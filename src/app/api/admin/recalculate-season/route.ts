// ============================================================
// Admin — Recalcular balanço hídrico completo de uma safra
// Itera dia a dia desde o plantio, encadeando ADc corretamente.
// Protegido por CRON_SECRET.
// Uso: GET /api/admin/recalculate-season?season_id=UUID
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calcDAS, computeResolvedManagementBalance } from '@/lib/calculations/management-balance'
import {
  getManagementExternalData,
  listDailyManagementBySeason,
  upsertDailyManagementRecord,
} from '@/services/management'
import { getScheduledIrrigationForDate } from '@/services/irrigation-schedule'
import type { TypedSupabaseClient } from '@/services/base'
import type { Crop, DailyManagement, DailyManagementInsert, Farm, Pivot, Season } from '@/types/database'

function addDays(dateISO: string, n: number): string {
  const d = new Date(dateISO + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function todayBRT(): string {
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const seasonId = req.nextUrl.searchParams.get('season_id')
  if (!seasonId) {
    return NextResponse.json({ error: 'season_id obrigatório' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as TypedSupabaseClient

  // Busca safra com joins
  const { data: seasonRaw, error: seasonErr } = await supabase
    .from('seasons')
    .select('*, crops(*), pivots(*), farms:farms!inner(*)')
    .eq('id', seasonId)
    .single()

  if (seasonErr || !seasonRaw) {
    return NextResponse.json({ error: 'Safra não encontrada', detail: seasonErr?.message }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = seasonRaw as any
  const season = raw as Season
  const crop = raw.crops as Crop | null
  const pivot = raw.pivots as Pivot | null
  const farm = raw.farms as Farm

  if (!crop || !pivot || !season.planting_date) {
    return NextResponse.json({ error: 'Safra sem cultura, pivô ou data de plantio' }, { status: 400 })
  }

  const plantingDate = season.planting_date
  const endDate = todayBRT()
  const context = { season, farm, pivot, crop }

  // Gera lista de datas do plantio até hoje
  const dates: string[] = []
  let d = plantingDate
  while (d <= endDate) {
    dates.push(d)
    d = addDays(d, 1)
  }

  console.log(`[recalculate] Safra "${season.name}" — ${dates.length} dias (${plantingDate} → ${endDate})`)

  // Busca registros existentes para preservar actual_depth_mm e actual_speed_percent
  const existingRecords = await listDailyManagementBySeason(seasonId, supabase)
  const existingByDate = new Map<string, DailyManagement>()
  for (const r of existingRecords) {
    existingByDate.set(r.date, r)
  }

  // Processa dia a dia, encadeando o ADc
  const results: Array<{ date: string; das: number; eto: number; etc: number; adcNew: number; fcPct: number; status: string }> = []
  // História virtual acumulada para que computeResolvedManagementBalance encadeie corretamente
  const runningHistory: DailyManagement[] = []

  for (const dateStr of dates) {
    const das = calcDAS(plantingDate, dateStr)

    try {
      const externalData = await getManagementExternalData(farm.id, pivot.id, dateStr, pivot, supabase)
      const climateSnapshot = externalData.weather ?? externalData.geolocationWeather

      if (!climateSnapshot) {
        console.warn(`[recalculate] ${dateStr} — sem dados climáticos, pulando`)
        continue
      }

      // Preserva irrigação e chuva real registradas pelo usuário
      const existing = existingByDate.get(dateStr)
      let actualDepthStr = ''
      let actualSpeedStr = ''
      let rainfallStr = ''
      if (existing?.actual_depth_mm != null && existing.actual_depth_mm > 0) {
        actualDepthStr = String(existing.actual_depth_mm)
      }
      if (existing?.actual_speed_percent != null && existing.actual_speed_percent > 0) {
        actualSpeedStr = String(existing.actual_speed_percent)
      }
      // Preserva chuva manual (rainfall_records tem prioridade, fallback no registro existente)
      if (existing?.rainfall_mm != null && existing.rainfall_mm > 0) {
        rainfallStr = String(existing.rainfall_mm)
      }

      // Busca lâmina agendada (lançamentos)
      let scheduledMm: number | null = null
      try {
        const schedule = await getScheduledIrrigationForDate(pivot.id, dateStr, supabase)
        if (schedule?.lamina_mm != null && schedule.lamina_mm > 0) {
          scheduledMm = schedule.lamina_mm
        }
      } catch { /* silencioso */ }

      // Se não tem irrigação real mas tem agendada, usa agendada
      if (!actualDepthStr && scheduledMm != null) {
        actualDepthStr = String(scheduledMm)
      }

      const result = computeResolvedManagementBalance({
        context,
        history: runningHistory,
        date: dateStr,
        tmax: climateSnapshot.temp_max != null ? String(climateSnapshot.temp_max) : '',
        tmin: climateSnapshot.temp_min != null ? String(climateSnapshot.temp_min) : '',
        humidity: climateSnapshot.humidity_percent != null ? String(climateSnapshot.humidity_percent) : '',
        wind: climateSnapshot.wind_speed_ms != null ? String(climateSnapshot.wind_speed_ms) : '',
        radiation: climateSnapshot.solar_radiation_wm2 != null ? String(climateSnapshot.solar_radiation_wm2) : '',
        rainfall: rainfallStr,
        actualDepth: actualDepthStr,
        actualSpeed: actualSpeedStr,
        externalData,
      })

      if (!result) {
        console.warn(`[recalculate] ${dateStr} — cálculo retornou null, pulando`)
        continue
      }

      const payload: DailyManagementInsert = {
        season_id: seasonId,
        date: dateStr,
        das: result.das,
        crop_stage: result.cropStage,
        temp_max: climateSnapshot.temp_max ?? null,
        temp_min: climateSnapshot.temp_min ?? null,
        humidity_percent: climateSnapshot.humidity_percent ?? null,
        wind_speed_ms: climateSnapshot.wind_speed_ms ?? null,
        solar_radiation_wm2: climateSnapshot.solar_radiation_wm2 ?? null,
        eto_mm: result.eto,
        etc_mm: result.etc,
        rainfall_mm: existing?.rainfall_mm ?? externalData.rainfall?.rainfall_mm ?? 0,
        kc: result.kc,
        ks: result.ks,
        ctda: result.adcNew,
        cta: result.cta,
        recommended_depth_mm: result.recommendedDepthMm,
        recommended_speed_percent: result.recommendedSpeedPercent,
        field_capacity_percent: result.fieldCapacityPercent,
        needs_irrigation: result.recommendedDepthMm > 0,
        soil_moisture_calculated: result.fieldCapacityPercent,
        actual_depth_mm: existing?.actual_depth_mm ?? scheduledMm ?? null,
        actual_speed_percent: existing?.actual_speed_percent ?? null,
        irrigation_start: existing?.irrigation_start ?? null,
        irrigation_end: existing?.irrigation_end ?? null,
        updated_at: new Date().toISOString(),
      }

      await upsertDailyManagementRecord(payload, supabase)

      // Adiciona ao running history (mais recente primeiro, como listDailyManagementBySeason retorna)
      runningHistory.unshift({
        ...existing,
        id: existing?.id ?? '',
        season_id: seasonId,
        date: dateStr,
        das: result.das,
        ctda: result.adcNew,
        eto_mm: result.eto,
        etc_mm: result.etc,
        kc: result.kc,
        ks: result.ks,
        cta: result.cta,
        field_capacity_percent: result.fieldCapacityPercent,
        rainfall_mm: payload.rainfall_mm ?? 0,
        actual_depth_mm: payload.actual_depth_mm ?? null,
        actual_speed_percent: payload.actual_speed_percent ?? null,
      } as DailyManagement)

      results.push({
        date: dateStr,
        das,
        eto: Math.round(result.eto * 100) / 100,
        etc: Math.round(result.etc * 100) / 100,
        adcNew: Math.round(result.adcNew * 100) / 100,
        fcPct: Math.round(result.fieldCapacityPercent * 10) / 10,
        status: result.status,
      })
    } catch (err) {
      console.error(`[recalculate] ${dateStr} — erro:`, err)
      results.push({
        date: dateStr,
        das,
        eto: 0,
        etc: 0,
        adcNew: 0,
        fcPct: 0,
        status: `error: ${err instanceof Error ? err.message : 'unknown'}`,
      })
    }
  }

  console.log(`[recalculate] Concluído — ${results.length} dias processados`)

  return NextResponse.json({
    season: season.name,
    planting_date: plantingDate,
    total_days: dates.length,
    processed: results.length,
    correction_factor: process.env.ETO_PLUGFIELD_CORRECTION_FACTOR ?? '1',
    results,
  })
}

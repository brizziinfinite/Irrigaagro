// POST /api/cron/recalculate-season
// Body: { season_id?: string, last_days?: number }
// Autenticado por CRON_SECRET (igual ao cron diário).
// Se season_id omitido: processa todas as safras ativas.
// Usa o mesmo código do /api/seasons/recalculate, sem exigir sessão de usuário.

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

async function recalculateSeason(
  seasonId: string,
  lastDays: number | null,
  supabase: TypedSupabaseClient
): Promise<{ processed: number; skipped: number; name: string }> {
  const { data: seasonRaw, error: seasonErr } = await supabase
    .from('seasons')
    .select('*, crops(*), pivots(*), farms:farms!inner(*)')
    .eq('id', seasonId)
    .single()

  if (seasonErr || !seasonRaw) return { processed: 0, skipped: 0, name: seasonId }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = seasonRaw as any
  const season = raw as Season
  const crop = raw.crops as Crop | null
  const pivot = raw.pivots as Pivot | null
  const farm = raw.farms as Farm

  if (!crop || !pivot || !season.planting_date) return { processed: 0, skipped: 1, name: season.name }

  const plantingDate = season.planting_date
  const endDate = todayBRT()
  const context = { season, farm, pivot, crop }

  const dates: string[] = []
  let d = plantingDate
  while (d <= endDate) { dates.push(d); d = addDays(d, 1) }

  const targetDate = lastDays != null ? addDays(endDate, -lastDays + 1) : null

  const existingRecords = await listDailyManagementBySeason(seasonId, supabase)
  const existingByDate = new Map<string, DailyManagement>()
  for (const r of existingRecords) existingByDate.set(r.date, r)

  let processed = 0
  let skipped = 0
  const runningHistory: DailyManagement[] = []

  for (const dateStr of dates) {
    const das = calcDAS(plantingDate, dateStr)
    try {
      const externalData = await getManagementExternalData(farm.id, pivot.id, dateStr, pivot, supabase)
      const climateSnapshot = externalData.weather ?? externalData.geolocationWeather
      if (!climateSnapshot) { skipped++; continue }

      const existing = existingByDate.get(dateStr)
      const actualDepthStr = existing?.actual_depth_mm ? String(existing.actual_depth_mm) : ''
      const actualSpeedStr = existing?.actual_speed_percent ? String(existing.actual_speed_percent) : ''

      let scheduledMm: number | null = null
      try {
        const schedule = await getScheduledIrrigationForDate(pivot.id, dateStr, supabase)
        if (schedule?.lamina_mm != null && schedule.lamina_mm > 0) {
          // Só contabiliza lâmina no turno de conclusão (diurno: start < end)
          // Turno noturno (start > end = cruza meia-noite) é saída — não contabilizar
          const isNightDeparture = schedule.start_time && schedule.end_time && schedule.start_time > schedule.end_time
          if (!isNightDeparture) scheduledMm = schedule.lamina_mm
        }
      } catch { /* silencioso */ }

      const result = computeResolvedManagementBalance({
        context, history: runningHistory, date: dateStr,
        tmax: climateSnapshot.temp_max != null ? String(climateSnapshot.temp_max) : '',
        tmin: climateSnapshot.temp_min != null ? String(climateSnapshot.temp_min) : '',
        humidity: climateSnapshot.humidity_percent != null ? String(climateSnapshot.humidity_percent) : '',
        wind: climateSnapshot.wind_speed_ms != null ? String(climateSnapshot.wind_speed_ms) : '',
        radiation: climateSnapshot.solar_radiation_wm2 != null ? String(climateSnapshot.solar_radiation_wm2) : '',
        rainfall: '',
        actualDepth: actualDepthStr || (scheduledMm != null ? String(scheduledMm) : ''),
        actualSpeed: actualSpeedStr,
        externalData,
      })
      if (!result) { skipped++; continue }

      const payload: DailyManagementInsert = {
        season_id: seasonId, date: dateStr, das: result.das ?? das,
        crop_stage: result.cropStage,
        temp_max: climateSnapshot.temp_max ?? null,
        temp_min: climateSnapshot.temp_min ?? null,
        humidity_percent: climateSnapshot.humidity_percent ?? null,
        wind_speed_ms: climateSnapshot.wind_speed_ms ?? null,
        solar_radiation_wm2: climateSnapshot.solar_radiation_wm2 ?? null,
        eto_mm: result.eto, etc_mm: result.etc,
        rainfall_mm: externalData.rainfall?.rainfall_mm ?? 0,
        kc: result.kc, ks: result.ks, ctda: result.adcNew, cta: result.cta,
        irn_mm: result.excessMm > 0 ? result.excessMm : null,
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

      if (!targetDate || dateStr >= targetDate) {
        await upsertDailyManagementRecord(payload, supabase)
        processed++
      }

      runningHistory.unshift({
        ...existing, id: existing?.id ?? '', season_id: seasonId, date: dateStr,
        das: result.das, ctda: result.adcNew, eto_mm: result.eto, etc_mm: result.etc,
        kc: result.kc, ks: result.ks, cta: result.cta,
        field_capacity_percent: result.fieldCapacityPercent,
        rainfall_mm: payload.rainfall_mm ?? 0,
        actual_depth_mm: payload.actual_depth_mm ?? null,
        actual_speed_percent: payload.actual_speed_percent ?? null,
      } as DailyManagement)

    } catch { skipped++ }
  }

  return { processed, skipped, name: season.name }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const seasonId: string | null = body.season_id ?? null
  const lastDays: number | null = body.last_days ?? null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as TypedSupabaseClient

  let seasonIds: string[]
  if (seasonId) {
    seasonIds = [seasonId]
  } else {
    const { data: active } = await supabase.from('seasons').select('id').eq('is_active', true)
    seasonIds = (active ?? []).map((s: { id: string }) => s.id)
  }

  if (!seasonIds.length) return NextResponse.json({ error: 'Nenhuma safra encontrada' }, { status: 404 })

  const results = []
  for (const id of seasonIds) {
    const r = await recalculateSeason(id, lastDays, supabase)
    results.push(r)
    console.log(`✓ ${r.name}: processed=${r.processed} skipped=${r.skipped}`)
  }

  return NextResponse.json({ ok: true, seasons: results })
}

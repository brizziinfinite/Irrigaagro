// POST /api/seasons/recalculate
// Body: { season_id: string }
// Autenticado por sessão Supabase (não exige CRON_SECRET).
// Delega internamente ao mesmo código de recalculate-season.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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

export async function POST(req: NextRequest) {
  // Verifica sessão do usuário
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const seasonId: string = body.season_id
  const singleDate: string | null = body.date ?? null // recalcula só este dia se informado
  const lastDays: number | null = body.last_days ?? null // limita a janela (ex: 7 dias)
  if (!seasonId) {
    return NextResponse.json({ error: 'season_id obrigatório' }, { status: 400 })
  }

  // Usa service role para leitura/escrita irrestrita
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as TypedSupabaseClient

  // Verifica que o usuário tem acesso à safra (via company_members)
  const { data: access } = await supabase
    .from('seasons')
    .select('id, farms!inner(company_id, company_members!inner(user_id))')
    .eq('id', seasonId)
    .eq('farms.company_members.user_id', user.id)
    .single()

  if (!access) {
    return NextResponse.json({ error: 'Sem permissão para esta safra' }, { status: 403 })
  }

  // Busca safra com joins
  const { data: seasonRaw, error: seasonErr } = await supabase
    .from('seasons')
    .select('*, crops(*), pivots(*), farms:farms!inner(*)')
    .eq('id', seasonId)
    .single()

  if (seasonErr || !seasonRaw) {
    return NextResponse.json({ error: 'Safra não encontrada' }, { status: 404 })
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

  // Monta lista de datas desde o plantio até hoje
  const dates: string[] = []
  let d = plantingDate
  while (d <= endDate) {
    dates.push(d)
    d = addDays(d, 1)
  }

  // last_days: limita a janela de gravação (percorre tudo para encadear ADc, mas só grava os últimos N dias)
  const targetDate = singleDate
    ?? (lastDays != null ? addDays(endDate, -lastDays + 1) : null)

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
      // Chuva vem sempre de rainfall_records (externalData.rainfall) — fonte autoritativa.
      // Passamos rainfall='' para que o cálculo use externalData.rainfall com prioridade correta
      // (manual > plugfield > estação), sem sobrescrever com valor antigo do daily_management.

      let scheduledMm: number | null = null
      try {
        const schedule = await getScheduledIrrigationForDate(pivot.id, dateStr, supabase)
        if (schedule?.lamina_mm != null && schedule.lamina_mm > 0) scheduledMm = schedule.lamina_mm
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

      // Se targetDate informado, persiste a partir daquele dia (inclusive) até hoje,
      // pois a mudança de chuva afeta o ADc de todos os dias seguintes.
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

  return NextResponse.json({
    season: season.name,
    total_days: dates.length,
    processed,
    skipped,
  })
}

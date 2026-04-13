/**
 * Recalcula os últimos 90 dias de todas as safras ativas localmente.
 * Roda via: npx tsx scripts/recalculate-seasons.ts
 */
import { createClient } from '@supabase/supabase-js'
import { calcDAS, computeResolvedManagementBalance } from '../src/lib/calculations/management-balance'
import {
  getManagementExternalData,
  listDailyManagementBySeason,
  upsertDailyManagementRecord,
} from '../src/services/management'
import { getScheduledIrrigationForDate } from '../src/services/irrigation-schedule'
import type { TypedSupabaseClient } from '../src/services/base'
import type { Crop, DailyManagement, DailyManagementInsert, Farm, Pivot, Season } from '../src/types/database'

// Configura env vars
process.env.NEXT_PUBLIC_ETO_CORRECTION_FACTOR = process.env.NEXT_PUBLIC_ETO_CORRECTION_FACTOR || '0.82'

const SUPABASE_URL = 'https://wvwjbzpnujmyvzvadctp.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SERVICE_KEY) {
  console.error('❌  SUPABASE_SERVICE_ROLE_KEY não definida')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY) as TypedSupabaseClient

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

const LAST_DAYS = 90

async function recalculateSeason(seasonId: string) {
  const { data: seasonRaw, error } = await supabase
    .from('seasons')
    .select('*, crops(*), pivots(*), farms:farms!inner(*)')
    .eq('id', seasonId)
    .single()

  if (error || !seasonRaw) {
    console.log(`  ❌ Erro ao buscar safra: ${error?.message}`)
    return
  }

  const raw = seasonRaw as any
  const season = raw as Season
  const crop = raw.crops as Crop | null
  const pivot = raw.pivots as Pivot | null
  const farm = raw.farms as Farm

  if (!crop || !pivot || !season.planting_date) {
    console.log(`  ⚠ Safra sem crop, pivot ou planting_date — pulada`)
    return
  }

  const plantingDate = season.planting_date
  const endDate = todayBRT()
  const startDate = addDays(endDate, -LAST_DAYS + 1)
  const context = { season, farm, pivot, crop }

  // Gera todas as datas desde o plantio (para calcular balanço correto com histórico)
  const allDates: string[] = []
  let d = plantingDate
  while (d <= endDate) { allDates.push(d); d = addDays(d, 1) }

  const existingRecords = await listDailyManagementBySeason(seasonId, supabase)
  const existingByDate = new Map<string, DailyManagement>()
  for (const r of existingRecords) existingByDate.set(r.date, r)

  let processed = 0
  let skipped = 0
  const runningHistory: DailyManagement[] = []

  for (const dateStr of allDates) {
    const das = calcDAS(plantingDate, dateStr)
    try {
      const externalData = await getManagementExternalData(farm.id, pivot.id, dateStr, pivot, supabase)
      const climateSnapshot = externalData.weather ?? externalData.geolocationWeather
      if (!climateSnapshot) {
        skipped++
        runningHistory.unshift(existingByDate.get(dateStr) as DailyManagement)
        continue
      }

      const existing = existingByDate.get(dateStr)
      const actualDepthStr = existing?.actual_depth_mm ? String(existing.actual_depth_mm) : ''
      const actualSpeedStr = existing?.actual_speed_percent ? String(existing.actual_speed_percent) : ''

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

      if (!result) {
        skipped++
        runningHistory.unshift(existingByDate.get(dateStr) as DailyManagement)
        continue
      }

      const payload: DailyManagementInsert = {
        season_id: seasonId, date: dateStr, das: result.das ?? das,
        crop_stage: result.cropStage,
        temp_max: climateSnapshot.temp_max ?? null,
        temp_min: climateSnapshot.temp_min ?? null,
        humidity_percent: climateSnapshot.humidity_percent ?? null,
        wind_speed_ms: climateSnapshot.wind_speed_ms ?? null,
        solar_radiation_wm2: climateSnapshot.solar_radiation_wm2 ?? null,
        eto_mm: result.eto, etc_mm: result.etc,
        // Chuva: SOMENTE rainfall_records — Plugfield ignorado
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

      // Só grava os últimos LAST_DAYS dias no banco
      if (dateStr >= startDate) {
        await upsertDailyManagementRecord(payload, supabase)
        processed++
        if (processed % 10 === 0) process.stdout.write('.')
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

    } catch (e) {
      skipped++
    }
  }

  console.log(`\n  ✓ processed=${processed}  skipped=${skipped}`)
}

// Main
async function main() {
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)

  if (!seasons?.length) {
    console.error('❌  Nenhuma safra ativa')
    process.exit(1)
  }

  const list = seasons as { id: string; name: string }[]
  console.log(`\n🌱 ${list.length} safra(s) ativa(s) — recalculando últimos ${LAST_DAYS} dias\n`)

  for (const season of list) {
    console.log(`▶  ${season.name} (${season.id})`)
    await recalculateSeason(season.id)
  }

  console.log('\n✅  Concluído!')
}

main().catch(e => { console.error(e); process.exit(1) })

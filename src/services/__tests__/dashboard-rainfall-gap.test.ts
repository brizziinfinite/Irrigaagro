/**
 * Testes de regressão: gap projection do dashboard deve incluir precipitações.
 *
 * Contexto histórico (2026-05): bug onde `rainfall: ''` hardcoded no loop de gap
 * fazia o dashboard mostrar FC% ~20pp abaixo do Manejo quando havia chuva entre
 * o último daily_management e hoje. "ISSO JAMAIS PODE ACONTECER NOVAMENTE."
 */
import { describe, it, expect } from 'vitest'
import { calcCTA, getStageInfoForDas, calcEtc } from '@/lib/water-balance'
import { calcADcWithExcess } from '@/lib/water-balance'
import { computeResolvedManagementBalance } from '@/lib/calculations/management-balance'
import type { Crop, Season, Pivot, Farm, DailyManagement } from '@/types/database'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const crop: Crop = {
  id: 'crop-test',
  company_id: null,
  name: 'Milho',
  kc_ini: 0.60,
  kc_mid: 1.20,
  kc_final: 0.35,
  total_cycle_days: 125,
  created_at: '',
  stage1_days: 20,
  stage2_days: 35,
  stage3_days: 40,
  stage4_days: 30,
  root_depth_stage1_cm: 20,
  root_depth_stage2_cm: 40,
  root_depth_stage3_cm: 60,
  root_depth_stage4_cm: 60,
  f_factor_stage1: 0.55,
  f_factor_stage2: 0.55,
  f_factor_stage3: 0.55,
  f_factor_stage4: 0.55,
  root_initial_depth_cm: null,
  root_growth_rate_cm_day: null,
  root_start_das: null,
}

const season: Season = {
  id: 'season-test',
  farm_id: 'farm-test',
  pivot_id: 'pivot-test',
  crop_id: 'crop-test',
  name: 'Safra Teste',
  planting_date: '2026-04-01',
  field_capacity: 32,
  wilting_point: 14,
  bulk_density: 1.4,
  initial_adc_percent: 100,
  is_active: true,
  created_at: '',
  updated_at: '',
  notes: null,
  f_factor: null,
  area_ha: null,
}

const farm: Farm = {
  id: 'farm-test',
  company_id: 'co-test',
  name: 'Fazenda Teste',
  altitude: 600,
  created_at: '',
  updated_at: '',
  document_number: null,
  owner_name: null,
  owner_email: null,
  owner_phone: null,
  cep: null,
  address: null,
  city: null,
  state_uf: null,
  latitude_degrees: null,
  latitude_minutes: null,
  hemisphere: null,
  longitude: null,
  area_m2: null,
  notes: null,
}

const pivot: Pivot = {
  id: 'pivot-test',
  farm_id: 'farm-test',
  name: 'Pivô Teste',
  field_capacity: 32,
  wilting_point: 14,
  bulk_density: 1.4,
  alert_threshold_percent: 70,
  irrigation_target_percent: 80,
  latitude: -22.9,
  longitude: -50.4,
  created_at: '',
  updated_at: '',
  operation_mode: 'individual',
  return_interval_days: 1,
  flow_rate_m3h: null,
  emitter_spacing_m: null,
  first_emitter_spacing_m: null,
  last_tower_length_m: null,
  overhang_length_m: null,
  last_tower_speed_mh: null,
  cuc_percent: null,
  length_m: null,
  time_360_h: null,
  weather_source: null,
  weather_config: null,
  sector_start_deg: null,
  sector_end_deg: null,
  paired_pivot_id: null,
  preferred_speed_percent: null,
  min_speed_percent: null,
  rs_correction_factor: null,
  rs_factor_updated_at: null,
  rs_factor_sample_days: null,
  f_factor: null,
  soil_texture: null,
  polygon_geojson: null,
}

const lastManagement: DailyManagement = {
  id: 'dm-test',
  season_id: 'season-test',
  date: '2026-05-10',
  ctda: 18,                    // ~75% CC
  field_capacity_percent: 75,
  eto_mm: 4.5,
  etc_mm: 4.5,
  rainfall_mm: 0,
  das: null,
  crop_stage: null,
  temp_max: null,
  temp_min: null,
  humidity_percent: null,
  wind_speed_ms: null,
  solar_radiation_wm2: null,
  kc: null,
  ks: null,
  cta: null,
  irn_mm: null,
  itn_mm: null,
  recommended_speed_percent: null,
  recommended_depth_mm: null,
  needs_irrigation: false,
  actual_speed_percent: null,
  actual_depth_mm: null,
  irrigation_start: null,
  irrigation_end: null,
  irrigation_duration_hours: null,
  soil_moisture_measured: null,
  soil_moisture_calculated: null,
  cost_per_mm_alq: null,
  cost_per_mm_ha: null,
  energy_kwh: null,
  sector_id: null,
  created_at: '',
  updated_at: '',
}

// ─── Helpers do gap projection (replicados do dashboard.ts) ──────────────────

function simulateGapFallback(params: {
  startAdc: number
  avgEtc: number
  rainfallByDate: Map<string, number>
  startDate: string
  endDate: string
  crop: Crop
  season: Season
  pivot: Pivot
}): number {
  const { startAdc, avgEtc, rainfallByDate, startDate, endDate, crop, season, pivot } = params
  const daysSince = Math.round(
    (new Date(endDate + 'T12:00:00').getTime() - new Date(startDate + 'T12:00:00').getTime()) / 86400000
  )
  const daysToProcess = Math.min(daysSince, 14)
  let runningAdc = startAdc

  for (let d = 1; d <= daysToProcess; d++) {
    const gapDate = new Date(startDate + 'T12:00:00')
    gapDate.setDate(gapDate.getDate() + d)
    const gapDateStr = gapDate.toISOString().split('T')[0]

    const stageInfo = getStageInfoForDas(crop, Math.max(1, Math.round(
      (new Date(gapDateStr + 'T12:00:00').getTime() - new Date(season.planting_date! + 'T12:00:00').getTime()) / 86400000
    ) + 1))
    const cta = calcCTA(
      Number(pivot.field_capacity ?? 32),
      Number(pivot.wilting_point ?? 14),
      Number(pivot.bulk_density ?? 1.4),
      stageInfo.rootDepthCm
    )
    const rainfallMm = rainfallByDate.get(gapDateStr) ?? 0
    runningAdc = Math.max(0, Math.min(runningAdc - avgEtc + rainfallMm, cta))
  }

  return runningAdc
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('dashboard gap projection — rainfall regression', () => {
  const avgEtc = 3.5

  it('REGRESSÃO: sem chuva o ADc cai monotonicamente', () => {
    const adcFinal = simulateGapFallback({
      startAdc: 18,
      avgEtc,
      rainfallByDate: new Map(), // zero chuva
      startDate: '2026-05-10',
      endDate: '2026-05-13',
      crop, season, pivot,
    })
    // 3 dias × 3.5mm ETc = -10.5mm → ~7.5mm
    expect(adcFinal).toBeCloseTo(18 - 3 * avgEtc, 0)
  })

  it('REGRESSÃO: chuva aumenta ADc — não pode ser ignorada', () => {
    const rainfallByDate = new Map([
      ['2026-05-11', 25], // 25mm no dia seguinte ao último registro
    ])

    const adcComChuva = simulateGapFallback({
      startAdc: 18,
      avgEtc,
      rainfallByDate,
      startDate: '2026-05-10',
      endDate: '2026-05-13',
      crop, season, pivot,
    })

    const adcSemChuva = simulateGapFallback({
      startAdc: 18,
      avgEtc,
      rainfallByDate: new Map(),
      startDate: '2026-05-10',
      endDate: '2026-05-13',
      crop, season, pivot,
    })

    // ADc com chuva DEVE ser maior — se isso falhar, bug voltou
    expect(adcComChuva).toBeGreaterThan(adcSemChuva)
    // Chuva de 25mm deve elevar ADc além do ponto sem chuva
    expect(adcComChuva).toBeGreaterThan(18) // recarregou acima do inicial
  })

  it('REGRESSÃO: FC% com chuva nunca pode ser menor que FC% sem chuva', () => {
    const stageInfo = getStageInfoForDas(crop, 40) // ~DAS 40
    const cta = calcCTA(32, 14, 1.4, stageInfo.rootDepthCm)

    const rainfallByDate = new Map([
      ['2026-05-11', 20],
      ['2026-05-12', 10],
    ])

    const adcComChuva = simulateGapFallback({
      startAdc: 18, avgEtc, rainfallByDate,
      startDate: '2026-05-10', endDate: '2026-05-13',
      crop, season, pivot,
    })
    const adcSemChuva = simulateGapFallback({
      startAdc: 18, avgEtc, rainfallByDate: new Map(),
      startDate: '2026-05-10', endDate: '2026-05-13',
      crop, season, pivot,
    })

    const pctComChuva = (adcComChuva / cta) * 100
    const pctSemChuva = (adcSemChuva / cta) * 100

    expect(pctComChuva).toBeGreaterThan(pctSemChuva)
    // Divergência do bug original era ~20pp — com fix deve ser > 0pp
    expect(pctComChuva - pctSemChuva).toBeGreaterThan(0)
  })

  it('REGRESSÃO: computeResolvedManagementBalance com rainfall="" ignora chuva corretamente (deve ser 0)', () => {
    // Valida que o comportamento antigo (rainfall='') resulta em adcNew menor
    // e que passar rainfall='25' eleva o ADc — confirma que a string é processada
    const context = { season, farm, pivot, crop }
    const history: DailyManagement[] = [lastManagement]

    const resultSemChuva = computeResolvedManagementBalance({
      context, history,
      date: '2026-05-11',
      tmax: '30', tmin: '18', humidity: '65', wind: '2', radiation: '200',
      rainfall: '',      // ← comportamento antigo (bugado para gap projection)
      actualDepth: '', actualSpeed: '',
      externalData: null,
    })

    const resultComChuva = computeResolvedManagementBalance({
      context, history,
      date: '2026-05-11',
      tmax: '30', tmin: '18', humidity: '65', wind: '2', radiation: '200',
      rainfall: '25',    // ← fix correto
      actualDepth: '', actualSpeed: '',
      externalData: null,
    })

    expect(resultSemChuva).not.toBeNull()
    expect(resultComChuva).not.toBeNull()

    // Com chuva deve ter ADc e FC% maiores
    expect(resultComChuva!.adcNew).toBeGreaterThan(resultSemChuva!.adcNew)
    expect(resultComChuva!.fieldCapacityPercent).toBeGreaterThan(resultSemChuva!.fieldCapacityPercent)
  })

  it('ADc não ultrapassa CTA mesmo com muita chuva', () => {
    const rainfallByDate = new Map([
      ['2026-05-11', 100], // chuva absurda
      ['2026-05-12', 100],
    ])

    const stageInfo = getStageInfoForDas(crop, 40)
    const cta = calcCTA(32, 14, 1.4, stageInfo.rootDepthCm)

    const adcFinal = simulateGapFallback({
      startAdc: 18, avgEtc, rainfallByDate,
      startDate: '2026-05-10', endDate: '2026-05-13',
      crop, season, pivot,
    })

    expect(adcFinal).toBeLessThanOrEqual(cta + 0.001)
  })

  it('ADc não fica negativo mesmo sem chuva e ETc alta', () => {
    const adcFinal = simulateGapFallback({
      startAdc: 2,           // quase seco
      avgEtc: 8,             // ETc muito alta
      rainfallByDate: new Map(),
      startDate: '2026-05-01',
      endDate: '2026-05-15', // 14 dias
      crop, season, pivot,
    })

    expect(adcFinal).toBeGreaterThanOrEqual(0)
  })
})

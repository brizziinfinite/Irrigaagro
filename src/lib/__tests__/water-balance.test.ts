import { describe, it, expect } from 'vitest'
import {
  calcCTA,
  calcCAD,
  calcEtc,
  getStageInfoForDas,
  getConjugatedRecommendation,
  calcADc,
  calcKs,
} from '../water-balance'
import type { Crop, Pivot } from '@/types/database'

// ─── Helpers ──────────────────────────────────────────────────

const milho: Crop = {
  id: 'test',
  company_id: null,
  name: 'Milho',
  kc_ini: 0.30,
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

/** Pivô de teste com velocidade preferida 50% e mínima 42% */
function makePivot(overrides: Partial<Pivot> = {}): Pivot {
  return {
    id: 'pv1', farm_id: 'f1', name: 'Valley', created_at: '', updated_at: '',
    flow_rate_m3h: 120, length_m: 350, time_360_h: 18, cuc_percent: 90,
    latitude: -22.87, longitude: -50.36,
    emitter_spacing_m: null, first_emitter_spacing_m: null, last_tower_length_m: null,
    overhang_length_m: null, last_tower_speed_mh: null,
    weather_source: 'plugfield', weather_config: null,
    alert_threshold_percent: 70,
    sector_start_deg: null, sector_end_deg: null,
    operation_mode: 'individual', paired_pivot_id: null, return_interval_days: 1,
    preferred_speed_percent: 50, min_speed_percent: 42,
    rs_correction_factor: null, rs_factor_updated_at: null, rs_factor_sample_days: null,
    field_capacity: null, wilting_point: null, bulk_density: null, f_factor: null,
    irrigation_target_percent: null, soil_texture: null,
    ...overrides,
  }
}

// ─── CTA ──────────────────────────────────────────────────────

describe('calcCTA', () => {
  it('calcula CTA corretamente com valores típicos', () => {
    // CTA = ((CC - PM) / 10) * Ds * raiz
    // ((39.6 - 16.1) / 10) * 1.2 * 25 = 2.35 * 1.2 * 25 = 70.5
    const cta = calcCTA(39.6, 16.1, 1.2, 25)
    expect(cta).toBeCloseTo(70.5, 1)
  })

  it('retorna 0 quando CC = PM', () => {
    expect(calcCTA(20, 20, 1.2, 30)).toBe(0)
  })
})

// ─── CAD ──────────────────────────────────────────────────────

describe('calcCAD', () => {
  it('calcula CAD corretamente para f=0.55', () => {
    // CAD = CTA * (1 - f) = 70.5 * (1 - 0.55) = 70.5 * 0.45 = 31.725
    const cad = calcCAD(70.5, 0.55)
    expect(cad).toBeCloseTo(31.725, 2)
  })

  it('usa f=0.5 como fallback quando f=0', () => {
    const cad = calcCAD(100, 0)
    expect(cad).toBeCloseTo(50, 1)
  })
})

// ─── Kc interpolação ─────────────────────────────────────────

describe('getStageInfoForDas', () => {
  it('retorna Kc ini na fase 1 (DAS=10)', () => {
    const info = getStageInfoForDas(milho, 10)
    expect(info.stage).toBe(1)
    expect(info.kc).toBe(0.30)
    expect(info.rootDepthCm).toBe(20)
    expect(info.fFactor).toBe(0.55)
  })

  it('interpola Kc na fase 2 (DAS=30)', () => {
    const info = getStageInfoForDas(milho, 30)
    expect(info.stage).toBe(2)
    // DAS=30, s1=20 → progress = (30-20)/35 ≈ 0.286
    // Kc = 0.30 + (1.20 - 0.30) * 0.286 ≈ 0.557
    expect(info.kc).toBeCloseTo(0.557, 2)
  })

  it('retorna Kc mid na fase 3 (DAS=70)', () => {
    const info = getStageInfoForDas(milho, 70)
    expect(info.stage).toBe(3)
    expect(info.kc).toBe(1.20)
    expect(info.rootDepthCm).toBe(60)
  })

  it('interpola Kc na fase 4 (DAS=100)', () => {
    const info = getStageInfoForDas(milho, 100)
    expect(info.stage).toBe(4)
    // s1+s2+s3 = 95, DAS=100, progress = (100-95)/30 ≈ 0.167
    // Kc = 1.20 + (0.35 - 1.20) * 0.167 ≈ 1.058
    expect(info.kc).toBeCloseTo(1.058, 2)
  })

  it('interpola raiz na fase 2', () => {
    const info = getStageInfoForDas(milho, 30)
    // progress = (30-20)/35 ≈ 0.286
    // root = 20 + (40 - 20) * 0.286 ≈ 25.7
    expect(info.rootDepthCm).toBeCloseTo(25.7, 0)
  })
})

// ─── ADc e Ks ─────────────────────────────────────────────────

describe('calcADc', () => {
  it('diminui ADc com ETc e sem chuva', () => {
    const adc = calcADc(60, 0, 0, 5, 70)
    expect(adc).toBeCloseTo(55, 1)
  })

  it('limita chuva ao espaço livre', () => {
    // ADc=65, CTA=70, espaço=5. Chuva=20 → efetiva=5
    const adc = calcADc(65, 20, 0, 3, 70)
    // 65 + 5 + 0 - 3 = 67
    expect(adc).toBeCloseTo(67, 1)
  })

  it('nunca ultrapassa CTA', () => {
    const adc = calcADc(70, 10, 10, 0, 70)
    expect(adc).toBe(70)
  })

  it('nunca vai abaixo de 0', () => {
    const adc = calcADc(2, 0, 0, 50, 70)
    expect(adc).toBe(0)
  })
})

describe('calcKs', () => {
  it('Ks=1 quando ADc >= CAD', () => {
    expect(calcKs(40, 30)).toBe(1)
  })

  it('Ks < 1 quando ADc < CAD', () => {
    expect(calcKs(15, 30)).toBeCloseTo(0.5, 2)
  })
})

// ─── Recomendação individual (sem velocidades configuradas) ──

describe('getConjugatedRecommendation — individual sem velocidades', () => {
  it('retorna ok quando déficit < 70% CAD', () => {
    const rec = getConjugatedRecommendation({
      cta: 70,
      cad: 31.5,     // f=0.55
      adcCurrent: 60, // déficit = 10
      etcMmPerDay: 5,
      returnIntervalDays: 1,
      pivot: null,
    })
    // déficit projetado = 10 + 5*1 = 15
    // 70% CAD = 31.5 * 0.70 = 22.05
    // 15 < 22.05 → ok
    expect(rec.status).toBe('ok')
    expect(rec.shouldIrrigateToday).toBe(false)
    expect(rec.deficitProjectedMm).toBeCloseTo(15, 1)
  })

  it('retorna queue quando déficit projetado entre 70-100% CAD', () => {
    const rec = getConjugatedRecommendation({
      cta: 70,
      cad: 31.5,
      adcCurrent: 45, // déficit = 25
      etcMmPerDay: 3,
      returnIntervalDays: 1,
      pivot: null,
    })
    // déficit projetado = 25 + 3 = 28
    // 70% CAD = 22.05, 100% CAD = 31.5
    // 22.05 <= 28 < 31.5 → queue
    expect(rec.status).toBe('queue')
    expect(rec.shouldIrrigateToday).toBe(false)
  })

  it('retorna irrigate_today quando déficit projetado >= CAD', () => {
    const rec = getConjugatedRecommendation({
      cta: 70,
      cad: 31.5,
      adcCurrent: 40, // déficit = 30
      etcMmPerDay: 5,
      returnIntervalDays: 1,
      pivot: null,
    })
    // déficit projetado = 30 + 5 = 35 >= 31.5 → irrigate_today
    expect(rec.status).toBe('irrigate_today')
    expect(rec.shouldIrrigateToday).toBe(true)
  })
})

// ─── Recomendação com velocidades reais ──────────────────────

describe('getConjugatedRecommendation — com velocidades do pivô', () => {
  it('sugere velocidade preferida quando cabe', () => {
    const pivot = makePivot({ preferred_speed_percent: 50, min_speed_percent: 42 })
    const rec = getConjugatedRecommendation({
      cta: 70,
      cad: 31.5,
      adcCurrent: 40, // déficit = 30
      etcMmPerDay: 5,
      returnIntervalDays: 1,
      pivot,
    })
    // déficit projetado = 30 + 5 = 35 >= 31.5 → irrigate_today
    expect(rec.status).toBe('irrigate_today')
    expect(rec.preferredDepthMm).toBeGreaterThan(0)
    expect(rec.maxDepthMm).toBeGreaterThan(0)
    // Deve sugerir alguma velocidade
    expect(rec.suggestedSpeedPercent).not.toBeNull()
  })

  it('calcula lâminas corretamente a partir das velocidades', () => {
    // Pivô: flow=120 m³/h, length=350m, time360=18h
    // Área = π × 350² = 384845 m²
    // A 100%: volume = 120 × 18 = 2160 m³, lâmina = 2160/384845 × 1000 = 5.61mm
    // A 50%: tempo = 18/(50/100) = 36h, volume = 120×36 = 4320 m³, lâmina = 4320/384845 × 1000 = 11.23mm
    // A 42%: tempo = 18/(42/100) = 42.86h, volume = 120×42.86 = 5143 m³, lâmina = 5143/384845 × 1000 = 13.36mm
    const pivot = makePivot()
    const rec = getConjugatedRecommendation({
      cta: 70, cad: 31.5, adcCurrent: 60, etcMmPerDay: 3,
      returnIntervalDays: 1, pivot,
    })
    expect(rec.preferredDepthMm).toBeCloseTo(11.23, 0)
    expect(rec.maxDepthMm).toBeCloseTo(13.36, 0)
  })
})

// ─── Recomendação conjugada ──────────────────────────────────

describe('getConjugatedRecommendation — conjugado com 2 dias retorno', () => {
  it('projeta déficit com 2 dias e limita pela lâmina máxima', () => {
    // min_speed=42% → maxDepthMm ≈ 13.36mm
    // CAD = 31.5, operationalLimit = min(31.5, 13.36) = 13.36
    const pivot = makePivot({ operation_mode: 'conjugated', return_interval_days: 2 })
    const rec = getConjugatedRecommendation({
      cta: 70,
      cad: 31.5,
      adcCurrent: 55, // déficit = 15
      etcMmPerDay: 5,
      returnIntervalDays: 2,
      pivot,
    })
    // déficit projetado = 15 + 5*2 = 25
    // operationalLimit ≈ 13.36
    // 25 >= 13.36 → irrigate_today
    expect(rec.status).toBe('irrigate_today')
    expect(rec.shouldIrrigateToday).toBe(true)
    expect(rec.deficitProjectedMm).toBeCloseTo(25, 1)
  })

  it('status ok quando depleção projetada < 70% limite', () => {
    const pivot = makePivot({ operation_mode: 'conjugated', return_interval_days: 2 })
    const rec = getConjugatedRecommendation({
      cta: 70,
      cad: 31.5,
      adcCurrent: 67, // déficit = 3
      etcMmPerDay: 2,
      returnIntervalDays: 2,
      pivot,
    })
    // déficit projetado = 3 + 2*2 = 7
    // operationalLimit ≈ 13.36, 70% = 9.35
    // 7 < 9.35 → ok
    expect(rec.status).toBe('ok')
  })
})

// ─── Risco operacional ───────────────────────────────────────

describe('getConjugatedRecommendation — risco operacional', () => {
  it('retorna operational_risk quando ETc por ciclo > lâmina máxima', () => {
    // min_speed=42% → maxDepthMm ≈ 13.36mm
    // ETc forecast = 8 × 2 = 16mm > 13.36mm → risco
    const pivot = makePivot({ operation_mode: 'conjugated', return_interval_days: 2 })
    const rec = getConjugatedRecommendation({
      cta: 70,
      cad: 31.5,
      adcCurrent: 60,
      etcMmPerDay: 8,
      returnIntervalDays: 2,
      pivot,
    })
    expect(rec.status).toBe('operational_risk')
    expect(rec.shouldIrrigateToday).toBe(true)
    expect(rec.reason).toContain('Risco')
  })

  it('sem risco quando ETc por ciclo < lâmina máxima', () => {
    const pivot = makePivot()
    const rec = getConjugatedRecommendation({
      cta: 70,
      cad: 31.5,
      adcCurrent: 65,
      etcMmPerDay: 3,
      returnIntervalDays: 1,
      pivot,
    })
    expect(rec.status).not.toBe('operational_risk')
  })
})

// ─── Chuva prevista NÃO entra na decisão ─────────────────────

describe('getConjugatedRecommendation — sem chuva prevista', () => {
  it('déficit projetado = depleção + ETc×dias (sem chuva)', () => {
    const rec = getConjugatedRecommendation({
      cta: 70,
      cad: 31.5,
      adcCurrent: 55, // déficit = 15
      etcMmPerDay: 5,
      returnIntervalDays: 2,
      pivot: null,
    })
    // déficit projetado = 15 + 5*2 = 25 (sem desconto de chuva)
    expect(rec.deficitProjectedMm).toBeCloseTo(25, 1)
    expect(rec.etcForecastUntilReturnMm).toBeCloseTo(10, 1)
  })
})

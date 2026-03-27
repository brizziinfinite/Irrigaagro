// ============================================================
// Funções de Balanço Hídrico FAO-56 — IrrigaAgro v2
// Todas as funções são puras (sem side effects)
// ============================================================

import type { Crop, Pivot, IrrigationStatus } from '@/types/database'

// ─── Tipos internos ──────────────────────────────────────────

export interface WeatherInput {
  tempMax: number       // °C
  tempMin: number       // °C
  humidity: number      // % umidade relativa média
  windSpeed: number     // m/s a 2m
  solarRadiation: number // W/m² (convertido internamente para MJ/m²·dia)
  altitude?: number     // m acima do nível do mar (default 650m)
  latitude?: number     // graus decimais (ex: -22.87 para sul)
  date?: string         // YYYY-MM-DD — usado para calcular dia do ano
}

export interface WaterBalanceResult {
  das: number
  cropStage: number
  kc: number
  rootDepthCm: number
  fFactor: number
  cta: number           // mm
  cad: number           // mm
  eto: number           // mm/dia
  etc: number           // mm/dia
  adcNew: number        // mm — novo ADc após o dia
  ks: number            // coeficiente de estresse (0-1)
  fieldCapacityPercent: number // % da CTA atual
  status: IrrigationStatus
  recommendedDepthMm: number  // lâmina a aplicar
  recommendedSpeedPercent: number | null
}

// ─── Auxiliares matemáticos ──────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// Pressão de vapor de saturação para temperatura T (kPa)
function satVaporPressure(T: number): number {
  return 0.6108 * Math.exp((17.27 * T) / (T + 237.3))
}

// Derivada da curva de pressão de saturação Δ (kPa/°C)
function slopeVaporPressure(T: number): number {
  return (4098 * satVaporPressure(T)) / Math.pow(T + 237.3, 2)
}

// ─── Ra extraterrestre FAO-56 Eq. 21-25 ──────────────────────

/** Retorna o número do dia no ano (1–365/366) a partir de YYYY-MM-DD */
function getDayOfYear(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return 1 // fallback seguro para data inválida
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d.getTime() - start.getTime()
  return Math.max(1, Math.floor(diff / 86400000))
}

/**
 * Ra — radiação extraterrestre (MJ/m²·dia)
 * FAO-56 Eq. 21: Ra = (24/π) × Gsc × dr × (ωs×sin(φ)×sin(δ) + cos(φ)×cos(δ)×sin(ωs))
 * @param latitudeDeg latitude em graus decimais (negativo = hemisfério sul)
 * @param doy         dia do ano (1–365)
 */
export function calcRa(latitudeDeg: number, doy: number): number {
  const Gsc = 0.0820  // constante solar (MJ/m²·min)
  const phi = (Math.PI / 180) * latitudeDeg   // latitude em radianos

  // Distância relativa Terra-Sol (FAO-56 Eq. 23)
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI / 365) * doy)

  // Declinação solar δ (FAO-56 Eq. 24)
  const delta = 0.409 * Math.sin((2 * Math.PI / 365) * doy - 1.39)

  // Ângulo horário ao pôr-do-sol ωs (FAO-56 Eq. 25)
  const cosOmegaS = -Math.tan(phi) * Math.tan(delta)
  const omegaS = Math.acos(Math.max(-1, Math.min(1, cosOmegaS)))

  // Ra (MJ/m²·dia) — FAO-56 Eq. 21
  const Ra = (24 * 60 / Math.PI) * Gsc * dr *
    (omegaS * Math.sin(phi) * Math.sin(delta) +
     Math.cos(phi) * Math.cos(delta) * Math.sin(omegaS))

  return Math.max(0, Ra)
}

// ─── Etapa 1: ETo Penman-Monteith FAO-56 ─────────────────────

export function calcETo(weather: WeatherInput): number {
  const { tempMax, tempMin, humidity, windSpeed, solarRadiation, altitude = 650, latitude, date } = weather

  const T = (tempMax + tempMin) / 2

  // Rs: radiação solar (W/m² → MJ/m²·dia: × 0.0864)
  const Rs = solarRadiation * 0.0864

  // Pressão atmosférica estimada pela altitude (kPa)
  const P = 101.3 * Math.pow((293 - 0.0065 * altitude) / 293, 5.26)

  // Constante psicrométrica γ (kPa/°C)
  const gamma = 0.000665 * P

  // Curva de pressão de saturação
  const esTmax = satVaporPressure(tempMax)
  const esTmin = satVaporPressure(tempMin)
  const es = (esTmax + esTmin) / 2

  // Pressão de vapor atual (kPa)
  const ea = (humidity / 100) * es

  // Δ — inclinação da curva a temperatura média
  const delta = slopeVaporPressure(T)

  // Rns: radiação de onda curta líquida
  const Rns = (1 - 0.23) * Rs

  // Ra: radiação extraterrestre — calculada pela latitude+data (FAO-56 Eq. 21) ou fallback 12.5
  const Ra = (latitude !== undefined && latitude !== null && date)
    ? calcRa(latitude, getDayOfYear(date))
    : 12.5  // MJ/m²·dia — fallback Brasil Central (≈ latitude -22°, equinócio)

  const Rso = (0.75 + 0.00002 * altitude) * Ra
  const rsRso = clamp(Rs / Rso, 0.25, 1.0)
  const Rnl = 4.903e-9 * ((Math.pow(tempMax + 273.16, 4) + Math.pow(tempMin + 273.16, 4)) / 2) *
    (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * rsRso - 0.35)

  // Rn: radiação líquida total
  const Rn = Math.max(0, Rns - Rnl)

  // G = 0 para cálculo diário (FAO-56 simplificado)
  const G = 0

  // ETo Penman-Monteith (mm/dia)
  const numerator = 0.408 * delta * (Rn - G) + gamma * (900 / (T + 273)) * windSpeed * (es - ea)
  const denominator = delta + gamma * (1 + 0.34 * windSpeed)

  return Math.max(0, numerator / denominator)
}

// ─── Etapa 2: Kc interpolado por DAS e fase da cultura ───────

interface StageInfo {
  stage: number      // 1..4
  kc: number
  rootDepthCm: number
  fFactor: number
}

export function getStageInfoForDas(crop: Crop, das: number): StageInfo {
  const s1 = crop.stage1_days ?? 15
  const s2 = crop.stage2_days ?? 35
  const s3 = crop.stage3_days ?? 40
  const s4 = crop.stage4_days ?? 30

  const kcIni   = crop.kc_ini   ?? 0.55
  const kcMid   = crop.kc_mid   ?? 1.15
  const kcFinal = crop.kc_final ?? 0.45

  const r1 = crop.root_depth_stage1_cm ?? 20
  const r2 = crop.root_depth_stage2_cm ?? r1
  const r3 = crop.root_depth_stage3_cm ?? r2
  const r4 = crop.root_depth_stage4_cm ?? r3

  const f1 = crop.f_factor_stage1 ?? 0.55
  const f2 = crop.f_factor_stage2 ?? f1
  const f3 = crop.f_factor_stage3 ?? f2
  const f4 = crop.f_factor_stage4 ?? f3

  const dasClamp = Math.max(1, das)

  // Fase 1 — Kc constante = kc_ini
  if (dasClamp <= s1) {
    return { stage: 1, kc: kcIni, rootDepthCm: r1, fFactor: f1 }
  }

  // Fase 2 — Kc linear de kc_ini → kc_mid
  if (dasClamp <= s1 + s2) {
    const progress = (dasClamp - s1) / s2
    const kc = kcIni + (kcMid - kcIni) * progress
    const root = r1 + (r2 - r1) * progress
    return { stage: 2, kc, rootDepthCm: root, fFactor: f2 }
  }

  // Fase 3 — Kc constante = kc_mid
  if (dasClamp <= s1 + s2 + s3) {
    return { stage: 3, kc: kcMid, rootDepthCm: r3, fFactor: f3 }
  }

  // Fase 4 — Kc linear de kc_mid → kc_final
  const s4Start = s1 + s2 + s3
  const progress = Math.min((dasClamp - s4Start) / s4, 1)
  const kc = kcMid + (kcFinal - kcMid) * progress
  return { stage: 4, kc, rootDepthCm: r4, fFactor: f4 }
}

export function getKcForDas(crop: Crop, das: number): number {
  return getStageInfoForDas(crop, das).kc
}

export function getRootDepthForDas(crop: Crop, das: number): number {
  return getStageInfoForDas(crop, das).rootDepthCm
}

export function getFFactorForDas(crop: Crop, das: number): number {
  return getStageInfoForDas(crop, das).fFactor
}

// ─── Etapa 3: CTA e CAD ──────────────────────────────────────

/** CTA = ((CC - PM) / 10) × Ds × profundidade_raiz_cm */
export function calcCTA(
  fieldCapacity: number,
  wiltingPoint: number,
  bulkDensity: number,
  rootDepthCm: number
): number {
  return ((fieldCapacity - wiltingPoint) / 10) * bulkDensity * rootDepthCm
}

/** CAD = CTA × f (f=0 → fallback to 0.5 to avoid zero-CAD edge case) */
export function calcCAD(cta: number, fFactor: number): number {
  const f = fFactor > 0 ? fFactor : 0.5
  return cta * f
}

// ─── Etapa 4: ETc ────────────────────────────────────────────

export function calcEtc(eto: number, kc: number, ks = 1): number {
  return eto * kc * ks
}

// ─── Etapa 5: Balanço hídrico diário ─────────────────────────

/**
 * ADc(t) = ADc(t-1) + chuva + irrigação - ETc
 * Limitado ao intervalo [0, CTA]
 */
export function calcADc(
  adcPrev: number,
  rainfall: number,
  irrigation: number,
  etc: number,
  cta: number
): number {
  const newAdc = adcPrev + rainfall + irrigation - etc
  return clamp(newAdc, 0, cta)
}

// ─── Etapa 6: Coeficiente de estresse ────────────────────────

/** Ks = 1 se ADc >= CAD; Ks = ADc/CAD se abaixo */
export function calcKs(adc: number, cad: number): number {
  if (cad <= 0) return 1
  if (adc >= cad) return 1
  return clamp(adc / cad, 0, 1)
}

// ─── Etapa 7: Status semáforo ─────────────────────────────────

export function getIrrigationStatus(
  adc: number,
  cad: number,
  isIrrigating = false
): IrrigationStatus {
  if (isIrrigating) return 'azul'
  if (adc >= cad) return 'verde'
  if (adc >= cad * 0.5) return 'amarelo'
  return 'vermelho'
}

// ─── Etapa 8: Recomendação de irrigação ──────────────────────

/** Lâmina necessária para atingir 100% da CAD */
export function calcRecommendedIrrigation(cad: number, adc: number): number {
  return Math.max(0, cad - adc)
}

/**
 * Encontra a menor % de velocidade do pivô que aplica ao menos a lâmina necessária.
 * Se não encontrar (sem tabela ou lâmina = 0), retorna null.
 */
export function findRecommendedSpeed(
  pivot: Pivot,
  depthMm: number
): number | null {
  if (depthMm <= 0 || !pivot.time_360_h || !pivot.flow_rate_m3h || !pivot.length_m) return null

  // Lâmina bruta para cada % de velocidade (10..100) usando geometria do pivô
  // Área = π × r² (m²); fluxo total = flow_rate_m3h (m³/h)
  // Tempo a speed% = time_360_h / (speed% / 100) em horas
  // Volume aplicado = flow_rate_m3h × Tempo
  // Lâmina = Volume / Área_m²  × 1000 (para mm)
  const area = Math.PI * Math.pow(pivot.length_m, 2)

  // Encontra menor velocidade que aplica >= depthMm
  for (let speed = 100; speed >= 10; speed -= 10) {
    const durHours = pivot.time_360_h / (speed / 100)
    const volumeM3 = pivot.flow_rate_m3h * durHours
    const lamina = (volumeM3 / area) * 1000 // mm

    if (lamina >= depthMm) {
      // Continua reduzindo para encontrar o mínimo necessário
      // Queremos a MAIOR velocidade (menor tempo) que ainda atinge a lâmina
      continue
    } else {
      // Speed anterior era o menor que atendia
      const prevSpeed = speed + 10
      return prevSpeed <= 100 ? prevSpeed : null
    }
  }

  // Velocidade 10% é suficiente
  return 10
}

// ─── Função principal: calcula tudo de uma vez ────────────────

export interface BalanceInput {
  weather: WeatherInput
  crop: Crop
  das: number
  fieldCapacity: number   // %
  wiltingPoint: number    // %
  bulkDensity: number     // g/cm³
  adcPrev: number         // mm — ADc do dia anterior
  rainfall: number        // mm
  irrigation: number      // mm aplicada (pode ser 0)
  pivot?: Pivot | null
  isIrrigating?: boolean
}

// ─── Projeção de N dias ───────────────────────────────────────

export interface ProjectionDay {
  date: string              // YYYY-MM-DD
  das: number
  cropStage: number
  kc: number
  etcAvg: number            // ETc estimada (mm) usando ETo média
  adcProjected: number      // ADc projetado (mm)
  cta: number
  cad: number
  fieldCapacityPercent: number
  status: IrrigationStatus
  recommendedDepthMm: number
  recommendedSpeedPercent: number | null
  isIrrigationDay: boolean  // true = primeiro dia abaixo da CAD
}

/**
 * Projeta o balanço hídrico para os próximos `days` dias.
 * Usa ETo média dos últimos registros como estimativa futura.
 * Opcionalmente aceita arrays de ETo e chuva por dia (forecast real).
 */
export function calcProjection(params: {
  crop: Crop
  startDate: string      // data de hoje (YYYY-MM-DD)
  startDas: number       // DAS de hoje
  startAdc: number       // ADc atual (mm) após o registro de hoje
  fieldCapacity: number
  wiltingPoint: number
  bulkDensity: number
  avgEto: number         // ETo média dos últimos dias (mm/dia) — fallback
  pivot?: Pivot | null
  days?: number
  etoByDay?: number[]      // ETo real por dia (index 0 = D+1); sobrepõe avgEto
  rainfallByDay?: number[] // chuva prevista por dia (mm); sobrepõe 0
}): ProjectionDay[] {
  const { crop, startDate, startDas, startAdc, fieldCapacity, wiltingPoint, bulkDensity, avgEto, pivot, days = 7, etoByDay, rainfallByDay } = params

  const results: ProjectionDay[] = []
  let adcPrev = startAdc
  let firstIrrigationMarked = false

  for (let i = 1; i <= days; i++) {
    const d = new Date(startDate + 'T12:00:00')
    d.setDate(d.getDate() + i)
    const date = d.toISOString().split('T')[0]
    const das = startDas + i

    const stageInfo = getStageInfoForDas(crop, das)
    const { stage: cropStage, kc, rootDepthCm, fFactor } = stageInfo

    const cta = calcCTA(fieldCapacity, wiltingPoint, bulkDensity, rootDepthCm)
    const cad = calcCAD(cta, fFactor)

    const etoForDay = etoByDay?.[i - 1] ?? avgEto
    const rainfallForDay = rainfallByDay?.[i - 1] ?? 0
    const etcAvg = calcEtc(etoForDay, kc)

    const adcProjected = calcADc(adcPrev, rainfallForDay, 0, etcAvg, cta)
    const fieldCapacityPercent = cta > 0 ? (adcProjected / cta) * 100 : 0
    const status = getIrrigationStatus(adcProjected, cad)
    const recommendedDepthMm = calcRecommendedIrrigation(cad, adcProjected)
    const recommendedSpeedPercent = pivot ? findRecommendedSpeed(pivot, recommendedDepthMm) : null

    // Marca o primeiro dia que cai abaixo da CAD
    const isIrrigationDay = !firstIrrigationMarked && adcProjected < cad
    if (isIrrigationDay) firstIrrigationMarked = true

    results.push({
      date, das, cropStage, kc, etcAvg,
      adcProjected, cta, cad, fieldCapacityPercent,
      status, recommendedDepthMm, recommendedSpeedPercent,
      isIrrigationDay,
    })

    adcPrev = adcProjected
  }

  return results
}

export function calcFullBalance(input: BalanceInput): WaterBalanceResult {
  const { weather, crop, das, fieldCapacity, wiltingPoint, bulkDensity, adcPrev, rainfall, irrigation, pivot, isIrrigating } = input

  const stageInfo = getStageInfoForDas(crop, das)
  const { stage: cropStage, kc, rootDepthCm, fFactor } = stageInfo

  const cta = calcCTA(fieldCapacity, wiltingPoint, bulkDensity, rootDepthCm)
  const cad = calcCAD(cta, fFactor)

  const eto = calcETo(weather)
  const etc = calcEtc(eto, kc)

  const adcNew = calcADc(adcPrev, rainfall, irrigation, etc, cta)
  const ks = calcKs(adcNew, cad)
  const fieldCapacityPercent = cta > 0 ? (adcNew / cta) * 100 : 0

  const status = getIrrigationStatus(adcNew, cad, isIrrigating)
  const recommendedDepthMm = calcRecommendedIrrigation(cad, adcNew)
  const recommendedSpeedPercent = pivot ? findRecommendedSpeed(pivot, recommendedDepthMm) : null

  return {
    das,
    cropStage,
    kc,
    rootDepthCm,
    fFactor,
    cta,
    cad,
    eto,
    etc,
    adcNew,
    ks,
    fieldCapacityPercent,
    status,
    recommendedDepthMm,
    recommendedSpeedPercent,
  }
}

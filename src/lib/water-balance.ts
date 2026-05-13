// ============================================================
// Funções de Balanço Hídrico FAO-56 — IrrigaAgro
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
  excessMm: number      // mm — excesso que transbordou da CTA (0 se não houve)
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

const ROOT_DEPTH_MAX_CM = 40 // limite prático por compactação de solo

/**
 * Calcula a profundidade de raiz para um dado DAS.
 * Usa crescimento contínuo (cm/dia) quando disponível,
 * limitado ao máximo prático de 40 cm.
 */
function calcRootDepthCm(crop: Crop, das: number): number {
  const rate    = crop.root_growth_rate_cm_day ?? null
  const initial = crop.root_initial_depth_cm  ?? null
  const startDas = crop.root_start_das        ?? null

  if (rate != null && initial != null && startDas != null) {
    // Modelo contínuo: cresce rate cm/dia a partir de startDas
    const growthDays = Math.max(0, das - startDas)
    return Math.min(initial + rate * growthDays, ROOT_DEPTH_MAX_CM)
  }

  // Fallback: modelo por estágio (campos legados)
  const s1 = crop.stage1_days ?? 15
  const s2 = crop.stage2_days ?? 35
  const s3 = crop.stage3_days ?? 40

  const r1 = crop.root_depth_stage1_cm ?? 20
  const r2 = crop.root_depth_stage2_cm ?? r1
  const r3 = crop.root_depth_stage3_cm ?? r2
  const r4 = crop.root_depth_stage4_cm ?? r3

  const dasClamp = Math.max(1, das)

  if (dasClamp <= s1) return Math.min(r1, ROOT_DEPTH_MAX_CM)
  if (dasClamp <= s1 + s2) {
    const progress = (dasClamp - s1) / s2
    return Math.min(r1 + (r2 - r1) * progress, ROOT_DEPTH_MAX_CM)
  }
  if (dasClamp <= s1 + s2 + s3) return Math.min(r3, ROOT_DEPTH_MAX_CM)
  return Math.min(r4, ROOT_DEPTH_MAX_CM)
}

export function getStageInfoForDas(crop: Crop, das: number): StageInfo {
  const s1 = crop.stage1_days ?? 15
  const s2 = crop.stage2_days ?? 35
  const s3 = crop.stage3_days ?? 40
  const s4 = crop.stage4_days ?? 30

  const kcIni   = crop.kc_ini   ?? 0.55
  const kcMid   = crop.kc_mid   ?? 1.15
  const kcFinal = crop.kc_final ?? 0.45

  const f1 = crop.f_factor_stage1 ?? 0.40
  const f2 = crop.f_factor_stage2 ?? f1
  const f3 = crop.f_factor_stage3 ?? f2
  const f4 = crop.f_factor_stage4 ?? f3

  const dasClamp = Math.max(1, das)
  const rootDepthCm = calcRootDepthCm(crop, dasClamp)

  // Fase 1 — Kc constante = kc_ini
  if (dasClamp <= s1) {
    return { stage: 1, kc: kcIni, rootDepthCm, fFactor: f1 }
  }

  // Fase 2 — Kc linear de kc_ini → kc_mid
  if (dasClamp <= s1 + s2) {
    const progress = (dasClamp - s1) / s2
    const kc = kcIni + (kcMid - kcIni) * progress
    return { stage: 2, kc, rootDepthCm, fFactor: f2 }
  }

  // Fase 3 — Kc constante = kc_mid
  if (dasClamp <= s1 + s2 + s3) {
    return { stage: 3, kc: kcMid, rootDepthCm, fFactor: f3 }
  }

  // Fase 4 — Kc linear de kc_mid → kc_final
  const s4Start = s1 + s2 + s3
  const progress = Math.min((dasClamp - s4Start) / s4, 1)
  const kc = kcMid + (kcFinal - kcMid) * progress
  return { stage: 4, kc, rootDepthCm, fFactor: f4 }
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

/**
 * CTA = ((CC - PM) / 10) × Ds × profundidade_raiz_cm
 * CC e PM são gravimétricos (%), Ds em g/cm³, profundidade em cm → resultado em mm
 */
export function calcCTA(
  fieldCapacity: number,
  wiltingPoint: number,
  bulkDensity: number,
  rootDepthCm: number
): number {
  return ((fieldCapacity - wiltingPoint) / 10) * bulkDensity * rootDepthCm
}

/**
 * adCrítica (CAD) = CTA × (1 - f)
 * f = fração de depleção permitida antes do estresse (FAO-56 Tabela 22)
 * Para milho: f = 0.55 → CAD = 45% da CTA → irrigar acima de ~72% do campo
 * Fallback: f=0.5 → CAD = 50% da CTA
 */
export function calcCAD(cta: number, fFactor: number): number {
  const f = fFactor > 0 ? fFactor : 0.5
  return cta * (1 - f)
}

// ─── Etapa 4: ETc ────────────────────────────────────────────

export function calcEtc(eto: number, kc: number, ks = 1): number {
  return eto * kc * ks
}

// ─── Etapa 5: Balanço hídrico diário ─────────────────────────

/**
 * ADc(t) = ADc(t-1) + chuvaEfetiva + irrigação - ETc
 * chuvaEfetiva = min(chuva, espaço livre no perfil) — spec seção 9.1
 * Excesso de chuva que transborda a CTA não é contabilizado.
 * Resultado limitado ao intervalo [0, CTA].
 *
 * Quando a CTA cresce (raiz aprofunda entre um dia e outro), o solo recém
 * acessível já contém água proporcional à umidade atual do perfil explorado.
 * Escalamos o ADc antes de aplicar o balanço do dia:
 *   adcEscalado = adcPrev × (ctaNova / ctaAnterior)
 * Exemplo: raiz 12→20cm, adcPrev=18mm, ctaPrev=20.7mm, ctaNova=34.5mm
 *   → adcEscalado = 18 × (34.5/20.7) = 30mm  (mesma % CC, mais mm)
 */
export function calcADc(
  adcPrev: number,
  rainfall: number,
  irrigation: number,
  etc: number,
  cta: number,
  ctaPrev?: number  // CTA do dia anterior; se maior que cta, sem efeito
): number {
  return calcADcWithExcess(adcPrev, rainfall, irrigation, etc, cta, ctaPrev).adc
}

/**
 * Igual a calcADc, mas também retorna o excesso hídrico do dia (mm).
 * Excesso = água que o solo não conseguiu reter (transbordou da CTA).
 * Fontes: chuva acima do espaço livre + irrigação acima do espaço restante.
 */
export function calcADcWithExcess(
  adcPrev: number,
  rainfall: number,
  irrigation: number,
  etc: number,
  cta: number,
  ctaPrev?: number
): { adc: number; excessMm: number; peakReachedCta: boolean } {
  // Escala quando a raiz cresceu (CTA aumentou)
  const adcBase = (ctaPrev && ctaPrev > 0 && cta > ctaPrev)
    ? adcPrev * (cta / ctaPrev)
    : adcPrev

  const espacoLivre = Math.max(0, cta - adcBase)
  const chuvaEfetiva = Math.min(Math.max(0, rainfall), espacoLivre)

  // Pico intradiário: solo chegou à CC (por chuva ou irrigação)?
  const adcPosAgua = adcBase + chuvaEfetiva + Math.max(0, irrigation)
  const peakReachedCta = adcPosAgua >= cta

  const newAdcBruto = adcPosAgua - etc
  const adc = clamp(newAdcBruto, 0, cta)

  // irn_mm = excesso de IRRIGAÇÃO apenas (água controlável pelo gestor).
  // Chuva excessiva é perda não controlável — não é KPI de gestão (FAO-56 / USDA-NRCS).
  // Calcula quanto da irrigação aplicada transbordou a CTA após chuva efetiva + ETc.
  const adcAposChuvaEtc = clamp(adcBase + chuvaEfetiva - etc, 0, cta)
  const espacoLivreParaIrrigacao = Math.max(0, cta - adcAposChuvaEtc)
  const excessMm = Math.max(0, Math.max(0, irrigation) - espacoLivreParaIrrigacao)

  return { adc, excessMm, peakReachedCta }
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
  isIrrigating = false,
  cta = 0,
  alertThresholdPct: number | null = null
): IrrigationStatus {
  if (isIrrigating) return 'azul'

  // Paleta unificada: Verde ≥75% | Âmbar 60–75% | Vermelho <60%
  // Independe do threshold configurado — threshold é só o gatilho de alarme,
  // as faixas de cor são fixas para consistência visual em todo o sistema.
  if (cta > 0) {
    const pct = (adc / cta) * 100
    if (pct >= 75) return 'verde'
    if (pct >= 60) return 'amarelo'
    return 'vermelho'
  }

  // Fallback sem CTA: usa CAD como referência
  if (adc >= cad * 0.75) return 'verde'
  if (adc >= cad * 0.60) return 'amarelo'
  return 'vermelho'
}

// ─── Etapa 8: Recomendação de irrigação ──────────────────────

/**
 * Lâmina necessária para irrigação.
 *
 * Se o pivô tem threshold e target configurados:
 *   - Dispara quando ADc < threshold_mm (ex: 70% de CTA)
 *   - Repõe até target_mm (ex: 80% de CTA)
 *
 * Caso contrário (comportamento padrão FAO-56):
 *   - Dispara quando ADc < CAD
 *   - Repõe até CTA (100% de campo)
 */
export function calcRecommendedIrrigation(
  cta: number,
  cad: number,
  adc: number,
  alertThresholdPct: number | null = null,
  targetPct: number | null = null
): number {
  if (alertThresholdPct != null && cta > 0) {
    const thresholdMm = (alertThresholdPct / 100) * cta
    if (adc >= thresholdMm) return 0
    const replenishTo = targetPct != null ? (targetPct / 100) * cta : cta
    return Math.max(0, replenishTo - adc)
  }
  if (adc >= cad) return 0
  return Math.max(0, cta - adc)
}

/**
 * Encontra a menor % de velocidade do pivô que aplica ao menos a lâmina necessária.
 * Aplica correção pelo CUC: lâmina_bruta = lâmina_líquida / (CUC/100)
 * Garante que o ponto mais seco do pivô receba a lâmina mínima necessária.
 * CUC=90% → precisa aplicar 11% a mais para cobrir a não-uniformidade.
 */
export function findRecommendedSpeed(
  pivot: Pivot,
  depthMm: number
): number | null {
  if (depthMm <= 0 || !pivot.time_360_h || !pivot.flow_rate_m3h || !pivot.length_m) return null

  // Corrige lâmina pelo CUC: divide pela eficiência de distribuição
  // Ex: precisa 10mm, CUC=90% → aplica 10/0.90 = 11.1mm para garantir
  // cobertura mínima em toda a área (ponto mais seco recebe 10mm)
  const cuc = (pivot.cuc_percent ?? 85) / 100
  const depthCorrected = depthMm / cuc

  // Lâmina bruta para cada % de velocidade (10..100) usando geometria do pivô
  // Área = π × r² (m²); fluxo total = flow_rate_m3h (m³/h)
  // Tempo a speed% = time_360_h / (speed% / 100) em horas
  // Volume aplicado = flow_rate_m3h × Tempo
  // Lâmina = Volume / Área_m²  × 1000 (para mm)
  const area = Math.PI * Math.pow(pivot.length_m, 2)

  // min_speed_percent = limite operacional mínimo (ex: 42% = não pode ir mais devagar)
  // Isso equivale à lâmina máxima que o solo absorve sem saturar.
  // A velocidade recomendada deve ser >= min_speed_percent.
  const speedFloor = pivot.min_speed_percent ?? 10

  // Encontra a MAIOR velocidade (menor tempo) que aplica >= depthCorrected
  // respeitando o limite mínimo operacional.
  // Itera de speedFloor → 100%: velocidade maior = menos tempo = menos lâmina.
  // Retorna a maior % que ainda cobre a lâmina necessária.
  let bestSpeed: number | null = null

  // Monta lista de velocidades a testar: speedFloor exato + múltiplos de 5 acima dele
  // Ex: speedFloor=47 → [47, 50, 55, 60, ..., 100]
  // Ex: speedFloor=42 → [42, 45, 50, 55, ..., 100]
  const speedsToTest: number[] = []
  // Inclui o speedFloor exato para não perder lâminas abaixo do próximo múltiplo de 5
  speedsToTest.push(speedFloor)
  const firstMultiple = Math.ceil(speedFloor / 5) * 5
  for (let speed = firstMultiple; speed <= 100; speed += 5) {
    if (speed > speedFloor) speedsToTest.push(speed)
  }

  for (const speed of speedsToTest) {
    const durHours = pivot.time_360_h / (speed / 100)
    const volumeM3 = pivot.flow_rate_m3h * durHours
    const lamina = (volumeM3 / area) * 1000 // mm

    if (lamina >= depthCorrected) {
      bestSpeed = speed // velocidade maior que ainda cobre a lâmina necessária
    }
  }

  // Se nenhuma velocidade acima do mínimo cobre a lâmina, retorna o mínimo
  // (lâmina necessária > capacidade por volta — pivô precisará de mais de uma passagem)
  if (bestSpeed === null) {
    const durMin = pivot.time_360_h / (speedFloor / 100)
    const laminaMin = (pivot.flow_rate_m3h * durMin / area) * 1000
    if (laminaMin > 0) return speedFloor
  }

  return bestSpeed
}

/** Dado uma % de velocidade, retorna a lâmina bruta que o pivô aplica (mm). */
export function calcDepthForSpeed(pivot: Pivot, speedPercent: number): number | null {
  if (speedPercent <= 0 || !pivot.time_360_h || !pivot.flow_rate_m3h || !pivot.length_m) return null
  const area = Math.PI * Math.pow(pivot.length_m, 2)
  const durHours = pivot.time_360_h / (speedPercent / 100)
  const volumeM3 = pivot.flow_rate_m3h * durHours
  return (volumeM3 / area) * 1000 // mm bruto
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
  recommendedDepthMm: number      // lâmina se já atingiu o threshold (vermelho)
  estimatedDepthMm: number        // lâmina estimada para repor ao alvo (amarelo+vermelho)
  estimatedSpeedPercent: number | null  // velocidade para a lâmina estimada
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
  irrigationByDay?: number[] // irrigação simulada por dia (mm brutos, index 0 = D+1) — CUC aplicado internamente
}): ProjectionDay[] {
  const { crop, startDate, startDas, startAdc, fieldCapacity, wiltingPoint, bulkDensity, avgEto, pivot, days = 7, etoByDay, rainfallByDay, irrigationByDay } = params
  const alertThresholdPct = pivot?.alert_threshold_percent ?? null
  const irrigationTargetPct = pivot?.irrigation_target_percent ?? null
  const cuc = (pivot?.cuc_percent ?? 85) / 100

  // ── Passo 1: projeção "seca" — sem irrigação — para encontrar quando o solo
  // vai cruzar o threshold. Isso permite antecipar a irrigação 1 dia.
  interface DryDay { adcDry: number; cta: number; cad: number; ctaPrev: number; etcAvg: number; rainfall: number; das: number; kc: number; cropStage: number; fFactor: number; rootDepthCm: number }
  const dryDays: DryDay[] = []
  let adcDry = startAdc
  for (let i = 1; i <= days; i++) {
    const das = startDas + i
    const stageInfo = getStageInfoForDas(crop, das)
    const { stage: cropStage, kc, rootDepthCm, fFactor } = stageInfo
    const cta = calcCTA(fieldCapacity, wiltingPoint, bulkDensity, rootDepthCm)
    const cad = calcCAD(cta, fFactor)
    const dasPrev = das - 1
    const stageInfoPrev = dasPrev > 0 ? getStageInfoForDas(crop, dasPrev) : stageInfo
    const ctaPrev = calcCTA(fieldCapacity, wiltingPoint, bulkDensity, stageInfoPrev.rootDepthCm)
    const etoForDay = etoByDay?.[i - 1] ?? avgEto
    const rainfallForDay = rainfallByDay?.[i - 1] ?? 0
    const etcAvg = calcEtc(etoForDay, kc)
    adcDry = calcADc(adcDry, rainfallForDay, 0, etcAvg, cta, ctaPrev)
    dryDays.push({ adcDry, cta, cad, ctaPrev, etcAvg, rainfall: rainfallForDay, das, kc, cropStage, fFactor, rootDepthCm })
  }

  // ── Passo 2: projeção totalmente seca — sem simular nenhuma irrigação.
  // O card serve para o agricultor se planejar: quanto precisaria irrigar em cada dia
  // se deixar passar. A lâmina é acumulada (quanto falta para atingir o alvo naquele dia).
  // irrigateDayIdx não é mais usado — todos os dias mostram a lâmina necessária.

  // ── Passo 3: projeção seca — ADc cai livremente, lâmina calculada em cada dia.
  const results: ProjectionDay[] = []
  let adcPrev = startAdc

  for (let i = 1; i <= days; i++) {
    const idx = i - 1
    const dry = dryDays[idx]
    const d = new Date(startDate + 'T12:00:00')
    d.setDate(d.getDate() + i)
    const date = d.toISOString().split('T')[0]

    // ADc totalmente seco (chuva prevista entra, irrigação não)
    const adcDry = calcADc(adcPrev, dry.rainfall, 0, dry.etcAvg, dry.cta, dry.ctaPrev)

    // FC% real projetado sem irrigação
    const fieldCapacityPercent = dry.cta > 0 ? (adcDry / dry.cta) * 100 : 0

    // Status baseado no ADc seco
    const status = getIrrigationStatus(adcDry, dry.cad, false, dry.cta, alertThresholdPct)

    // Lâmina necessária para atingir o alvo neste dia (acumula à medida que o solo seca)
    const recommendedDepthMm = calcRecommendedIrrigation(dry.cta, dry.cad, adcDry, alertThresholdPct, irrigationTargetPct)

    // Lâmina estimada para repor ao alvo, sem guard do threshold — exibida em amarelo também
    const estimatedDepthMm = (() => {
      if (recommendedDepthMm > 0) return recommendedDepthMm
      if (dry.cta <= 0) return 0
      const replenishTo = irrigationTargetPct != null ? (irrigationTargetPct / 100) * dry.cta : dry.cta
      return Math.max(0, replenishTo - adcDry)
    })()

    // Velocidade que o pivô precisaria andar para aplicar essa lâmina
    const recommendedSpeedPercent = pivot && recommendedDepthMm > 0
      ? findRecommendedSpeed(pivot, recommendedDepthMm)
      : null
    const estimatedSpeedPercent = pivot && estimatedDepthMm > 0
      ? findRecommendedSpeed(pivot, estimatedDepthMm)
      : null

    // Respeita irrigationByDay externo (simulação manual pelo usuário)
    let adcNext = adcDry
    if (irrigationByDay?.[idx] && irrigationByDay[idx] > 0) {
      adcNext = Math.min(dry.cta, adcDry + irrigationByDay[idx] * cuc)
    }

    results.push({
      date,
      das: dry.das,
      cropStage: dry.cropStage,
      kc: dry.kc,
      etcAvg: dry.etcAvg,
      adcProjected: adcNext,
      cta: dry.cta,
      cad: dry.cad,
      fieldCapacityPercent,
      status,
      recommendedDepthMm,
      estimatedDepthMm,
      estimatedSpeedPercent,
      recommendedSpeedPercent,
      isIrrigationDay: recommendedDepthMm > 0,
    })

    adcPrev = adcNext
  }

  return results
}

// ─── Motor de Recomendação v2 — Individual + Conjugado ──────

export type RecommendationStatus = 'ok' | 'queue' | 'irrigate_today' | 'operational_risk'

export interface IrrigationRecommendation {
  cadTotalMm: number
  preferredDepthMm: number | null  // lâmina na velocidade preferida do operador
  maxDepthMm: number | null        // lâmina na velocidade mínima (máx do pivô)
  deficitCurrentMm: number         // CTA - ADc (depleção atual)
  etcForecastUntilReturnMm: number
  deficitProjectedMm: number       // depleção + ETc*dias (sem chuva prevista)
  shouldIrrigateToday: boolean
  suggestedSpeedPercent: number | null  // velocidade sugerida
  status: RecommendationStatus
  reason: string                   // mensagem clara em pt-BR
}

/**
 * Recomendação de irrigação para pivô individual ou conjugado.
 *
 * REGRA: chuva prevista NÃO entra na decisão. Só conta chuva que de fato ocorreu.
 * O déficit projetado = depleção atual + ETc × dias de retorno.
 *
 * Usa as velocidades reais do pivô:
 * - preferredSpeedPercent: velocidade que o agricultor costuma usar (ex: 50%)
 * - minSpeedPercent: velocidade mínima = máxima lâmina possível (ex: 42%)
 *
 * Para individual: returnIntervalDays=1, sem limite → comporta como hoje.
 * Para conjugado: projeta N dias e compara com a capacidade real do pivô.
 */
export function getConjugatedRecommendation(input: {
  cta: number
  cad: number
  adcCurrent: number
  etcMmPerDay: number
  returnIntervalDays: number
  pivot: Pivot | null
  /** ETo forecast real por dia (D+1…D+N). Se fornecido, usa soma em vez de etcMmPerDay×dias. */
  etcForecastMm?: number[]
}): IrrigationRecommendation {
  const { cta, cad, adcCurrent, etcMmPerDay, returnIntervalDays, pivot, etcForecastMm } = input

  const deficitCurrentMm = Math.max(0, cta - adcCurrent)
  // Usa forecast real (primeiros returnIntervalDays dias) se disponível; fallback: média × dias
  const etcForecast = etcForecastMm && etcForecastMm.length > 0
    ? etcForecastMm.slice(0, returnIntervalDays).reduce((a, b) => a + b, 0)
    : etcMmPerDay * returnIntervalDays
  const deficitProjected = deficitCurrentMm + etcForecast

  // Calcular lâminas reais a partir das velocidades do pivô
  const preferredSpeed = pivot?.preferred_speed_percent ?? null
  const minSpeed = pivot?.min_speed_percent ?? null
  const preferredDepthMm = (pivot && preferredSpeed) ? calcDepthForSpeed(pivot, preferredSpeed) : null
  const maxDepthMm = (pivot && minSpeed) ? calcDepthForSpeed(pivot, minSpeed) : null

  // Limite operacional: lâmina máxima que o pivô aguenta (velocidade mínima)
  // Se não configurado, usa CAD como limite (comportamento padrão)
  const operationalLimit = maxDepthMm != null ? Math.min(cad, maxDepthMm) : cad

  // Risco operacional: ETc por ciclo > lâmina máxima do pivô
  // Se em N dias a planta consome mais do que o pivô aplica no máximo, não tem como repor
  if (maxDepthMm != null && etcForecast > maxDepthMm) {
    return {
      cadTotalMm: cad,
      preferredDepthMm,
      maxDepthMm,
      deficitCurrentMm,
      etcForecastUntilReturnMm: etcForecast,
      deficitProjectedMm: deficitProjected,
      shouldIrrigateToday: true,
      suggestedSpeedPercent: minSpeed,
      status: 'operational_risk',
      reason: `Risco: ETc até retorno (${etcForecast.toFixed(1)}mm em ${returnIntervalDays}d) > lâmina máxima do pivô (${maxDepthMm.toFixed(1)}mm a ${minSpeed}%)`,
    }
  }

  // Limiares: 70% e 100% do limite operacional
  const queueThreshold = operationalLimit * 0.70
  const irrigateThreshold = operationalLimit

  let status: RecommendationStatus
  let reason: string
  let shouldIrrigateToday: boolean
  let suggestedSpeedPercent: number | null = null

  if (deficitProjected >= irrigateThreshold) {
    status = 'irrigate_today'
    shouldIrrigateToday = true

    // Sugerir velocidade: preferida se cabe, senão mínima
    if (preferredDepthMm != null && preferredDepthMm >= deficitProjected) {
      suggestedSpeedPercent = preferredSpeed
      reason = `Irrigar a ${preferredSpeed}% (${preferredDepthMm.toFixed(1)}mm) — déficit projetado ${deficitProjected.toFixed(1)}mm`
    } else if (maxDepthMm != null) {
      suggestedSpeedPercent = minSpeed
      reason = `Irrigar a ${minSpeed}% (${maxDepthMm.toFixed(1)}mm) — déficit projetado ${deficitProjected.toFixed(1)}mm excede a preferida`
    } else {
      // Sem velocidades configuradas, usa lógica padrão
      suggestedSpeedPercent = pivot ? findRecommendedSpeed(pivot, deficitProjected) : null
      reason = returnIntervalDays > 1
        ? `Irrigar hoje — déficit projetado (${deficitProjected.toFixed(1)}mm) antes da próxima volta em ${returnIntervalDays}d`
        : `Irrigar hoje — déficit (${deficitProjected.toFixed(1)}mm) atingiu o limite (${irrigateThreshold.toFixed(1)}mm)`
    }
  } else if (deficitProjected >= queueThreshold) {
    status = 'queue'
    shouldIrrigateToday = false
    suggestedSpeedPercent = preferredSpeed
    reason = `Fila — déficit projetado (${deficitProjected.toFixed(1)}mm) se aproxima do limite (${irrigateThreshold.toFixed(1)}mm)`
  } else {
    status = 'ok'
    shouldIrrigateToday = false
    reason = 'Sem necessidade de irrigação'
  }

  return {
    cadTotalMm: cad,
    preferredDepthMm,
    maxDepthMm,
    deficitCurrentMm,
    etcForecastUntilReturnMm: etcForecast,
    deficitProjectedMm: deficitProjected,
    shouldIrrigateToday,
    suggestedSpeedPercent,
    status,
    reason,
  }
}

// ─── Função principal: calcula tudo de uma vez ────────────────

export function calcFullBalance(input: BalanceInput): WaterBalanceResult {
  const { weather, crop, das, fieldCapacity, wiltingPoint, bulkDensity, adcPrev, rainfall, irrigation, pivot, isIrrigating } = input

  const stageInfo = getStageInfoForDas(crop, das)
  const { stage: cropStage, kc, rootDepthCm, fFactor } = stageInfo

  const cta = calcCTA(fieldCapacity, wiltingPoint, bulkDensity, rootDepthCm)
  const cad = calcCAD(cta, fFactor)

  const dasPrev = das - 1
  const stageInfoPrev = dasPrev > 0 ? getStageInfoForDas(crop, dasPrev) : stageInfo
  const ctaPrev = calcCTA(fieldCapacity, wiltingPoint, bulkDensity, stageInfoPrev.rootDepthCm)

  const eto = calcETo(weather)
  const etc = calcEtc(eto, kc)

  const { adc: adcNew, excessMm, peakReachedCta } = calcADcWithExcess(adcPrev, rainfall, irrigation, etc, cta, ctaPrev)
  const ks = calcKs(adcNew, cad)
  // FC% real ao final do dia (pós-ETc) — valor que o agricultor encontra no campo
  // peakReachedCta indica que passou por CC durante o dia, mas o valor exibido é o pós-ETc
  const fieldCapacityPercent = cta > 0 ? (adcNew / cta) * 100 : 0

  const alertThresholdPct = pivot?.alert_threshold_percent ?? null
  const irrigationTargetPct = pivot?.irrigation_target_percent ?? null
  const status = getIrrigationStatus(adcNew, cad, isIrrigating, cta, alertThresholdPct)
  const recommendedDepthMm = calcRecommendedIrrigation(cta, cad, adcNew, alertThresholdPct, irrigationTargetPct)
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
    excessMm,
    ks,
    fieldCapacityPercent,
    status,
    recommendedDepthMm,
    recommendedSpeedPercent,
  }
}

import type { Crop, DailyManagement, Farm, Pivot, Season } from '@/types/database'
import {
  calcADcWithExcess,
  calcCAD,
  calcCTA,
  calcEtc,
  calcKs,
  calcRecommendedIrrigation,
  findRecommendedSpeed,
  getConjugatedRecommendation,
  getIrrigationStatus,
  getStageInfoForDas,
  type IrrigationRecommendation,
  type WaterBalanceResult,
  type WeatherInput,
} from '@/lib/water-balance'
import {
  resolveETo,
  type EToConfidence,
  type EToSource,
} from '@/lib/calculations/eto-resolution'
import type { ManagementExternalData } from '@/services/management'

export interface ManagementSeasonFullContext {
  season: Season
  farm: Farm
  pivot: Pivot | null
  crop: Crop | null
}

export interface ResolvedManagementBalance extends WaterBalanceResult {
  etoSource: EToSource
  etoConfidence: EToConfidence | null
  etoNotes: string | null
  recommendation: IrrigationRecommendation | null
}

export interface ComputeManagementBalanceParams {
  context: ManagementSeasonFullContext
  history: DailyManagement[]
  date: string
  tmax: string
  tmin: string
  humidity: string
  wind: string
  radiation: string
  rainfall: string
  actualDepth: string
  actualSpeed: string
  externalData: ManagementExternalData | null
}

export function calcDAS(plantingDate: string, targetDate: string): number {
  const plant = new Date(`${plantingDate}T12:00:00`)
  const target = new Date(`${targetDate}T12:00:00`)
  return Math.max(1, Math.round((target.getTime() - plant.getTime()) / 86400000) + 1)
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function computeResolvedManagementBalance(
  params: ComputeManagementBalanceParams
): ResolvedManagementBalance | null {
  const { context, history, date, tmax, tmin, humidity, wind, radiation, rainfall, actualDepth, actualSpeed, externalData } = params
  const { season, farm, pivot, crop } = context
  if (!crop || !date) return null

  const das = season.planting_date ? calcDAS(season.planting_date, date) : 1
  const stageInfo = getStageInfoForDas(crop, das)
  const fieldCapacity = Number(pivot?.field_capacity ?? season.field_capacity ?? 32)
  const wiltingPoint = Number(pivot?.wilting_point ?? season.wilting_point ?? 14)
  const bulkDensity = Number(pivot?.bulk_density ?? season.bulk_density ?? 1.4)
  const cta = calcCTA(fieldCapacity, wiltingPoint, bulkDensity, stageInfo.rootDepthCm)
  const cad = calcCAD(cta, stageInfo.fFactor)

  const prevRecord = history.find((record) => record.date < date)
  const adcPrev = prevRecord?.ctda
    ?? ((season.initial_adc_percent ?? 100) / 100) * cta

  // CTA do dia anterior — para escalar ADc quando a raiz cresceu
  const dasPrev = das - 1
  const stageInfoPrev = dasPrev > 0 ? getStageInfoForDas(crop, dasPrev) : stageInfo
  const ctaPrev = calcCTA(fieldCapacity, wiltingPoint, bulkDensity, stageInfoPrev.rootDepthCm)

  const tempMax = parseOptionalNumber(tmax)
  const tempMin = parseOptionalNumber(tmin)
  const humidityValue = parseOptionalNumber(humidity)
  const windValue = parseOptionalNumber(wind)
  const radiationValue = parseOptionalNumber(radiation)

  if (tempMax == null || tempMin == null) return null

  const weatherInput: WeatherInput = {
    tempMax,
    tempMin,
    humidity: humidityValue ?? 60,
    windSpeed: windValue ?? 2,
    solarRadiation: radiationValue ?? 200,
    altitude: farm.altitude ?? 650,
    latitude: pivot?.latitude ?? undefined,
    date,
  }

  const correctionFactor = parseFloat(process.env.NEXT_PUBLIC_ETO_CORRECTION_FACTOR ?? '1')

  const etoResolution = resolveETo({
    weatherCorrectedMm: externalData?.weather?.eto_corrected_mm ?? null,
    weatherRawMm: externalData?.weather?.eto_mm ?? null,
    calculationInput: weatherInput,
    manualEtoMm: null,
    etoCorrectionFactor: correctionFactor > 0 && correctionFactor < 1 ? correctionFactor : null,
  })

  if (etoResolution.etoMm == null) return null

  // Chuva: somente rainfall_records (lançamentos manuais/importados pelo gestor).
  // Sensor de estação (Plugfield) NÃO é fonte para chuva — leituras imprecisas.
  // Se não há lançamento manual, assume zero.
  const rainfallMm = parseOptionalNumber(rainfall)
    ?? externalData?.rainfall?.rainfall_mm
    ?? 0
  // Nota: o parâmetro `rainfall` string vem vazio do recalculate/route.ts para forçar
  // o uso exclusivo de externalData.rainfall (rainfall_records). A cadeia acima é correta
  // porque getManagementExternalData já prioriza rainfall_records sobre weather_data.

  const irrigationMm = parseOptionalNumber(actualDepth) ?? 0
  const actualSpeedPercent = parseOptionalNumber(actualSpeed)
  const etc = calcEtc(etoResolution.etoMm, stageInfo.kc)
  const { adc: adcNew, excessMm, peakReachedCta } = calcADcWithExcess(adcPrev, rainfallMm, irrigationMm, etc, cta, ctaPrev)
  const ks = calcKs(adcNew, cad)
  // Se houve excesso (solo saturou durante o dia), exibir 100% no gráfico
  const fieldCapacityPercent = peakReachedCta ? 100 : (cta > 0 ? (adcNew / cta) * 100 : 0)

  // Usa threshold configurado no pivô (ex: 70%) como gatilho
  // e repõe até irrigation_target_percent (ex: 80%) — não necessariamente 100%
  const alertThresholdPct = pivot?.alert_threshold_percent ?? null
  const irrigationTargetPct = pivot?.irrigation_target_percent ?? null

  const status = getIrrigationStatus(adcNew, cad, Boolean(actualSpeedPercent && actualSpeedPercent > 0), cta, alertThresholdPct)
  const recommendedDepthMm = calcRecommendedIrrigation(cta, cad, adcNew, alertThresholdPct, irrigationTargetPct)
  const recommendedSpeedPercent = pivot ? findRecommendedSpeed(pivot, recommendedDepthMm) : null

  // Motor de recomendação v2 — individual ou conjugado
  const recommendation = getConjugatedRecommendation({
    cta,
    cad,
    adcCurrent: adcNew,
    etcMmPerDay: etc,
    returnIntervalDays: pivot?.return_interval_days ?? 1,
    pivot: pivot ?? null,
  })

  return {
    das,
    cropStage: stageInfo.stage,
    kc: stageInfo.kc,
    rootDepthCm: stageInfo.rootDepthCm,
    fFactor: stageInfo.fFactor,
    cta,
    cad,
    eto: etoResolution.etoMm,
    etc,
    adcNew,
    excessMm,
    ks,
    fieldCapacityPercent,
    status,
    recommendedDepthMm,
    recommendedSpeedPercent,
    etoSource: etoResolution.etoSource,
    etoConfidence: etoResolution.etoConfidence,
    etoNotes: etoResolution.etoNotes,
    recommendation,
  }
}

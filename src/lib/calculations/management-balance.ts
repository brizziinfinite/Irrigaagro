import type { Crop, DailyManagement, Farm, Pivot, Season } from '@/types/database'
import { getManagementExternalData } from '@/services/management'
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

/**
 * Projeta o ADc (mm) e % de campo até `targetDate`, partindo do último
 * registro real de `daily_management`.
 *
 * Usa dados climáticos reais do banco quando disponíveis; cai para ETc
 * média do último registro como fallback.
 *
 * Idêntico à lógica do dashboard (dashboard.ts linhas ~108-195) mas
 * extraído para ser reutilizável pelo client-side (Lançamentos).
 */
export async function projectAdcToDate(params: {
  lastManagement: DailyManagement | null
  targetDate: string
  crop: Crop
  season: Season
  farm: Farm
  pivot: Pivot | null
  history: DailyManagement[]
}): Promise<{ adcMm: number; pct: number }> {
  const { lastManagement, targetDate, crop, season, farm, pivot, history } = params

  const das = calcDAS(season.planting_date!, targetDate)
  const stageInfo = getStageInfoForDas(crop, das)
  const CC = Number(pivot?.field_capacity ?? season.field_capacity ?? 32)
  const PM = Number(pivot?.wilting_point  ?? season.wilting_point  ?? 14)
  const Ds = Number(pivot?.bulk_density   ?? season.bulk_density   ?? 1.4)
  const ctaToday = calcCTA(CC, PM, Ds, stageInfo.rootDepthCm)

  if (!lastManagement?.ctda) {
    // Sem histórico: parte do ADc inicial da safra
    const adcMm = ctaToday * ((season.initial_adc_percent ?? 100) / 100)
    const pct   = season.initial_adc_percent ?? 100
    return { adcMm, pct }
  }

  if (lastManagement.date === targetDate) {
    return {
      adcMm: lastManagement.ctda,
      pct:   lastManagement.field_capacity_percent ?? (ctaToday > 0 ? (lastManagement.ctda / ctaToday) * 100 : 0),
    }
  }

  // Avança dia a dia com dados climáticos reais
  const lastDate = lastManagement.date
  const daysSinceRecord = Math.max(1, Math.round(
    (new Date(targetDate + 'T12:00:00').getTime() - new Date(lastDate + 'T12:00:00').getTime()) / 86400000
  ))
  const daysToProcess = Math.min(daysSinceRecord, 14)
  let runningAdc = lastManagement.ctda
  let runningHistory = [...history]

  const context = { season, farm, pivot, crop }

  for (let d = 1; d <= daysToProcess; d++) {
    const gapDate = new Date(lastDate + 'T12:00:00')
    gapDate.setDate(gapDate.getDate() + d)
    const gapDateStr = gapDate.toISOString().split('T')[0]

    try {
      const externalData = await getManagementExternalData(farm.id, pivot?.id ?? null, gapDateStr, pivot)
      // Usa APENAS weather_data do banco — ignora geolocationWeather (Open-Meteo ao vivo)
      // para garantir projeção determinística entre reloads
      const climateSnapshot = externalData.weather

      if (climateSnapshot) {
        const result = computeResolvedManagementBalance({
          context,
          history: runningHistory,
          date: gapDateStr,
          tmax:      climateSnapshot.temp_max          != null ? String(climateSnapshot.temp_max)          : '',
          tmin:      climateSnapshot.temp_min          != null ? String(climateSnapshot.temp_min)          : '',
          humidity:  climateSnapshot.humidity_percent  != null ? String(climateSnapshot.humidity_percent)  : '',
          wind:      climateSnapshot.wind_speed_ms     != null ? String(climateSnapshot.wind_speed_ms)     : '',
          radiation: climateSnapshot.solar_radiation_wm2 != null ? String(climateSnapshot.solar_radiation_wm2) : '',
          rainfall:    '',
          actualDepth: '',
          actualSpeed: '',
          externalData: { ...externalData, geolocationWeather: null },
        })
        if (result) {
          runningAdc = result.adcNew
          runningHistory = [
            { ...lastManagement, date: gapDateStr, ctda: result.adcNew, field_capacity_percent: result.fieldCapacityPercent },
            ...runningHistory,
          ]
          continue
        }
      }
    } catch {
      // fallback silencioso
    }

    // Fallback determinístico: ETc média dos últimos registros válidos
    const recentEtcValues = history
      .filter((m: DailyManagement) => m.etc_mm != null && m.etc_mm > 0)
      .slice(0, 3)
      .map((m: DailyManagement) => m.etc_mm!)
    const avgEtc = recentEtcValues.length > 0
      ? recentEtcValues.reduce((a, b) => a + b, 0) / recentEtcValues.length
      : 3
    const gapDas = calcDAS(season.planting_date!, gapDateStr)
    const gapStage = getStageInfoForDas(crop, gapDas)
    const ctaGap = calcCTA(CC, PM, Ds, gapStage.rootDepthCm)
    runningAdc = Math.max(0, Math.min(runningAdc - avgEtc, ctaGap))
  }

  const pct = ctaToday > 0 ? (runningAdc / ctaToday) * 100 : 0
  return { adcMm: runningAdc, pct }
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

  // Validação de range — rejeita dados de sensores defeituosos
  if (tempMax < -20 || tempMax > 60) return null
  if (tempMin < -30 || tempMin > 55) return null
  if (tempMax < tempMin) return null // sensor invertido

  // Clamp valores secundários a ranges plausíveis (fallback para default se absurdo)
  const humidityClamped = humidityValue != null && humidityValue >= 5 && humidityValue <= 100
    ? humidityValue : 60
  const windClamped = windValue != null && windValue >= 0 && windValue <= 25
    ? windValue : 2
  const radiationClamped = radiationValue != null && radiationValue >= 0 && radiationValue <= 500
    ? radiationValue : 200

  const weatherInput: WeatherInput = {
    tempMax,
    tempMin,
    humidity: humidityClamped,
    windSpeed: windClamped,
    solarRadiation: radiationClamped,
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
  // FC% real ao final do dia (pós-ETc) — valor que o agricultor encontra no campo
  // peakReachedCta fica salvo no registro histórico mas NÃO altera o % exibido
  const fieldCapacityPercent = cta > 0 ? (adcNew / cta) * 100 : 0

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

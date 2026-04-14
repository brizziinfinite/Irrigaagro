// ============================================================
// Recomendações de Irrigação — 7 dias por pivô
// Busca forecast Open-Meteo e calcula projeção com dados reais
// ============================================================

import { calcETo, calcProjection, type ProjectionDay } from '@/lib/water-balance'
import { calcDAS } from '@/lib/calculations/management-balance'
import { calcCTA, getStageInfoForDas } from '@/lib/water-balance'
import type { ManagementSeasonContext } from '@/services/management'

export type WeatherIcon = 'sun' | 'rain' | 'cloud' | 'storm'

export interface ForecastDay {
  date: string
  eto: number
  rainfall: number
  tempMax: number
  tempMin: number
  icon: WeatherIcon
}

export interface PivotRecommendation {
  seasonId: string
  pivotId: string
  pivotName: string
  farmName: string
  lastUpdated: string | null
  forecast: ForecastDay[]
  projection: ProjectionDay[]
}

// ─── Cache de módulo (TTL 10 min) ────────────────────────────
interface CacheEntry { data: ForecastDay[]; fetchedAt: number }
const forecastCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 10 * 60 * 1000

function classifyIcon(rainfall: number, tempMax: number): WeatherIcon {
  if (rainfall > 20) return 'storm'
  if (rainfall > 5) return 'rain'
  if (tempMax < 25) return 'cloud'
  return 'sun'
}

/**
 * Busca forecast Open-Meteo para uma janela de 7 dias.
 * Retorna array de ForecastDay (D+1 a D+7).
 */
export async function fetchForecastRange(
  lat: number,
  lng: number,
  startDate: string, // YYYY-MM-DD (D+1)
  endDate: string,   // YYYY-MM-DD (D+7)
): Promise<ForecastDay[]> {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${startDate},${endDate}`
  const cached = forecastCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data
  }

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    start_date: startDate,
    end_date: endDate,
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'shortwave_radiation_sum',
      'wind_speed_10m_max',
      'relative_humidity_2m_mean',
    ].join(','),
    timezone: 'America/Sao_Paulo',
    wind_speed_unit: 'ms',
  })

  const url = `https://api.open-meteo.com/v1/forecast?${params}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })

  if (!res.ok) {
    throw new Error(`Open-Meteo error: ${res.status}`)
  }

  const json = await res.json() as {
    daily: {
      time: string[]
      temperature_2m_max: number[]
      temperature_2m_min: number[]
      precipitation_sum: number[]
      shortwave_radiation_sum: number[] // MJ/m²
      wind_speed_10m_max: number[]
      relative_humidity_2m_mean: number[]
    }
  }

  const { daily } = json
  const days: ForecastDay[] = daily.time.map((date, i) => {
    const tempMax = daily.temperature_2m_max[i] ?? 30
    const tempMin = daily.temperature_2m_min[i] ?? 18
    const rainfall = daily.precipitation_sum[i] ?? 0
    const radiationMJ = daily.shortwave_radiation_sum[i] ?? 12.5  // MJ/m²·dia
    const windSpeed = daily.wind_speed_10m_max[i] ?? 2
    const humidity = daily.relative_humidity_2m_mean[i] ?? 60

    // Converter MJ/m²·dia → W/m² (÷ 0.0864)
    const radiationWm2 = radiationMJ / 0.0864

    const eto = calcETo({
      tempMax,
      tempMin,
      humidity,
      windSpeed,
      solarRadiation: radiationWm2,
      latitude: lat,
      date,
    })

    return {
      date,
      eto: Math.round(eto * 10) / 10,
      rainfall: Math.round(rainfall * 10) / 10,
      tempMax: Math.round(tempMax),
      tempMin: Math.round(tempMin),
      icon: classifyIcon(rainfall, tempMax),
    }
  })

  forecastCache.set(cacheKey, { data: days, fetchedAt: Date.now() })
  return days
}

/**
 * Busca forecast para um pivô específico (D+1 a D+7).
 * Retorna null se o pivô não tiver coordenadas.
 */
export async function fetchForecastForPivot(
  lat: number,
  lng: number,
  today: string,
): Promise<ForecastDay[] | null> {
  // D+1 a D+7
  const start = new Date(today + 'T12:00:00')
  start.setDate(start.getDate() + 1)
  const end = new Date(today + 'T12:00:00')
  end.setDate(end.getDate() + 7)

  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)

  return fetchForecastRange(lat, lng, startDate, endDate)
}

/**
 * Constrói as recomendações para todos os pivôs com safra ativa.
 * Usa Promise.allSettled para tolerar falhas individuais.
 */
export async function buildPivotRecommendations(
  contexts: ManagementSeasonContext[],
  lastMgmtBySeasonId: Record<string, { ctda: number | null; eto_mm: number | null; date: string } | null>,
  today: string,
  currentAdcBySeasonId?: Record<string, number>,
): Promise<PivotRecommendation[]> {
  const active = contexts.filter(ctx => ctx.season.is_active && ctx.pivot && ctx.crop)

  const results = await Promise.allSettled(
    active.map(async (ctx): Promise<PivotRecommendation> => {
      const { season, pivot, crop, farm } = ctx
      if (!pivot || !crop) throw new Error('No pivot or crop')

      const lastMgmt = lastMgmtBySeasonId[season.id] ?? null
      const das = calcDAS(season.planting_date ?? today, today)
      const avgEto = lastMgmt?.eto_mm ?? 5

      // Start ADc — usa currentAdcBySeasonId (já avançado até hoje pelo dashboard)
      // se disponível; caso contrário, usa último registro salvo no banco.
      let startAdc = 0
      if (currentAdcBySeasonId?.[season.id] != null) {
        startAdc = currentAdcBySeasonId[season.id]
      } else if (lastMgmt?.ctda != null) {
        startAdc = lastMgmt.ctda
      } else {
        const stageInfo = getStageInfoForDas(crop, das)
        const cta = calcCTA(
          Number(pivot.field_capacity ?? season.field_capacity ?? 32),
          Number(pivot.wilting_point ?? season.wilting_point ?? 14),
          Number(pivot.bulk_density ?? season.bulk_density ?? 1.4),
          stageInfo.rootDepthCm,
        )
        startAdc = cta * ((season.initial_adc_percent ?? 100) / 100)
      }

      // Fetch forecast if pivot has coordinates
      let forecast: ForecastDay[] = []
      let etoByDay: number[] | undefined
      let rainfallByDay: number[] | undefined

      if (pivot.latitude != null && pivot.longitude != null) {
        try {
          forecast = await fetchForecastForPivot(pivot.latitude, pivot.longitude, today) ?? []
          etoByDay = forecast.map(d => d.eto)
          rainfallByDay = forecast.map(d => d.rainfall)
        } catch {
          // silently fall back to avgEto
          forecast = []
        }
      }

      const fc = Number(pivot.field_capacity ?? season.field_capacity ?? 32)
      const wp = Number(pivot.wilting_point ?? season.wilting_point ?? 14)
      const bd = Number(pivot.bulk_density ?? season.bulk_density ?? 1.4)
      const projection = calcProjection({
        crop,
        startDate: today,
        startDas: das,
        startAdc,
        fieldCapacity: fc,
        wiltingPoint: wp,
        bulkDensity: bd,
        avgEto,
        pivot,
        days: 7,
        etoByDay,
        rainfallByDay,
      })

      return {
        seasonId: season.id,
        pivotId: pivot.id,
        pivotName: pivot.name,
        farmName: farm.name,
        lastUpdated: lastMgmt?.date ?? null,
        forecast,
        projection,
      }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<PivotRecommendation> => r.status === 'fulfilled')
    .map(r => r.value)
}

import type { Json } from '@/types/database'

export const GEOLOCATION_WEATHER_SOURCE = 'pivot_geolocation_open_meteo'

export interface GeolocationWeatherSnapshot {
  date: string
  temp_max: number | null
  temp_min: number | null
  humidity_percent: number | null
  wind_speed_ms: number | null
  solar_radiation_wm2: number | null
  rainfall_mm: number | null
  eto_mm: number | null
  source: string
  raw_data: Json | null
}

function toAverage(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (numeric.length === 0) return null
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
}

function mjDayToAverageWatts(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value * 11.574074
}

function getOpenMeteoEndpoint(date: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return date < today
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast'
}

export async function getWeatherByPivotGeolocation(
  latitude: number,
  longitude: number,
  date: string
): Promise<GeolocationWeatherSnapshot | null> {
  const endpoint = getOpenMeteoEndpoint(date)
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: date,
    end_date: date,
    timezone: 'auto',
    wind_speed_unit: 'ms',
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'shortwave_radiation_sum',
      'et0_fao_evapotranspiration',
    ].join(','),
    hourly: [
      'relative_humidity_2m',
      'wind_speed_10m',
    ].join(','),
  })

  const response = await fetch(`${endpoint}?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Falha ao consultar Open-Meteo (${response.status})`)
  }

  const raw = await response.json()
  const daily = raw?.daily
  if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) {
    return null
  }

  const hourlyTimes: string[] = Array.isArray(raw?.hourly?.time) ? raw.hourly.time : []
  const humiditySeries: Array<number | null | undefined> = Array.isArray(raw?.hourly?.relative_humidity_2m)
    ? raw.hourly.relative_humidity_2m
    : []
  const windSeries: Array<number | null | undefined> = Array.isArray(raw?.hourly?.wind_speed_10m)
    ? raw.hourly.wind_speed_10m
    : []

  const humidityForDay = hourlyTimes.map((time, index) => time.startsWith(date) ? humiditySeries[index] : null)
  const windForDay = hourlyTimes.map((time, index) => time.startsWith(date) ? windSeries[index] : null)

  return {
    date,
    temp_max: daily.temperature_2m_max?.[0] ?? null,
    temp_min: daily.temperature_2m_min?.[0] ?? null,
    humidity_percent: toAverage(humidityForDay),
    wind_speed_ms: toAverage(windForDay),
    solar_radiation_wm2: mjDayToAverageWatts(daily.shortwave_radiation_sum?.[0] ?? null),
    rainfall_mm: daily.precipitation_sum?.[0] ?? null,
    eto_mm: null,
    source: GEOLOCATION_WEATHER_SOURCE,
    raw_data: raw ?? null,
  }
}

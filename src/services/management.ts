import { createClient } from '@/lib/supabase/client'
import type {
  Crop,
  DailyManagement,
  DailyManagementInsert,
  DailyManagementUpdate,
  Farm,
  Pivot,
  RainfallRecord,
  Season,
  WeatherData,
  WeatherStation,
} from '@/types/database'
import { listCropsByCompany } from '@/services/crops'
import { listFarmsByCompany } from '@/services/farms'
import { listPivotsByFarmIds } from '@/services/pivots'
import { listSeasonsByFarmIds } from '@/services/seasons'
import { getWeatherDataByFarmDate, getWeatherDataByStationDate } from '@/services/weather-data'
import { getWeatherStationById } from '@/services/weather-stations'
import {
  getWeatherByPivotGeolocation,
  type GeolocationWeatherSnapshot,
} from '@/services/weather-geolocation'
import type { TypedSupabaseClient } from './base'

export type ManagementClimateSource =
  | 'pivot_station'
  | 'farm_station'
  | 'pivot_geolocation'
  | 'manual'
  | null

export interface ManagementSeasonContext {
  season: Season
  farm: Farm
  pivot: Pivot | null
  crop: Crop | null
}

export interface ManagementExternalData {
  station: Pick<WeatherStation, 'id' | 'name' | 'farm_id'> | null
  weather: WeatherData | null
  geolocationWeather: GeolocationWeatherSnapshot | null
  rainfall: RainfallRecord | null
  climateSource: ManagementClimateSource
}

const dailyManagementTable = (client: TypedSupabaseClient) => (client as any).from('daily_management')
const rainfallTable = (client: TypedSupabaseClient) => (client as any).from('rainfall_records')
const seasonsTable = (client: TypedSupabaseClient) => (client as any).from('seasons')

function managementServiceError(action: string, error: { message: string }) {
  return new Error(`Falha ao ${action} manejo: ${error.message}`)
}

function getPreferredStationId(pivot?: Pivot | null): string | null {
  return typeof pivot?.weather_config?.station_id === 'string' && pivot.weather_config.station_id.trim()
    ? pivot.weather_config.station_id
    : null
}

export async function listManagementSeasonContexts(
  companyId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<ManagementSeasonContext[]> {
  const farms = await listFarmsByCompany(companyId, client)
  const farmIds = farms.map((farm) => farm.id)

  if (farmIds.length === 0) return []

  const [pivots, seasons, crops] = await Promise.all([
    listPivotsByFarmIds(farmIds, client),
    listSeasonsByFarmIds(farmIds, client),
    listCropsByCompany(companyId, client),
  ])

  const farmMap = new Map(farms.map((farm) => [farm.id, farm]))
  const pivotMap = new Map(pivots.map((pivot) => [pivot.id, pivot]))
  const cropMap = new Map(crops.map((crop) => [crop.id, crop]))

  const contexts: ManagementSeasonContext[] = []

  for (const season of seasons) {
    const farm = farmMap.get(season.farm_id)
    if (!farm) continue

    contexts.push({
      season,
      farm,
      pivot: season.pivot_id ? pivotMap.get(season.pivot_id) ?? null : null,
      crop: season.crop_id ? cropMap.get(season.crop_id) ?? null : null,
    })
  }

  return contexts
    .sort((a, b) => {
      if (a.season.is_active !== b.season.is_active) {
        return a.season.is_active ? -1 : 1
      }
      return b.season.created_at.localeCompare(a.season.created_at)
    })
}

export async function listActiveManagementSeasonContexts(
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient,
  companyId?: string | null
): Promise<ManagementSeasonContext[]> {
  const selectStr = companyId
    ? '*, farms!inner(*), pivots(*), crops(*)'
    : '*, farms(*), pivots(*), crops(*)'

  let query = seasonsTable(client)
    .select(selectStr)
    .eq('is_active', true)
    .not('planting_date', 'is', null)

  if (companyId) {
    query = query.eq('farms.company_id', companyId)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    throw managementServiceError('listar safras ativas de', error)
  }

  return ((data ?? []) as Array<Season & {
    farms: Farm | null
    pivots: Pivot | null
    crops: Crop | null
  }>)
    .filter((item) => item.farms != null)
    .map((item) => ({
      season: item,
      farm: item.farms as Farm,
      pivot: item.pivots ?? null,
      crop: item.crops ?? null,
    }))
}

export async function listDailyManagementBySeason(
  seasonId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<DailyManagement[]> {
  const { data, error } = await dailyManagementTable(client)
    .select('*')
    .eq('season_id', seasonId)
    .order('date', { ascending: false })

  if (error) {
    throw managementServiceError('listar histórico de', error)
  }

  return (data ?? []) as DailyManagement[]
}

export async function upsertDailyManagementRecord(
  input: DailyManagementInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<DailyManagement> {
  const { data, error } = await dailyManagementTable(client)
    .upsert(input, { onConflict: 'season_id,date' })
    .select()
    .single()

  if (error) {
    throw managementServiceError('salvar', error)
  }

  return data as DailyManagement
}

export async function createDailyManagementRecord(
  input: DailyManagementInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<DailyManagement> {
  const { data, error } = await dailyManagementTable(client)
    .insert(input)
    .select()
    .single()

  if (error) {
    throw managementServiceError('criar', error)
  }

  return data as DailyManagement
}

export async function updateDailyManagementRecord(
  id: string,
  input: DailyManagementUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<DailyManagement> {
  const { data, error } = await dailyManagementTable(client)
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw managementServiceError('atualizar', error)
  }

  return data as DailyManagement
}

export async function deleteDailyManagementRecord(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await dailyManagementTable(client)
    .delete()
    .eq('id', id)

  if (error) {
    throw managementServiceError('excluir', error)
  }
}

export async function getRainfallRecordByPivotDate(
  pivotId: string | null,
  date: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<RainfallRecord | null> {
  if (!pivotId) return null

  const { data, error } = await rainfallTable(client)
    .select('*')
    .eq('pivot_id', pivotId)
    .eq('date', date)
    .maybeSingle()

  if (error) {
    throw new Error(`Falha ao buscar chuva do pivô: ${error.message}`)
  }

  return (data as RainfallRecord | null) ?? null
}

export async function getManagementExternalData(
  farmId: string,
  pivotId: string | null,
  date: string,
  pivot?: Pivot | null,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<ManagementExternalData> {
  const [rainfall, farmWeatherSnapshot] = await Promise.all([
    getRainfallRecordByPivotDate(pivotId, date, client),
    getWeatherDataByFarmDate(farmId, date, client),
  ])

  let station = farmWeatherSnapshot?.weather_stations ?? null
  let weather = farmWeatherSnapshot
  let climateSource: ManagementClimateSource = weather ? 'farm_station' : null

  const preferredStationId = getPreferredStationId(pivot)

  if (preferredStationId) {
    const [preferredStation, preferredWeather] = await Promise.all([
      getWeatherStationById(preferredStationId, client),
      getWeatherDataByStationDate(preferredStationId, date, client),
    ])

    if (preferredStation && preferredWeather) {
      station = preferredStation
      weather = preferredWeather
      climateSource = 'pivot_station'
    }
  }

  let geolocationWeather: GeolocationWeatherSnapshot | null = null

  if (!weather && pivot?.latitude != null && pivot?.longitude != null) {
    try {
      geolocationWeather = await getWeatherByPivotGeolocation(pivot.latitude, pivot.longitude, date)
      if (geolocationWeather) {
        climateSource = 'pivot_geolocation'
      }
    } catch {
      geolocationWeather = null
    }
  }

  return {
    station,
    weather,
    geolocationWeather,
    rainfall,
    climateSource,
  }
}

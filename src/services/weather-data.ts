import { createClient } from '@/lib/supabase/client'
import type {
  WeatherData,
  WeatherDataInsert,
  WeatherDataUpdate,
  WeatherStation,
} from '@/types/database'
import { fromUntyped } from './base'
import type { TypedSupabaseClient } from './base'

const weatherDataTable = (client: TypedSupabaseClient) => fromUntyped(client, 'weather_data')
const WEATHER_DATA_UPSERT_CONFLICT = 'station_id,date'

function weatherDataServiceError(action: string, error: { message: string }) {
  return new Error(`Falha ao ${action} dado climático: ${error.message}`)
}

export interface WeatherDataWithStation extends WeatherData {
  weather_stations?: Pick<WeatherStation, 'id' | 'name' | 'farm_id'> | null
}

export async function getWeatherDataByStationDate(
  stationId: string,
  date: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherData | null> {
  const { data, error } = await weatherDataTable(client)
    .select('*')
    .eq('station_id', stationId)
    .eq('date', date)
    .maybeSingle()

  if (error) {
    throw weatherDataServiceError('buscar', error)
  }

  return (data as WeatherData | null) ?? null
}

export async function listWeatherDataByStation(
  stationId: string,
  limit = 30,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherData[]> {
  const { data, error } = await weatherDataTable(client)
    .select('*')
    .eq('station_id', stationId)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) {
    throw weatherDataServiceError('listar', error)
  }

  return (data ?? []) as WeatherData[]
}

export async function listWeatherDataByStationIds(
  stationIds: string[],
  limit = 120,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherData[]> {
  if (stationIds.length === 0) {
    return []
  }

  const { data, error } = await weatherDataTable(client)
    .select('*')
    .in('station_id', stationIds)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) {
    throw weatherDataServiceError('listar', error)
  }

  return (data ?? []) as WeatherData[]
}

export async function upsertWeatherData(
  input: WeatherDataInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherData> {
  const { data, error } = await weatherDataTable(client)
    .upsert(input, { onConflict: WEATHER_DATA_UPSERT_CONFLICT })
    .select()
    .single()

  if (error) {
    throw weatherDataServiceError('salvar', error)
  }

  return data as WeatherData
}

export async function updateWeatherData(
  id: string,
  input: WeatherDataUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherData> {
  const { data, error } = await weatherDataTable(client)
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw weatherDataServiceError('atualizar', error)
  }

  return data as WeatherData
}

export async function deleteWeatherData(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await weatherDataTable(client)
    .delete()
    .eq('id', id)

  if (error) {
    throw weatherDataServiceError('excluir', error)
  }
}

export async function getWeatherDataByStationRange(
  stationId: string,
  fromDate: string,
  toDate: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherData[]> {
  const { data, error } = await weatherDataTable(client)
    .select('*')
    .eq('station_id', stationId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: true })

  if (error) {
    throw weatherDataServiceError('buscar range', error)
  }

  return (data ?? []) as WeatherData[]
}

export async function getWeatherDataByFarmRange(
  farmId: string,
  fromDate: string,
  toDate: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherDataWithStation[]> {
  const { data, error } = await weatherDataTable(client)
    .select('*, weather_stations!inner(id, name, farm_id)')
    .eq('weather_stations.farm_id', farmId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: true })

  if (error) {
    throw weatherDataServiceError('buscar range', error)
  }

  return (data ?? []) as WeatherDataWithStation[]
}

export async function getWeatherDataByFarmDate(
  farmId: string,
  date: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherDataWithStation | null> {
  const { data, error } = await weatherDataTable(client)
    .select('*, weather_stations!inner(id, name, farm_id)')
    .eq('weather_stations.farm_id', farmId)
    .eq('date', date)
    .order('eto_corrected_mm', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw weatherDataServiceError('buscar', error)
  }

  return (data as WeatherDataWithStation | null) ?? null
}

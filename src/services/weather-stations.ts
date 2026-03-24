import { createClient } from '@/lib/supabase/client'
import type {
  WeatherStation,
  WeatherStationInsert,
  WeatherStationUpdate,
} from '@/types/database'
import type { TypedSupabaseClient } from './base'

const weatherStationsTable = (client: TypedSupabaseClient) => (client as any).from('weather_stations')

function weatherStationsServiceError(action: string, error: { message: string }) {
  return new Error(`Falha ao ${action} estação meteorológica: ${error.message}`)
}

export async function getWeatherStationById(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherStation | null> {
  const { data, error } = await weatherStationsTable(client)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw weatherStationsServiceError('buscar', error)
  }

  return (data as WeatherStation | null) ?? null
}

export async function listWeatherStationsByFarmIds(
  farmIds: string[],
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherStation[]> {
  if (farmIds.length === 0) {
    return []
  }

  const { data, error } = await weatherStationsTable(client)
    .select('*')
    .in('farm_id', farmIds)
    .order('name')

  if (error) {
    throw weatherStationsServiceError('listar', error)
  }

  return (data ?? []) as WeatherStation[]
}

export async function createWeatherStation(
  input: WeatherStationInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherStation> {
  const { data, error } = await weatherStationsTable(client)
    .insert(input)
    .select()
    .single()

  if (error) {
    throw weatherStationsServiceError('criar', error)
  }

  return data as WeatherStation
}

export async function updateWeatherStation(
  id: string,
  input: WeatherStationUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<WeatherStation> {
  const { data, error } = await weatherStationsTable(client)
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw weatherStationsServiceError('atualizar', error)
  }

  return data as WeatherStation
}

export async function deleteWeatherStation(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await weatherStationsTable(client)
    .delete()
    .eq('id', id)

  if (error) {
    throw weatherStationsServiceError('excluir', error)
  }
}

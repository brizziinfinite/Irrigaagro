import { createClient } from '@/lib/supabase/client'
import type { Crop, Farm, Pivot, Season, SeasonInsert, SeasonUpdate } from '@/types/database'
import type { TypedSupabaseClient } from './base'

export interface SeasonWithRelations extends Season {
  pivots: { name: string } | null
  crops: Crop | null
  farms: { name: string }
}

const seasonsTable = (client: TypedSupabaseClient) => (client as any).from('seasons')

export async function listSeasonsByFarmIds(
  farmIds: string[],
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<SeasonWithRelations[]> {
  if (farmIds.length === 0) {
    return []
  }

  const { data, error } = await seasonsTable(client)
    .select('*, farms(name), pivots(name), crops(*)')
    .in('farm_id', farmIds)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Falha ao listar safras: ${error.message}`)
  }

  return (data ?? []) as SeasonWithRelations[]
}

export async function createSeason(
  input: SeasonInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Season> {
  const { data, error } = await seasonsTable(client)
    .insert(input)
    .select()
    .single()

  if (error) {
    throw new Error(`Falha ao criar safra: ${error.message}`)
  }

  return data as Season
}

export async function updateSeason(
  id: string,
  input: SeasonUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Season> {
  const { data, error } = await seasonsTable(client)
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Falha ao atualizar safra: ${error.message}`)
  }

  return data as Season
}

export async function deleteSeason(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await seasonsTable(client)
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Falha ao excluir safra: ${error.message}`)
  }
}

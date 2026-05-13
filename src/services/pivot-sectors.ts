import { createClient } from '@/lib/supabase/client'
import type { PivotSector, PivotSectorInsert, PivotSectorUpdate } from '@/types/database'
import { fromUntyped } from './base'
import type { TypedSupabaseClient } from './base'

const sectorsTable = (client: TypedSupabaseClient) => fromUntyped(client, 'pivot_sectors')

function sectorError(action: string, error: { message: string }) {
  return new Error(`Falha ao ${action} setor: ${error.message}`)
}

export async function listSectorsByPivotId(
  pivotId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<PivotSector[]> {
  const { data, error } = await sectorsTable(client)
    .select('*')
    .eq('pivot_id', pivotId)
    .order('sort_order', { ascending: true })
    .limit(50)

  if (error) throw sectorError('listar', error)
  return (data ?? []) as PivotSector[]
}

export async function createSector(
  input: PivotSectorInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<PivotSector> {
  const { data, error } = await sectorsTable(client)
    .insert(input)
    .select()
    .single()

  if (error) throw sectorError('criar', error)
  return data as PivotSector
}

export async function updateSector(
  id: string,
  input: PivotSectorUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<PivotSector> {
  const { data, error } = await sectorsTable(client)
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) throw sectorError('atualizar', error)
  return data as PivotSector
}

export async function deleteSector(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await sectorsTable(client)
    .delete()
    .eq('id', id)

  if (error) throw sectorError('excluir', error)
}

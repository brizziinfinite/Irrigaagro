import { createClient } from '@/lib/supabase/client'
import type { Pivot, PivotInsert, PivotUpdate } from '@/types/database'
import type { TypedSupabaseClient } from './base'

export interface PivotWithFarmName extends Pivot {
  farms: { name: string } | null
}

const pivotsTable = (client: TypedSupabaseClient) => (client as any).from('pivots')

export async function listPivotsByFarmIds(
  farmIds: string[],
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<PivotWithFarmName[]> {
  if (farmIds.length === 0) {
    return []
  }

  const { data, error } = await pivotsTable(client)
    .select('*, farms(name)')
    .in('farm_id', farmIds)
    .order('name')

  if (error) {
    throw new Error(`Falha ao listar pivôs: ${error.message}`)
  }

  return (data ?? []) as PivotWithFarmName[]
}

export async function createPivot(
  input: PivotInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Pivot> {
  const { data, error } = await pivotsTable(client)
    .insert(input)
    .select()
    .single()

  if (error) {
    throw new Error(`Falha ao criar pivô: ${error.message}`)
  }

  return data as Pivot
}

export async function updatePivot(
  id: string,
  input: PivotUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Pivot> {
  const { data, error } = await pivotsTable(client)
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Falha ao atualizar pivô: ${error.message}`)
  }

  return data as Pivot
}

export async function deletePivot(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await pivotsTable(client)
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Falha ao excluir pivô: ${error.message}`)
  }
}

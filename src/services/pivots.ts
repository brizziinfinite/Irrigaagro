import { createClient } from '@/lib/supabase/client'
import type { Pivot, PivotInsert, PivotUpdate } from '@/types/database'
import type { TypedSupabaseClient } from './base'

export interface PivotWithFarmName extends Pivot {
  farms: { name: string } | null
  sectorCount?: number
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

  const pivots = (data ?? []) as PivotWithFarmName[]

  // Busca contagem de setores separadamente para evitar join complexo no PostgREST
  const ids = pivots.map(p => p.id)
  if (ids.length === 0) return pivots

  const { data: sectorRows } = await (client as any)
    .from('pivot_sectors')
    .select('pivot_id')
    .in('pivot_id', ids)
    .limit(500)

  const countMap: Record<string, number> = {}
  for (const row of (sectorRows ?? [])) {
    countMap[row.pivot_id] = (countMap[row.pivot_id] ?? 0) + 1
  }

  return pivots.map(p => ({ ...p, sectorCount: countMap[p.id] ?? 0 }))
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
  const { error } = await pivotsTable(client)
    .update(input)
    .eq('id', id)

  if (error) {
    throw new Error(`Falha ao atualizar pivô: ${error.message}`)
  }

  // Buscar o registro atualizado em query separada (evita problema de RLS no .select() pós-update)
  const { data, error: fetchError } = await pivotsTable(client)
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError) {
    throw new Error(`Falha ao buscar pivô atualizado: ${fetchError.message}`)
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

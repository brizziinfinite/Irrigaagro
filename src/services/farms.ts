import { createClient } from '@/lib/supabase/client'
import type { Farm, FarmInsert, FarmUpdate } from '@/types/database'
import type { TypedSupabaseClient } from './base'

const farmsTable = (client: TypedSupabaseClient) => (client as any).from('farms')

export async function listFarmsByCompany(
  companyId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Farm[]> {
  const { data, error } = await farmsTable(client)
    .select('*')
    .eq('company_id', companyId)
    .order('name')

  if (error) {
    throw new Error(`Falha ao listar fazendas: ${error.message}`)
  }

  return (data ?? []) as Farm[]
}

export async function createFarm(
  input: FarmInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Farm> {
  const { data, error } = await farmsTable(client)
    .insert(input)
    .select()
    .single()

  if (error) {
    throw new Error(`Falha ao criar fazenda: ${error.message}`)
  }

  return data as Farm
}

export async function updateFarm(
  id: string,
  input: FarmUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Farm> {
  const { data, error } = await farmsTable(client)
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Falha ao atualizar fazenda: ${error.message}`)
  }

  return data as Farm
}

export async function deleteFarm(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await farmsTable(client)
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Falha ao excluir fazenda: ${error.message}`)
  }
}

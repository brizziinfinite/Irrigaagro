import { createClient } from '@/lib/supabase/client'
import type {
  RainfallRecord,
  RainfallRecordInsert,
  RainfallRecordUpdate,
} from '@/types/database'
import type { TypedSupabaseClient } from './base'

const rainfallTable = (client: TypedSupabaseClient) => (client as any).from('rainfall_records')
const RAINFALL_UPSERT_CONFLICT = 'pivot_id,date'

function rainfallServiceError(action: string, error: { message: string }) {
  return new Error(`Falha ao ${action} precipitação: ${error.message}`)
}

export async function listRainfallByPivotIds(
  pivotIds: string[],
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<RainfallRecord[]> {
  if (pivotIds.length === 0) {
    return []
  }

  const { data, error } = await rainfallTable(client)
    .select('*')
    .in('pivot_id', pivotIds)
    .order('date', { ascending: false })

  if (error) {
    throw rainfallServiceError('listar', error)
  }

  return (data ?? []) as RainfallRecord[]
}

export async function upsertRainfallRecord(
  input: RainfallRecordInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<RainfallRecord> {
  const { data, error } = await rainfallTable(client)
    .upsert(input, { onConflict: RAINFALL_UPSERT_CONFLICT })
    .select()
    .single()

  if (error) {
    throw rainfallServiceError('salvar', error)
  }

  return data as RainfallRecord
}

export async function upsertRainfallRecords(
  input: RainfallRecordInsert[],
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<RainfallRecord[]> {
  if (input.length === 0) {
    return []
  }

  const { data, error } = await rainfallTable(client)
    .upsert(input, { onConflict: RAINFALL_UPSERT_CONFLICT })
    .select()

  if (error) {
    throw rainfallServiceError('salvar', error)
  }

  return (data ?? []) as RainfallRecord[]
}

export async function updateRainfallRecord(
  id: string,
  input: RainfallRecordUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<RainfallRecord> {
  const { data, error } = await rainfallTable(client)
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw rainfallServiceError('atualizar', error)
  }

  return data as RainfallRecord
}

export async function deleteRainfallRecord(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await rainfallTable(client)
    .delete()
    .eq('id', id)

  if (error) {
    throw rainfallServiceError('excluir', error)
  }
}

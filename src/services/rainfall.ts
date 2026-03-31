import { createClient } from '@/lib/supabase/client'
import type {
  RainfallRecord,
  RainfallRecordInsert,
  RainfallRecordUpdate,
} from '@/types/database'
import type { TypedSupabaseClient } from './base'

export async function validatePivotOwnership(
  pivotId: string,
  companyId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<boolean> {
  const { data } = await (client as any)
    .from('pivots')
    .select('id, farms!inner(company_id)')
    .eq('id', pivotId)
    .eq('farms.company_id', companyId)
    .maybeSingle()
  return data !== null
}

const rainfallTable = (client: TypedSupabaseClient) => (client as any).from('rainfall_records')
// unique index: (pivot_id, COALESCE(sector_id, '00000000-0000-0000-0000-000000000000'), date)
// Supabase upsert with onConflict requires the full column list matching the unique index.
// Since sector_id uses COALESCE (partial/expression index), we pass the raw columns and let
// Postgres resolve the conflict via the expression index automatically.
const RAINFALL_UPSERT_CONFLICT = 'pivot_id,sector_id,date'

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

export async function listRainfallByPivotIdAndSector(
  pivotId: string,
  sectorId: string | null,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<RainfallRecord[]> {
  let q = rainfallTable(client)
    .select('*')
    .eq('pivot_id', pivotId)
    .order('date', { ascending: false })

  if (sectorId === null) {
    q = q.is('sector_id', null)
  } else {
    q = q.eq('sector_id', sectorId)
  }

  const { data, error } = await q
  if (error) throw rainfallServiceError('listar', error)
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

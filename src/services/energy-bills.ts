import { createClient } from '@/lib/supabase/client'
import type { EnergyBill } from '@/types/database'
import type { TypedSupabaseClient } from './base'

const table = (client: TypedSupabaseClient) => (client as ReturnType<typeof createClient>).from('energy_bills')

export async function listEnergyBillsByPivotIds(
  pivotIds: string[],
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<EnergyBill[]> {
  if (pivotIds.length === 0) return []

  const { data, error } = await table(client)
    .select('*')
    .in('pivot_id', pivotIds)
    .order('reference_month', { ascending: false })
    .limit(120)

  if (error) throw new Error(`Falha ao buscar contas de energia: ${error.message}`)
  return (data ?? []) as EnergyBill[]
}

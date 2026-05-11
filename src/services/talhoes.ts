import { createClient } from '@/lib/supabase/client'

export interface Talhao {
  id: string
  company_id: string
  farm_id: string | null
  name: string
  area_ha: number | null
  polygon_geojson: Record<string, unknown> | null
  color: string
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface TalhaoInsert {
  company_id: string
  farm_id?: string | null
  name: string
  area_ha?: number | null
  polygon_geojson?: Record<string, unknown> | null
  color?: string
  notes?: string | null
}

export async function listTalhoesByCompany(companyId: string): Promise<Talhao[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('talhoes')
    .select('*')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('name')
  if (error) throw error
  return (data ?? []) as Talhao[]
}

export async function createTalhao(insert: TalhaoInsert): Promise<Talhao> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('talhoes')
    .insert(insert)
    .select()
    .single()
  if (error) throw error
  return data as Talhao
}

export async function updateTalhao(id: string, update: Partial<TalhaoInsert>): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('talhoes')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteTalhao(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('talhoes')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

import { createClient } from '@/lib/supabase/client'
import type { Crop, CropInsert, CropUpdate } from '@/types/database'
import type { TypedSupabaseClient } from './base'

const cropsTable = (client: TypedSupabaseClient) => (client as any).from('crops')

export async function listCropsByCompany(
  companyId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Crop[]> {
  const { data, error } = await cropsTable(client)
    .select('*')
    .or(`company_id.is.null,company_id.eq.${companyId}`)
    .order('name')

  if (error) {
    throw new Error(`Falha ao listar culturas: ${error.message}`)
  }

  return (data ?? []) as Crop[]
}

export async function createCrop(
  input: CropInsert,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Crop> {
  const { data, error } = await cropsTable(client)
    .insert(input)
    .select()
    .single()

  if (error) {
    throw new Error(`Falha ao criar cultura: ${error.message}`)
  }

  return data as Crop
}

export async function updateCrop(
  id: string,
  input: CropUpdate,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Crop> {
  const { data, error } = await cropsTable(client)
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Falha ao atualizar cultura: ${error.message}`)
  }

  return data as Crop
}

export async function deleteCrop(
  id: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<void> {
  const { error } = await cropsTable(client)
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Falha ao excluir cultura: ${error.message}`)
  }
}

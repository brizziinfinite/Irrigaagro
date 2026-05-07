import type { Company } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { unwrapData, type TypedSupabaseClient } from './base'

export async function listUserCompanies(
  userId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<Company[]> {
  const { data: membershipsRaw, error: membershipsError } = await client
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)

  if (membershipsError) {
    throw new Error(`Falha ao buscar vínculos da empresa: ${membershipsError.message}`)
  }

  const memberships = (membershipsRaw ?? []) as Array<{ company_id: string }>
  const companyIds = memberships.map((membership) => membership.company_id)

  if (companyIds.length === 0) {
    return []
  }

  const { data: companies, error: companiesError } = await client
    .from('companies')
    .select('*')
    .in('id', companyIds)
    .order('name')
    .limit(100)

  if (companiesError) {
    throw new Error(`Falha ao buscar empresas: ${companiesError.message}`)
  }

  return companies ?? []
}

export function resolveActiveCompany(
  companies: Company[],
  preferredCompanyId?: string | null
): Company | null {
  if (companies.length === 0) {
    return null
  }

  if (preferredCompanyId) {
    const preferred = companies.find((company) => company.id === preferredCompanyId)
    if (preferred) {
      return preferred
    }
  }

  return companies[0]
}

export async function getUserCompanyOrThrow(
  userId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient,
  preferredCompanyId?: string | null
): Promise<Company> {
  const companies = await listUserCompanies(userId, client)
  return unwrapData(resolveActiveCompany(companies, preferredCompanyId), null, 'Nenhuma empresa vinculada ao usuário')
}

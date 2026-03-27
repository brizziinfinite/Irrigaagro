import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getUserCompanyOrThrow } from '@/services/companies'
import { listFarmsByCompany } from '@/services/farms'
import { listPivotsByFarmIds } from '@/services/pivots'
import { listManagementSeasonContexts, listDailyManagementBySeason } from '@/services/management'
import type { TypedSupabaseClient } from '@/services/base'
import { PivotDetailClient } from './PivotDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function PivoDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient() as TypedSupabaseClient

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const preferredCompanyId = cookieStore.get('gotejo:active_company_id')?.value ?? null

  const company = await getUserCompanyOrThrow(user.id, supabase, preferredCompanyId)
  const farms = await listFarmsByCompany(company.id, supabase)
  const farmIds = farms.map(f => f.id)

  const pivots = await listPivotsByFarmIds(farmIds, supabase)
  const pivot = pivots.find(p => p.id === id)

  if (!pivot) redirect('/dashboard')

  const farm = farms.find(f => f.id === pivot.farm_id) ?? null
  const contexts = await listManagementSeasonContexts(company.id, supabase)
  const context = contexts.find(c => c.season.pivot_id === id && c.season.is_active) ?? null

  const history = context
    ? await listDailyManagementBySeason(context.season.id, supabase)
    : []

  // today string for server
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PivotDetailClient
      pivot={pivot}
      farm={farm}
      context={context}
      history={history}
      today={today}
    />
  )
}

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { DashboardClient } from './DashboardClient'
import { getDashboardDataForUser } from '@/services/dashboard'
import type { TypedSupabaseClient } from '@/services/base'

export default async function DashboardPage() {
  const supabase = await createClient() as TypedSupabaseClient
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const cookieStore = await cookies()
  const preferredCompanyId = cookieStore.get('irrigaagro:active_company_id')?.value ?? null
  const preferredFarmId = cookieStore.get('irrigaagro:active_farm_id')?.value ?? null

  if (!user) {
    return (
      <DashboardClient
        pivots={[]}
        activeSeasons={[]}
        contexts={[]}
        hasPivots={false}
        lastManagementBySeason={{}}
        historyBySeason={{}}
        currentFieldCapacityBySeasonId={{}}
        diagnosticsByPivot={{}}
        energyBills={[]}
        summary={{
          totalPivots: 0,
          activePivots: 0,
          automationReady: 0,
          automationRestricted: 0,
          automationUnavailable: 0,
          handledToday: 0,
          pivotsWithClimateFallback: 0,
          pivotsWithAlerts: 0,
        }}
      />
    )
  }

  try {
    const dashboard = await getDashboardDataForUser(user.id, supabase, preferredCompanyId, preferredFarmId)

    return (
      <DashboardClient
        pivots={dashboard.pivots}
        activeSeasons={dashboard.activeSeasons}
        contexts={dashboard.contexts}
        hasPivots={dashboard.hasPivots}
        lastManagementBySeason={dashboard.lastManagementBySeason}
        historyBySeason={dashboard.historyBySeason}
        currentFieldCapacityBySeasonId={dashboard.currentFieldCapacityBySeasonId}
        currentAdcBySeasonId={dashboard.currentAdcBySeasonId}
        diagnosticsByPivot={dashboard.diagnosticsByPivot}
        energyBills={dashboard.energyBills}
        summary={dashboard.summary}
      />
    )
  } catch (error) {
    console.error('[dashboard] Failed to load data:', error)
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#ef4444', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Erro ao carregar o dashboard
        </p>
        <p style={{ color: '#8899aa', fontSize: 13 }}>
          {error instanceof Error ? error.message : 'Tente recarregar a página.'}
        </p>
      </div>
    )
  }
}

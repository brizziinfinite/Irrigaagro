import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './DashboardClient'
import { getDashboardDataForUser } from '@/services/dashboard'
import type { TypedSupabaseClient } from '@/services/base'

export default async function DashboardPage() {
  const supabase = await createClient() as TypedSupabaseClient
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <DashboardClient
        pivots={[]}
        activeSeasons={[]}
        hasPivots={false}
        lastManagementBySeason={{}}
        historyBySeason={{}}
        projectionBySeason={{}}
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

  const dashboard = await getDashboardDataForUser(user.id, supabase)

  return (
    <DashboardClient
      pivots={dashboard.pivots}
      activeSeasons={dashboard.activeSeasons}
      hasPivots={dashboard.hasPivots}
      lastManagementBySeason={dashboard.lastManagementBySeason}
      historyBySeason={dashboard.historyBySeason}
      projectionBySeason={dashboard.projectionBySeason}
      diagnosticsByPivot={dashboard.diagnosticsByPivot}
      energyBills={dashboard.energyBills}
      summary={dashboard.summary}
    />
  )
}

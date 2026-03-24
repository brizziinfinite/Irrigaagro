import { calcProjection, calcCTA, getStageInfoForDas, type ProjectionDay } from '@/lib/water-balance'
import { getUserCompanyOrThrow } from '@/services/companies'
import { listFarmsByCompany } from '@/services/farms'
import { getPivotDiagnostic, type PivotDiagnostic } from '@/services/pivot-diagnostics'
import { listManagementSeasonContexts, listDailyManagementBySeason } from '@/services/management'
import { listPivotsByFarmIds } from '@/services/pivots'
import type { TypedSupabaseClient } from '@/services/base'
import type { DailyManagement, Pivot, Season } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { calcDAS } from '@/lib/calculations/management-balance'

export interface DashboardPivot extends Pivot {
  farms: { id: string; name: string } | null
}

export interface DashboardData {
  companyId: string
  pivots: DashboardPivot[]
  activeSeasons: Season[]
  hasPivots: boolean
  lastManagementBySeason: Record<string, DailyManagement>
  projectionBySeason: Record<string, ProjectionDay[]>
  diagnosticsByPivot: Record<string, PivotDiagnostic>
  summary: {
    totalPivots: number
    activePivots: number
    automationReady: number
    automationRestricted: number
    automationUnavailable: number
    handledToday: number
    pivotsWithClimateFallback: number
    pivotsWithAlerts: number
  }
}

export async function getDashboardDataForUser(
  userId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<DashboardData> {
  const company = await getUserCompanyOrThrow(userId, client)
  const farms = await listFarmsByCompany(company.id, client)
  const farmMap = new Map(farms.map((farm) => [farm.id, farm]))
  const pivots = (await listPivotsByFarmIds(farms.map((farm) => farm.id), client)).map((pivot) => ({
    ...pivot,
    farms: farmMap.get(pivot.farm_id)
      ? { id: pivot.farm_id, name: farmMap.get(pivot.farm_id)!.name }
      : null,
  })) as DashboardPivot[]
  const contexts = await listManagementSeasonContexts(company.id, client)

  const activeSeasons = contexts
    .filter((context) => context.season.is_active)
    .map((context) => context.season)

  const lastManagementBySeason: Record<string, DailyManagement> = {}
  const projectionBySeason: Record<string, ProjectionDay[]> = {}

  for (const context of contexts.filter((item) => item.season.is_active)) {
    const { season, crop, pivot } = context
    const history = await listDailyManagementBySeason(season.id, client)
    const lastManagement = history[0] ?? null
    if (lastManagement) {
      lastManagementBySeason[season.id] = lastManagement
    }

    if (!crop || !season.planting_date) continue

    const today = new Date().toISOString().slice(0, 10)
    const das = calcDAS(season.planting_date, today)
    const avgEto = lastManagement?.eto_mm ?? 5
    let startAdc = 0

    if (lastManagement?.ctda != null) {
      startAdc = lastManagement.ctda
    } else {
      const stageInfo = getStageInfoForDas(crop, das)
      const cta = calcCTA(
        Number(season.field_capacity ?? 32),
        Number(season.wilting_point ?? 14),
        Number(season.bulk_density ?? 1.4),
        stageInfo.rootDepthCm
      )
      startAdc = cta * ((season.initial_adc_percent ?? 100) / 100)
    }

    projectionBySeason[season.id] = calcProjection({
      crop,
      startDate: today,
      startDas: das,
      startAdc,
      fieldCapacity: Number(season.field_capacity ?? 32),
      wiltingPoint: Number(season.wilting_point ?? 14),
      bulkDensity: Number(season.bulk_density ?? 1.4),
      avgEto,
      pivot,
      days: 7,
    })
  }

  pivots.sort((a, b) => a.name.localeCompare(b.name))
  const diagnostics = await Promise.all(
    pivots.map(async (pivot) => [pivot.id, await getPivotDiagnostic(company.id, pivot.id, undefined, client)] as const)
  )
  const diagnosticsByPivot = Object.fromEntries(diagnostics)

  const summary = {
    totalPivots: pivots.length,
    activePivots: activeSeasons.filter((season) => season.pivot_id).length,
    automationReady: diagnostics.filter(([, diagnostic]) => diagnostic.automationStatus === 'Automação pronta').length,
    automationRestricted: diagnostics.filter(([, diagnostic]) => diagnostic.automationStatus === 'Automação com restrições').length,
    automationUnavailable: diagnostics.filter(([, diagnostic]) => diagnostic.automationStatus === 'Automação indisponível').length,
    handledToday: diagnostics.filter(([, diagnostic]) => diagnostic.hasManagementToday).length,
    pivotsWithClimateFallback: diagnostics.filter(([, diagnostic]) => diagnostic.climateRoute === 'pivot_geolocation' || diagnostic.climateRoute === 'manual').length,
    pivotsWithAlerts: diagnostics.filter(([, diagnostic]) => diagnostic.alerts.length > 0).length,
  }

  return {
    companyId: company.id,
    pivots,
    activeSeasons,
    hasPivots: pivots.length > 0,
    lastManagementBySeason,
    projectionBySeason,
    diagnosticsByPivot,
    summary,
  }
}

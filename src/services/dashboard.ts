import { calcProjection, calcCTA, getStageInfoForDas, type ProjectionDay } from '@/lib/water-balance'
import { getUserCompanyOrThrow } from '@/services/companies'
import { listFarmsByCompany } from '@/services/farms'
import { getPivotDiagnostic, type PivotDiagnostic } from '@/services/pivot-diagnostics'
import { listManagementSeasonContexts, listDailyManagementBySeason, type ManagementSeasonContext } from '@/services/management'
import { listPivotsByFarmIds } from '@/services/pivots'
import { listEnergyBillsByPivotIds } from '@/services/energy-bills'
import type { TypedSupabaseClient } from '@/services/base'
import type { DailyManagement, EnergyBill, Pivot, Season } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { calcDAS } from '@/lib/calculations/management-balance'

export interface DashboardPivot extends Pivot {
  farms: { id: string; name: string } | null
}

export interface DashboardData {
  companyId: string
  pivots: DashboardPivot[]
  activeSeasons: Season[]
  contexts: ManagementSeasonContext[]
  hasPivots: boolean
  lastManagementBySeason: Record<string, DailyManagement>
  historyBySeason: Record<string, DailyManagement[]>
  projectionBySeason: Record<string, ProjectionDay[]>
  diagnosticsByPivot: Record<string, PivotDiagnostic>
  energyBills: EnergyBill[]
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
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient,
  preferredCompanyId?: string | null
): Promise<DashboardData> {
  // 1ª rodada: company (depende de userId)
  const company = await getUserCompanyOrThrow(userId, client, preferredCompanyId)

  // 2ª rodada: farms + contexts em paralelo (ambos dependem só de company.id)
  const [farms, contexts] = await Promise.all([
    listFarmsByCompany(company.id, client),
    listManagementSeasonContexts(company.id, client),
  ])

  const farmMap = new Map(farms.map((farm) => [farm.id, farm]))
  const farmIds = farms.map((farm) => farm.id)

  // 3ª rodada: pivots + histórico de todas as safras ativas em paralelo
  const activeContexts = contexts.filter((item) => item.season.is_active)

  const [rawPivots, allHistories] = await Promise.all([
    listPivotsByFarmIds(farmIds, client),
    Promise.all(activeContexts.map((ctx) => listDailyManagementBySeason(ctx.season.id, client))),
  ])

  const pivots = rawPivots.map((pivot) => ({
    ...pivot,
    farms: farmMap.get(pivot.farm_id)
      ? { id: pivot.farm_id, name: farmMap.get(pivot.farm_id)!.name }
      : null,
  })) as DashboardPivot[]

  const activeSeasons = activeContexts.map((context) => context.season)

  // Processar históricos (já vieram todos em paralelo)
  const lastManagementBySeason: Record<string, DailyManagement> = {}
  const historyBySeason: Record<string, DailyManagement[]> = {}
  const projectionBySeason: Record<string, ProjectionDay[]> = {}
  const today = new Date().toISOString().slice(0, 10)

  for (let i = 0; i < activeContexts.length; i++) {
    const { season, crop, pivot } = activeContexts[i]
    const history = allHistories[i]
    const lastManagement = history[0] ?? null
    if (lastManagement) lastManagementBySeason[season.id] = lastManagement
    historyBySeason[season.id] = history.slice(0, 7).reverse()

    if (!crop || !season.planting_date) continue

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
      crop, startDate: today, startDas: das, startAdc,
      fieldCapacity: Number(season.field_capacity ?? 32),
      wiltingPoint:  Number(season.wilting_point  ?? 14),
      bulkDensity:   Number(season.bulk_density   ?? 1.4),
      avgEto, pivot, days: 7,
    })
  }

  // 4ª rodada: energyBills + diagnostics em paralelo (dependem de pivots)
  pivots.sort((a, b) => a.name.localeCompare(b.name))

  const [energyBills, diagnostics] = await Promise.all([
    listEnergyBillsByPivotIds(pivots.map(p => p.id), client),
    Promise.all(
      pivots.map(async (pivot) => [pivot.id, await getPivotDiagnostic(company.id, pivot.id, undefined, client)] as const)
    ),
  ])

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
    contexts,
    hasPivots: pivots.length > 0,
    lastManagementBySeason,
    historyBySeason,
    projectionBySeason,
    diagnosticsByPivot,
    energyBills,
    summary,
  }
}

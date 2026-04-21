import { calcProjection, calcCTA, getStageInfoForDas, type ProjectionDay } from '@/lib/water-balance'
import { getUserCompanyOrThrow } from '@/services/companies'
import { listFarmsByCompany } from '@/services/farms'
import { getPivotDiagnostic, type PivotDiagnostic } from '@/services/pivot-diagnostics'
import {
  listManagementSeasonContexts,
  listDailyManagementBySeason,
  getManagementExternalData,
  type ManagementSeasonContext,
} from '@/services/management'
import { listPivotsByFarmIds } from '@/services/pivots'
import { listEnergyBillsByPivotIds } from '@/services/energy-bills'
import type { TypedSupabaseClient } from '@/services/base'
import type { DailyManagement, EnergyBill, Pivot, Season } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { calcDAS, computeResolvedManagementBalance } from '@/lib/calculations/management-balance'

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
  /** ADc projetado para HOJE (%), descontando ETc dos dias sem registro */
  currentFieldCapacityBySeasonId: Record<string, number>
  /** ADc projetado para HOJE (mm), usado como ponto de partida para projeções */
  currentAdcBySeasonId: Record<string, number>
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
  // ADc projetado para HOJE usando dados climáticos reais do banco
  const currentFieldCapacityBySeasonId: Record<string, number> = {}
  const currentAdcBySeasonId: Record<string, number> = {}
  // Usa data local BRT (UTC-3) para evitar avanço de dia à noite
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const today = brt.toISOString().slice(0, 10)

  for (let i = 0; i < activeContexts.length; i++) {
    const { season, crop, pivot, farm } = activeContexts[i]
    const history = allHistories[i]
    const lastManagement = history[0] ?? null
    if (lastManagement) lastManagementBySeason[season.id] = lastManagement
    historyBySeason[season.id] = history.slice(0, 15).reverse()

    if (!crop || !season.planting_date) continue

    const das = calcDAS(season.planting_date, today)
    let currentAdc: number
    let currentPct: number

    if (!lastManagement?.ctda) {
      // Sem histórico: parte do ADc inicial da safra
      const stageInfo = getStageInfoForDas(crop, das)
      const cta = calcCTA(
        Number(pivot?.field_capacity ?? season.field_capacity ?? 32),
        Number(pivot?.wilting_point ?? season.wilting_point ?? 14),
        Number(pivot?.bulk_density ?? season.bulk_density ?? 1.4),
        stageInfo.rootDepthCm
      )
      currentAdc = cta * ((season.initial_adc_percent ?? 100) / 100)
      currentPct = (season.initial_adc_percent ?? 100)
    } else if (lastManagement.date === today) {
      // Último registro é de hoje — usa diretamente
      currentAdc = lastManagement.ctda
      currentPct = lastManagement.field_capacity_percent ?? 100
    } else {
      // Último registro é de dias anteriores: avança dia a dia usando APENAS dados do banco.
      // NUNCA chama APIs externas aqui — o cron é responsável por buscar dados e gravar.
      // Isso garante que o dashboard mostra valores determinísticos e estáveis entre reloads.
      const lastDate = lastManagement.date
      const daysSinceRecord = Math.max(1, Math.round(
        (new Date(today + 'T12:00:00').getTime() - new Date(lastDate + 'T12:00:00').getTime()) / 86400000
      ))

      // ETc fallback: média dos últimos 3 registros com ETc válido (mais estável que só o último)
      const recentEtcValues = history
        .filter((m: DailyManagement) => m.etc_mm != null && m.etc_mm > 0)
        .slice(0, 3)
        .map((m: DailyManagement) => m.etc_mm!)
      const avgEtc = recentEtcValues.length > 0
        ? recentEtcValues.reduce((a, b) => a + b, 0) / recentEtcValues.length
        : 3

      const daysToProcess = Math.min(daysSinceRecord, 14)
      let runningAdc = lastManagement.ctda
      let runningHistory = [...history]

      for (let d = 1; d <= daysToProcess; d++) {
        const gapDate = new Date(lastDate + 'T12:00:00')
        gapDate.setDate(gapDate.getDate() + d)
        const gapDateStr = gapDate.toISOString().split('T')[0]

        // Busca dados climáticos APENAS do banco (weather_data + rainfall_records)
        // Irrigação NÃO é incluída na projeção — só entra no balanço quando o
        // agricultor confirma via Lançamentos e o cron processa (padrão FAO-56:
        // Ii deve ser a lâmina realmente aplicada, não a planejada)
        try {
          const externalData = await getManagementExternalData(
            farm.id, pivot?.id ?? null, gapDateStr, pivot, client
          )
          // Usa APENAS weather_data do banco — ignora geolocationWeather (Open-Meteo ao vivo)
          const climateSnapshot = externalData.weather

          if (climateSnapshot) {
            const result = computeResolvedManagementBalance({
              context: activeContexts[i],
              history: runningHistory,
              date: gapDateStr,
              tmax: climateSnapshot.temp_max != null ? String(climateSnapshot.temp_max) : '',
              tmin: climateSnapshot.temp_min != null ? String(climateSnapshot.temp_min) : '',
              humidity: climateSnapshot.humidity_percent != null ? String(climateSnapshot.humidity_percent) : '',
              wind: climateSnapshot.wind_speed_ms != null ? String(climateSnapshot.wind_speed_ms) : '',
              radiation: climateSnapshot.solar_radiation_wm2 != null ? String(climateSnapshot.solar_radiation_wm2) : '',
              rainfall: '',
              actualDepth: '',
              actualSpeed: '',
              externalData: { ...externalData, geolocationWeather: null },
            })
            if (result) {
              runningAdc = result.adcNew
              runningHistory = [
                { ...lastManagement, date: gapDateStr, ctda: result.adcNew, field_capacity_percent: result.fieldCapacityPercent },
                ...runningHistory,
              ]
              continue
            }
          }
        } catch {
          // Falha ao buscar dados do banco — usa fallback ETc
        }

        // Fallback determinístico: apenas ETc (sem irrigação)
        const stageInfo = getStageInfoForDas(crop, calcDAS(season.planting_date, gapDateStr))
        const cta = calcCTA(
          Number(pivot?.field_capacity ?? season.field_capacity ?? 32),
          Number(pivot?.wilting_point ?? season.wilting_point ?? 14),
          Number(pivot?.bulk_density ?? season.bulk_density ?? 1.4),
          stageInfo.rootDepthCm
        )
        runningAdc = Math.max(0, Math.min(runningAdc - avgEtc, cta))
      }

      currentAdc = runningAdc
      const stageInfo = getStageInfoForDas(crop, das)
      const cta = calcCTA(
        Number(pivot?.field_capacity ?? season.field_capacity ?? 32),
        Number(pivot?.wilting_point ?? season.wilting_point ?? 14),
        Number(pivot?.bulk_density ?? season.bulk_density ?? 1.4),
        stageInfo.rootDepthCm
      )
      currentPct = cta > 0 ? (currentAdc / cta) * 100 : 0
    }

    currentFieldCapacityBySeasonId[season.id] = currentPct
    currentAdcBySeasonId[season.id] = currentAdc

    const avgEto = lastManagement?.eto_mm ?? 5
    projectionBySeason[season.id] = calcProjection({
      crop, startDate: today, startDas: das, startAdc: currentAdc,
      fieldCapacity: Number(pivot?.field_capacity ?? season.field_capacity ?? 32),
      wiltingPoint:  Number(pivot?.wilting_point  ?? season.wilting_point  ?? 14),
      bulkDensity:   Number(pivot?.bulk_density   ?? season.bulk_density   ?? 1.4),
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
    currentFieldCapacityBySeasonId,
    currentAdcBySeasonId,
    diagnosticsByPivot,
    energyBills,
    summary,
  }
}

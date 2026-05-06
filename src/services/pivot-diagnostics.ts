import type {
  Crop,
  DailyManagement,
  Farm,
  Pivot,
  RainfallRecord,
  Season,
  WeatherStation,
} from '@/types/database'
import { listCropsByCompany } from '@/services/crops'
import { listFarmsByCompany } from '@/services/farms'
import {
  getManagementExternalData,
  listDailyManagementBySeason,
  type ManagementClimateSource,
} from '@/services/management'
import { listPivotsByFarmIds } from '@/services/pivots'
import { listRainfallByPivotIds } from '@/services/rainfall'
import { listSeasonsByFarmIds } from '@/services/seasons'
import { getWeatherStationById, listWeatherStationsByFarmIds } from '@/services/weather-stations'
import type { TypedSupabaseClient } from './base'
import { createClient } from '@/lib/supabase/client'

export interface PivotDiagnosticSummary {
  pivotId: string
  pivotName: string
  farmName: string
}

export interface PivotDiagnostic {
  pivot: Pivot
  farm: Farm
  activeSeason: Season | null
  crop: Crop | null
  preferredStation: WeatherStation | null
  farmStations: WeatherStation[]
  climateRoute: Exclude<ManagementClimateSource, null>
  climateRouteLabel: string
  etoValue: number | null
  etoSource: string | null
  etoConfidence: string | null
  rainfallValue: number | null
  rainfallDate: string | null
  rainfallSource: string
  lastManagement: DailyManagement | null
  hasManagementToday: boolean
  automationStatus: 'Automação pronta' | 'Automação com restrições' | 'Automação indisponível' | 'Manejo do dia já gerado'
  suggestedAction:
    | 'Nenhuma ação necessária'
    | 'Gerar manejo automático de hoje'
    | 'Registrar chuva do dia'
    | 'Associar estação ao pivô'
    | 'Cadastrar coordenadas do pivô'
    | 'Criar safra ativa'
    | 'Vincular cultura à safra'
    | 'Revisar dados climáticos'
    | 'Completar dados mínimos para cálculo'
    | 'Revisar manejo de hoje'
  automationReason: string | null
  alerts: string[]
  status: 'OK' | 'atenção' | 'sem dados'
}

function getTodayDateValue(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function getClimateRouteLabel(route: PivotDiagnostic['climateRoute']): string {
  switch (route) {
    case 'pivot_station':
      return 'Estação preferencial do pivô'
    case 'farm_station':
      return 'Estação da fazenda'
    case 'pivot_geolocation':
      return 'Geolocalização do pivô'
    default:
      return 'Fallback manual/local'
  }
}

function getPreferredStationId(pivot: Pivot): string | null {
  return typeof pivot.weather_config?.station_id === 'string' && pivot.weather_config.station_id.trim()
    ? pivot.weather_config.station_id
    : null
}

function getAutomationDecision(params: {
  activeSeason: Season | null
  crop: Crop | null
  preferredStation: WeatherStation | null
  farmStations: WeatherStation[]
  pivot: Pivot
  climateSnapshot: { rainfall_mm?: number | null } | null
  climateSource: PivotDiagnostic['climateRoute']
  rainfallValue: number | null
  hasManagementToday: boolean
}) {
  const {
    activeSeason,
    crop,
    preferredStation,
    farmStations,
    pivot,
    climateSnapshot,
    climateSource,
    rainfallValue,
    hasManagementToday,
  } = params

  if (hasManagementToday) {
    return {
      automationStatus: 'Manejo do dia já gerado' as const,
      suggestedAction: 'Nenhuma ação necessária' as const,
      automationReason: 'Já existe manejo salvo para a data de hoje.',
    }
  }

  if (!activeSeason) {
    return {
      automationStatus: 'Automação indisponível' as const,
      suggestedAction: 'Criar safra ativa' as const,
      automationReason: 'O pivô ainda não possui safra ativa para gerar manejo automático.',
    }
  }

  if (!crop) {
    return {
      automationStatus: 'Automação indisponível' as const,
      suggestedAction: 'Vincular cultura à safra' as const,
      automationReason: 'A safra ativa existe, mas está sem cultura vinculada.',
    }
  }

  if (!preferredStation && farmStations.length === 0 && (pivot.latitude == null || pivot.longitude == null)) {
    return {
      automationStatus: 'Automação indisponível' as const,
      suggestedAction: 'Cadastrar coordenadas do pivô' as const,
      automationReason: 'Sem estação disponível e sem coordenadas para fallback climático por geolocalização.',
    }
  }

  if (!climateSnapshot) {
    return {
      automationStatus: 'Automação com restrições' as const,
      suggestedAction: preferredStation || farmStations.length > 0
        ? ('Revisar dados climáticos' as const)
        : ('Completar dados mínimos para cálculo' as const),
      automationReason: 'Ainda não há clima recente suficiente para sustentar o manejo automático do dia.',
    }
  }

  if (rainfallValue == null) {
    return {
      automationStatus: 'Automação com restrições' as const,
      suggestedAction: 'Registrar chuva do dia' as const,
      automationReason: 'O clima existe, mas a chuva do dia ainda não está registrada de forma confiável.',
    }
  }

  if (climateSource === 'manual') {
    return {
      automationStatus: 'Automação com restrições' as const,
      suggestedAction: 'Completar dados mínimos para cálculo' as const,
      automationReason: 'O pivô depende de fallback manual/local, o que reduz a autonomia operacional.',
    }
  }

  if (!preferredStation && farmStations.length === 0) {
    return {
      automationStatus: 'Automação com restrições' as const,
      suggestedAction: 'Associar estação ao pivô' as const,
      automationReason: 'O manejo pode operar por geolocalização, mas ainda sem estação associada ao pivô ou à fazenda.',
    }
  }

  return {
    automationStatus: 'Automação pronta' as const,
    suggestedAction: 'Gerar manejo automático de hoje' as const,
    automationReason: 'O pivô possui safra, cultura e caminho climático suficiente para gerar o manejo do dia.',
  }
}

export async function listPivotDiagnosticSummaries(
  companyId: string,
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<PivotDiagnosticSummary[]> {
  const farms = await listFarmsByCompany(companyId, client)
  const farmIds = farms.map((farm) => farm.id)
  const farmMap = new Map(farms.map((farm) => [farm.id, farm.name]))
  const pivots = await listPivotsByFarmIds(farmIds, client)

  return pivots.map((pivot) => ({
    pivotId: pivot.id,
    pivotName: pivot.name,
    farmName: farmMap.get(pivot.farm_id) ?? 'Fazenda desconhecida',
  }))
}

export async function getPivotDiagnostic(
  companyId: string,
  pivotId: string,
  date = getTodayDateValue(),
  client: TypedSupabaseClient = createClient() as TypedSupabaseClient
): Promise<PivotDiagnostic> {
  const farms = await listFarmsByCompany(companyId, client)
  const farmIds = farms.map((farm) => farm.id)
  const [pivots, seasons, crops, stations] = await Promise.all([
    listPivotsByFarmIds(farmIds, client),
    listSeasonsByFarmIds(farmIds, client),
    listCropsByCompany(companyId, client),
    listWeatherStationsByFarmIds(farmIds, client),
  ])

  const pivot = pivots.find((item) => item.id === pivotId)
  if (!pivot) {
    throw new Error('Pivô não encontrado para a empresa ativa')
  }

  const farm = farms.find((item) => item.id === pivot.farm_id)
  if (!farm) {
    throw new Error('Fazenda do pivô não encontrada')
  }

  const pivotSeasons = seasons.filter((season) => season.pivot_id === pivot.id)
  const activeSeason = pivotSeasons.find((season) => season.is_active) ?? pivotSeasons[0] ?? null
  const crop = activeSeason?.crop_id ? crops.find((item) => item.id === activeSeason.crop_id) ?? null : null
  const farmStations = stations.filter((station) => station.farm_id === farm.id)
  const preferredStationId = getPreferredStationId(pivot)
  const preferredStation = preferredStationId ? await getWeatherStationById(preferredStationId, client) : null

  const [externalData, seasonHistory, rainfallRecords] = await Promise.all([
    getManagementExternalData(farm.id, pivot.id, date, pivot, client),
    activeSeason ? listDailyManagementBySeason(activeSeason.id, client) : Promise.resolve([]),
    listRainfallByPivotIds([pivot.id], client, date, date),
  ])

  const lastManagement = seasonHistory[0] ?? null
  const latestRainfall = rainfallRecords[0] ?? null
  const climateSnapshot = externalData.weather ?? externalData.geolocationWeather
  const hasManagementToday = lastManagement?.date === date

  const alerts: string[] = []
  if (!activeSeason) alerts.push('Sem safra ativa')
  if (activeSeason && !crop) alerts.push('Safra sem cultura vinculada')
  if (pivot.latitude == null || pivot.longitude == null) alerts.push('Pivô sem coordenada')
  if (!preferredStation && farmStations.length === 0) alerts.push('Pivô/Fazenda sem estação')
  if (!climateSnapshot) alerts.push('Sem clima recente')
  if (!latestRainfall && climateSnapshot?.rainfall_mm == null) alerts.push('Sem chuva registrada')
  if (!lastManagement) alerts.push('Sem manejo recente')

  const status: PivotDiagnostic['status'] =
    !lastManagement && alerts.length >= 3
      ? 'sem dados'
      : alerts.length > 0
        ? 'atenção'
        : 'OK'

  const rainfallValue = latestRainfall?.rainfall_mm ?? climateSnapshot?.rainfall_mm ?? null
  const climateRoute = (externalData.climateSource ?? 'manual') as PivotDiagnostic['climateRoute']
  const automationDecision = getAutomationDecision({
    activeSeason,
    crop,
    preferredStation,
    farmStations,
    pivot,
    climateSnapshot,
    climateSource: climateRoute,
    rainfallValue,
    hasManagementToday,
  })

  return {
    pivot,
    farm,
    activeSeason,
    crop,
    preferredStation,
    farmStations,
    climateRoute,
    climateRouteLabel: getClimateRouteLabel(climateRoute),
    etoValue: lastManagement?.eto_mm ?? null,
    etoSource: climateSnapshot
      ? (externalData.weather ? 'Estação climática' : 'Dados meteorológicos')
      : lastManagement?.eto_mm != null ? 'Último manejo' : null,
    etoConfidence: null,
    rainfallValue,
    rainfallDate: latestRainfall?.date ?? (climateSnapshot ? date : null),
    rainfallSource: latestRainfall
      ? 'rainfall_records'
      : climateSnapshot?.source === 'pivot_geolocation_open_meteo'
        ? 'geolocalização do pivô'
        : externalData.weather
          ? 'weather_data'
          : 'ausente',
    lastManagement,
    hasManagementToday,
    automationStatus: automationDecision.automationStatus,
    suggestedAction: automationDecision.suggestedAction,
    automationReason: automationDecision.automationReason,
    alerts,
    status,
  }
}

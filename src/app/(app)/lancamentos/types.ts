import type { ManagementSeasonContext } from '@/services/management'
import type { DailyManagement, PivotSpeedEntry, PivotSector } from '@/types/database'

export interface PivotMeta {
  context: ManagementSeasonContext
  speedTable: PivotSpeedEntry[]
  sectors: PivotSector[]
  history: DailyManagement[]
  currentPct: number | null
  currentAdcMm: number
  ctaMm: number
  cadMm: number
}

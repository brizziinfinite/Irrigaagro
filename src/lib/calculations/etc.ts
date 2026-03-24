/**
 * Evapotranspiration Correction Module
 * Implements crop coefficient (Kc) and water stress coefficient (Ks) calculations
 * for computing actual crop evapotranspiration (ETc)
 */

/**
 * Parameters for crop coefficient calculation
 */
export interface KcParams {
  /** Days after sowing (DAS) */
  das: number
  /** Duration of stage 1: Initial growth (days) */
  stage1Duration: number
  /** Duration of stage 2: Development/crop growth (days) */
  stage2Duration: number
  /** Duration of stage 3: Mid-season/full cover (days) */
  stage3Duration: number
  /** Duration of stage 4: Late season/maturity (days) */
  stage4Duration: number
  /** Crop coefficient at initial stage */
  kcIni: number
  /** Crop coefficient at mid-season */
  kcMid: number
  /** Crop coefficient at final/maturity stage */
  kcFinal: number
}

/**
 * Parameters for water stress coefficient calculation
 */
export interface KsParams {
  /** Current soil moisture (mm or cm, must match fieldCapacity/wiltingPoint units) */
  soilMoisture: number
  /** Field capacity (mm or cm) */
  fieldCapacity: number
  /** Wilting point (mm or cm) */
  wiltingPoint: number
  /** Depletion fraction (typically 0.5-0.6) */
  fFactor: number
}

/**
 * Calculate crop coefficient (Kc) for a specific day in the growing season
 * Interpolates between four growth stages
 *
 * Stage 1: Initial (0 to stage1Duration) - Linear interpolation from 0 to kcIni
 * Stage 2: Development (stage1Duration to stage1+2Duration) - Linear interpolation from kcIni to kcMid
 * Stage 3: Mid-season (stage1+2 to stage1+2+3Duration) - Constant kcMid
 * Stage 4: Late season (stage1+2+3 to end) - Linear interpolation from kcMid to kcFinal
 *
 * @param params Crop coefficient parameters
 * @returns Kc value for the given DAS
 */
export function calculateKc(params: KcParams): number {
  const {
    das,
    stage1Duration,
    stage2Duration,
    stage3Duration,
    stage4Duration,
    kcIni,
    kcMid,
    kcFinal
  } = params

  // Stage boundaries (in DAS)
  const stage1End = stage1Duration
  const stage2End = stage1Duration + stage2Duration
  const stage3End = stage1Duration + stage2Duration + stage3Duration
  const stage4End = stage1Duration + stage2Duration + stage3Duration + stage4Duration

  // Stage 1: Initial growth (0 to stage1End)
  if (das <= stage1End && stage1End > 0) {
    const progress = das / stage1End
    return kcIni * progress
  }

  // Stage 2: Development (stage1End to stage2End)
  if (das <= stage2End && stage2End > stage1End) {
    const stageProgress = das - stage1End
    const stageDuration = stage2End - stage1End
    const progress = stageProgress / stageDuration
    return kcIni + (kcMid - kcIni) * progress
  }

  // Stage 3: Mid-season (stage2End to stage3End)
  if (das <= stage3End && stage3End > stage2End) {
    return kcMid
  }

  // Stage 4: Late season (stage3End to stage4End)
  if (das <= stage4End && stage4End > stage3End) {
    const stageProgress = das - stage3End
    const stageDuration = stage4End - stage3End
    const progress = stageProgress / stageDuration
    return kcMid + (kcFinal - kcMid) * progress
  }

  // After end of season
  if (das > stage4End) {
    return kcFinal
  }

  return kcMid
}

/**
 * Calculate water stress coefficient (Ks)
 * Reduces ETc when soil moisture is below the critical depletion threshold
 *
 * Ks = 1 when soil moisture > (fieldCapacity - fFactor × AWC)
 * Ks decreases linearly from 1 to 0 when moisture is between threshold and wilting point
 * Ks = 0 when soil moisture <= wilting point
 *
 * @param params Water stress coefficient parameters
 * @returns Ks value between 0 and 1
 */
export function calculateKs(params: KsParams): number {
  const { soilMoisture, fieldCapacity, wiltingPoint, fFactor } = params

  // Available water capacity
  const awc = fieldCapacity - wiltingPoint

  // Critical depletion threshold (soil moisture below which stress occurs)
  const criticalThreshold = fieldCapacity - fFactor * awc

  // No stress when moisture is above critical threshold
  if (soilMoisture >= criticalThreshold) {
    return 1.0
  }

  // Plant wilting point - no water available
  if (soilMoisture <= wiltingPoint) {
    return 0.0
  }

  // Linear decrease between threshold and wilting point
  const ks = (soilMoisture - wiltingPoint) / (criticalThreshold - wiltingPoint)
  return Math.max(0, Math.min(1, ks))
}

/**
 * Calculate actual crop evapotranspiration (ETc)
 * ETc = ETo × Kc × Ks
 *
 * @param eto Reference evapotranspiration (mm/day)
 * @param kc Crop coefficient (dimensionless)
 * @param ks Water stress coefficient (dimensionless, 0-1)
 * @returns Actual crop evapotranspiration in mm/day
 */
export function calculateETc(eto: number, kc: number, ks: number = 1): number {
  return eto * kc * ks
}

/**
 * Calculate Kc value for multiple days and return array
 * Useful for seasonal planning
 *
 * @param params Crop coefficient parameters
 * @param totalDays Total number of days to calculate
 * @returns Array of Kc values for each day (0 to totalDays-1)
 */
export function calculateKcSeries(params: KcParams, totalDays: number): number[] {
  const result: number[] = []
  for (let das = 0; das < totalDays; das++) {
    result.push(calculateKc({ ...params, das }))
  }
  return result
}

/**
 * Calculate Ks value for a range of soil moisture values
 * Useful for analyzing stress response
 *
 * @param fieldCapacity Field capacity in mm/cm
 * @param wiltingPoint Wilting point in mm/cm
 * @param fFactor Depletion fraction
 * @param steps Number of steps from wilting point to field capacity
 * @returns Array of [soilMoisture, Ks] pairs
 */
export function calculateKsRange(
  fieldCapacity: number,
  wiltingPoint: number,
  fFactor: number,
  steps: number = 100
): Array<[number, number]> {
  const result: Array<[number, number]> = []
  const step = (fieldCapacity - wiltingPoint) / steps

  for (let i = 0; i <= steps; i++) {
    const soilMoisture = wiltingPoint + step * i
    const ks = calculateKs({
      soilMoisture,
      fieldCapacity,
      wiltingPoint,
      fFactor
    })
    result.push([soilMoisture, ks])
  }

  return result
}

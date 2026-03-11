/**
 * Water Balance Module
 * Implements daily soil moisture calculations and irrigation requirement estimates
 * based on water balance equations
 */

/**
 * Parameters for daily water balance calculation
 */
export interface WaterBalanceParams {
  /** Soil moisture from previous day (mm or cm) */
  previousMoisture: number
  /** Actual crop evapotranspiration (mm/day) */
  etc: number
  /** Effective rainfall (mm/day) */
  effectiveRainfall: number
  /** Applied irrigation depth (mm/day) */
  irrigationApplied: number
}

/**
 * Result of water balance calculation
 */
export interface WaterBalanceResult {
  /** Calculated soil moisture for current day (mm or cm) */
  currentMoisture: number
  /** Daily change in soil moisture (mm or cm) */
  dailyChange: number
}

/**
 * Irrigation requirement parameters
 */
export interface IrrigationRequirementParams {
  /** Current soil moisture (mm or cm) */
  currentMoisture: number
  /** Field capacity (mm or cm) */
  fieldCapacity: number
  /** Wilting point (mm or cm) */
  wiltingPoint: number
  /** Root depth (cm or mm) */
  rootDepth: number
  /** Depletion fraction (typically 0.5-0.6) */
  fFactor: number
}

/**
 * Calculate daily soil moisture using water balance
 * moisture(t) = moisture(t-1) - ETc + effectiveRainfall + irrigation
 *
 * @param params Water balance parameters
 * @returns Water balance result with current moisture and daily change
 */
export function calculateWaterBalance(
  params: WaterBalanceParams
): WaterBalanceResult {
  const {
    previousMoisture,
    etc,
    effectiveRainfall,
    irrigationApplied
  } = params

  const dailyChange = -etc + effectiveRainfall + irrigationApplied
  const currentMoisture = previousMoisture + dailyChange

  return {
    currentMoisture: Math.max(0, currentMoisture),
    dailyChange
  }
}

/**
 * Calculate crop total available water (CTDA)
 * CTDA = (fieldCapacity - wiltingPoint) × rootDepth
 * Represents total water available for plant use in the root zone
 *
 * @param fieldCapacity Field capacity in % of dry soil weight or mm/cm depth
 * @param wiltingPoint Wilting point in % of dry soil weight or mm/cm depth
 * @param rootDepth Root depth in cm
 * @returns Total available water in mm
 */
export function calculateCTDA(
  fieldCapacity: number,
  wiltingPoint: number,
  rootDepth: number
): number {
  // AWC in percentage or depth basis
  const awc = fieldCapacity - wiltingPoint

  // If values appear to be percentage-based (0-100), convert to depth
  // Assuming typical soil with ~1.0 mm water per mm depth per % difference
  if (fieldCapacity <= 100 && wiltingPoint <= 100) {
    return (awc / 100) * rootDepth * 10 // mm
  }

  // If values are already in depth units (mm/cm)
  return awc * (rootDepth / 10) // Assuming rootDepth in cm
}

/**
 * Calculate easily available water (EAW)
 * EAW = CTDA × (1 - fFactor)
 * Represents water available before plant stress occurs
 *
 * @param ctda Crop total available water (mm)
 * @param fFactor Depletion fraction (typically 0.5-0.6)
 * @returns Easily available water in mm
 */
export function calculateEAW(ctda: number, fFactor: number): number {
  return ctda * (1 - fFactor)
}

/**
 * Calculate current available water in the root zone
 * CAW = currentMoisture - wiltingPoint
 *
 * @param currentMoisture Current soil moisture (mm)
 * @param wiltingPoint Wilting point (mm)
 * @returns Current available water in mm
 */
export function calculateCAW(
  currentMoisture: number,
  wiltingPoint: number
): number {
  return Math.max(0, currentMoisture - wiltingPoint)
}

/**
 * Calculate net irrigation requirement (IRN)
 * IRN = fieldCapacity - currentMoisture
 * Represents the water needed to bring soil to field capacity
 *
 * @param fieldCapacity Field capacity (mm)
 * @param currentMoisture Current soil moisture (mm)
 * @param rootDepth Root depth (cm) - used to scale percentage-based values
 * @returns Net irrigation requirement in mm
 */
export function calculateIRN(
  fieldCapacity: number,
  currentMoisture: number,
  rootDepth: number = 100
): number {
  // Handle percentage-based field capacity values
  if (fieldCapacity <= 100) {
    // Convert percentage to depth (mm)
    const fcDepth = (fieldCapacity / 100) * rootDepth * 10
    return Math.max(0, fcDepth - currentMoisture)
  }

  return Math.max(0, fieldCapacity - currentMoisture)
}

/**
 * Calculate total irrigation requirement (ITN) accounting for application efficiency
 * ITN = IRN / CUC
 * where CUC is the coefficient of uniformity (0-1)
 *
 * @param irn Net irrigation requirement (mm)
 * @param cuc Coefficient of uniformity (0-1, typically 0.75-0.85 for pivots)
 * @returns Total irrigation requirement in mm
 */
export function calculateITN(irn: number, cuc: number = 0.8): number {
  if (cuc <= 0 || cuc > 1) {
    return irn
  }
  return irn / cuc
}

/**
 * Calculate frequency of irrigation
 * Determines how often irrigation should be applied
 *
 * @param eaw Easily available water (mm)
 * @param etcDaily Daily crop evapotranspiration (mm/day)
 * @returns Irrigation frequency in days
 */
export function calculateIrrigationFrequency(
  eaw: number,
  etcDaily: number
): number {
  if (etcDaily <= 0) {
    return 365 // No irrigation needed
  }

  const frequency = eaw / etcDaily
  return Math.max(1, Math.round(frequency))
}

/**
 * Calculate irrigation depth per event
 * Balances field capacity replacement with frequency constraints
 *
 * @param ctda Crop total available water (mm)
 * @param fFactor Depletion fraction (0-1)
 * @param frequency Desired irrigation frequency (days)
 * @param etcDaily Daily crop evapotranspiration (mm/day)
 * @returns Recommended irrigation depth in mm
 */
export function calculateIrrigationDepth(
  ctda: number,
  fFactor: number,
  frequency: number,
  etcDaily: number
): number {
  // Maximum depletion depth
  const maxDepletion = ctda * fFactor

  // Amount consumed in frequency days
  const etcFrequency = etcDaily * frequency

  // Apply the lesser of max depletion or consumption
  const depth = Math.min(maxDepletion, etcFrequency)

  return Math.max(0, depth)
}

/**
 * Calculate soil moisture as percentage of field capacity
 *
 * @param currentMoisture Current soil moisture (mm)
 * @param fieldCapacity Field capacity (mm)
 * @returns Soil moisture as percentage of field capacity (0-100)
 */
export function calculateFieldCapacityPercent(
  currentMoisture: number,
  fieldCapacity: number
): number {
  if (fieldCapacity <= 0) {
    return 0
  }

  return (currentMoisture / fieldCapacity) * 100
}

/**
 * Calculate cumulative water balance over multiple days
 * Useful for seasonal analysis
 *
 * @param initialMoisture Initial soil moisture (mm)
 * @param etcSeries Array of daily ETc values (mm/day)
 * @param rainfallSeries Array of daily rainfall values (mm/day)
 * @param irrigationSeries Array of daily irrigation values (mm/day)
 * @returns Array of daily soil moisture values
 */
export function calculateWaterBalanceSeries(
  initialMoisture: number,
  etcSeries: number[],
  rainfallSeries: number[],
  irrigationSeries: number[]
): number[] {
  const moistureSeries: number[] = [initialMoisture]

  const maxDays = Math.max(
    etcSeries.length,
    rainfallSeries.length,
    irrigationSeries.length
  )

  for (let day = 0; day < maxDays; day++) {
    const previousMoisture = moistureSeries[day]
    const etc = etcSeries[day] ?? 0
    const rainfall = rainfallSeries[day] ?? 0
    const irrigation = irrigationSeries[day] ?? 0

    const balance = calculateWaterBalance({
      previousMoisture,
      etc,
      effectiveRainfall: rainfall,
      irrigationApplied: irrigation
    })

    moistureSeries.push(balance.currentMoisture)
  }

  return moistureSeries
}

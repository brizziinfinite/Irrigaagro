/**
 * Irrigation Management Module
 * Implements irrigation recommendations, pivot speed calculations, and cost analysis
 */

import type { PivotSpeedEntry } from '@/types/database.ts'

/**
 * Irrigation status indicator
 */
export type IrrigationStatus = 'ok' | 'warning' | 'critical'

/**
 * Irrigation recommendation result
 */
export interface IrrigationRecommendation {
  /** Current irrigation status */
  status: IrrigationStatus
  /** Color code for UI display: 'green' | 'yellow' | 'red' */
  color: 'green' | 'yellow' | 'red'
  /** Human-readable status message */
  message: string
  /** Recommended irrigation depth in mm */
  recommendedDepthMm: number
  /** Recommended pivot speed as percentage (0-100) */
  recommendedSpeedPercent: number
  /** Field capacity as percentage (0-100) */
  fieldCapacityPercent: number
  /** Flag indicating if irrigation is needed */
  needsIrrigation: boolean
}

/**
 * Parameters for irrigation recommendation
 */
export interface IrrigationRecommendationParams {
  /** Current soil moisture (mm) */
  currentMoisture: number
  /** Field capacity (mm) */
  fieldCapacity: number
  /** Wilting point (mm) */
  wiltingPoint: number
  /** Easily available water (mm) */
  eaw: number
  /** Daily crop evapotranspiration (mm/day) */
  etcDaily: number
  /** Days until next recommended irrigation window */
  daysUntilCritical?: number
}

/**
 * Get irrigation recommendation based on field capacity percentage
 *
 * Status determination:
 * - OK (green): >75% FC - No immediate irrigation needed
 * - WARNING (yellow): 60-75% FC - Irrigation recommended within 2-3 days
 * - CRITICAL (red): <60% FC - Immediate irrigation required
 *
 * @param currentMoisture Current soil moisture (mm)
 * @param fieldCapacity Field capacity (mm)
 * @param eaw Easily available water (mm)
 * @param etcDaily Daily crop evapotranspiration (mm/day)
 * @param wiltingPoint Wilting point (mm)
 * @returns Irrigation recommendation
 */
export function getIrrigationRecommendation(
  currentMoisture: number,
  fieldCapacity: number,
  eaw: number,
  etcDaily: number,
  wiltingPoint: number
): IrrigationRecommendation {
  const fcPercent = (currentMoisture / fieldCapacity) * 100
  const awc = fieldCapacity - wiltingPoint

  let status: IrrigationStatus
  let color: 'green' | 'yellow' | 'red'
  let message: string
  let needsIrrigation: boolean
  let recommendedDepthMm: number

  // Determine status and recommendation based on field capacity percentage
  if (fcPercent > 75) {
    status = 'ok'
    color = 'green'
    message = 'Soil moisture is adequate. No irrigation needed.'
    needsIrrigation = false
    recommendedDepthMm = 0
  } else if (fcPercent > 60) {
    status = 'warning'
    color = 'yellow'
    message = 'Soil moisture is moderate. Plan irrigation in next 2-3 days.'
    needsIrrigation = false
    recommendedDepthMm = Math.min(eaw, awc * 0.5)
  } else {
    status = 'critical'
    color = 'red'
    message = 'Soil moisture is low. Apply irrigation immediately to avoid plant stress.'
    needsIrrigation = true
    recommendedDepthMm = fieldCapacity - currentMoisture
  }

  // Calculate recommended pivot speed (0-100%)
  // Speed should deliver recommended depth in a reasonable timeframe
  // Assuming typical pivot can deliver 20-40mm in one full pass
  const recommendedSpeedPercent = calculateRecommendedPivotSpeed(
    recommendedDepthMm
  )

  return {
    status,
    color,
    message,
    recommendedDepthMm,
    recommendedSpeedPercent,
    fieldCapacityPercent: fcPercent,
    needsIrrigation
  }
}

/**
 * Calculate recommended pivot speed based on desired irrigation depth
 * Assumes standard pivot performance: 100% speed delivers ~30-35mm per full cycle
 *
 * @param desiredDepthMm Desired irrigation depth in mm
 * @returns Recommended speed as percentage (0-100)
 */
export function calculateRecommendedPivotSpeed(desiredDepthMm: number): number {
  // Standard pivot can deliver approximately 30mm at 100% speed
  const referenceDepth = 30
  const speedPercent = (desiredDepthMm / referenceDepth) * 100

  // Clamp to 0-100%
  return Math.max(0, Math.min(100, speedPercent))
}

/**
 * Find the closest pivot speed entry for a desired water depth
 * Uses linear interpolation if exact match not found
 *
 * @param speedTable Array of pivot speed table entries
 * @param targetDepthMm Target water depth in mm
 * @returns Closest matching speed table entry
 */
export function findPivotSpeed(
  speedTable: PivotSpeedEntry[],
  targetDepthMm: number
): PivotSpeedEntry | null {
  if (!speedTable || speedTable.length === 0) {
    return null
  }

  // Sort by water depth
  const sorted = [...speedTable].sort((a, b) => a.water_depth_mm - b.water_depth_mm)

  // Find exact match or closest values
  let closest = sorted[0]
  let minDiff = Math.abs(sorted[0].water_depth_mm - targetDepthMm)

  for (const entry of sorted) {
    const diff = Math.abs(entry.water_depth_mm - targetDepthMm)
    if (diff < minDiff) {
      minDiff = diff
      closest = entry
    }

    // Return first entry that matches or exceeds target
    if (entry.water_depth_mm >= targetDepthMm) {
      return entry
    }
  }

  return closest
}

/**
 * Find pivot speed using linear interpolation between table values
 *
 * @param speedTable Array of pivot speed table entries sorted by water depth
 * @param targetDepthMm Target water depth in mm
 * @returns Interpolated speed entry with calculated values
 */
export function findPivotSpeedInterpolated(
  speedTable: PivotSpeedEntry[],
  targetDepthMm: number
): PivotSpeedEntry | null {
  if (!speedTable || speedTable.length === 0) {
    return null
  }

  // Sort by water depth
  const sorted = [...speedTable].sort((a, b) => a.water_depth_mm - b.water_depth_mm)

  // If target is below minimum, return minimum
  if (targetDepthMm <= sorted[0].water_depth_mm) {
    return sorted[0]
  }

  // If target is above maximum, return maximum
  if (targetDepthMm >= sorted[sorted.length - 1].water_depth_mm) {
    return sorted[sorted.length - 1]
  }

  // Find bracketing entries for interpolation
  for (let i = 0; i < sorted.length - 1; i++) {
    const lower = sorted[i]
    const upper = sorted[i + 1]

    if (
      targetDepthMm >= lower.water_depth_mm &&
      targetDepthMm <= upper.water_depth_mm
    ) {
      // Linear interpolation
      const ratio =
        (targetDepthMm - lower.water_depth_mm) /
        (upper.water_depth_mm - lower.water_depth_mm)

      const interpolatedSpeed =
        lower.speed_percent + (upper.speed_percent - lower.speed_percent) * ratio
      const interpolatedDuration =
        lower.duration_hours + (upper.duration_hours - lower.duration_hours) * ratio

      return {
        id: `interpolated-${i}`,
        pivot_id: lower.pivot_id,
        speed_percent: interpolatedSpeed,
        water_depth_mm: targetDepthMm,
        duration_hours: interpolatedDuration
      }
    }
  }

  return sorted[sorted.length - 1]
}

/**
 * Calculate irrigation cost
 * Total cost = depthMm × areaHa × costPerMm
 *
 * @param depthMm Irrigation depth in mm
 * @param areaHa Area being irrigated in hectares
 * @param costPerMmPerHa Cost per mm of irrigation per hectare (e.g., R$/ha/mm)
 * @returns Total irrigation cost in cost units
 */
export function calculateIrrigationCost(
  depthMm: number,
  areaHa: number,
  costPerMmPerHa: number = 1.0
): number {
  return depthMm * areaHa * costPerMmPerHa
}

/**
 * Calculate irrigation cost with energy component
 * Total cost = (water cost) + (energy cost)
 *
 * @param depthMm Irrigation depth in mm
 * @param areaHa Area being irrigated in hectares
 * @param costPerMmPerHa Water cost per mm per hectare
 * @param energyCostPerHour Energy cost per hour of operation
 * @param durationHours Duration of irrigation in hours
 * @returns Total irrigation cost including energy
 */
export function calculateIrrigationCostWithEnergy(
  depthMm: number,
  areaHa: number,
  costPerMmPerHa: number = 1.0,
  energyCostPerHour: number = 0,
  durationHours: number = 0
): number {
  const waterCost = calculateIrrigationCost(depthMm, areaHa, costPerMmPerHa)
  const energyCost = energyCostPerHour * durationHours
  return waterCost + energyCost
}

/**
 * Calculate cost-benefit of irrigation
 * Compares irrigation cost against potential yield loss from water stress
 *
 * @param irrigationCost Cost of irrigation
 * @param estimatedYieldGainPercent Expected yield gain from irrigation (%)
 * @param potentialYieldPerHa Potential yield per hectare
 * @param pricePerUnit Price per unit of crop
 * @param areaHa Area being irrigated
 * @returns Cost-benefit analysis result
 */
export interface CostBenefitResult {
  irrigationCost: number
  potentialBenefitValue: number
  netBenefit: number
  benefitCostRatio: number
  isWorthwhile: boolean
}

export function calculateCostBenefit(
  irrigationCost: number,
  estimatedYieldGainPercent: number,
  potentialYieldPerHa: number,
  pricePerUnit: number,
  areaHa: number
): CostBenefitResult {
  const totalPotentialYield = potentialYieldPerHa * areaHa
  const yieldGain = (estimatedYieldGainPercent / 100) * totalPotentialYield
  const potentialBenefitValue = yieldGain * pricePerUnit

  const netBenefit = potentialBenefitValue - irrigationCost
  const benefitCostRatio =
    irrigationCost > 0 ? potentialBenefitValue / irrigationCost : 0

  return {
    irrigationCost,
    potentialBenefitValue,
    netBenefit,
    benefitCostRatio,
    isWorthwhile: netBenefit > 0
  }
}

/**
 * Estimate energy consumption for irrigation
 * Based on pivot specifications and operation duration
 *
 * @param durationHours Duration of operation in hours
 * @param motorPowerKw Motor power rating in kW
 * @param efficiencyPercent Motor/system efficiency as percentage (0-100)
 * @returns Energy consumption in kWh
 */
export function estimateEnergyConsumption(
  durationHours: number,
  motorPowerKw: number = 50,
  efficiencyPercent: number = 85
): number {
  const efficiency = efficiencyPercent / 100
  return (durationHours * motorPowerKw) / efficiency
}

/**
 * Calculate water application efficiency
 * Based on Christiansen's uniformity coefficient
 *
 * @param cuc Coefficient of uniformity (0-1)
 * @returns Application efficiency as percentage (0-100)
 */
export function calculateApplicationEfficiency(cuc: number): number {
  return cuc * 100
}

/**
 * Get irrigation scheduling advice based on multiple factors
 *
 * @param fieldCapacityPercent Current field capacity percentage
 * @param daysUntilCritical Days until critical depletion at current ETc
 * @returns Array of scheduling recommendations
 */
export function getSchedulingAdvice(
  fieldCapacityPercent: number,
  daysUntilCritical: number = 0
): string[] {
  const advice: string[] = []

  if (fieldCapacityPercent > 75) {
    advice.push('Soil moisture is good. Focus on monitoring.')
    advice.push('Next irrigation can be scheduled in 5-7 days.')
  } else if (fieldCapacityPercent > 60) {
    advice.push('Soil moisture is adequate but monitor closely.')
    advice.push(`Apply irrigation within ${daysUntilCritical || 2}-3 days.`)
    advice.push('Consider current weather forecast for rainfall.')
  } else {
    advice.push('URGENT: Soil moisture is critically low.')
    advice.push('Apply irrigation today to prevent plant stress.')
    if (daysUntilCritical > 0) {
      advice.push(
        `Critical depletion will occur in ${daysUntilCritical} days without irrigation.`
      )
    }
  }

  return advice
}

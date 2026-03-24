/**
 * Penman-Monteith Method (FAO-56)
 * Implements the FAO-56 Penman-Monteith equation for calculating
 * reference evapotranspiration (ETo)
 */

/**
 * Parameters required for ETo calculation
 */
export interface EToParams {
  /** Maximum daily temperature (°C) */
  tempMax: number
  /** Minimum daily temperature (°C) */
  tempMin: number
  /** Mean relative humidity (%) */
  humidity: number
  /** Wind speed at 2m height (m/s) */
  windSpeed2m: number
  /** Solar radiation (MJ/m²/day) or incoming shortwave radiation (MJ/m²/day) */
  solarRadiation: number
  /** Latitude (decimal degrees, positive for N, negative for S) */
  latitude: number
  /** Altitude above sea level (m) */
  altitude: number
  /** Day of year (1-365) */
  dayOfYear: number
}

/**
 * Result of ETo calculation with intermediate values
 */
export interface EToResult {
  eto: number
  es: number
  ea: number
  delta: number
  gamma: number
  rn: number
  g: number
}

/**
 * Calculate saturation vapor pressure at a given temperature
 * Using Magnus formula: e°(T) = 0.6108 × exp(17.27 × T / (T + 237.3))
 *
 * @param temp Temperature in °C
 * @returns Saturation vapor pressure in kPa
 */
export function calculateSaturationVaporPressure(temp: number): number {
  return 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3))
}

/**
 * Calculate actual vapor pressure from relative humidity and saturation vapor pressure
 * ea = (RH/100) × e°(Tmean)
 *
 * @param humidity Relative humidity (%)
 * @param tempMax Maximum temperature (°C)
 * @param tempMin Minimum temperature (°C)
 * @returns Actual vapor pressure in kPa
 */
export function calculateActualVaporPressure(
  humidity: number,
  tempMax: number,
  tempMin: number
): number {
  const tempMean = (tempMax + tempMin) / 2
  const es = calculateSaturationVaporPressure(tempMean)
  return (humidity / 100) * es
}

/**
 * Calculate slope of saturation vapor pressure curve (Δ)
 * Δ = 4098 × e°(T) / (T + 237.3)²
 *
 * @param temp Temperature in °C
 * @returns Slope in kPa/°C
 */
export function calculateVaporPressureSlope(temp: number): number {
  const es = calculateSaturationVaporPressure(temp)
  return (4098 * es) / Math.pow(temp + 237.3, 2)
}

/**
 * Calculate psychrometric constant (γ)
 * γ = (Cp × P) / (ε × λ)
 * Simplified: γ = 0.000665 × P
 *
 * @param altitude Altitude above sea level (m)
 * @returns Psychrometric constant in kPa/°C
 */
export function calculatePsychrometricConstant(altitude: number): number {
  // Atmospheric pressure at given altitude
  const pressure = 101.3 * Math.pow(1 - (0.0065 * altitude) / 293.15, 5.26)
  // Simplified psychrometric constant
  return 0.000665 * pressure
}

/**
 * Calculate inverse relative distance Earth-Sun (dr)
 * dr = 1 + 0.033 × cos(2π/365 × J)
 *
 * @param dayOfYear Day of year (1-365)
 * @returns Inverse relative distance (dimensionless)
 */
export function calculateInverseDistanceEarthSun(dayOfYear: number): number {
  return 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365)
}

/**
 * Calculate solar declination (δ)
 * δ = 0.409 × sin(2π/365 × J - 1.39)
 *
 * @param dayOfYear Day of year (1-365)
 * @returns Solar declination in radians
 */
export function calculateSolarDeclination(dayOfYear: number): number {
  return 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39)
}

/**
 * Calculate sunset hour angle (ωs)
 * ωs = arccos(-tan(φ) × tan(δ))
 *
 * @param latitude Latitude in decimal degrees
 * @param declination Solar declination in radians
 * @returns Sunset hour angle in radians
 */
export function calculateSunsetHourAngle(
  latitude: number,
  declination: number
): number {
  const phi = (latitude * Math.PI) / 180 // Convert to radians
  const arg = -Math.tan(phi) * Math.tan(declination)
  // Clamp to [-1, 1] to avoid NaN from arccos
  const clampedArg = Math.max(-1, Math.min(1, arg))
  return Math.acos(clampedArg)
}

/**
 * Calculate extraterrestrial radiation (Ra)
 * Ra = (24×60/π) × Gsc × dr × [ωs×sin(φ)×sin(δ) + cos(φ)×cos(δ)×sin(ωs)]
 *
 * @param latitude Latitude in decimal degrees
 * @param dayOfYear Day of year (1-365)
 * @returns Extraterrestrial radiation in MJ/m²/day
 */
export function calculateExtraterrestrialRadiation(
  latitude: number,
  dayOfYear: number
): number {
  const Gsc = 0.0820 // Solar constant in MJ/m²/min
  const dr = calculateInverseDistanceEarthSun(dayOfYear)
  const delta = calculateSolarDeclination(dayOfYear)
  const phi = (latitude * Math.PI) / 180
  const omegaS = calculateSunsetHourAngle(latitude, delta)

  const term1 = omegaS * Math.sin(phi) * Math.sin(delta)
  const term2 =
    Math.cos(phi) * Math.cos(delta) * Math.sin(omegaS)

  const ra =
    ((24 * 60) / Math.PI) *
    Gsc *
    dr *
    (term1 + term2)

  return Math.max(0, ra)
}

/**
 * Calculate clear-sky radiation (Rso)
 * Rso = (0.75 + 2×10⁻⁵ × z) × Ra
 *
 * @param ra Extraterrestrial radiation (MJ/m²/day)
 * @param altitude Altitude above sea level (m)
 * @returns Clear-sky radiation in MJ/m²/day
 */
export function calculateClearSkyRadiation(
  ra: number,
  altitude: number
): number {
  return (0.75 + (2e-5 * altitude)) * ra
}

/**
 * Calculate net shortwave radiation (Rns)
 * Rns = (1 - α) × Rs
 * where α = 0.23 (albedo for grass)
 *
 * @param solarRadiation Incoming shortwave radiation (MJ/m²/day)
 * @returns Net shortwave radiation in MJ/m²/day
 */
export function calculateNetShortwaveRadiation(
  solarRadiation: number
): number {
  const albedo = 0.23 // For grass reference crop
  return (1 - albedo) * solarRadiation
}

/**
 * Calculate net longwave radiation (Rnl)
 * Rnl = σ × [((Tmax+273.16)⁴ + (Tmin+273.16)⁴)/2] × (0.34 - 0.14×√ea) × (1.35×Rs/Rso - 0.35)
 *
 * @param tempMax Maximum temperature (°C)
 * @param tempMin Minimum temperature (°C)
 * @param actualVaporPressure Actual vapor pressure (kPa)
 * @param solarRadiation Solar radiation (MJ/m²/day)
 * @param clearSkyRadiation Clear-sky radiation (MJ/m²/day)
 * @returns Net longwave radiation in MJ/m²/day
 */
export function calculateNetLongwaveRadiation(
  tempMax: number,
  tempMin: number,
  actualVaporPressure: number,
  solarRadiation: number,
  clearSkyRadiation: number
): number {
  const sigma = 2.042e-10 // Stefan-Boltzmann constant in MJ/K⁴/m²/day
  const tMax4 = Math.pow(tempMax + 273.16, 4)
  const tMin4 = Math.pow(tempMin + 273.16, 4)
  const t4Mean = (tMax4 + tMin4) / 2

  const vaFactor = 0.34 - 0.14 * Math.sqrt(actualVaporPressure)

  // Avoid division by zero
  const rRatio =
    clearSkyRadiation > 0
      ? (1.35 * solarRadiation) / clearSkyRadiation - 0.35
      : 0.35

  const rnl = sigma * t4Mean * vaFactor * Math.max(0, rRatio)
  return rnl
}

/**
 * Calculate net radiation (Rn)
 * Rn = Rns - Rnl
 *
 * @param rns Net shortwave radiation (MJ/m²/day)
 * @param rnl Net longwave radiation (MJ/m²/day)
 * @returns Net radiation in MJ/m²/day
 */
export function calculateNetRadiation(
  rns: number,
  rnl: number
): number {
  return rns - rnl
}

/**
 * Calculate soil heat flux (G)
 * For daily calculation: G ≈ 0 (soil heat flux averaged over daily period)
 * For growing season: G = 0
 *
 * @returns Soil heat flux in MJ/m²/day (typically 0 for daily calculations)
 */
export function calculateSoilHeatFlux(): number {
  return 0 // For daily calculations over grass, G is negligible
}

/**
 * Calculate reference evapotranspiration (ETo) using FAO-56 Penman-Monteith equation
 *
 * ETo = [0.408 × Δ × (Rn - G) + γ × (900/(T+273)) × u2 × (es - ea)] / [Δ + γ × (1 + 0.34 × u2)]
 *
 * @param params ETo calculation parameters
 * @returns ETo in mm/day
 */
export function calculateETo(params: EToParams): number {
  const { tempMax, tempMin, humidity, windSpeed2m, solarRadiation, latitude, altitude, dayOfYear } = params

  // Calculate mean temperature
  const tempMean = (tempMax + tempMin) / 2

  // Calculate vapor pressures
  const es = calculateSaturationVaporPressure(tempMean)
  const ea = calculateActualVaporPressure(humidity, tempMax, tempMin)

  // Calculate slope of vapor pressure curve
  const delta = calculateVaporPressureSlope(tempMean)

  // Calculate psychrometric constant
  const gamma = calculatePsychrometricConstant(altitude)

  // Calculate radiation components
  const ra = calculateExtraterrestrialRadiation(latitude, dayOfYear)
  const rso = calculateClearSkyRadiation(ra, altitude)
  const rns = calculateNetShortwaveRadiation(solarRadiation)
  const rnl = calculateNetLongwaveRadiation(
    tempMax,
    tempMin,
    ea,
    solarRadiation,
    rso
  )
  const rn = calculateNetRadiation(rns, rnl)

  // Soil heat flux (0 for daily calculations)
  const g = calculateSoilHeatFlux()

  // Calculate ETo using Penman-Monteith equation
  const numerator1 = 0.408 * delta * (rn - g)
  const numerator2 =
    gamma * (900 / (tempMean + 273)) * windSpeed2m * (es - ea)
  const denominator = delta + gamma * (1 + 0.34 * windSpeed2m)

  const eto = (numerator1 + numerator2) / denominator

  return Math.max(0, eto)
}

/**
 * Calculate ETo with intermediate values for detailed analysis
 *
 * @param params ETo calculation parameters
 * @returns ETo result with all intermediate values
 */
export function calculateEToWithDetails(params: EToParams): EToResult {
  const { tempMax, tempMin, humidity, windSpeed2m, solarRadiation, latitude, altitude, dayOfYear } = params

  const tempMean = (tempMax + tempMin) / 2

  const es = calculateSaturationVaporPressure(tempMean)
  const ea = calculateActualVaporPressure(humidity, tempMax, tempMin)
  const delta = calculateVaporPressureSlope(tempMean)
  const gamma = calculatePsychrometricConstant(altitude)

  const ra = calculateExtraterrestrialRadiation(latitude, dayOfYear)
  const rso = calculateClearSkyRadiation(ra, altitude)
  const rns = calculateNetShortwaveRadiation(solarRadiation)
  const rnl = calculateNetLongwaveRadiation(tempMax, tempMin, ea, solarRadiation, rso)
  const rn = calculateNetRadiation(rns, rnl)
  const g = calculateSoilHeatFlux()

  const numerator1 = 0.408 * delta * (rn - g)
  const numerator2 = gamma * (900 / (tempMean + 273)) * windSpeed2m * (es - ea)
  const denominator = delta + gamma * (1 + 0.34 * windSpeed2m)

  const eto = (numerator1 + numerator2) / denominator

  return {
    eto: Math.max(0, eto),
    es,
    ea,
    delta,
    gamma,
    rn,
    g
  }
}

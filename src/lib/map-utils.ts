// Pure geometry utilities for pivot map rendering

const DEG_TO_RAD = Math.PI / 180

/**
 * Converts a bearing (degrees CW from North) and distance to lat/lng offset.
 * Uses equirectangular approximation — accurate enough for radii < 2km.
 */
function offsetLatLng(
  centerLat: number,
  centerLng: number,
  radiusM: number,
  bearingDeg: number,
): [number, number] {
  // Convert CW-from-North bearing to standard math angle (CCW from East)
  const angleRad = (90 - bearingDeg) * DEG_TO_RAD
  const dx = radiusM * Math.cos(angleRad) // metres East
  const dy = radiusM * Math.sin(angleRad) // metres North

  const dLat = dy / 111320
  const dLng = dx / (111320 * Math.cos(centerLat * DEG_TO_RAD))

  return [centerLat + dLat, centerLng + dLng]
}

/**
 * Builds a polygon (array of [lat, lng]) representing a circle or sector.
 *
 * - If startDeg or endDeg is null → full circle (72-point polygon, closed)
 * - Otherwise → sector "pizza slice": center → arc → back to center
 * - Angles are in degrees, clockwise from North
 * - Wrap-around supported: endDeg < startDeg adds 360 (e.g., 300°→60° = 120° sector passing through North)
 *
 * @param lat        Center latitude
 * @param lng        Center longitude
 * @param radiusM    Radius in metres
 * @param startDeg   Sector start angle (CW from North), or null for full circle
 * @param endDeg     Sector end angle (CW from North), or null for full circle
 * @param steps      Number of arc segments (default 72 = 5° each)
 */
export function buildSectorPolygon(
  lat: number,
  lng: number,
  radiusM: number,
  startDeg: number | null,
  endDeg: number | null,
  steps = 72,
): [number, number][] {
  const isFullCircle = startDeg === null || endDeg === null

  if (isFullCircle) {
    const pts: [number, number][] = []
    for (let i = 0; i <= steps; i++) {
      const bearing = (i / steps) * 360
      pts.push(offsetLatLng(lat, lng, radiusM, bearing))
    }
    return pts
  }

  // Sector
  let arcSpan = endDeg - startDeg
  if (arcSpan <= 0) arcSpan += 360 // wrap-around (e.g. 300°→60°)

  const pts: [number, number][] = []
  pts.push([lat, lng]) // center (first point of pizza slice)

  const arcSteps = Math.max(3, Math.round((arcSpan / 360) * steps))
  for (let i = 0; i <= arcSteps; i++) {
    const bearing = startDeg + (i / arcSteps) * arcSpan
    pts.push(offsetLatLng(lat, lng, radiusM, bearing))
  }

  pts.push([lat, lng]) // close back to center
  return pts
}

/**
 * Calculates the irrigated area in hectares.
 *
 * @param radiusM    Radius in metres
 * @param startDeg   Sector start angle or null (full circle)
 * @param endDeg     Sector end angle or null (full circle)
 */
export function calcIrrigatedAreaHa(
  radiusM: number,
  startDeg: number | null,
  endDeg: number | null,
): number {
  const areaFull = Math.PI * radiusM * radiusM / 10000 // ha

  if (startDeg === null || endDeg === null) return areaFull

  let arcSpan = endDeg - startDeg
  if (arcSpan <= 0) arcSpan += 360

  return (arcSpan / 360) * areaFull
}

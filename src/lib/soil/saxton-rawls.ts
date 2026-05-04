/**
 * Saxton & Rawls (2006) — Pedotransfer Functions
 * Soil Water Characteristic Estimates by Texture and Organic Matter
 * Soil Sci. Soc. Am. J. 70:1569–1578
 *
 * Entradas: Areia, Silte, Argila (%) + Matéria Orgânica (%, opcional)
 * Saídas:   CC (33 kPa), PMP (1500 kPa), Ds, CAD — em cm³/cm³ e g/cm³
 */

export interface SoilGranulometry {
  sand: number           // % Areia
  silt: number           // % Silte
  clay: number           // % Argila
  organicMatter?: number // % Matéria Orgânica (default 2.5)
}

export interface SoilHydraulicProperties {
  /** Capacidade de Campo (33 kPa), cm³/cm³ — ex: 0.38 */
  fieldCapacity: number
  /** Ponto de Murcha Permanente (1500 kPa), cm³/cm³ — ex: 0.26 */
  wiltingPoint: number
  /** Densidade do solo, g/cm³ — ex: 1.25 */
  bulkDensity: number
  /** Água disponível = CC − PMP, cm³/cm³ */
  availableWater: number
  /** Classe textural USDA */
  textureClass: TextureClass
  /** CC em % volumétrico (× 100) — para gravar no banco */
  fieldCapacityPct: number
  /** PMP em % volumétrico (× 100) */
  wiltingPointPct: number
}

export type TextureClass =
  | 'Arenoso'
  | 'Areia-Franca'
  | 'Franco-Arenoso'
  | 'Franco'
  | 'Franco-Siltoso'
  | 'Siltoso'
  | 'Franco-Argilo-Arenoso'
  | 'Franco-Argiloso'
  | 'Franco-Argilo-Siltoso'
  | 'Argila-Arenosa'
  | 'Argila-Siltosa'
  | 'Argiloso'

/**
 * Classificação textural USDA / SBCS
 * Baseada no triângulo textural padrão
 */
export function classifyTexture(sand: number, silt: number, clay: number): TextureClass {
  if (clay >= 40) {
    if (sand >= 45) return 'Argila-Arenosa'
    if (silt >= 40) return 'Argila-Siltosa'
    return 'Argiloso'
  }
  if (clay >= 27) {
    if (sand > 45) return 'Franco-Argilo-Arenoso'
    if (silt >= 40) return 'Franco-Argilo-Siltoso'
    return 'Franco-Argiloso'
  }
  if (clay >= 20 && sand > 45) return 'Franco-Argilo-Arenoso'
  if (silt >= 80 && clay < 12) return 'Siltoso'
  if (silt >= 50) return 'Franco-Siltoso'
  if (clay >= 7 && sand <= 52) return 'Franco'
  if (sand >= 85) return 'Arenoso'
  if (sand >= 70) return 'Areia-Franca'
  return 'Franco-Arenoso'
}

/**
 * Calcula propriedades hidráulicas do solo via PTF Saxton & Rawls (2006)
 * Equações 1–6 do paper original
 */
export function calculateSoilProperties(input: SoilGranulometry): SoilHydraulicProperties {
  const total = input.sand + input.silt + input.clay
  if (Math.abs(total - 100) > 1) {
    throw new Error(`Soma Areia+Silte+Argila deve ser 100% (atual: ${total.toFixed(1)}%)`)
  }

  // Frações decimais
  const S  = input.sand / 100
  const C  = input.clay / 100
  const OM = (input.organicMatter ?? 2.5) / 100

  // ── Equação 2: Wilting Point (1500 kPa) ──
  const θ1500t =
    -0.024 * S +
     0.487 * C +
     0.006 * OM +
     0.005 * (S * OM) -
     0.013 * (C * OM) +
     0.068 * (S * C) +
     0.031
  const θ1500 = θ1500t + (0.14 * θ1500t - 0.02)

  // ── Equação 3: Field Capacity (33 kPa) ──
  const θ33t =
    -0.251 * S +
     0.195 * C +
     0.011 * OM +
     0.006 * (S * OM) -
     0.027 * (C * OM) +
     0.452 * (S * C) +
     0.299
  const θ33 = θ33t + (1.283 * Math.pow(θ33t, 2) - 0.374 * θ33t - 0.015)

  // ── Equação 4: Saturated − 33 kPa ──
  const θS_33t =
     0.278 * S +
     0.034 * C +
     0.022 * OM -
     0.018 * (S * OM) -
     0.027 * (C * OM) -
     0.584 * (S * C) +
     0.078
  const θS_33 = θS_33t + (0.636 * θS_33t - 0.107)

  // ── Equação 5: Saturated moisture (porosity) ──
  const θS = θ33 + θS_33 - 0.097 * S + 0.043

  // ── Equação 6: Bulk Density ──
  const bulkDensity = (1 - θS) * 2.65

  const fieldCapacity  = Math.max(0.01, θ33)
  const wiltingPoint   = Math.max(0.01, θ1500)
  const availableWater = Math.max(0, fieldCapacity - wiltingPoint)

  return {
    fieldCapacity:    parseFloat(fieldCapacity.toFixed(3)),
    wiltingPoint:     parseFloat(wiltingPoint.toFixed(3)),
    bulkDensity:      parseFloat(Math.max(0.8, Math.min(2.2, bulkDensity)).toFixed(2)),
    availableWater:   parseFloat(availableWater.toFixed(3)),
    textureClass:     classifyTexture(input.sand, input.silt, input.clay),
    fieldCapacityPct: parseFloat((fieldCapacity * 100).toFixed(1)),
    wiltingPointPct:  parseFloat((wiltingPoint * 100).toFixed(1)),
  }
}

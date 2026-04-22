/**
 * soil-diagnosis.ts
 * Lógica pura para diagnóstico manual de umidade do solo
 * Método USDA/NRCS "Feel and Appearance" — adaptado para condições brasileiras
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type SoilTexture = 'arenoso' | 'franco-arenoso' | 'franco' | 'franco-argiloso' | 'argiloso'
export type DiagnosisResult = 'critico' | 'atencao' | 'adequado' | 'excessivo'

export interface DepthScore {
  depth: '0-20' | '20-40' | '40-60'
  score: 1 | 2 | 3 | 4 | 5
  label: string
  description: string
}

export interface DiagnosisInput {
  texture: SoilTexture
  depth_0_20_score: 1 | 2 | 3 | 4 | 5
  depth_20_40_score: 1 | 2 | 3 | 4 | 5
  depth_40_60_score: 1 | 2 | 3 | 4 | 5
}

export interface DiagnosisOutput {
  weighted_score: number
  result: DiagnosisResult
  estimated_fc_percent: number
  recommendation: string
  color: string
  icon: string
}

// ─── Matriz USDA/NRCS simplificada ────────────────────────────────────────────
// Score 1-5: 1=seco/crítico … 5=encharcado/excessivo

export const SCORE_LABELS: Record<number, string> = {
  1: 'Seco / Crítico',
  2: 'Seco-Úmido / Atenção',
  3: 'Úmido / Adequado',
  4: 'Muito Úmido / Bom',
  5: 'Encharcado / Excessivo',
}

export const SCORE_DESCRIPTIONS: Record<SoilTexture, Record<number, string>> = {
  'arenoso': {
    1: 'Solo solto, escorre entre os dedos, não forma bola',
    2: 'Forma bola frágil, desmancha com leve pressão',
    3: 'Forma bola firme, úmido ao toque',
    4: 'Deixa marca d\'água na mão, escorre entre dedos',
    5: 'Água escorre livremente ao comprimir',
  },
  'franco-arenoso': {
    1: 'Seco, não retém forma, cor clara',
    2: 'Forma bola que racha ao dobrar',
    3: 'Forma bola, molda mas quebra com pressão moderada',
    4: 'Bola firme, deixa mancha úmida na palma',
    5: 'Escorrega entre dedos, brilhante',
  },
  'franco': {
    1: 'Torrão quebra facilmente, cor desbotada',
    2: 'Torrão quebradiço, não molda bem',
    3: 'Molda em fita curta (< 3 cm) que quebra',
    4: 'Fita média (3-5 cm), superfície levemente brilhante',
    5: 'Fita longa e brilhante, água visível',
  },
  'franco-argiloso': {
    1: 'Duro, trincado, abre rachaduras',
    2: 'Firme, quebra com esforço moderado',
    3: 'Plástico, forma fita de 5-8 cm',
    4: 'Fita longa, brilhante, escorregadio',
    5: 'Muito escorregadio, brilho intenso, água escorre',
  },
  'argiloso': {
    1: 'Muito duro, trincado, rachaduras visíveis',
    2: 'Duro, difícil de moldar',
    3: 'Plástico, forma fita > 8 cm, levemente brilhante',
    4: 'Escorregadio, fita longa, muito brilhante',
    5: 'Extremamente escorregadio, água visível na superfície',
  },
}

// % estimada da CC por textura e score
const FC_PERCENT_MATRIX: Record<SoilTexture, Record<number, number>> = {
  'arenoso':         { 1: 15, 2: 35, 3: 65, 4: 85, 5: 100 },
  'franco-arenoso':  { 1: 15, 2: 35, 3: 65, 4: 85, 5: 100 },
  'franco':          { 1: 15, 2: 35, 3: 65, 4: 85, 5: 100 },
  'franco-argiloso': { 1: 15, 2: 35, 3: 65, 4: 85, 5: 100 },
  'argiloso':        { 1: 15, 2: 35, 3: 65, 4: 85, 5: 100 },
}

// ─── Funções puras ────────────────────────────────────────────────────────────

/** Peso por profundidade: camada superficial mais importante para cultura */
const DEPTH_WEIGHTS = [0.4, 0.35, 0.25] // 0-20, 20-40, 40-60

export function calcWeightedScore(s1: number, s2: number, s3: number): number {
  return s1 * DEPTH_WEIGHTS[0] + s2 * DEPTH_WEIGHTS[1] + s3 * DEPTH_WEIGHTS[2]
}

export function getResult(weightedScore: number): DiagnosisResult {
  if (weightedScore < 1.8) return 'critico'
  if (weightedScore < 2.8) return 'atencao'
  if (weightedScore < 4.3) return 'adequado'
  return 'excessivo'
}

export function getEstimatedFcPercent(texture: SoilTexture, weightedScore: number): number {
  // Interpolação linear entre scores inteiros
  const lo = Math.floor(weightedScore)
  const hi = Math.ceil(weightedScore)
  const frac = weightedScore - lo
  const loVal = FC_PERCENT_MATRIX[texture][Math.max(1, lo)] ?? 15
  const hiVal = FC_PERCENT_MATRIX[texture][Math.min(5, hi)] ?? 100
  return Math.round(loVal + (hiVal - loVal) * frac)
}

export const RESULT_META: Record<DiagnosisResult, { label: string; color: string; icon: string; recommendation: string }> = {
  critico: {
    label: 'Crítico',
    color: '#ef4444',
    icon: '🔴',
    recommendation: 'Solo em déficit severo. Irrigar imediatamente — risco de estresse hídrico irreversível.',
  },
  atencao: {
    label: 'Atenção',
    color: '#f59e0b',
    icon: '🟡',
    recommendation: 'Solo abaixo do limiar de alerta. Programar irrigação nas próximas 24-48 horas.',
  },
  adequado: {
    label: 'Adequado',
    color: '#38bdf8',
    icon: '🔵',
    recommendation: 'Umidade dentro da faixa ideal. Monitorar conforme turno normal.',
  },
  excessivo: {
    label: 'Excessivo',
    color: '#a78bfa',
    icon: '🟣',
    recommendation: 'Solo com excesso de água. Suspender irrigação e monitorar drenagem.',
  },
}

export function calcDiagnosis(input: DiagnosisInput): DiagnosisOutput {
  const weighted_score = calcWeightedScore(
    input.depth_0_20_score,
    input.depth_20_40_score,
    input.depth_40_60_score,
  )
  const result = getResult(weighted_score)
  const estimated_fc_percent = getEstimatedFcPercent(input.texture, weighted_score)
  const meta = RESULT_META[result]

  return {
    weighted_score: Math.round(weighted_score * 100) / 100,
    result,
    estimated_fc_percent,
    recommendation: meta.recommendation,
    color: meta.color,
    icon: meta.icon,
  }
}

export const TEXTURE_LABELS: Record<SoilTexture, string> = {
  'arenoso': 'Arenoso',
  'franco-arenoso': 'Franco-Arenoso',
  'franco': 'Franco',
  'franco-argiloso': 'Franco-Argiloso',
  'argiloso': 'Argiloso',
}

export const ALL_TEXTURES: SoilTexture[] = [
  'arenoso',
  'franco-arenoso',
  'franco',
  'franco-argiloso',
  'argiloso',
]

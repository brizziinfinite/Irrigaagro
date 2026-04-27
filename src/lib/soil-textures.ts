/**
 * Texturas de solo FAO-56 — valores típicos para agricultores sem análise laboratorial
 * Fonte: FAO Irrigation and Drainage Paper 56, Tabela 4.2
 */

export const FAO_SOIL_TEXTURES = {
  argiloso: {
    label: 'Argiloso',
    cc: 40,
    pm: 23,
    ds: 1.15,
    hint: 'Forma fita longa e lisa, gruda nos dedos',
    icon: '🟤',
    color: '#8B5E3C',
  },
  'franco-argiloso': {
    label: 'Franco-Argiloso',
    cc: 33,
    pm: 18,
    ds: 1.25,
    hint: 'Fita curta, levemente granular',
    icon: '🟫',
    color: '#A0714F',
  },
  franco: {
    label: 'Franco',
    cc: 27,
    pm: 13,
    ds: 1.35,
    hint: 'Forma fita curta, textura mista',
    icon: '🪨',
    color: '#B8936A',
  },
  'franco-arenoso': {
    label: 'Franco-Arenoso',
    cc: 20,
    pm: 9,
    ds: 1.50,
    hint: 'Granular, pouca aderência',
    icon: '🏜️',
    color: '#C8A882',
  },
  arenoso: {
    label: 'Arenoso',
    cc: 12,
    pm: 5,
    ds: 1.60,
    hint: 'Não forma fita, escorre entre os dedos',
    icon: '⬜',
    color: '#D4BC9C',
  },
} as const

export type SoilTextureKey = keyof typeof FAO_SOIL_TEXTURES
export type SoilTextureValue = typeof FAO_SOIL_TEXTURES[SoilTextureKey]

export const SOIL_TEXTURE_KEYS = Object.keys(FAO_SOIL_TEXTURES) as SoilTextureKey[]

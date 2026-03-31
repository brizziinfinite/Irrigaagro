import { calcETo, type WeatherInput } from '@/lib/water-balance'

export type EToSource =
  | 'weather_corrected'
  | 'weather_raw'
  | 'calculated_penman_monteith'
  | 'manual'
  | 'unavailable'

export type EToConfidence = 'high' | 'medium' | 'low'

export interface EToResolution {
  etoMm: number | null
  etoSource: EToSource
  etoConfidence: EToConfidence | null
  etoNotes: string | null
}

export interface ResolveEToParams {
  weatherCorrectedMm?: number | null
  weatherRawMm?: number | null
  calculationInput?: WeatherInput | null
  manualEtoMm?: number | null
  etoCorrectionFactor?: number | null  // fator empírico (ex: 0.82) aplicado ao cálculo local
}

export function resolveETo(params: ResolveEToParams): EToResolution {
  const {
    weatherCorrectedMm = null,
    weatherRawMm = null,
    calculationInput = null,
    manualEtoMm = null,
    etoCorrectionFactor = null,
  } = params

  if (weatherCorrectedMm != null) {
    return {
      etoMm: weatherCorrectedMm,
      etoSource: 'weather_corrected',
      etoConfidence: 'high',
      etoNotes: 'Usando weather_data.eto_corrected_mm como fonte prioritária.',
    }
  }

  if (weatherRawMm != null) {
    return {
      etoMm: weatherRawMm,
      etoSource: 'weather_raw',
      etoConfidence: 'medium',
      etoNotes: 'Usando weather_data.eto_mm por ausência do valor corrigido.',
    }
  }

  if (calculationInput) {
    const calculatedEto = calcETo(calculationInput)
    if (Number.isFinite(calculatedEto)) {
      const factor = etoCorrectionFactor != null && etoCorrectionFactor > 0 ? etoCorrectionFactor : 1
      const correctedEto = calculatedEto * factor
      return {
        etoMm: correctedEto,
        etoSource: 'calculated_penman_monteith',
        etoConfidence: 'medium',
        etoNotes: factor < 1
          ? `ETo calculada localmente via Penman-Monteith (fator correção ${factor}).`
          : 'ETo calculada localmente via Penman-Monteith com os dados meteorológicos disponíveis.',
      }
    }

    return {
      etoMm: null,
      etoSource: 'unavailable',
      etoConfidence: null,
      etoNotes: 'As variáveis meteorológicas disponíveis não foram suficientes para calcular ETo com segurança.',
    }
  }

  if (manualEtoMm != null) {
    return {
      etoMm: manualEtoMm,
      etoSource: 'manual',
      etoConfidence: 'low',
      etoNotes: 'ETo informada manualmente por ausência de dado corrigido, bruto ou de cálculo completo.',
    }
  }

  return {
    etoMm: null,
    etoSource: 'unavailable',
    etoConfidence: null,
    etoNotes: 'Nenhuma fonte de ETo disponível para a data selecionada.',
  }
}

export function getEToSourceLabel(source: EToSource): string {
  switch (source) {
    case 'weather_corrected':
      return 'estação corrigida'
    case 'weather_raw':
      return 'estação bruta'
    case 'calculated_penman_monteith':
      return 'cálculo local'
    case 'manual':
      return 'manual'
    default:
      return 'indisponível'
  }
}

export function getEToConfidenceLabel(confidence: EToConfidence | null): string {
  switch (confidence) {
    case 'high':
      return 'alta'
    case 'medium':
      return 'média'
    case 'low':
      return 'baixa'
    default:
      return 'indisponível'
  }
}

export function isEToFallback(source: EToSource): boolean {
  return source === 'calculated_penman_monteith' || source === 'manual'
}

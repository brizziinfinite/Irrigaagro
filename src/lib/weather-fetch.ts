// ============================================================
// Busca automática de dados climáticos — IrrigaAgro v2
// Fontes: Google Sheets (Plugfield) com fallback NASA POWER
// ============================================================

export interface WeatherDay {
  tempMax: number
  tempMin: number
  humidity: number
  windSpeed: number      // m/s
  solarRadiation: number // W/m²
  rainfall: number       // mm
  source: 'google_sheets' | 'nasa' | 'manual'
}

// ─── Google Sheets (Plugfield via CSV público) ────────────────

/**
 * Busca dados climáticos da planilha Google Sheets para uma data específica.
 * A planilha precisa estar pública ("qualquer pessoa com o link").
 * Usa a aba dataByDay (gid=1375608425 por padrão).
 */
export async function fetchFromGoogleSheets(
  spreadsheetId: string,
  dateISO: string,          // YYYY-MM-DD
  gid?: string
): Promise<WeatherDay | null> {
  try {
    const sheetGid = gid || '1375608425'
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${sheetGid}`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null

    const csv = await res.text()
    const lines = csv.trim().split('\n')
    if (lines.length < 2) return null

    // Mapeia cabeçalhos
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const idx = (col: string) => headers.indexOf(col)

    const iDate      = idx('localDate')
    const iTempMax   = idx('tempMax')
    const iTempMin   = idx('tempMin')
    const iHumidity  = idx('humidity')
    const iWind      = idx('wind')
    const iRadiation = idx('radiationWatts')
    const iRain      = idx('rainAccum')

    // Encontra a linha da data
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const rowDate = cols[iDate]?.trim()

      if (!rowDate) continue
      // localDate pode ser "2025-04-14" ou "2025-04-14T00:00:00"
      if (!rowDate.startsWith(dateISO)) continue

      const tempMax   = parseFloat(cols[iTempMax])
      const tempMin   = parseFloat(cols[iTempMin])
      const humidity  = parseFloat(cols[iHumidity])
      const windSpeed = parseFloat(cols[iWind])
      const radiation = parseFloat(cols[iRadiation])
      const rainfall  = parseFloat(cols[iRain]) || 0

      if (isNaN(tempMax) || isNaN(tempMin)) return null

      return {
        tempMax,
        tempMin,
        humidity:       isNaN(humidity)  ? 65  : humidity,
        windSpeed:      isNaN(windSpeed) ? 2   : windSpeed,
        solarRadiation: isNaN(radiation) ? 200 : radiation,
        rainfall,
        source: 'google_sheets',
      }
    }

    return null // data não encontrada na planilha
  } catch {
    return null
  }
}

// ─── NASA POWER ───────────────────────────────────────────────

/**
 * Busca dados climáticos diários da NASA POWER por coordenada geográfica.
 * API pública, gratuita, sem autenticação. CORS liberado.
 * Parâmetros: T2M_MAX, T2M_MIN, RH2M, WS2M, ALLSKY_SFC_SW_DWN, PRECTOTCORR
 */
export async function fetchFromNASAPower(
  latitude: number,
  longitude: number,
  dateISO: string  // YYYY-MM-DD
): Promise<WeatherDay | null> {
  try {
    const dateCompact = dateISO.replace(/-/g, '') // YYYYMMDD

    const params = [
      'T2M_MAX',           // Temperatura máxima a 2m (°C)
      'T2M_MIN',           // Temperatura mínima a 2m (°C)
      'RH2M',              // Umidade relativa a 2m (%)
      'WS2M',              // Velocidade do vento a 2m (m/s)
      'ALLSKY_SFC_SW_DWN', // Radiação solar de onda curta (MJ/m²·dia)
      'PRECTOTCORR',       // Precipitação corrigida (mm/dia)
    ].join(',')

    const url = [
      'https://power.larc.nasa.gov/api/temporal/daily/point',
      `?parameters=${params}`,
      `&community=AG`,
      `&longitude=${longitude}`,
      `&latitude=${latitude}`,
      `&start=${dateCompact}`,
      `&end=${dateCompact}`,
      `&format=JSON`,
    ].join('')

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null

    const json = await res.json()
    const props = json?.properties?.parameter

    if (!props) return null

    const tempMax   = props.T2M_MAX?.[dateCompact]
    const tempMin   = props.T2M_MIN?.[dateCompact]
    const humidity  = props.RH2M?.[dateCompact]
    const wind      = props.WS2M?.[dateCompact]
    const radMJ     = props.ALLSKY_SFC_SW_DWN?.[dateCompact]  // MJ/m²·dia
    const rainfall  = props.PRECTOTCORR?.[dateCompact] ?? 0

    if (tempMax === undefined || tempMax === -999 || isNaN(tempMax)) return null
    if (tempMin === undefined || tempMin === -999 || isNaN(tempMin)) return null

    // NASA fornece radiação em MJ/m²·dia → converter para W/m²  (÷ 0.0864)
    const radiationWm2 = (radMJ && radMJ !== -999) ? radMJ / 0.0864 : 200

    return {
      tempMax,
      tempMin,
      humidity:       (humidity && humidity !== -999) ? humidity : 65,
      windSpeed:      (wind && wind !== -999)         ? wind     : 2,
      solarRadiation: radiationWm2,
      rainfall:       (rainfall && rainfall !== -999) ? rainfall : 0,
      source: 'nasa',
    }
  } catch {
    return null
  }
}

// ─── Função principal com fallback automático ─────────────────

/** Retorna YYYY-MM-DD do dia anterior a dateISO */
export function previousDay(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

/**
 * Tenta buscar dados climáticos para o pivô/data na ordem:
 * 1. Google Sheets (se configurado)
 * 2. NASA POWER (fallback ou padrão)
 *
 * IMPORTANTE: dados climáticos são sempre de D-1 (ontem).
 * A estação gera às 03h, então "hoje" usa os dados de ontem.
 * Passe dateISO = data do registro (hoje) — a função busca D-1 internamente.
 *
 * Retorna null apenas se ambos falharem.
 */
export async function fetchWeatherForPivot(
  pivotLatitude: number | null,
  pivotLongitude: number | null,
  weatherSource: 'nasa' | 'google_sheets' | 'manual' | null,
  weatherConfig: { spreadsheet_id?: string; gid?: string } | null,
  dateISO: string  // data do registro (hoje) — busca D-1 internamente
): Promise<WeatherDay | null> {
  // Dados climáticos são sempre do dia anterior
  const fetchDate = previousDay(dateISO)

  // Fonte = manual → não busca nada, usuário digita
  if (weatherSource === 'manual') return null

  // Tenta Google Sheets primeiro (se configurado) — busca D-1
  if (weatherSource === 'google_sheets' && weatherConfig?.spreadsheet_id) {
    const sheetsData = await fetchFromGoogleSheets(
      weatherConfig.spreadsheet_id,
      fetchDate,
      weatherConfig.gid
    )
    if (sheetsData) return sheetsData
    // Se falhou → fallback NASA
  }

  // NASA POWER (padrão ou fallback) — busca D-1
  if (pivotLatitude !== null && pivotLongitude !== null) {
    return await fetchFromNASAPower(pivotLatitude, pivotLongitude, fetchDate)
  }

  return null
}

// ─── Busca múltiplos dias para projeção ──────────────────────

/**
 * Busca dados climáticos reais dos últimos N dias (para calcular ETo média).
 * Cada dia busca D-1, então para calcular média dos últimos 7 dias reais
 * passamos as datas dos últimos 7 registros.
 */
export async function fetchRecentDaysNASA(
  latitude: number,
  longitude: number,
  endDateISO: string,  // data mais recente (hoje)
  days = 7
): Promise<WeatherDay[]> {
  // Busca intervalo de N dias terminando em endDate-1 (D-1)
  const end = previousDay(endDateISO)
  const startD = new Date(end + 'T12:00:00')
  startD.setDate(startD.getDate() - (days - 1))
  const start = startD.toISOString().split('T')[0]

  try {
    const params = [
      'T2M_MAX', 'T2M_MIN', 'RH2M', 'WS2M',
      'ALLSKY_SFC_SW_DWN', 'PRECTOTCORR',
    ].join(',')

    const url = [
      'https://power.larc.nasa.gov/api/temporal/daily/point',
      `?parameters=${params}`,
      `&community=AG`,
      `&longitude=${longitude}`,
      `&latitude=${latitude}`,
      `&start=${start.replace(/-/g, '')}`,
      `&end=${end.replace(/-/g, '')}`,
      `&format=JSON`,
    ].join('')

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []

    const json = await res.json()
    const props = json?.properties?.parameter
    if (!props) return []

    const results: WeatherDay[] = []
    const dates = Object.keys(props.T2M_MAX ?? {}).sort()

    for (const d of dates) {
      const tempMax  = props.T2M_MAX?.[d]
      const tempMin  = props.T2M_MIN?.[d]
      const humidity = props.RH2M?.[d]
      const wind     = props.WS2M?.[d]
      const radMJ    = props.ALLSKY_SFC_SW_DWN?.[d]
      const rainfall = props.PRECTOTCORR?.[d] ?? 0

      if (!tempMax || tempMax === -999 || !tempMin || tempMin === -999) continue

      results.push({
        tempMax,
        tempMin,
        humidity:       (humidity && humidity !== -999) ? humidity : 65,
        windSpeed:      (wind && wind !== -999)         ? wind     : 2,
        solarRadiation: (radMJ && radMJ !== -999)       ? radMJ / 0.0864 : 200,
        rainfall:       (rainfall && rainfall !== -999) ? rainfall : 0,
        source: 'nasa',
      })
    }

    return results
  } catch {
    return []
  }
}

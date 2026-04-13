// ============================================================
// Busca automática de dados climáticos — IrrigaAgro
// Fontes: Google Sheets (Plugfield) com fallback NASA POWER
// ============================================================

export interface WeatherDay {
  tempMax: number
  tempMin: number
  humidity: number
  windSpeed: number        // m/s
  solarRadiation: number   // W/m²
  rainfall: number         // mm
  source: 'google_sheets' | 'nasa' | 'manual' | 'plugfield'
  /** Valor bruto de ETo reportado pelo Plugfield (campo 'evapo') — apenas para comparativo */
  evapoPlugfield?: number | null
}

// ─── Google Sheets (Plugfield via CSV público) ────────────────

/**
 * Busca dados climáticos da planilha Google Sheets para uma data específica.
 * A planilha precisa estar pública ("qualquer pessoa com o link").
 * Usa a aba dataByDay (gid=1375608425 por padrão).
 */
/** Parseia uma linha CSV respeitando campos entre aspas */
function parseCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      cols.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cols.push(cur.trim())
  return cols
}

/** Converte string numérica com vírgula ou ponto decimal para number */
function parseNum(s: string): number {
  return parseFloat(s.replace(',', '.'))
}

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
    const headers = parseCsvLine(lines[0])
    const idx = (col: string) => headers.indexOf(col)

    const iDate      = idx('localDate')
    const iTempMax   = idx('tempMax')
    const iTempMin   = idx('tempMin')
    const iHumidity  = idx('humidity')
    const iWind      = idx('wind')
    const iRadiation   = idx('radiation')
    const iRadiationC  = idx('radiationCount')
    const iRain      = idx('rainAccum')

    // Encontra a linha da data
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i])
      const rowDate = cols[iDate]?.trim()

      if (!rowDate) continue
      // localDate pode ser "2025-04-14" ou "2025-04-14T00:00:00"
      if (!rowDate.startsWith(dateISO)) continue

      const tempMax   = parseNum(cols[iTempMax] ?? '')
      const tempMin   = parseNum(cols[iTempMin] ?? '')
      const humidity  = parseNum(cols[iHumidity] ?? '')
      const windSpeed = parseNum(cols[iWind] ?? '')
      const rainfall  = parseNum(cols[iRain] ?? '') || 0

      if (isNaN(tempMax) || isNaN(tempMin)) return null

      // Radiação solar em W/m²: usa radiation/radiationCount×3.1 (média diária × fator de horas de sol)
      // NOTA: a coluna 'radiationWatts' na planilha Plugfield contém ETo em mm/dia (não W/m²) — ignorada.
      let solarRadiation = 200
      if (iRadiation >= 0 && iRadiationC >= 0) {
        const rad = parseNum(cols[iRadiation] ?? '')
        const radC = parseNum(cols[iRadiationC] ?? '')
        // radiation/count = média de 24h em W/m²; ×3.1 ≈ horas de sol efetivas (~8h/dia)
        if (!isNaN(rad) && !isNaN(radC) && radC > 0) {
          solarRadiation = Math.min((rad / radC) * 3.1, 800)
        }
      }

      return {
        tempMax,
        tempMin,
        humidity:       isNaN(humidity)  ? 65  : humidity,
        windSpeed:      isNaN(windSpeed) ? 2   : windSpeed,
        solarRadiation,
        rainfall,
        source: 'google_sheets',
      }
    }

    return null // data não encontrada na planilha
  } catch {
    return null
  }
}

// ─── Plugfield API ────────────────────────────────────────────

/**
 * Busca dados climáticos diários direto da API do Plugfield.
 * Credenciais são por pivô (weather_config), não globais do sistema.
 * date: YYYY-MM-DD (D-1 do dia atual)
 */
export async function fetchFromPlugfield(
  deviceId: number,
  dateISO: string,  // YYYY-MM-DD
  token: string,
  apiKey: string,
): Promise<WeatherDay | null> {
  if (!token || !apiKey) return null

  try {
    // API espera DD/MM/YYYY
    const [year, month, day] = dateISO.split('-')
    const dateFormatted = `${day}/${month}/${year}`

    const url = `https://prod-api.plugfield.com.br/data/daily?device=${deviceId}&begin=${dateFormatted}&end=${dateFormatted}`
    const res = await fetch(url, {
      headers: { Authorization: token, 'x-api-key': apiKey },
      cache: 'no-store',
    })
    if (!res.ok) return null

    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null

    const d = data[0]
    const tempMax   = d.tempMax
    const tempMin   = d.tempMin
    const humidity  = d.humidity
    const windSpeed = d.wind
    const rainfall  = d.rainAccum ?? 0

    if (!tempMax || !tempMin) return null

    // Radiação solar em W/m²: usa radiation/radiationCount×3.1
    // NOTA: 'radiationWatts' da API Plugfield contém ETo em mm/dia (não W/m²) — ignorado.
    let solarRadiation = 200
    if (d.radiation != null && d.radiationCount > 0) {
      solarRadiation = Math.min((d.radiation / d.radiationCount) * 3.1, 800)
    }

    return {
      tempMax,
      tempMin,
      humidity:       isNaN(humidity)  ? 65 : humidity,
      windSpeed:      isNaN(windSpeed) ? 2  : windSpeed,
      solarRadiation,
      rainfall,
      source: 'plugfield',
      evapoPlugfield: typeof d.evapo === 'number' && !isNaN(d.evapo) ? d.evapo : null,
    }
  } catch {
    return null
  }
}

// ─── NASA POWER ───────────────────────────────────────────────

/**
 * Busca apenas Rs (radiação solar, MJ/m²/dia) da NASA POWER para uma data específica.
 * Retorna null se NASA não tiver dado disponível ou se o valor for inválido.
 * Uso: substituir Rs do Plugfield (sensor não calibrado) por Rs NASA mais confiável.
 */
export async function fetchRsFromNASA(
  latitude: number,
  longitude: number,
  dateISO: string  // YYYY-MM-DD
): Promise<number | null> {
  try {
    const dateCompact = dateISO.replace(/-/g, '') // YYYYMMDD
    const url = [
      'https://power.larc.nasa.gov/api/temporal/daily/point',
      `?parameters=ALLSKY_SFC_SW_DWN`,
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
    const radMJ = json?.properties?.parameter?.ALLSKY_SFC_SW_DWN?.[dateCompact]

    if (radMJ === undefined || radMJ === null || radMJ === -999 || isNaN(radMJ)) return null

    return radMJ // MJ/m²/dia
  } catch {
    return null
  }
}

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

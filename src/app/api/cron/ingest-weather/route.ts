// ============================================================
// Cron Job — Ingestão Diária de Dados Climáticos
// Roda todo dia às 22:00 UTC (19:00 BRT), ANTES do daily-balance
// Busca dados D-1 de cada pivô com fallback automático:
//   1. Plugfield API direta
//   2. Google Sheets (estação Plugfield ou similar)
//   3. Open-Meteo (arquivo histórico, gratuito, sem autenticação)
// Grava na tabela weather_data vinculada à estação do pivô.
// Pivôs sem estação cadastrada são processados com estação "virtual"
// gravada diretamente em weather_data usando pivot_id como referência.
//
// Ao final, roda calibrateRsFactor() que:
//   - Para cada estação com dados plugfield_fallback dos últimos 30 dias,
//     busca Rs NASA retroativo e calcula mediana dos fatores → atualiza
//     weather_stations.rs_correction_factor
//   - Para pivôs sem estação (Open-Meteo), recalcula ETo com Open-Meteo
//     e NASA e calcula mediana dos fatores → atualiza pivots.rs_correction_factor
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchFromPlugfield, fetchFromGoogleSheets, fetchRsFromNASA, previousDay } from '@/lib/weather-fetch'
import { getWeatherByPivotGeolocation } from '@/services/weather-geolocation'
import type { TypedSupabaseClient } from '@/services/base'

function todayBRT(): string {
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().split('T')[0]
}

// Calcula ETo Penman-Monteith FAO-56 com dados diários
function calcETo(tmax: number, tmin: number, rh: number, wind: number, rgWm2: number, lat: number, doy: number): number {
  const tmean = (tmax + tmin) / 2
  const rg = rgWm2 * 0.0864 // W/m² → MJ/m²/dia
  const latR = (Math.PI / 180) * lat
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365)
  const d = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39)
  const ws = Math.acos(-Math.tan(latR) * Math.tan(d))
  const ra = ((24 * 60) / Math.PI) * 0.082 * dr *
    (ws * Math.sin(latR) * Math.sin(d) + Math.cos(latR) * Math.cos(d) * Math.sin(ws))
  const rso = (0.75 + 2e-5 * 600) * ra
  const rsRso = rso > 0 ? Math.min(rg / rso, 1) : 0.5
  const ea = (rh / 100) * 0.5 * (
    0.6108 * Math.exp((17.27 * tmax) / (tmax + 237.3)) +
    0.6108 * Math.exp((17.27 * tmin) / (tmin + 237.3))
  )
  const es = 0.5 * (
    0.6108 * Math.exp((17.27 * tmax) / (tmax + 237.3)) +
    0.6108 * Math.exp((17.27 * tmin) / (tmin + 237.3))
  )
  const rnl = 4.903e-9 * (((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2) *
    (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0.001))) * (1.35 * rsRso - 0.35)
  const rn = 0.77 * rg - rnl
  const delta = (4098 * 0.6108 * Math.exp((17.27 * tmean) / (tmean + 237.3))) / (tmean + 237.3) ** 2
  const gamma = 0.000665 * 101.3
  const eto = (0.408 * delta * rn + gamma * (900 / (tmean + 273)) * wind * (es - ea)) /
    (delta + gamma * (1 + 0.34 * wind))
  return Math.max(Math.round(eto * 100) / 100, 0)
}

function getDayOfYear(dateISO: string): number {
  const d = new Date(dateISO + 'T12:00:00')
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d.getTime() - start.getTime()) / 86400000)
}

/** Mediana de um array de números (retorna null se array vazio) */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Retorna YYYY-MM-DD de N dias antes de dateISO */
function daysAgo(dateISO: string, n: number): string {
  const d = new Date(dateISO + 'T12:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

interface CalibrationResult {
  stationId?: string
  pivotId?: string
  name: string
  previousFactor: number | null
  newFactor: number | null
  sampleDays: number
  status: 'updated' | 'unchanged' | 'insufficient_data' | 'error'
  message: string
}

/**
 * Calibração automática do fator de correção Rs.
 * Roda uma vez por execução do cron, após processar D-1.
 *
 * Para cada estação com dados `plugfield_fallback` dos últimos 30 dias:
 *   - Busca Rs NASA para cada dia (com latência de 4-5 dias, haverá poucos resultados recentes)
 *   - Calcula fator = ETo_com_Rs_nasa / ETo_com_Rs_plugfield_bruto
 *   - Se >= 7 fatores válidos: mediana → atualiza weather_stations.rs_correction_factor
 *
 * Para pivôs sem estação (Open-Meteo):
 *   - Busca Open-Meteo + Rs NASA dos últimos 30 dias (em memória)
 *   - Mesma lógica de mediana
 */
async function calibrateRsFactor(
  supabase: TypedSupabaseClient,
  today: string
): Promise<CalibrationResult[]> {
  const results: CalibrationResult[] = []
  const startDate = daysAgo(today, 30)

  // ── Calibração por estação (Plugfield/Sheets) ────────────────
  // Busca estações que têm dados com rs_source = 'plugfield_fallback' nos últimos 30 dias
  const { data: stationRows } = await (supabase as any)
    .from('weather_data')
    .select('station_id, date, temp_max, temp_min, humidity_percent, wind_speed_ms, solar_radiation_wm2')
    .eq('rs_source', 'plugfield_fallback')
    .gte('date', startDate)
    .lte('date', today)
    .order('date', { ascending: true })

  if (stationRows && stationRows.length > 0) {
    // Agrupar por station_id
    const byStation: Record<string, typeof stationRows> = {}
    for (const row of stationRows) {
      if (!byStation[row.station_id]) byStation[row.station_id] = []
      byStation[row.station_id].push(row)
    }

    // Buscar metadados das estações (coordenadas via farm, fator atual)
    const stationIds = Object.keys(byStation)
    const { data: stations } = await (supabase as any)
      .from('weather_stations')
      .select('id, name, rs_correction_factor, rs_factor_sample_days, farms(latitude_degrees, latitude_minutes, hemisphere, longitude_degrees)')
      .in('id', stationIds)

    // Buscar coordenadas das fazendas via FK
    const { data: stationFarms } = await (supabase as any)
      .from('weather_stations')
      .select('id, name, rs_correction_factor, rs_factor_sample_days, farms!inner(id, latitude_degrees, latitude_minutes, hemisphere, altitude)')
      .in('id', stationIds)

    for (const stationId of stationIds) {
      const rows = byStation[stationId]

      // Encontra metadados da estação
      const stationMeta = (stationFarms ?? []).find((s: { id: string }) => s.id === stationId)
      const stationName = stationMeta?.name ?? stationId

      // Coordenadas: farm tem latitude_degrees + latitude_minutes + hemisphere
      // Precisamos de lat decimal para calcular ETo e buscar NASA
      // Se não tem coordenadas, tentamos buscar via pivô vinculado
      const farm = stationMeta?.farms
      let lat: number | null = null
      let lon: number | null = null

      if (farm?.latitude_degrees != null) {
        const latDec = farm.latitude_degrees + (farm.latitude_minutes ?? 0) / 60
        lat = farm.hemisphere === 'S' ? -latDec : latDec
      }

      // Se não tem lat da farm, tenta pegar do pivô vinculado
      if (lat === null) {
        const { data: pivotWithCoords } = await (supabase as any)
          .from('pivots')
          .select('latitude, longitude')
          .eq('weather_config->station_id', stationId)
          .not('latitude', 'is', null)
          .limit(1)
          .maybeSingle()
        if (pivotWithCoords) {
          lat = pivotWithCoords.latitude
          lon = pivotWithCoords.longitude
        }
      }

      if (lat === null) {
        // Tenta pegar do pivô via farm
        const { data: farmForStation } = await (supabase as any)
          .from('weather_stations')
          .select('farms!inner(pivots(latitude, longitude))')
          .eq('id', stationId)
          .maybeSingle()

        const pivots = farmForStation?.farms?.pivots ?? []
        const pivotWithCoords = pivots.find((p: { latitude: number | null }) => p.latitude != null)
        if (pivotWithCoords) {
          lat = pivotWithCoords.latitude
          lon = pivotWithCoords.longitude
        }
      }

      if (lat === null || lon === null) {
        results.push({
          stationId,
          name: stationName,
          previousFactor: stationMeta?.rs_correction_factor ?? null,
          newFactor: null,
          sampleDays: 0,
          status: 'error',
          message: 'Sem coordenadas para buscar NASA Rs',
        })
        continue
      }

      // Para cada dia, busca Rs NASA e calcula fator
      const factors: number[] = []

      for (const row of rows) {
        const dateISO = row.date
        const rsNasaMJ = await fetchRsFromNASA(lat, lon, dateISO)
        if (rsNasaMJ === null) continue

        // ETo com Rs NASA (referência)
        const doy = getDayOfYear(dateISO)
        const rgNasaWm2 = rsNasaMJ / 0.0864
        const etoNasa = calcETo(
          row.temp_max, row.temp_min,
          row.humidity_percent, row.wind_speed_ms,
          rgNasaWm2, lat, doy
        )

        // ETo com Rs bruto do Plugfield (solar_radiation_wm2 já gravado sem fator)
        const rgPlugfieldWm2 = row.solar_radiation_wm2
        if (!rgPlugfieldWm2 || rgPlugfieldWm2 <= 0) continue

        const etoPlugfield = calcETo(
          row.temp_max, row.temp_min,
          row.humidity_percent, row.wind_speed_ms,
          rgPlugfieldWm2, lat, doy
        )

        if (etoPlugfield <= 0) continue

        const factor = etoNasa / etoPlugfield
        // Filtra fatores absurdos (< 0.3 ou > 1.5)
        if (factor >= 0.3 && factor <= 1.5) {
          factors.push(factor)
        }
      }

      const sampleDays = factors.length
      const previousFactor = stationMeta?.rs_correction_factor ?? 0.82

      if (sampleDays < 7) {
        results.push({
          stationId,
          name: stationName,
          previousFactor,
          newFactor: null,
          sampleDays,
          status: 'insufficient_data',
          message: `Apenas ${sampleDays} dias válidos (mínimo 7)`,
        })
        continue
      }

      const newFactor = Math.round((median(factors) ?? 0.82) * 10000) / 10000

      // Só atualiza se mudou (evita writes desnecessários)
      if (Math.abs(newFactor - (previousFactor ?? 0.82)) < 0.0001) {
        results.push({
          stationId,
          name: stationName,
          previousFactor,
          newFactor,
          sampleDays,
          status: 'unchanged',
          message: `Fator ${newFactor} (sem mudança)`,
        })
        continue
      }

      const { error: updateErr } = await (supabase as any)
        .from('weather_stations')
        .update({
          rs_correction_factor: newFactor,
          rs_factor_updated_at: new Date().toISOString(),
          rs_factor_sample_days: sampleDays,
        })
        .eq('id', stationId)

      if (updateErr) {
        results.push({
          stationId,
          name: stationName,
          previousFactor,
          newFactor,
          sampleDays,
          status: 'error',
          message: updateErr.message,
        })
      } else {
        results.push({
          stationId,
          name: stationName,
          previousFactor,
          newFactor,
          sampleDays,
          status: 'updated',
          message: `${previousFactor} → ${newFactor} (${sampleDays} dias)`,
        })
      }
    }
  }

  // ── Calibração por pivô sem estação (Open-Meteo) ─────────────
  // Busca pivôs com latitude/longitude mas sem estação cadastrada
  const { data: pivotsNoStation } = await (supabase as any)
    .from('pivots')
    .select('id, name, latitude, longitude, rs_correction_factor, rs_factor_sample_days, farms!inner(weather_stations(id))')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  for (const pivot of (pivotsNoStation ?? [])) {
    // Pula pivôs que têm estação na fazenda
    const hasStation = (pivot.farms?.weather_stations ?? []).length > 0
    if (hasStation) continue

    const lat: number = pivot.latitude
    const lon: number = pivot.longitude

    // Busca dados Open-Meteo dos últimos 30 dias
    const factors: number[] = []

    for (let i = 5; i <= 30; i++) {
      // Começa de D-5 porque NASA tem latência 4-5 dias
      const dateISO = daysAgo(today, i)

      const omData = await getWeatherByPivotGeolocation(lat, lon, dateISO)
      if (!omData) continue

      const rsNasaMJ = await fetchRsFromNASA(lat, lon, dateISO)
      if (rsNasaMJ === null) continue

      const doy = getDayOfYear(dateISO)
      const rgOmWm2 = omData.solar_radiation_wm2 ?? 200
      const rgNasaWm2 = rsNasaMJ / 0.0864

      const etoNasa = calcETo(
        omData.temp_max ?? 30, omData.temp_min ?? 18,
        omData.humidity_percent ?? 65, omData.wind_speed_ms ?? 2,
        rgNasaWm2, lat, doy
      )
      const etoOM = calcETo(
        omData.temp_max ?? 30, omData.temp_min ?? 18,
        omData.humidity_percent ?? 65, omData.wind_speed_ms ?? 2,
        rgOmWm2, lat, doy
      )

      if (etoOM <= 0) continue

      const factor = etoNasa / etoOM
      if (factor >= 0.3 && factor <= 1.5) {
        factors.push(factor)
      }
    }

    const sampleDays = factors.length
    const previousFactor = pivot.rs_correction_factor ?? 0.82

    if (sampleDays < 7) {
      results.push({
        pivotId: pivot.id,
        name: pivot.name,
        previousFactor,
        newFactor: null,
        sampleDays,
        status: 'insufficient_data',
        message: `Apenas ${sampleDays} dias válidos (mínimo 7)`,
      })
      continue
    }

    const newFactor = Math.round((median(factors) ?? 0.82) * 10000) / 10000

    if (Math.abs(newFactor - previousFactor) < 0.0001) {
      results.push({
        pivotId: pivot.id,
        name: pivot.name,
        previousFactor,
        newFactor,
        sampleDays,
        status: 'unchanged',
        message: `Fator ${newFactor} (sem mudança)`,
      })
      continue
    }

    const { error: updateErr } = await (supabase as any)
      .from('pivots')
      .update({
        rs_correction_factor: newFactor,
        rs_factor_updated_at: new Date().toISOString(),
        rs_factor_sample_days: sampleDays,
      })
      .eq('id', pivot.id)

    if (updateErr) {
      results.push({
        pivotId: pivot.id,
        name: pivot.name,
        previousFactor,
        newFactor,
        sampleDays,
        status: 'error',
        message: updateErr.message,
      })
    } else {
      results.push({
        pivotId: pivot.id,
        name: pivot.name,
        previousFactor,
        newFactor,
        sampleDays,
        status: 'updated',
        message: `${previousFactor} → ${newFactor} (${sampleDays} dias)`,
      })
    }
  }

  return results
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as TypedSupabaseClient

  const today = todayBRT()
  const fetchDate = previousDay(today) // D-1

  // Busca todos os pivôs com weather_config + estação vinculada à fazenda
  // Inclui rs_correction_factor da estação e do próprio pivô para usar fator calibrado
  const { data: pivots, error: pivotErr } = await (supabase as any)
    .from('pivots')
    .select(`
      id, name, latitude, longitude, weather_source, weather_config,
      rs_correction_factor,
      farms!inner(id, company_id, weather_stations(id, rs_correction_factor))
    `)

  if (pivotErr) {
    return NextResponse.json({ error: pivotErr.message }, { status: 500 })
  }

  const results: Array<{ pivot: string; date: string; status: string; message: string }> = []

  for (const pivot of (pivots ?? [])) {
    const station = pivot.farms?.weather_stations?.[0] ?? null
    const config = pivot.weather_config ?? {}

    // Se não tem estação E não tem coordenadas, não tem como buscar nada
    if (!station && (pivot.latitude == null || pivot.longitude == null)) {
      results.push({ pivot: pivot.name, date: fetchDate, status: 'skipped', message: 'Sem estação e sem coordenadas' })
      continue
    }

    // Verifica se já existe registro para esta estação/data (evita reprocessar)
    if (station) {
      const { data: existing } = await (supabase as any)
        .from('weather_data')
        .select('id')
        .eq('station_id', station.id)
        .eq('date', fetchDate)
        .maybeSingle()

      if (existing) {
        results.push({ pivot: pivot.name, date: fetchDate, status: 'skipped', message: 'Já existe' })
        continue
      }
    }

    // ── Cadeia de fallback: Plugfield API → Google Sheets → Open-Meteo ──
    let weatherDay: { tempMax: number; tempMin: number; humidity: number; windSpeed: number; solarRadiation: number; rainfall: number; source: string; evapoPlugfield?: number | null } | null = null

    // 1. Plugfield API direta — credenciais vêm do weather_config do próprio pivô
    if (config.plugfield_device_id && config.plugfield_token && config.plugfield_api_key) {
      weatherDay = await fetchFromPlugfield(
        Number(config.plugfield_device_id),
        fetchDate,
        String(config.plugfield_token),
        String(config.plugfield_api_key),
      )
    }

    // 2. Google Sheets (planilha Plugfield exportada)
    if (!weatherDay && pivot.weather_source === 'google_sheets' && config.spreadsheet_id) {
      weatherDay = await fetchFromGoogleSheets(config.spreadsheet_id, fetchDate, config.gid)
    }

    // 3. Fallback: Open-Meteo (arquivo histórico, gratuito, dados D-1 disponíveis no mesmo dia)
    if (!weatherDay && pivot.latitude != null && pivot.longitude != null) {
      const omData = await getWeatherByPivotGeolocation(pivot.latitude, pivot.longitude, fetchDate)
      if (omData) {
        weatherDay = {
          tempMax:        omData.temp_max ?? 30,
          tempMin:        omData.temp_min ?? 18,
          humidity:       omData.humidity_percent ?? 65,
          windSpeed:      omData.wind_speed_ms ?? 2,
          solarRadiation: omData.solar_radiation_wm2 ?? 200,
          rainfall:       omData.rainfall_mm ?? 0,
          source: omData.source,
        }
      }
    }

    if (!weatherDay) {
      results.push({ pivot: pivot.name, date: fetchDate, status: 'error', message: 'Sem dados climáticos (todas as fontes falharam)' })
      continue
    }

    // ── Rs NASA: substitui Rs do Plugfield para cálculo ETo mais preciso ──
    // NASA POWER tem dados D-1 disponíveis; se falhar, usa Rs do Plugfield como fallback
    let rsSource = 'plugfield_fallback'
    let rgForEto = weatherDay.solarRadiation // W/m² (Plugfield fallback)

    if (pivot.latitude != null && pivot.longitude != null) {
      const rsNasaMJ = await fetchRsFromNASA(pivot.latitude, pivot.longitude, fetchDate)
      if (rsNasaMJ !== null) {
        rgForEto = rsNasaMJ / 0.0864 // MJ/m²/dia → W/m²
        rsSource = 'nasa'
      }
    }

    // Calcula ETo Penman-Monteith FAO-56 com Rs correto
    const doy = getDayOfYear(fetchDate)
    const lat = pivot.latitude ?? -15
    let eto = calcETo(
      weatherDay.tempMax, weatherDay.tempMin,
      weatherDay.humidity, weatherDay.windSpeed,
      rgForEto, lat, doy
    )

    // ── Fator de correção calibrado por estação/pivô ───────────────────
    // Prioridade: fator da estação → fator do pivô → variável de ambiente → 0.82
    // Aplicado apenas quando Rs vem do Plugfield/Sheets (sensor não calibrado).
    if (rsSource === 'plugfield_fallback') {
      const factor =
        (station?.rs_correction_factor ?? null) ??
        (pivot.rs_correction_factor ?? null) ??
        parseFloat(process.env.ETO_PLUGFIELD_CORRECTION_FACTOR ?? '0.82')
      eto = Math.round(eto * factor * 100) / 100
    }

    // Só grava em weather_data se o pivô tem estação cadastrada
    if (station) {
      const { error: upsertErr } = await (supabase as any)
        .from('weather_data')
        .upsert({
          station_id: station.id,
          date: fetchDate,
          temp_max: weatherDay.tempMax,
          temp_min: weatherDay.tempMin,
          humidity_percent: weatherDay.humidity,
          wind_speed_ms: weatherDay.windSpeed,
          solar_radiation_wm2: rgForEto,
          rainfall_mm: weatherDay.rainfall,
          eto_mm: eto,
          eto_plugfield_mm: weatherDay.evapoPlugfield ?? null,
          rs_source: rsSource,
          source: weatherDay.source,
        }, { onConflict: 'station_id,date' })

      if (upsertErr) {
        results.push({ pivot: pivot.name, date: fetchDate, status: 'error', message: upsertErr.message })
        continue
      }
    }

    // ── Grava chuva em rainfall_records (source='plugfield') ──────────────────
    // Só grava se teve chuva detectada pelo sensor
    // Preserva edições manuais: não sobrescreve registros source='manual'
    if (weatherDay.rainfall > 0) {
      const { data: existingRainfall } = await (supabase as any)
        .from('rainfall_records')
        .select('id, source')
        .eq('pivot_id', pivot.id)
        .eq('date', fetchDate)
        .is('sector_id', null)
        .maybeSingle()

      if (!existingRainfall || existingRainfall.source !== 'manual') {
        await (supabase as any)
          .from('rainfall_records')
          .upsert({
            pivot_id: pivot.id,
            date: fetchDate,
            rainfall_mm: weatherDay.rainfall,
            source: 'plugfield',
            sector_id: null,
          }, { onConflict: 'pivot_id,sector_id,date' })
      }
    }

    const usedFactor = rsSource === 'plugfield_fallback'
      ? ((station?.rs_correction_factor ?? null) ?? (pivot.rs_correction_factor ?? null) ?? parseFloat(process.env.ETO_PLUGFIELD_CORRECTION_FACTOR ?? '0.82'))
      : null
    const correctionNote = usedFactor !== null ? ` [fator=${usedFactor}]` : ''
    results.push({
      pivot: pivot.name, date: fetchDate,
      status: station ? 'ok' : 'ok_no_station',
      message: `ETo=${eto}mm via ${weatherDay.source}, Rs=${rsSource}${correctionNote}${!station ? ' (sem estação, não gravado)' : ''}`,
    })
  }

  // ── Calibração retroativa (1x por execução) ──────────────────
  let calibration: CalibrationResult[] = []
  try {
    calibration = await calibrateRsFactor(supabase, today)
  } catch (e) {
    calibration = [{ name: 'global', previousFactor: null, newFactor: null, sampleDays: 0, status: 'error', message: String(e) }]
  }

  const ok = results.filter(r => r.status === 'ok' || r.status === 'ok_no_station').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const errors = results.filter(r => r.status === 'error').length

  const calUpdated = calibration.filter(c => c.status === 'updated').length
  const calInsufficient = calibration.filter(c => c.status === 'insufficient_data').length

  return NextResponse.json({
    date: fetchDate,
    ok, skipped, errors,
    results,
    calibration: {
      updated: calUpdated,
      insufficient_data: calInsufficient,
      details: calibration,
    },
  })
}

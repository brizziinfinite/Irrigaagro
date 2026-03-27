// ============================================================
// Cron Job — Ingestão Diária de Dados Climáticos
// Roda todo dia às 22:00 UTC (19:00 BRT), ANTES do daily-balance
// Busca dados D-1 de cada pivô com fallback automático:
//   1. Google Sheets (estação Plugfield ou similar)
//   2. Open-Meteo (arquivo histórico, gratuito, sem autenticação)
// Grava na tabela weather_data vinculada à estação do pivô.
// Pivôs sem estação cadastrada são processados com estação "virtual"
// gravada diretamente em weather_data usando pivot_id como referência.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchFromPlugfield, fetchFromGoogleSheets, previousDay } from '@/lib/weather-fetch'
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
  const { data: pivots, error: pivotErr } = await (supabase as any)
    .from('pivots')
    .select(`
      id, name, latitude, longitude, weather_source, weather_config,
      farms!inner(id, company_id, weather_stations(id))
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
    let weatherDay: { tempMax: number; tempMin: number; humidity: number; windSpeed: number; solarRadiation: number; rainfall: number; source: string } | null = null

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

    // 2. Fallback: Open-Meteo (arquivo histórico, gratuito, dados D-1 disponíveis no mesmo dia)
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

    // Calcula ETo Penman-Monteith FAO-56
    const doy = getDayOfYear(fetchDate)
    const lat = pivot.latitude ?? -15
    const eto = calcETo(
      weatherDay.tempMax, weatherDay.tempMin,
      weatherDay.humidity, weatherDay.windSpeed,
      weatherDay.solarRadiation, lat, doy
    )

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
          solar_radiation_wm2: weatherDay.solarRadiation,
          rainfall_mm: weatherDay.rainfall,
          eto_mm: eto,
          source: weatherDay.source,
        }, { onConflict: 'station_id,date' })

      if (upsertErr) {
        results.push({ pivot: pivot.name, date: fetchDate, status: 'error', message: upsertErr.message })
        continue
      }
    }

    results.push({
      pivot: pivot.name, date: fetchDate,
      status: station ? 'ok' : 'ok_no_station',
      message: `ETo=${eto}mm via ${weatherDay.source}${!station ? ' (sem estação, não gravado)' : ''}`,
    })
  }

  const ok = results.filter(r => r.status === 'ok' || r.status === 'ok_no_station').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const errors = results.filter(r => r.status === 'error').length

  return NextResponse.json({ date: fetchDate, ok, skipped, errors, results })
}

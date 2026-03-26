// ============================================================
// Cron Job — Ingestão Diária de Dados Climáticos
// Roda todo dia às 04:00 UTC (01:00 BRT), ANTES do daily-balance
// Busca dados D-1 de cada pivô (Google Sheets ou NASA POWER)
// e grava na tabela weather_data
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchFromGoogleSheets, fetchFromNASAPower, previousDay } from '@/lib/weather-fetch'
import type { TypedSupabaseClient } from '@/services/base'

function todayBRT(): string {
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().split('T')[0]
}

// Calcula ETo Penman-Monteith FAO-56 simplificado
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

  // Busca todos os pivôs ativos com weather_config + station vinculada
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
    // Encontra a estação vinculada à fazenda deste pivô
    const station = pivot.farms?.weather_stations?.[0] ?? null
    if (!station) {
      results.push({ pivot: pivot.name, date: fetchDate, status: 'skipped', message: 'Sem estação vinculada' })
      continue
    }

    // Verifica se já existe registro
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

    // Busca dados climáticos
    let weatherDay = null
    const source = pivot.weather_source
    const config = pivot.weather_config ?? {}

    if (source === 'google_sheets' && config.spreadsheet_id) {
      weatherDay = await fetchFromGoogleSheets(config.spreadsheet_id, fetchDate, config.gid)
    }

    if (!weatherDay && pivot.latitude != null && pivot.longitude != null) {
      weatherDay = await fetchFromNASAPower(pivot.latitude, pivot.longitude, fetchDate)
    }

    if (!weatherDay) {
      results.push({ pivot: pivot.name, date: fetchDate, status: 'error', message: 'Sem dados climáticos' })
      continue
    }

    // Calcula ETo
    const doy = getDayOfYear(fetchDate)
    const lat = pivot.latitude ?? -15
    const eto = calcETo(
      weatherDay.tempMax, weatherDay.tempMin,
      weatherDay.humidity, weatherDay.windSpeed,
      weatherDay.solarRadiation, lat, doy
    )

    // Grava no banco
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
    } else {
      results.push({
        pivot: pivot.name, date: fetchDate, status: 'ok',
        message: `ETo=${eto}mm Tmax=${weatherDay.tempMax}°C rain=${weatherDay.rainfall}mm via ${weatherDay.source}`
      })
    }
  }

  const ok = results.filter(r => r.status === 'ok').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const errors = results.filter(r => r.status === 'error').length

  return NextResponse.json({ date: fetchDate, fetch_date: fetchDate, ok, skipped, errors, results })
}

// ============================================================
// Admin — Calibração retroativa do fator Rs por estação/pivô
// GET /api/admin/calibrate-rs?days=90
//
// Mesma lógica do calibrateRsFactor() do cron, mas com janela
// configurável (padrão 90 dias) para backtest.
// Protegido por CRON_SECRET.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchRsFromNASA } from '@/lib/weather-fetch'
import { getWeatherByPivotGeolocation } from '@/services/weather-geolocation'
import type { TypedSupabaseClient } from '@/services/base'

function getDayOfYear(dateISO: string): number {
  const d = new Date(dateISO + 'T12:00:00')
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d.getTime() - start.getTime()) / 86400000)
}

function calcETo(tmax: number, tmin: number, rh: number, wind: number, rgWm2: number, lat: number, doy: number): number {
  const tmean = (tmax + tmin) / 2
  const rg = rgWm2 * 0.0864
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

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function daysAgo(dateISO: string, n: number): string {
  const d = new Date(dateISO + 'T12:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function todayBRT(): string {
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return brt.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '90'), 365)
  const dryRun = url.searchParams.get('dry_run') === 'true'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as TypedSupabaseClient

  const today = todayBRT()
  const startDate = daysAgo(today, days)

  type CalibrationDetail = {
    stationId?: string
    pivotId?: string
    name: string
    previousFactor: number | null
    newFactor: number | null
    sampleDays: number
    totalDays: number
    factors: number[]
    status: string
    message: string
  }

  const results: CalibrationDetail[] = []

  // ── Calibração por estação ────────────────────────────────────
  const { data: stationRows } = await (supabase as any)
    .from('weather_data')
    .select('station_id, date, temp_max, temp_min, humidity_percent, wind_speed_ms, solar_radiation_wm2')
    .eq('rs_source', 'plugfield_fallback')
    .gte('date', startDate)
    .lte('date', today)
    .order('date', { ascending: true })

  if (stationRows && stationRows.length > 0) {
    const byStation: Record<string, typeof stationRows> = {}
    for (const row of stationRows) {
      if (!byStation[row.station_id]) byStation[row.station_id] = []
      byStation[row.station_id].push(row)
    }

    for (const stationId of Object.keys(byStation)) {
      const rows = byStation[stationId]

      // Coordenadas via pivô vinculado
      const { data: pivotData } = await (supabase as any)
        .from('pivots')
        .select('latitude, longitude, name')
        .eq('weather_config->station_id', stationId)
        .not('latitude', 'is', null)
        .limit(1)
        .maybeSingle()

      let lat: number | null = null
      let lon: number | null = null

      if (pivotData?.latitude != null) {
        lat = pivotData.latitude
        lon = pivotData.longitude
      } else {
        // Fallback: pivô da mesma fazenda da estação
        const { data: stationFarmPivot } = await (supabase as any)
          .from('weather_stations')
          .select('name, farms!inner(pivots(latitude, longitude))')
          .eq('id', stationId)
          .maybeSingle()

        const pivotsArr = stationFarmPivot?.farms?.pivots ?? []
        const p = pivotsArr.find((x: { latitude: number | null }) => x.latitude != null)
        if (p) { lat = p.latitude; lon = p.longitude }
      }

      // Nome da estação
      const { data: stationMeta } = await (supabase as any)
        .from('weather_stations')
        .select('name, rs_correction_factor, rs_factor_sample_days')
        .eq('id', stationId)
        .maybeSingle()
      const stationName = stationMeta?.name ?? stationId

      if (lat === null || lon === null) {
        results.push({ stationId, name: stationName, previousFactor: stationMeta?.rs_correction_factor ?? null, newFactor: null, sampleDays: 0, totalDays: rows.length, factors: [], status: 'error', message: 'Sem coordenadas' })
        continue
      }

      const factors: number[] = []
      const dayFactors: Array<{ date: string; factor: number }> = []

      for (const row of rows) {
        const rsNasaMJ = await fetchRsFromNASA(lat, lon, row.date)
        if (rsNasaMJ === null) continue

        const doy = getDayOfYear(row.date)
        const etoNasa = calcETo(row.temp_max, row.temp_min, row.humidity_percent, row.wind_speed_ms, rsNasaMJ / 0.0864, lat, doy)
        const etoPlug = calcETo(row.temp_max, row.temp_min, row.humidity_percent, row.wind_speed_ms, row.solar_radiation_wm2, lat, doy)

        if (etoPlug <= 0) continue
        const f = etoNasa / etoPlug
        if (f >= 0.3 && f <= 1.5) {
          factors.push(f)
          dayFactors.push({ date: row.date, factor: Math.round(f * 10000) / 10000 })
        }
      }

      const sampleDays = factors.length
      const previousFactor = stationMeta?.rs_correction_factor ?? 0.82
      const newFactor = sampleDays >= 7 ? Math.round((median(factors) ?? 0.82) * 10000) / 10000 : null

      if (newFactor === null) {
        results.push({ stationId, name: stationName, previousFactor, newFactor: null, sampleDays, totalDays: rows.length, factors: dayFactors.map(d => d.factor), status: 'insufficient_data', message: `${sampleDays}/${rows.length} dias com NASA` })
        continue
      }

      if (!dryRun) {
        await (supabase as any)
          .from('weather_stations')
          .update({ rs_correction_factor: newFactor, rs_factor_updated_at: new Date().toISOString(), rs_factor_sample_days: sampleDays })
          .eq('id', stationId)
      }

      results.push({
        stationId,
        name: stationName,
        previousFactor,
        newFactor,
        sampleDays,
        totalDays: rows.length,
        factors: dayFactors.map(d => d.factor),
        status: dryRun ? 'dry_run' : (Math.abs(newFactor - previousFactor) < 0.0001 ? 'unchanged' : 'updated'),
        message: `${previousFactor} → ${newFactor} | mediana de ${sampleDays} dias (${rows.length} total)`,
      })
    }
  }

  // ── Calibração por pivô sem estação (Open-Meteo) ─────────────
  const { data: pivotsNoStation } = await (supabase as any)
    .from('pivots')
    .select('id, name, latitude, longitude, rs_correction_factor, farms!inner(weather_stations(id))')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  for (const pivot of (pivotsNoStation ?? [])) {
    if ((pivot.farms?.weather_stations ?? []).length > 0) continue

    const lat: number = pivot.latitude
    const lon: number = pivot.longitude
    const factors: number[] = []

    for (let i = 5; i <= days; i++) {
      const dateISO = daysAgo(today, i)
      const omData = await getWeatherByPivotGeolocation(lat, lon, dateISO)
      if (!omData) continue

      const rsNasaMJ = await fetchRsFromNASA(lat, lon, dateISO)
      if (rsNasaMJ === null) continue

      const doy = getDayOfYear(dateISO)
      const etoNasa = calcETo(omData.temp_max ?? 30, omData.temp_min ?? 18, omData.humidity_percent ?? 65, omData.wind_speed_ms ?? 2, rsNasaMJ / 0.0864, lat, doy)
      const etoOM = calcETo(omData.temp_max ?? 30, omData.temp_min ?? 18, omData.humidity_percent ?? 65, omData.wind_speed_ms ?? 2, omData.solar_radiation_wm2 ?? 200, lat, doy)

      if (etoOM <= 0) continue
      const f = etoNasa / etoOM
      if (f >= 0.3 && f <= 1.5) factors.push(f)
    }

    const sampleDays = factors.length
    const previousFactor = pivot.rs_correction_factor ?? 0.82
    const newFactor = sampleDays >= 7 ? Math.round((median(factors) ?? 0.82) * 10000) / 10000 : null

    if (newFactor === null) {
      results.push({ pivotId: pivot.id, name: pivot.name, previousFactor, newFactor: null, sampleDays, totalDays: days, factors: [], status: 'insufficient_data', message: `${sampleDays} dias com NASA` })
      continue
    }

    if (!dryRun) {
      await (supabase as any)
        .from('pivots')
        .update({ rs_correction_factor: newFactor, rs_factor_updated_at: new Date().toISOString(), rs_factor_sample_days: sampleDays })
        .eq('id', pivot.id)
    }

    results.push({
      pivotId: pivot.id,
      name: pivot.name,
      previousFactor,
      newFactor,
      sampleDays,
      totalDays: days,
      factors: factors.map(f => Math.round(f * 10000) / 10000),
      status: dryRun ? 'dry_run' : (Math.abs(newFactor - previousFactor) < 0.0001 ? 'unchanged' : 'updated'),
      message: `${previousFactor} → ${newFactor} | mediana de ${sampleDays} dias`,
    })
  }

  const updated = results.filter(r => r.status === 'updated').length
  const insufficient = results.filter(r => r.status === 'insufficient_data').length

  return NextResponse.json({
    days,
    startDate,
    today,
    dryRun,
    updated,
    insufficient_data: insufficient,
    results,
  })
}

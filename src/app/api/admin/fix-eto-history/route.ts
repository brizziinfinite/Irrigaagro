// ============================================================
// Admin — Corrige ETo histórico no weather_data
// Recalcula FAO-56 para registros com rs_source = 'plugfield_evapo'
// onde o campo evapo bruto do sensor foi gravado como eto_mm.
// Protegido por CRON_SECRET.
// Uso: GET /api/admin/fix-eto-history?dry_run=true (simula sem gravar)
//      GET /api/admin/fix-eto-history (aplica correção)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getDayOfYear(dateISO: string): number {
  const d = new Date(dateISO + 'T12:00:00')
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d.getTime() - start.getTime()
  return Math.floor(diff / 86400000)
}

/**
 * Calcula ETo Penman-Monteith FAO-56 com dados diários.
 * Altitude padrão: 500m (alinhado com water-balance.ts).
 */
function calcETo(
  tmax: number, tmin: number,
  rh: number, wind: number,
  rgWm2: number, lat: number,
  doy: number
): number {
  const tmean = (tmax + tmin) / 2
  const rg = rgWm2 * 0.0864
  const latR = (Math.PI / 180) * lat
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365)
  const d = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39)
  const ws = Math.acos(-Math.tan(latR) * Math.tan(d))
  const ra = ((24 * 60) / Math.PI) * 0.082 * dr *
    (ws * Math.sin(latR) * Math.sin(d) + Math.cos(latR) * Math.cos(d) * Math.sin(ws))
  const rso = (0.75 + 2e-5 * 500) * ra
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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Busca todos os registros com rs_source = 'plugfield_evapo'
  // Esses registros têm eto_mm = evapo bruto do sensor (subestimado ~30-50%)
  const { data: rows, error } = await supabase
    .from('weather_data')
    .select('id, date, station_id, eto_mm, eto_plugfield_mm, temp_max, temp_min, humidity_percent, wind_speed_ms, solar_radiation_wm2')
    .eq('rs_source', 'plugfield_evapo')
    .order('date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ message: 'Nenhum registro plugfield_evapo encontrado', updated: 0 })
  }

  // Busca coordenadas das estações via pivôs vinculados
  const stationIds = [...new Set(rows.map(r => r.station_id).filter(Boolean))]
  const { data: pivotCoords } = await supabase
    .from('pivots')
    .select('latitude, longitude, farms!inner(weather_stations(id))')
    .not('latitude', 'is', null)

  // Mapa station_id → { lat, lon }
  const coordsByStation: Record<string, { lat: number; lon: number }> = {}
  for (const p of pivotCoords ?? []) {
    const stIds = ((p.farms as { weather_stations?: Array<{ id: string }> })?.weather_stations ?? []).map((s: { id: string }) => s.id)
    for (const sid of stIds) {
      if (p.latitude != null && p.longitude != null) {
        coordsByStation[sid] = { lat: p.latitude, lon: p.longitude }
      }
    }
  }

  const results: Array<{
    id: string
    date: string
    eto_old: number
    eto_plugfield: number | null
    eto_new: number
    delta: number
    updated: boolean
  }> = []

  for (const row of rows) {
    const coords = coordsByStation[row.station_id]
    const lat = coords?.lat ?? -22.9 // fallback aproximado SP interior

    const doy = getDayOfYear(row.date)

    // Verifica se tem todos os dados necessários para FAO-56
    if (
      row.temp_max == null || row.temp_min == null ||
      row.humidity_percent == null || row.wind_speed_ms == null ||
      row.solar_radiation_wm2 == null
    ) {
      results.push({
        id: row.id,
        date: row.date,
        eto_old: Number(row.eto_mm),
        eto_plugfield: row.eto_plugfield_mm != null ? Number(row.eto_plugfield_mm) : null,
        eto_new: Number(row.eto_mm),
        delta: 0,
        updated: false,
      })
      continue
    }

    const etoNew = calcETo(
      Number(row.temp_max),
      Number(row.temp_min),
      Number(row.humidity_percent),
      Number(row.wind_speed_ms),
      Number(row.solar_radiation_wm2),
      lat,
      doy
    )

    const etoOld = Number(row.eto_mm)
    const delta = Math.round((etoNew - etoOld) * 100) / 100

    if (!dryRun) {
      await supabase
        .from('weather_data')
        .update({
          eto_mm: etoNew,
          // Garante que eto_plugfield_mm está salvo como referência
          eto_plugfield_mm: row.eto_plugfield_mm ?? etoOld,
          // Mantém rs_source como 'plugfield_evapo' para rastreabilidade histórica
          // (foi de fato coletado pelo sensor Plugfield, mas ETo agora é FAO-56)
          rs_source: 'plugfield_fao56',
        })
        .eq('id', row.id)
    }

    results.push({
      id: row.id,
      date: row.date,
      eto_old: etoOld,
      eto_plugfield: row.eto_plugfield_mm != null ? Number(row.eto_plugfield_mm) : null,
      eto_new: etoNew,
      delta,
      updated: !dryRun,
    })
  }

  const updated = results.filter(r => r.updated).length
  const avgDelta = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.delta, 0) / results.length * 100) / 100
    : 0

  return NextResponse.json({
    dry_run: dryRun,
    total_records: rows.length,
    updated,
    avg_eto_delta_mm: avgDelta,
    results,
  })
}

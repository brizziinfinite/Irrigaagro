// ============================================================
// Cron Job — Atualização Automática NDVI via Sentinel-2
// Roda toda segunda-feira às 06:00 UTC (03:00 BRT)
// Busca NDVI dos últimos 30 dias para todos os pivôs e talhões
// com polígono cadastrado, via Copernicus Data Space.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SENTINEL_TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
const SENTINEL_STATS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics'

const EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const isCloud = s.SCL >= 8 && s.SCL <= 10;
  const isShadow = s.SCL === 3;
  const isValid = s.dataMask === 1 && !isCloud && !isShadow;
  if (!isValid) return { ndvi: [0], dataMask: [0] };
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 0.0001);
  return { ndvi: [ndvi], dataMask: [1] };
}
`

async function getSentinelToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(SENTINEL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) throw new Error(`Sentinel auth failed: ${await res.text()}`)
  const data = await res.json()
  return data.access_token as string
}

async function fetchNdviStats(
  token: string,
  geojson: unknown,
  dataInicio: string,
  dataFim: string,
): Promise<Array<{ data: string; ndvi_medio: number; ndvi_min: number; ndvi_max: number; cobertura_nuvens_pct: number }>> {
  const body = {
    input: {
      bounds: {
        geometry: geojson,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [{ type: 'sentinel-2-l2a', dataFilter: { maxCloudCoverage: 80 } }],
    },
    aggregation: {
      timeRange: { from: `${dataInicio}T00:00:00Z`, to: `${dataFim}T23:59:59Z` },
      aggregationInterval: { of: 'P30D' },
      evalscript: EVALSCRIPT,
      resx: 10,
      resy: 10,
    },
    calculations: { default: {} },
  }

  const res = await fetch(SENTINEL_STATS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error('Statistics API error:', await res.text())
    return []
  }

  const resp = await res.json()
  const results = []

  for (const item of (resp.data ?? [])) {
    const stats = item?.outputs?.ndvi?.bands?.B0?.stats
    if (!stats || stats.sampleCount === 0) continue
    const ndvi_medio = stats.mean ?? null
    if (ndvi_medio === null) continue

    const dataRepresentativa = (item.interval?.to ?? item.interval?.from ?? dataFim).slice(0, 10)
    const totalPixels = (stats.sampleCount ?? 0) + (stats.noDataCount ?? 0)
    const cobertura = totalPixels > 0
      ? Math.round(((stats.noDataCount ?? 0) / totalPixels) * 100)
      : 0

    results.push({
      data: dataRepresentativa,
      ndvi_medio: Math.round(ndvi_medio * 1000) / 1000,
      ndvi_min: Math.round((stats.min ?? 0) * 1000) / 1000,
      ndvi_max: Math.round((stats.max ?? 0) * 1000) / 1000,
      cobertura_nuvens_pct: cobertura,
    })
  }

  return results
}

function subtrairDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  // Verificar autorização
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const clientId = process.env.SENTINEL_CLIENT_ID
  const clientSecret = process.env.SENTINEL_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'SENTINEL credentials not configured' }, { status: 500 })
  }

  const startedAt = Date.now()
  const results: Array<{ entity: string; tipo: string; status: string; registros?: number; erro?: string }> = []

  try {
    // Buscar pivôs com polígono
    const { data: pivots } = await supabase
      .from('pivots')
      .select('id, name, polygon_geojson')
      .not('polygon_geojson', 'is', null)

    // Buscar talhões com polígono
    const { data: talhoes } = await supabase
      .from('talhoes')
      .select('id, name, polygon_geojson')
      .not('polygon_geojson', 'is', null)

    const totalEntidades = (pivots?.length ?? 0) + (talhoes?.length ?? 0)

    if (totalEntidades === 0) {
      return NextResponse.json({ ok: true, message: 'Nenhuma entidade com polígono', results: [] })
    }

    // Obter token uma vez para todas as requisições
    const token = await getSentinelToken(clientId, clientSecret)

    const dataFim = subtrairDias(0)
    const dataInicio = subtrairDias(35) // 35 dias para garantir ao menos 1 período de 30d

    // Processar pivôs
    for (const pivot of pivots ?? []) {
      try {
        const dados = await fetchNdviStats(token, pivot.polygon_geojson, dataInicio, dataFim)

        let registros = 0
        for (const r of dados) {
          const { error } = await supabase.from('ndvi_cache').upsert({
            pivot_id: pivot.id,
            data_imagem: r.data,
            ndvi_medio: r.ndvi_medio,
            ndvi_min: r.ndvi_min,
            ndvi_max: r.ndvi_max,
            cobertura_nuvens_pct: r.cobertura_nuvens_pct,
            fonte: 'sentinel2',
          }, { onConflict: 'pivot_id,data_imagem' })

          if (!error) registros++
        }

        results.push({ entity: pivot.name, tipo: 'pivot', status: 'ok', registros })
      } catch (err) {
        results.push({ entity: pivot.name, tipo: 'pivot', status: 'error', erro: String(err) })
      }
    }

    // Processar talhões
    for (const talhao of talhoes ?? []) {
      try {
        const dados = await fetchNdviStats(token, talhao.polygon_geojson, dataInicio, dataFim)

        let registros = 0
        for (const r of dados) {
          const { error } = await supabase.from('ndvi_cache').upsert({
            talhao_id: talhao.id,
            data_imagem: r.data,
            ndvi_medio: r.ndvi_medio,
            ndvi_min: r.ndvi_min,
            ndvi_max: r.ndvi_max,
            cobertura_nuvens_pct: r.cobertura_nuvens_pct,
            fonte: 'sentinel2',
          }, { onConflict: 'talhao_id,data_imagem' })

          if (!error) registros++
        }

        results.push({ entity: talhao.name, tipo: 'talhao', status: 'ok', registros })
      } catch (err) {
        results.push({ entity: talhao.name, tipo: 'talhao', status: 'error', erro: String(err) })
      }
    }

    const elapsed = Date.now() - startedAt
    const erros = results.filter(r => r.status === 'error').length

    console.log(`[ndvi-refresh] ${results.length} entidades, ${erros} erros, ${elapsed}ms`)

    return NextResponse.json({
      ok: true,
      total: results.length,
      erros,
      elapsed_ms: elapsed,
      results,
    })
  } catch (err) {
    console.error('[ndvi-refresh] Fatal error:', err)
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 },
    )
  }
}

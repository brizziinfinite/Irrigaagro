import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Edge Function: ndvi-fetch
 *
 * Busca NDVI de um pivô ou talhão via Copernicus Data Space Statistics API.
 *
 * Secrets necessários:
 *   SENTINEL_CLIENT_ID     — OAuth client ID do Copernicus Data Space
 *   SENTINEL_CLIENT_SECRET — OAuth client secret do Copernicus Data Space
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SENTINEL_TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
const SENTINEL_STATS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics'
const SENTINEL_PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process'

const CACHE_DIAS = 10
const DIAS_HISTORICO = 120

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

const EVALSCRIPT_IMG = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08"] }],
    output: { bands: 3, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 0.0001);
  var r, g, b;
  if (ndvi < 0.0)       { r=50;  g=50;  b=50;  }
  else if (ndvi < 0.2)  { var t=ndvi/0.2;          r=220; g=Math.round(30+50*t);   b=20; }
  else if (ndvi < 0.35) { var t=(ndvi-0.2)/0.15;   r=220; g=Math.round(80+100*t);  b=0;  }
  else if (ndvi < 0.5)  { var t=(ndvi-0.35)/0.15;  r=Math.round(220-140*t); g=200; b=0;  }
  else if (ndvi < 0.65) { var t=(ndvi-0.5)/0.15;   r=Math.round(80-80*t);  g=200; b=0;  }
  else if (ndvi < 0.8)  { var t=(ndvi-0.65)/0.15;  r=0; g=Math.round(200-40*t);   b=0;  }
  else                  { var t=(ndvi-0.8)/0.2;     r=0; g=Math.round(160-60*t);   b=0;  }
  return [r, g, b];
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

async function fetchNdviImagem(
  token: string,
  geojson: unknown,
  dataInicio: string,
  dataFim: string,
): Promise<Uint8Array | null> {
  const body = {
    input: {
      bounds: {
        geometry: geojson,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [{
        type: 'sentinel-2-l2a',
        dataFilter: {
          timeRange: { from: `${dataInicio}T00:00:00Z`, to: `${dataFim}T23:59:59Z` },
          maxCloudCoverage: 80,
        },
      }],
    },
    output: {
      width: 512,
      height: 512,
      responses: [{ identifier: 'default', format: { type: 'image/png' } }],
    },
    evalscript: EVALSCRIPT_IMG,
  }

  const res = await fetch(SENTINEL_PROCESS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error('Process API error:', await res.text())
    return null
  }

  return new Uint8Array(await res.arrayBuffer())
}

function subtrairDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sentinelClientId = Deno.env.get('SENTINEL_CLIENT_ID')
    const sentinelClientSecret = Deno.env.get('SENTINEL_CLIENT_SECRET')

    // Validate caller
    const authHeader = req.headers.get('authorization') ?? ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await callerClient.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { pivot_id, talhao_id, forcar_refresh = false } = await req.json()
    if (!pivot_id && !talhao_id) {
      return new Response(JSON.stringify({ error: 'pivot_id ou talhao_id obrigatório' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Resolve entidade
    let entityName = ''
    let polygonGeoJSON: unknown = null
    let companyId = ''
    const cacheField = pivot_id ? 'pivot_id' : 'talhao_id'
    const cacheValue = pivot_id ?? talhao_id
    const storagePrefix = pivot_id ? `pivot/${pivot_id}` : `talhao/${talhao_id}`

    if (pivot_id) {
      const { data: pivot, error: pivotErr } = await supabaseAdmin
        .from('pivots')
        .select('id, name, polygon_geojson, farms!inner(company_id)')
        .eq('id', pivot_id)
        .single()
      if (pivotErr || !pivot) {
        return new Response(JSON.stringify({ error: 'Pivot not found' }), {
          status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      entityName = pivot.name
      polygonGeoJSON = pivot.polygon_geojson
      companyId = (pivot.farms as { company_id: string }).company_id
    } else {
      const { data: talhao, error: talhaoErr } = await supabaseAdmin
        .from('talhoes')
        .select('id, name, polygon_geojson, company_id')
        .eq('id', talhao_id)
        .single()
      if (talhaoErr || !talhao) {
        return new Response(JSON.stringify({ error: 'Talhão not found' }), {
          status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      entityName = talhao.name
      polygonGeoJSON = talhao.polygon_geojson
      companyId = talhao.company_id
    }

    // Check user belongs to same company
    const { data: member } = await supabaseAdmin
      .from('company_members')
      .select('id')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Buscar cache existente
    const dataLimite = subtrairDias(DIAS_HISTORICO)
    const { data: historico = [] } = await supabaseAdmin
      .from('ndvi_cache')
      .select('*')
      .eq(cacheField, cacheValue)
      .gte('data_imagem', dataLimite)
      .order('data_imagem', { ascending: true })

    const ultimaImagem = historico.length > 0 ? historico[historico.length - 1] : null
    const ultimaData = ultimaImagem?.data_imagem
    const diasDesdeUltima = ultimaData
      ? Math.floor((Date.now() - new Date(ultimaData).getTime()) / 86400000)
      : 999

    const precisaAtualizar = forcar_refresh || diasDesdeUltima >= CACHE_DIAS

    // Sem credenciais — retornar cache
    if (!sentinelClientId || !sentinelClientSecret) {
      return new Response(JSON.stringify({
        pivot_id, talhao_id, entity_name: entityName,
        historico, alertas: [],
        sem_credenciais: true,
        ultima_atualizacao: ultimaData ?? null,
        dias_desde_ultima: diasDesdeUltima === 999 ? null : diasDesdeUltima,
        error: 'SENTINEL_NOT_CONFIGURED',
        message: 'Configure SENTINEL_CLIENT_ID e SENTINEL_CLIENT_SECRET (Copernicus Data Space)',
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Sem polígono
    if (!polygonGeoJSON) {
      return new Response(JSON.stringify({
        error: 'NO_POLYGON',
        message: 'Sem polígono cadastrado. Desenhe o polígono para habilitar NDVI.',
      }), { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    let sentinelErro: string | null = null

    if (precisaAtualizar) {
      try {
        const token = await getSentinelToken(sentinelClientId, sentinelClientSecret)
        const dataFim = subtrairDias(0)
        const dataInicio = subtrairDias(DIAS_HISTORICO)

        const resultados = await fetchNdviStats(token, polygonGeoJSON, dataInicio, dataFim)

        for (const r of resultados) {
          const registro = {
            ...(pivot_id ? { pivot_id } : { talhao_id }),
            data_imagem: r.data,
            ndvi_medio: r.ndvi_medio,
            ndvi_min: r.ndvi_min,
            ndvi_max: r.ndvi_max,
            cobertura_nuvens_pct: r.cobertura_nuvens_pct,
            fonte: 'sentinel2',
          }
          await supabaseAdmin.from('ndvi_cache').upsert(registro, { onConflict: `${cacheField},data_imagem` })

          const idx = historico.findIndex((h: { data_imagem: string }) => h.data_imagem === r.data)
          if (idx >= 0) historico[idx] = { ...historico[idx], ...registro }
          else historico.push({ id: 'novo', created_at: new Date().toISOString(), ...registro })
        }

        // Gerar imagem PNG do período mais recente
        const ultimoResultado = resultados.at(-1)
        if (ultimoResultado) {
          try {
            const pngBytes = await fetchNdviImagem(token, polygonGeoJSON, subtrairDias(DIAS_HISTORICO), subtrairDias(0))
            if (pngBytes) {
              const storagePath = `${storagePrefix}/${ultimoResultado.data}.png`
              const { error: uploadErr } = await supabaseAdmin.storage
                .from('campo-ndvi')
                .upload(storagePath, pngBytes, { contentType: 'image/png', upsert: true })

              if (!uploadErr) {
                const { data: urlData } = supabaseAdmin.storage.from('campo-ndvi').getPublicUrl(storagePath)
                if (urlData?.publicUrl) {
                  await supabaseAdmin.from('ndvi_cache')
                    .update({ imagem_url: urlData.publicUrl })
                    .eq(cacheField, cacheValue)
                    .eq('data_imagem', ultimoResultado.data)

                  const idx = historico.findIndex((h: { data_imagem: string }) => h.data_imagem === ultimoResultado.data)
                  if (idx >= 0) historico[idx] = { ...historico[idx], imagem_url: urlData.publicUrl }
                }
              }
            }
          } catch (imgErr) {
            console.error('PNG error (non-fatal):', imgErr)
          }
        }

        historico.sort((a: { data_imagem: string }, b: { data_imagem: string }) => a.data_imagem.localeCompare(b.data_imagem))
      } catch (err) {
        console.error('Sentinel Hub error:', err)
        sentinelErro = err instanceof Error ? err.message : String(err)
      }
    }

    // Alertas
    const alertas: string[] = []
    if (historico.length >= 2) {
      const last = historico[historico.length - 1]
      const prev = historico[historico.length - 2]
      if (last?.ndvi_medio != null && prev?.ndvi_medio != null && prev.ndvi_medio > 0) {
        const queda = ((prev.ndvi_medio - last.ndvi_medio) / prev.ndvi_medio) * 100
        if (queda >= 20) alertas.push(`Queda crítica de NDVI: ${queda.toFixed(1)}% em relação ao mês anterior`)
        else if (queda >= 10) alertas.push(`Queda de NDVI detectada: ${queda.toFixed(1)}% — monitorar`)
      }
    }

    const historicoOrdenado = [...historico].sort((a: { data_imagem: string }, b: { data_imagem: string }) => b.data_imagem.localeCompare(a.data_imagem))
    const ultimaDataFinal = historicoOrdenado[0]?.data_imagem ?? null
    const diasDesdeUltimaFinal = ultimaDataFinal
      ? Math.floor((Date.now() - new Date(ultimaDataFinal).getTime()) / 86400000)
      : null

    return new Response(JSON.stringify({
      pivot_id, talhao_id, entity_name: entityName,
      historico, alertas,
      ultima_atualizacao: ultimaDataFinal,
      dias_desde_ultima: diasDesdeUltimaFinal,
      cache_fresco: !precisaAtualizar,
      sem_credenciais: false,
      sentinel_erro: sentinelErro,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('ndvi-fetch error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})

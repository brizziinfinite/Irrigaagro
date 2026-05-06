import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Sentinel Hub ──────────────────────────────────────────────────────────────
const CACHE_DIAS = 10
const DIAS_HISTORICO = 120
const PERIODO = 'P30D'
const MAX_NUVENS = 80
const IMG_SIZE = 512

const EVALSCRIPT_STATS = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1, sampleType: "UINT8" }
    ]
  };
}
function evaluatePixel(s) {
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-10);
  const clear = s.dataMask === 1 && ![3,8,9,10].includes(s.SCL[0]);
  return {
    ndvi: [clear ? ndvi : NaN],
    dataMask: [clear ? 1 : 0]
  };
}`

const EVALSCRIPT_IMG = `//VERSION=3
function setup() {
  return { input: [{ bands: ["B04","B08","SCL","dataMask"] }], output: { bands: 4 } };
}
function colorFromNdvi(ndvi) {
  if (ndvi < 0.0)  return [0.10, 0.10, 0.10];
  if (ndvi < 0.2)  return [0.86, 0.12, 0.08];
  if (ndvi < 0.35) return [0.78, 0.31, 0.00];
  if (ndvi < 0.5)  return [0.78, 0.78, 0.00];
  if (ndvi < 0.7)  return [0.00, 0.78, 0.00];
  return               [0.00, 0.59, 0.00];
}
function evaluatePixel(s) {
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-10);
  const isClear = s.dataMask === 1 && ![3,8,9,10].includes(s.SCL[0]);
  if (!isClear) return [0, 0, 0, 0];
  const [r, g, b] = colorFromNdvi(ndvi);
  return [r, g, b, 1];
}`

async function getToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(
    'https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }
  )
  if (!res.ok) throw new Error(`Sentinel auth failed: ${res.status}`)
  const data = await res.json()
  return data.access_token
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

    const { pivot_id, forcar_refresh = false } = await req.json()
    if (!pivot_id) {
      return new Response(JSON.stringify({ error: 'pivot_id required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Fetch pivot data + access check
    const { data: pivot, error: pivotErr } = await supabaseAdmin
      .from('pivots')
      .select('id, name, polygon_geojson, latitude, longitude, farms!inner(company_id)')
      .eq('id', pivot_id)
      .single()

    if (pivotErr || !pivot) {
      return new Response(JSON.stringify({ error: 'Pivot not found' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Check user belongs to same company
    const farmData = pivot.farms as { company_id: string }
    const { data: member } = await supabaseAdmin
      .from('company_members')
      .select('id')
      .eq('company_id', farmData.company_id)
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Check cache freshness
    if (!forcar_refresh) {
      const { data: recente } = await supabaseAdmin
        .from('ndvi_cache')
        .select('*')
        .eq('pivot_id', pivot_id)
        .order('data_imagem', { ascending: false })
        .limit(1)
        .single()

      if (recente) {
        const diasAtras = Math.floor(
          (Date.now() - new Date(recente.data_imagem).getTime()) / 86400000
        )
        if (diasAtras < CACHE_DIAS) {
          // Return from cache
          const { data: historico } = await supabaseAdmin
            .from('ndvi_cache')
            .select('*')
            .eq('pivot_id', pivot_id)
            .order('data_imagem', { ascending: true })

          return new Response(
            JSON.stringify({ pivot_id, pivot_name: pivot.name, historico: historico ?? [], alertas: [] }),
            { headers: { ...CORS, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // Check if Sentinel credentials configured
    if (!sentinelClientId || !sentinelClientSecret) {
      return new Response(
        JSON.stringify({
          error: 'SENTINEL_NOT_CONFIGURED',
          message: 'Configure SENTINEL_CLIENT_ID e SENTINEL_CLIENT_SECRET nas Edge Function Secrets',
        }),
        { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Check polygon
    if (!pivot.polygon_geojson) {
      return new Response(
        JSON.stringify({
          error: 'NO_POLYGON',
          message: 'Pivô sem polígono cadastrado. Desenhe o polígono no cadastro do pivô.',
        }),
        { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const token = await getToken(sentinelClientId, sentinelClientSecret)

    // Date range
    const agora = new Date()
    const dataFim = agora.toISOString().split('T')[0]
    const dataInicio = new Date(agora.getTime() - DIAS_HISTORICO * 86400000)
      .toISOString()
      .split('T')[0]

    const polygonGeoJSON = pivot.polygon_geojson

    // Statistics API
    const statsPayload = {
      input: {
        bounds: { geometry: polygonGeoJSON },
        data: [{ type: 'sentinel-2-l2a', dataFilter: { maxCloudCoverage: MAX_NUVENS } }],
      },
      aggregation: {
        timeRange: { from: `${dataInicio}T00:00:00Z`, to: `${dataFim}T23:59:59Z` },
        aggregationInterval: { of: PERIODO },
        evalscript: EVALSCRIPT_STATS,
        resx: 10,
        resy: 10,
      },
    }

    const statsRes = await fetch('https://services.sentinel-hub.com/api/v1/statistics', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(statsPayload),
    })

    if (!statsRes.ok) {
      const errText = await statsRes.text()
      throw new Error(`Statistics API error ${statsRes.status}: ${errText}`)
    }

    const statsData = await statsRes.json()
    const intervals = statsData?.data ?? []

    if (intervals.length === 0) {
      return new Response(
        JSON.stringify({ pivot_id, pivot_name: pivot.name, historico: [], alertas: ['Sem imagens disponíveis no período'] }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Parse intervals
    interface NdviRegistro {
      data: string
      ndvi_medio: number | null
      ndvi_min: number | null
      ndvi_max: number | null
      nuvens_pct: number | null
    }

    const registros: NdviRegistro[] = intervals.map((interval: Record<string, unknown>) => {
      const to = (interval.interval as { to: string }).to.split('T')[0]
      const outputs = (interval.outputs as Record<string, unknown>) ?? {}
      const ndviOutput = (outputs.ndvi as Record<string, unknown>) ?? {}
      const bands = (ndviOutput.bands as Record<string, unknown>) ?? {}
      const b0 = (bands.B0 as Record<string, unknown>) ?? {}
      const stats = (b0.stats as Record<string, unknown>) ?? {}
      return {
        data: to,
        ndvi_medio: (stats.mean as number | null) ?? null,
        ndvi_min: (stats.min as number | null) ?? null,
        ndvi_max: (stats.max as number | null) ?? null,
        nuvens_pct: null,
      }
    }).filter((r: NdviRegistro) => r.ndvi_medio !== null && !isNaN(r.ndvi_medio as number))

    if (registros.length === 0) {
      return new Response(
        JSON.stringify({ pivot_id, pivot_name: pivot.name, historico: [], alertas: ['Nenhum pixel limpo encontrado (possível cobertura de nuvens)'] }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Most recent date for PNG
    const dataMaisRecente = registros[registros.length - 1].data

    // Process API — colored PNG
    let imagemUrl: string | null = null
    try {
      const processPayload = {
        input: {
          bounds: { geometry: polygonGeoJSON },
          data: [{
            type: 'sentinel-2-l2a',
            dataFilter: {
              timeRange: {
                from: `${dataMaisRecente}T00:00:00Z`,
                to: `${dataMaisRecente}T23:59:59Z`,
              },
              maxCloudCoverage: MAX_NUVENS,
            },
          }],
        },
        output: {
          width: IMG_SIZE,
          height: IMG_SIZE,
          responses: [{ identifier: 'default', format: { type: 'image/png' } }],
        },
        evalscript: EVALSCRIPT_IMG,
      }

      const imgRes = await fetch('https://services.sentinel-hub.com/api/v1/process', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(processPayload),
      })

      if (imgRes.ok) {
        const imgBuffer = await imgRes.arrayBuffer()
        const nomeArquivo = `${pivot_id}/${dataMaisRecente}.png`

        await supabaseAdmin.storage
          .from('campo-ndvi')
          .upload(nomeArquivo, imgBuffer, { contentType: 'image/png', upsert: true })

        const { data: urlData } = supabaseAdmin.storage
          .from('campo-ndvi')
          .getPublicUrl(nomeArquivo)

        imagemUrl = urlData.publicUrl
      }
    } catch (imgErr) {
      console.error('PNG generation failed (non-fatal):', imgErr)
    }

    // Upsert cache
    await supabaseAdmin.from('ndvi_cache').upsert(
      registros.map((r) => ({
        pivot_id,
        data_imagem: r.data,
        ndvi_medio: r.ndvi_medio,
        ndvi_min: r.ndvi_min,
        ndvi_max: r.ndvi_max,
        cobertura_nuvens_pct: r.nuvens_pct,
        imagem_url: r.data === dataMaisRecente ? imagemUrl : null,
        fonte: 'sentinel2',
      })),
      { onConflict: 'pivot_id,data_imagem' }
    )

    // Alertas
    const alertas: string[] = []
    if (registros.length >= 2) {
      const anterior = registros[registros.length - 2]
      const atual = registros[registros.length - 1]
      if (atual.ndvi_medio != null && anterior.ndvi_medio != null && anterior.ndvi_medio > 0) {
        const queda = (anterior.ndvi_medio - atual.ndvi_medio) / anterior.ndvi_medio
        if (queda >= 0.2) alertas.push(`Queda crítica de NDVI: ${Math.round(queda * 100)}%`)
        else if (queda >= 0.1) alertas.push(`Queda moderada de NDVI: ${Math.round(queda * 100)}%`)
      }
    }

    // Return full historico from DB
    const { data: historico } = await supabaseAdmin
      .from('ndvi_cache')
      .select('*')
      .eq('pivot_id', pivot_id)
      .order('data_imagem', { ascending: true })

    return new Response(
      JSON.stringify({ pivot_id, pivot_name: pivot.name, historico: historico ?? [], alertas }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('ndvi-fetch error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})

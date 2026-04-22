import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DiagnoseRequest {
  pivot_id: string
  season_id?: string | null
  sample_depth_cm: number
  soil_texture: string
  behavior_range: number          // Score 1-5 informado pelo agricultor
  photo_url?: string | null       // URL já gravada no Storage
  ai_analysis?: {                 // Resultado do Gemini (se foto enviada)
    estimated_behavior_range: number
    agrees_with_user_assessment: boolean
    confidence: number
    visible_color?: string
  } | null
  source: 'web' | 'whatsapp'
  diagnosed_by?: string           // user_id (opcional para WhatsApp)
  company_id: string
}

interface DiagnoseResponse {
  id: string
  percent_available: number       // % da CAD utilizada
  estimated_fc_percent: number    // % da CC estimada
  total_smd_mm: number            // déficit total em mm
  recommended_irrigation_mm: number
  management_status: 'critical' | 'below_threshold' | 'ok' | 'near_fc' | 'saturated'
  action: 'irrigate_now' | 'irrigate_soon' | 'wait' | 'no_action'
  next_check_date: string
  hours_estimated: number | null
  weather_context: string | null
  divergence: {
    modeled_percent: number | null
    difference_pct: number | null
    requires_action: boolean
  }
  ai_validation: {
    agrees: boolean
    confidence: number
    notes: string
  } | null
}

// ─── Constantes ───────────────────────────────────────────────────────────────

// % estimada da CC por score (1-5)
const FC_PERCENT_BY_SCORE: Record<number, number> = {
  1: 15,
  2: 35,
  3: 65,
  4: 85,
  5: 100,
}

// Pesos por profundidade padrão (usado para score único = profundidade única)
const DEFAULT_THRESHOLD = 70  // % CC alerta padrão

function scoreToFcPercent(score: number): number {
  // Interpolação linear entre valores inteiros
  const lo = Math.floor(score)
  const hi = Math.ceil(score)
  const frac = score - lo
  const loVal = FC_PERCENT_BY_SCORE[Math.max(1, lo)] ?? 15
  const hiVal = FC_PERCENT_BY_SCORE[Math.min(5, hi)] ?? 100
  return Math.round(loVal + (hiVal - loVal) * frac)
}

function getManagementStatus(fcPercent: number, threshold: number): DiagnoseResponse['management_status'] {
  if (fcPercent < 30) return 'critical'
  if (fcPercent < threshold) return 'below_threshold'
  if (fcPercent < 90) return 'ok'
  if (fcPercent < 100) return 'near_fc'
  return 'saturated'
}

function getAction(status: DiagnoseResponse['management_status']): DiagnoseResponse['action'] {
  if (status === 'critical') return 'irrigate_now'
  if (status === 'below_threshold') return 'irrigate_soon'
  if (status === 'saturated') return 'no_action'
  return 'wait'
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }

  try {
    const body: DiagnoseRequest = await req.json()
    const { pivot_id, season_id, soil_texture, behavior_range, photo_url, ai_analysis, source, company_id } = body

    if (!pivot_id || !company_id || !behavior_range) {
      return new Response(JSON.stringify({ error: 'pivot_id, company_id e behavior_range são obrigatórios' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── 1. Buscar dados do pivô ──────────────────────────────────────────────
    const { data: pivot, error: pivotErr } = await supabase
      .from('pivots')
      .select('id, name, alert_threshold_percent, field_capacity, wilting_point, bulk_density, f_factor, flow_rate_m3h, time_360_h, length_m')
      .eq('id', pivot_id)
      .single()

    if (pivotErr || !pivot) {
      return new Response(JSON.stringify({ error: 'Pivô não encontrado' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      })
    }

    // ── 2. Buscar último balanço hídrico do modelo (para calcular divergência) ─
    let modeledFcPercent: number | null = null
    if (season_id) {
      const { data: lastMgmt } = await supabase
        .from('daily_management')
        .select('field_capacity_percent')
        .eq('season_id', season_id)
        .order('date', { ascending: false })
        .limit(1)
        .single()
      modeledFcPercent = lastMgmt?.field_capacity_percent ?? null
    }

    // ── 3. Calcular % CC estimada a partir do score ──────────────────────────
    // Se IA forneceu análise e concorda, usa score médio ponderado; se discorda, flag divergência
    let effectiveScore = behavior_range
    if (ai_analysis && ai_analysis.confidence >= 60) {
      if (ai_analysis.agrees_with_user_assessment) {
        // Média ponderada: 70% agricultor, 30% IA
        effectiveScore = behavior_range * 0.7 + ai_analysis.estimated_behavior_range * 0.3
      }
      // Se discorda com alta confiança, mantém score do agricultor mas flag divergência
    }

    const estimated_fc_percent = scoreToFcPercent(effectiveScore)
    const threshold = pivot.alert_threshold_percent ?? DEFAULT_THRESHOLD

    // ── 4. Calcular déficit e recomendação ──────────────────────────────────
    const cc = pivot.field_capacity ?? null
    const pm = pivot.wilting_point ?? null
    const ds = pivot.bulk_density ?? null
    const depth = body.sample_depth_cm ?? 30

    let total_smd_mm = 0
    let recommended_irrigation_mm = 0
    let cta: number | null = null

    if (cc && pm && ds) {
      // CTA (Capacidade Total de Água) para a profundidade amostrada
      cta = ((cc - pm) / 100) * ds * depth * 10   // mm
      const currentWater = (estimated_fc_percent / 100) * cta
      const targetWater = (threshold / 100) * cta
      total_smd_mm = Math.max(0, Math.round((targetWater - currentWater) * 10) / 10)
      recommended_irrigation_mm = total_smd_mm > 0 ? total_smd_mm : 0
    } else {
      // Sem parâmetros de solo — estimativa simplificada
      total_smd_mm = Math.max(0, Math.round((threshold - estimated_fc_percent) * 0.3))
      recommended_irrigation_mm = total_smd_mm
    }

    const management_status = getManagementStatus(estimated_fc_percent, threshold)
    const action = getAction(management_status)
    const today = new Date().toISOString().slice(0, 10)

    // Estimar horas de pivô
    let hours_estimated: number | null = null
    if (recommended_irrigation_mm > 0 && pivot.flow_rate_m3h && pivot.time_360_h) {
      // Lâmina (mm) = Q (m³/h) × t (h) / Área (ha) × 0.1
      // Área ≈ π × R² onde R = pivot.length_m
      const radiusM = pivot.length_m ?? 400
      const areaHa = Math.PI * radiusM * radiusM / 10000
      const mmPerHour360 = (pivot.flow_rate_m3h * pivot.time_360_h) / (areaHa * 1000 / 100) / pivot.time_360_h
      hours_estimated = mmPerHour360 > 0 ? Math.round((recommended_irrigation_mm / mmPerHour360) * 10) / 10 : null
    }

    // Próxima verificação sugerida
    const next_check_date = action === 'wait'
      ? addDays(today, 2)
      : action === 'irrigate_soon'
        ? addDays(today, 1)
        : today

    // ── 5. Divergência modelo vs. diagnóstico ───────────────────────────────
    const difference_pct = modeledFcPercent != null
      ? Math.abs(estimated_fc_percent - modeledFcPercent)
      : null
    const requires_action = difference_pct != null && difference_pct > 20

    // ── 6. AI validation summary ─────────────────────────────────────────────
    let ai_validation = null
    if (ai_analysis) {
      ai_validation = {
        agrees: ai_analysis.agrees_with_user_assessment,
        confidence: ai_analysis.confidence,
        notes: ai_analysis.agrees_with_user_assessment
          ? `Foto confirma análise (IA ${ai_analysis.confidence}%).`
          : `Atenção: foto sugere comportamento diferente (faixa ${ai_analysis.estimated_behavior_range}).`,
      }
    }

    // ── 7. Contexto climático (Open-Meteo forecast D+1) ─────────────────────
    let weather_context: string | null = null
    try {
      const { data: pivotFull } = await supabase
        .from('pivots')
        .select('latitude, longitude')
        .eq('id', pivot_id)
        .single()

      if (pivotFull?.latitude && pivotFull?.longitude) {
        const tomorrow = addDays(today, 1)
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${pivotFull.latitude}&longitude=${pivotFull.longitude}&daily=precipitation_sum&timezone=America%2FSao_Paulo&start_date=${tomorrow}&end_date=${tomorrow}`
        const fr = await fetch(forecastUrl)
        if (fr.ok) {
          const fd = await fr.json()
          const rain = fd.daily?.precipitation_sum?.[0] ?? 0
          if (rain >= 5) {
            weather_context = `☔ Previsão de ${rain.toFixed(1)}mm amanhã — considere aguardar.`
          }
        }
      }
    } catch (_) {
      // Silently fail — weather context is optional
    }

    // ── 8. Gravar no banco ───────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    let diagnosed_by = body.diagnosed_by ?? null
    if (!diagnosed_by && authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      diagnosed_by = user?.id ?? null
    }

    const { data: record, error: insertErr } = await supabase
      .from('soil_manual_diagnosis')
      .insert({
        company_id,
        pivot_id,
        season_id: season_id ?? null,
        diagnosed_by,
        depth_0_20_score: behavior_range,    // Para diagnóstico WhatsApp: profundidade única → score 0-20
        depth_20_40_score: behavior_range,
        depth_40_60_score: behavior_range,
        weighted_score: effectiveScore,
        result: management_status === 'critical' ? 'critico'
              : management_status === 'below_threshold' ? 'atencao'
              : management_status === 'saturated' ? 'excessivo'
              : 'adequado',
        estimated_fc_percent,
        notes: ai_analysis
          ? `Diagnóstico via ${source} — Score: ${behavior_range}/5 — IA: ${ai_analysis.confidence}% confiança`
          : `Diagnóstico via ${source} — Score: ${behavior_range}/5`,
        photo_url: photo_url ?? null,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('Insert error:', insertErr)
      return new Response(JSON.stringify({ error: 'Erro ao gravar diagnóstico' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      })
    }

    const response: DiagnoseResponse = {
      id: record.id,
      percent_available: estimated_fc_percent,
      estimated_fc_percent,
      total_smd_mm,
      recommended_irrigation_mm,
      management_status,
      action,
      next_check_date,
      hours_estimated,
      weather_context,
      divergence: {
        modeled_percent: modeledFcPercent,
        difference_pct,
        requires_action,
      },
      ai_validation,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (error) {
    console.error('diagnose-soil error:', error)
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})

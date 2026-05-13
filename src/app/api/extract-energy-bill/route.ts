import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const maxDuration = 60 // Vercel Pro: até 300s; Hobby ignora (10s padrão)
export const dynamic = 'force-dynamic'

// ─── Zod-like validation (sem dependência extra) ──────────────

interface ExtractedBill {
  reference_month: string | null
  kwh_total: number | null
  cost_total_brl: number | null
  kwh_reserved: number | null
  cost_reserved_brl: number | null
  kwh_peak: number | null
  cost_peak_brl: number | null
  kwh_offpeak: number | null
  cost_offpeak_brl: number | null
  reactive_kvarh: number | null
  cost_reactive_brl: number | null
  contracted_demand_kw: number | null
  measured_demand_kw: number | null
  demand_exceeded_brl: number | null
  power_factor: number | null
}

function validateBill(raw: unknown): ExtractedBill {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Resposta da LLM não é um objeto JSON válido')
  }
  const obj = raw as Record<string, unknown>

  function num(key: string): number | null {
    const v = obj[key]
    if (v === null || v === undefined) return null
    const n = Number(v)
    return isNaN(n) ? null : n
  }
  function str(key: string): string | null {
    const v = obj[key]
    if (v === null || v === undefined) return null
    return String(v)
  }

  const bill: ExtractedBill = {
    reference_month:      str('reference_month'),
    kwh_total:            num('kwh_total'),
    cost_total_brl:       num('cost_total_brl'),
    kwh_reserved:         num('kwh_reserved'),
    cost_reserved_brl:    num('cost_reserved_brl'),
    kwh_peak:             num('kwh_peak'),
    cost_peak_brl:        num('cost_peak_brl'),
    kwh_offpeak:          num('kwh_offpeak'),
    cost_offpeak_brl:     num('cost_offpeak_brl'),
    reactive_kvarh:       num('reactive_kvarh'),
    cost_reactive_brl:    num('cost_reactive_brl'),
    contracted_demand_kw: num('contracted_demand_kw'),
    measured_demand_kw:   num('measured_demand_kw'),
    demand_exceeded_brl:  num('demand_exceeded_brl'),
    power_factor:         num('power_factor'),
  }

  // Campo crítico: precisa ao menos do mês de referência e custo total
  if (!bill.reference_month || !bill.cost_total_brl) {
    throw new Error('Campos críticos ausentes: reference_month ou cost_total_brl')
  }

  return bill
}

// ─── KPIs calculados ──────────────────────────────────────────

function calcKPIs(bill: ExtractedBill) {
  const reactivePct = bill.kwh_total && bill.reactive_kvarh
    ? (bill.reactive_kvarh / bill.kwh_total) * 100
    : null

  const reservedPct = bill.kwh_total && bill.kwh_reserved
    ? (bill.kwh_reserved / bill.kwh_total) * 100
    : null

  const peakCost = bill.cost_peak_brl ?? null

  // Semáforo reativa: meta <2%
  const reactiveStatus = reactivePct === null ? 'unknown'
    : reactivePct <= 2 ? 'green'
    : reactivePct <= 5 ? 'yellow'
    : 'red'

  // Semáforo reservado: meta >50%
  const reservedStatus = reservedPct === null ? 'unknown'
    : reservedPct >= 50 ? 'green'
    : reservedPct >= 30 ? 'yellow'
    : 'red'

  return { reactivePct, reservedPct, peakCost, reactiveStatus, reservedStatus }
}

// ─── Handler principal ────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const farmId = formData.get('farm_id') as string | null
    const irrigatedMmHa = formData.get('irrigated_mm_ha')
      ? Number(formData.get('irrigated_mm_ha'))
      : null

    if (!file) {
      return NextResponse.json({ error: 'Campo file obrigatório' }, { status: 400 })
    }
    if (!farmId) {
      return NextResponse.json({ error: 'Campo farm_id obrigatório' }, { status: 400 })
    }

    // ── Validar autenticação e ownership da fazenda ──
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Verificar que fazenda pertence à empresa do usuário
    const { data: membership } = await authClient
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)

    const companyIds = ((membership ?? []) as Array<{ company_id: string }>).map(m => m.company_id)
    if (companyIds.length === 0) {
      return NextResponse.json({ error: 'Usuário sem empresa vinculada' }, { status: 403 })
    }

    const { data: farmCheck } = await authClient
      .from('farms')
      .select('id')
      .eq('id', farmId)
      .in('company_id', companyIds)
      .maybeSingle()

    if (!farmCheck) {
      return NextResponse.json({ error: 'Fazenda não pertence à sua empresa' }, { status: 403 })
    }

    const mimeType = file.type || 'image/jpeg'
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // ── Delegar extração à Edge Function Supabase (sem limite de 10s) ──
    const supabaseUrlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKeyEnv = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const edgeRes = await fetch(`${supabaseUrlEnv}/functions/v1/process-energy-bill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKeyEnv}`,
      },
      body: JSON.stringify({
        image_base64: base64,
        image_mime_type: mimeType,
        farm_id: farmId,
      }),
    })

    if (!edgeRes.ok) {
      const errText = await edgeRes.text()
      return NextResponse.json({ error: `Edge Function erro ${edgeRes.status}: ${errText.slice(0, 200)}` }, { status: 502 })
    }

    const edgeData = await edgeRes.json() as { success: boolean; bill?: Record<string, unknown>; error?: string; duplicate?: boolean; confirmation_message?: string }

    if (edgeData.duplicate) {
      return NextResponse.json({ error: edgeData.confirmation_message ?? 'Fatura duplicada' }, { status: 409 })
    }
    if (!edgeData.success || !edgeData.bill) {
      return NextResponse.json({ error: edgeData.error ?? 'Extração falhou' }, { status: 422 })
    }

    const rawBill = edgeData.bill
    let bill: ExtractedBill
    try {
      bill = validateBill(rawBill)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Campos críticos ausentes' }, { status: 422 })
    }
    const llmUsed = 'gemini'

    // ── KPIs ──
    const kpis = calcKPIs(bill)

    // ── Custo/mm/ha — atualizar registro já salvo pela edge ──
    let costPerMmHa: number | null = null
    if (irrigatedMmHa && irrigatedMmHa > 0 && bill.cost_total_brl) {
      costPerMmHa = bill.cost_total_brl / irrigatedMmHa
      const supabase = createClient(supabaseUrlEnv, serviceRoleKeyEnv)
      await supabase
        .from('energy_bills')
        .update({ cost_per_mm_ha: costPerMmHa, source: 'upload' })
        .eq('farm_id', farmId)
        .eq('reference_month', bill.reference_month!)
    }

    return NextResponse.json({
      success: true,
      bill: { ...rawBill, cost_per_mm_ha: costPerMmHa },
      kpis: { ...kpis, costPerMmHa },
      llmUsed,
    })
  } catch (err) {
    console.error('[extract-energy-bill] Erro inesperado:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 }
    )
  }
}

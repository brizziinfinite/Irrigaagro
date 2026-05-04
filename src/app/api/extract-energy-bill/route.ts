import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

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

// ─── Prompt de extração ───────────────────────────────────────

const EXTRACTION_PROMPT = `Você é um extrator especializado em contas de energia elétrica brasileiras (distribuidoras como Energisa, CPFL, Enel, Neoenergia, Cemig, COPEL, etc.).

Analise o documento fornecido e extraia os seguintes campos. Retorne SOMENTE um JSON válido, sem markdown, sem comentários, sem explicações.

{
  "reference_month": "YYYY-MM",
  "kwh_total": number,
  "cost_total_brl": number,
  "kwh_reserved": number,
  "cost_reserved_brl": number,
  "kwh_peak": number,
  "cost_peak_brl": number,
  "kwh_offpeak": number,
  "cost_offpeak_brl": number,
  "reactive_kvarh": number,
  "cost_reactive_brl": number,
  "contracted_demand_kw": number,
  "measured_demand_kw": number,
  "demand_exceeded_brl": number,
  "power_factor": number
}

Regras:
- reference_month: mês de competência no formato YYYY-MM (ex: "2025-11")
- kwh_total: consumo total em kWh (soma de todos os postos tarifários)
- cost_total_brl: valor total da fatura em R$ (sem impostos separados, o total a pagar)
- kwh_reserved / cost_reserved_brl: consumo e custo no horário reservado (HR ou fora-de-ponta subvencionado)
- kwh_peak / cost_peak_brl: consumo e custo no horário de ponta (HP)
- kwh_offpeak / cost_offpeak_brl: consumo e custo no horário fora-de-ponta (HFP), se separado do reservado
- reactive_kvarh: energia reativa excedente em kVArh
- cost_reactive_brl: custo da energia reativa em R$
- contracted_demand_kw: demanda contratada em kW
- measured_demand_kw: demanda medida/faturada em kW
- demand_exceeded_brl: custo de ultrapassagem de demanda em R$ (0 se não houver)
- power_factor: fator de potência (entre 0 e 1, ex: 0.92)
- Se um campo não existir na conta, use null.`

// ─── Gemini ───────────────────────────────────────────────────

async function callGemini(fileBase64: string, mimeType: string): Promise<ExtractedBill> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada')

  const body = {
    contents: [{
      parts: [
        { text: EXTRACTION_PROMPT },
        { inline_data: { mime_type: mimeType, data: fileBase64 } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024,
    },
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini HTTP ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // Limpar possível markdown
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const parsed = JSON.parse(cleaned) as unknown
  return validateBill(parsed)
}

// ─── GPT-5 Mini (OpenAI) ──────────────────────────────────────

async function callOpenAI(fileBase64: string, mimeType: string): Promise<ExtractedBill> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada')

  const isImage = mimeType.startsWith('image/')
  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: EXTRACTION_PROMPT },
  ]

  if (isImage) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${fileBase64}` },
    })
  } else {
    // PDF: enviar como texto — tentar decodificar ou indicar que é PDF
    contentParts.push({
      type: 'text',
      text: `[Arquivo PDF em base64 — analise o conteúdo da conta de energia]`,
    })
  }

  const body = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: contentParts }],
    temperature: 0,
    max_tokens: 1024,
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI HTTP ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content ?? ''
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  const parsed = JSON.parse(cleaned) as unknown
  return validateBill(parsed)
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

    // ── Tentar Gemini, fallback OpenAI ──
    let bill: ExtractedBill
    let llmUsed = 'gemini'
    let geminiError: string | null = null

    try {
      bill = await callGemini(base64, mimeType)
    } catch (err) {
      geminiError = err instanceof Error ? err.message : String(err)
      console.warn('[extract-energy-bill] Gemini falhou, tentando OpenAI:', geminiError)
      try {
        bill = await callOpenAI(base64, mimeType)
        llmUsed = 'openai'
      } catch (err2) {
        const openaiError = err2 instanceof Error ? err2.message : String(err2)
        return NextResponse.json(
          { error: 'Ambas as LLMs falharam', gemini: geminiError, openai: openaiError },
          { status: 502 }
        )
      }
    }

    // ── KPIs ──
    const kpis = calcKPIs(bill)

    // ── Custo/mm/ha ──
    let costPerMmHa: number | null = null
    if (irrigatedMmHa && irrigatedMmHa > 0 && bill.cost_total_brl) {
      costPerMmHa = bill.cost_total_brl / irrigatedMmHa
    }

    // ── Salvar no Supabase via service_role ──
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: saved, error: dbError } = await supabase
      .from('energy_bills')
      .upsert({
        farm_id:              farmId,
        reference_month:      bill.reference_month!,
        kwh_total:            bill.kwh_total,
        cost_total_brl:       bill.cost_total_brl,
        kwh_reserved:         bill.kwh_reserved,
        cost_reserved_brl:    bill.cost_reserved_brl,
        kwh_peak:             bill.kwh_peak,
        cost_peak_brl:        bill.cost_peak_brl,
        kwh_offpeak:          bill.kwh_offpeak,
        cost_offpeak_brl:     bill.cost_offpeak_brl,
        reactive_kvarh:       bill.reactive_kvarh,
        cost_reactive_brl:    bill.cost_reactive_brl,
        contracted_demand_kw: bill.contracted_demand_kw,
        measured_demand_kw:   bill.measured_demand_kw,
        demand_exceeded_brl:  bill.demand_exceeded_brl,
        power_factor:         bill.power_factor,
        cost_per_mm_ha:       costPerMmHa,
        source:               'upload',
        raw_text:             `llm:${llmUsed}`,
      }, { onConflict: 'farm_id,reference_month' })
      .select()
      .single()

    if (dbError) {
      console.error('[extract-energy-bill] DB error:', dbError)
      // Retornar dados extraídos mesmo sem salvar
      return NextResponse.json({
        success: false,
        bill,
        kpis,
        costPerMmHa,
        llmUsed,
        dbError: dbError.message,
      }, { status: 207 })
    }

    return NextResponse.json({
      success: true,
      bill: saved,
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

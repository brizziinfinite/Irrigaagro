import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

serve(async (req) => {
  try {
    const { image_base64, image_mime_type, contact_id, farm_id, company_id } = await req.json()

    if (!image_base64) {
      return new Response(JSON.stringify({ success: false, error: 'image_base64 obrigatório' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }
    if (!farm_id) {
      return new Response(JSON.stringify({ success: false, error: 'farm_id obrigatório' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Chamar Gemini para extrair dados da fatura
    const prompt = `Analise esta fatura de energia elétrica e extraia os dados em JSON.
Retorne APENAS o JSON, sem explicações, sem markdown.
{
  "reference_month": "YYYY-MM",
  "kwh_total": número ou null,
  "cost_total_brl": número ou null,
  "kwh_reserved": número ou null,
  "cost_reserved_brl": número ou null,
  "kwh_peak": número ou null,
  "cost_peak_brl": número ou null,
  "kwh_offpeak": número ou null,
  "cost_offpeak_brl": número ou null,
  "reactive_kvarh": número ou null,
  "cost_reactive_brl": número ou null,
  "reactive_percent": número ou null,
  "contracted_demand_kw": número ou null,
  "measured_demand_kw": número ou null,
  "demand_exceeded_brl": número ou null,
  "power_factor": número ou null
}`

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: image_mime_type || 'image/jpeg', data: image_base64 } }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 1024 }
        })
      }
    )

    if (!geminiResp.ok) {
      const err = await geminiResp.text()
      return new Response(JSON.stringify({ success: false, error: `Gemini error: ${err}` }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    const geminiData = await geminiResp.json()
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ success: false, error: 'Não foi possível extrair dados da fatura' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const extracted = JSON.parse(jsonMatch[0])

    // Verificar duplicata: mesma fazenda + mesmo mês
    if (extracted.reference_month) {
      const { data: existing } = await supabase
        .from('energy_bills')
        .select('id')
        .eq('farm_id', farm_id)
        .eq('reference_month', extracted.reference_month)
        .limit(1)
        .single()

      if (existing) {
        return new Response(JSON.stringify({
          success: false,
          duplicate: true,
          confirmation_message:
            `⚠️ *Fatura duplicada*\n\nJá existe uma fatura registrada para *${extracted.reference_month}*.\n\nAcesse o app para corrigir: https://irrigaagro.com.br`,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    }

    // Salvar
    const { data: bill, error: billError } = await supabase
      .from('energy_bills')
      .upsert({
        farm_id,
        reference_month:      extracted.reference_month,
        kwh_total:            extracted.kwh_total,
        cost_total_brl:       extracted.cost_total_brl,
        kwh_reserved:         extracted.kwh_reserved,
        cost_reserved_brl:    extracted.cost_reserved_brl,
        kwh_peak:             extracted.kwh_peak,
        cost_peak_brl:        extracted.cost_peak_brl,
        kwh_offpeak:          extracted.kwh_offpeak,
        cost_offpeak_brl:     extracted.cost_offpeak_brl,
        reactive_kvarh:       extracted.reactive_kvarh,
        cost_reactive_brl:    extracted.cost_reactive_brl,
        reactive_percent:     extracted.reactive_percent,
        contracted_demand_kw: extracted.contracted_demand_kw,
        measured_demand_kw:   extracted.measured_demand_kw,
        demand_exceeded_brl:  extracted.demand_exceeded_brl,
        power_factor:         extracted.power_factor,
        source:               'whatsapp',
        raw_text:             `llm:gemini`,
      }, { onConflict: 'farm_id,reference_month' })
      .select()
      .single()

    if (billError) {
      console.error('DB error:', billError)
      return new Response(JSON.stringify({ success: false, error: billError.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    const month = extracted.reference_month || '?'
    const kwh = extracted.kwh_total ? `${extracted.kwh_total} kWh` : '? kWh'
    const amount = extracted.cost_total_brl
      ? `R$ ${Number(extracted.cost_total_brl).toFixed(2).replace('.', ',')}`
      : 'R$ ?'
    const reactive = extracted.reactive_percent
      ? `\n⚡ Reativa: ${Number(extracted.reactive_percent).toFixed(1)}%`
      : ''
    const reserved = extracted.kwh_reserved && extracted.kwh_total
      ? `\n🕐 Reservado: ${((extracted.kwh_reserved / extracted.kwh_total) * 100).toFixed(0)}%`
      : ''

    const confirmation_message =
      `✅ *Fatura salva com sucesso!*\n\n` +
      `📅 Referência: ${month}\n` +
      `⚡ Consumo: ${kwh}\n` +
      `💰 Valor: ${amount}` +
      reactive + reserved +
      `\n\nVeja a análise completa em: https://irrigaagro.com.br/relatorios`

    return new Response(JSON.stringify({ success: true, confirmation_message, bill }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('process-energy-bill error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})

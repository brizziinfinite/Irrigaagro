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

    // Detectar PDF pelos magic bytes (%PDF) caso mimeType venha errado
    const isPdf = image_mime_type?.includes('pdf') ||
      atob(image_base64.slice(0, 8)).startsWith('%PDF')
    const effectiveMime = isPdf ? 'application/pdf'
      : (image_mime_type && !['application/octet-stream', 'audio/ogg'].includes(image_mime_type))
        ? image_mime_type
        : 'image/jpeg'

    console.log('process-energy-bill: mime_orig=', image_mime_type, 'effective=', effectiveMime, 'base64_len=', image_base64.length)

    const prompt = 'Analise esta fatura de energia elétrica brasileira. Extraia os campos e retorne JSON.'

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: effectiveMime, data: image_base64 } }
            ]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                reference_month:      { type: 'string' },
                kwh_total:            { type: 'number' },
                cost_total_brl:       { type: 'number' },
                kwh_reserved:         { type: 'number' },
                cost_reserved_brl:    { type: 'number' },
                kwh_peak:             { type: 'number' },
                cost_peak_brl:        { type: 'number' },
                kwh_offpeak:          { type: 'number' },
                cost_offpeak_brl:     { type: 'number' },
                reactive_kvarh:       { type: 'number' },
                cost_reactive_brl:    { type: 'number' },
                reactive_percent:     { type: 'number' },
                contracted_demand_kw: { type: 'number' },
                measured_demand_kw:   { type: 'number' },
                demand_exceeded_brl:  { type: 'number' },
                power_factor:         { type: 'number' }
              }
            }
          }
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

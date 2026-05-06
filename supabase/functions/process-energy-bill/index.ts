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

    // Detectar PDF pelo mimeType ou pelos magic bytes (%PDF)
    let isPdf = image_mime_type?.includes('pdf') ?? false
    if (!isPdf) {
      try {
        const header = atob(image_base64.slice(0, 8))
        if (header.startsWith('%PDF')) isPdf = true
      } catch (_) { /* ignora erro de decodificação */ }
    }
    const effectiveMime = isPdf ? 'application/pdf'
      : (image_mime_type && !['application/octet-stream', 'audio/ogg'].includes(image_mime_type))
        ? image_mime_type
        : 'image/jpeg'

    console.log('process-energy-bill: mime_orig=', image_mime_type, 'effective=', effectiveMime, 'base64_len=', image_base64.length)

    const prompt = `Analise esta fatura de energia elétrica brasileira e extraia os campos abaixo.

Regras importantes:
- reference_month: formato YYYY-MM (ex: "2026-03" para março/2026)
- kwh_total: consumo total em kWh (soma de todos os postos)
- cost_total_brl: TOTAL A PAGAR (valor final da fatura em R$)
- kwh_peak: consumo em kWh no horário de PONTA (HP) — linha "TUSD em kWh - Ponta" ou similar
- cost_peak_brl: custo total no horário de PONTA (somar TUSD+TE da ponta se separados)
- kwh_offpeak: consumo em kWh FORA DE PONTA (HFP) — linha "TUSD em kWh - Fora Ponta" ou similar
- cost_offpeak_brl: custo total FORA DE PONTA (somar TUSD+TE fora ponta se separados)
- kwh_reserved: consumo em kWh no horário RESERVADO (HR) — se não existir use 0
- cost_reserved_brl: custo no horário RESERVADO — se não existir use 0
- reactive_kvarh: energia reativa excedente em kVArh
- cost_reactive_brl: custo da energia reativa em R$
- contracted_demand_kw: demanda contratada em kW
- measured_demand_kw: demanda medida/faturada em kW
- demand_exceeded_brl: custo de ultrapassagem de demanda (0 se não houver)
- power_factor: fator de potência (0 a 1)`

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
    console.log('gemini rawText len=', rawText.length, 'finish=', geminiData.candidates?.[0]?.finishReason)

    let extracted: Record<string, unknown>
    try {
      // responseMimeType=application/json → texto já é JSON direto
      const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
      extracted = JSON.parse(cleaned)
    } catch (_) {
      // fallback: extrair primeiro bloco JSON
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return new Response(JSON.stringify({ success: false, error: `Não foi possível extrair dados da fatura. rawText: ${rawText.slice(0,200)}` }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      extracted = JSON.parse(jsonMatch[0])
    }

    // Normalizar reference_month para YYYY-MM
    if (extracted.reference_month && typeof extracted.reference_month === 'string') {
      const raw = extracted.reference_month as string
      // Já está em YYYY-MM
      if (!/^\d{4}-\d{2}$/.test(raw)) {
        const months: Record<string, string> = {
          janeiro:'01', fevereiro:'02', março:'03', marco:'03', abril:'04', maio:'05', junho:'06',
          julho:'07', agosto:'08', setembro:'09', outubro:'10', novembro:'11', dezembro:'12',
          jan:'01', fev:'02', mar:'03', abr:'04', mai:'05', jun:'06',
          jul:'07', ago:'08', set:'09', out:'10', nov:'11', dez:'12'
        }
        const lower = raw.toLowerCase()
        const yearMatch = raw.match(/\d{4}/)
        const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString()
        const monthKey = Object.keys(months).find(k => lower.includes(k))
        if (year && monthKey) {
          extracted.reference_month = `${year}-${months[monthKey]}`
        }
      }
    }

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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

serve(async (req) => {
  try {
    const { image_base64, image_mime_type, contact_id, pivot_id, company_id, phone } = await req.json()

    if (!image_base64) {
      return new Response(JSON.stringify({ success: false, error: 'image_base64 obrigatório' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Se não tiver contact_id, buscar pelo phone
    let resolvedContactId = contact_id
    let resolvedCompanyId = company_id
    let resolvedPivotId = pivot_id

    if (!resolvedContactId && phone) {
      const { data: contact } = await supabase
        .from('whatsapp_contacts')
        .select('id, company_id')
        .eq('phone', phone)
        .eq('is_active', true)
        .single()

      if (contact) {
        resolvedContactId = contact.id
        resolvedCompanyId = contact.company_id
      }
    }

    // Se não tiver pivot_id, pegar o primeiro pivô da empresa
    if (!resolvedPivotId && resolvedCompanyId) {
      const { data: subs } = await supabase
        .from('whatsapp_pivot_subscriptions')
        .select('pivot_id')
        .eq('contact_id', resolvedContactId)
        .limit(1)
        .single()

      resolvedPivotId = subs?.pivot_id ?? null
    }

    // Chamar Gemini para extrair dados da fatura
    const prompt = `Analise esta fatura de energia elétrica e extraia as seguintes informações em JSON:
{
  "reference_month": "YYYY-MM (mês de referência da fatura)",
  "total_kwh": número (consumo total em kWh),
  "total_amount": número (valor total em reais, sem R$),
  "demand_kw": número ou null (demanda contratada/medida em kW se houver),
  "reactive_charge": número ou null (cobrança de reativos se houver),
  "reading_date": "YYYY-MM-DD ou null"
}
Responda APENAS com o JSON, sem explicações.`

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: image_mime_type || 'image/jpeg',
                  data: image_base64,
                }
              }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 }
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

    // Extrair JSON da resposta
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ success: false, error: 'Não foi possível extrair dados da fatura' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const extracted = JSON.parse(jsonMatch[0])

    // Verificar duplicata: mesmo pivot + mesmo mês de referência já confirmado
    if (extracted.reference_month && resolvedPivotId) {
      const { data: existing } = await supabase
        .from('energy_bills')
        .select('id, reference_month')
        .eq('pivot_id', resolvedPivotId)
        .eq('reference_month', extracted.reference_month)
        .limit(1)
        .single()

      if (existing) {
        const confirmation_message =
          `⚠️ *Fatura duplicada*\n\n` +
          `Já existe uma fatura registrada para *${extracted.reference_month}*.\n\n` +
          `Se precisar corrigir, acesse o app: https://irrigaagro.com.br`

        return new Response(JSON.stringify({ success: false, confirmation_message, duplicate: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Salvar no banco como não confirmado
    const { data: bill, error: billError } = await supabase
      .from('energy_bills')
      .insert({
        company_id: resolvedCompanyId,
        pivot_id: resolvedPivotId,
        reference_month: extracted.reference_month,
        total_kwh: extracted.total_kwh,
        total_amount: extracted.total_amount,
        demand_kw: extracted.demand_kw,
        reactive_charge: extracted.reactive_charge,
        reading_date: extracted.reading_date,
        source: 'whatsapp',
        confirmed: false,
      })
      .select()
      .single()

    if (billError) {
      console.error('DB error:', billError)
      return new Response(JSON.stringify({ success: false, error: billError.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    const month = extracted.reference_month || 'desconhecido'
    const kwh = extracted.total_kwh ? `${extracted.total_kwh} kWh` : '? kWh'
    const amount = extracted.total_amount
      ? `R$ ${extracted.total_amount.toFixed(2).replace('.', ',')}`
      : 'R$ ?'

    const confirmation_message =
      `✅ *Fatura lida com sucesso!*\n\n` +
      `📅 Referência: ${month}\n` +
      `⚡ Consumo: ${kwh}\n` +
      `💰 Valor: ${amount}\n\n` +
      `Responda *SIM* para confirmar e salvar, ou *NÃO* para descartar.`

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

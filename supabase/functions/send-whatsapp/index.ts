import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE')

serve(async (req) => {
  try {
    const { phone, message, contact_id, pivot_id, message_type = 'manual' } = await req.json()

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: 'phone e message são obrigatórios' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const evoResponse = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY!,
        },
        body: JSON.stringify({ number: phone, text: message }),
      }
    )

    const evoData = await evoResponse.json()
    const status = evoResponse.ok ? 'sent' : 'failed'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('whatsapp_messages_log').insert({
      contact_id: contact_id ?? null,
      pivot_id: pivot_id ?? null,
      direction: 'outbound',
      message_type,
      content: message,
      raw_payload: evoData,
      status,
      error_message: status === 'failed' ? JSON.stringify(evoData) : null,
    })

    return new Response(JSON.stringify({ success: status === 'sent', data: evoData }), {
      status: evoResponse.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

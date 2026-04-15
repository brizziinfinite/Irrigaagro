import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    // Autenticar usuário
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { phone, message } = await req.json()
    if (!phone || !message) {
      return NextResponse.json({ error: 'phone e message são obrigatórios' }, { status: 400 })
    }

    // Verificar que o contato pertence à empresa do usuário
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('id,phone,contact_name')
      .eq('phone', phone)
      .maybeSingle()

    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado ou sem permissão' }, { status: 403 })
    }

    // Chamar a edge function send-whatsapp
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const resp = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        phone,
        message,
        contact_id: contact.id,
        message_type: 'schedule',
      }),
    })

    const data = await resp.json()
    return NextResponse.json(data, { status: resp.ok ? 200 : 500 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

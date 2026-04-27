import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { render } from '@react-email/components'
import ActivationEmail from '@/emails/ActivationEmail'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { email, companyName } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.warn('[notify-activation] RESEND_API_KEY não configurada')
    return NextResponse.json({ ok: true, skipped: true })
  }

  const html = await render(<ActivationEmail companyName={companyName} />)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'IrrigaAgro <noreply@irrigaagro.com.br>',
      to: [email],
      subject: 'Seu acesso ao IrrigaAgro foi liberado!',
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[notify-activation] Resend error:', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

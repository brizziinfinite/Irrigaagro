import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/components'
import NewSignupEmail from '@/emails/NewSignupEmail'

// Chamada pelo trigger Supabase via webhook após novo cadastro
export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET
  const authHeader = req.headers.get('authorization')

  if (!secret) {
    console.error('[notify-new-signup] WEBHOOK_SECRET não configurado — endpoint bloqueado')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { email, companyName, userId } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const resendKey = process.env.RESEND_API_KEY
  const notifyEmail = process.env.ADMIN_NOTIFY_EMAIL ?? 'fazbrizzi@gmail.com'

  if (!resendKey) {
    console.warn('[notify-new-signup] RESEND_API_KEY não configurada')
    return NextResponse.json({ ok: true, skipped: true })
  }

  const signupAt = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })

  const html = await render(
    <NewSignupEmail
      email={email}
      companyName={companyName}
      userId={userId}
      signupAt={signupAt}
      adminUrl="https://www.irrigaagro.com.br/admin"
    />
  )

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'IrrigaAgro <noreply@irrigaagro.com.br>',
      to: [notifyEmail],
      subject: `Novo cadastro aguardando aprovação: ${companyName ?? email}`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[notify-new-signup] Resend error:', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

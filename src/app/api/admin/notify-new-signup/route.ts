import { NextRequest, NextResponse } from 'next/server'

// Esta rota é chamada pelo trigger Supabase via webhook (ou pelo handle_new_user)
// Protegida por WEBHOOK_SECRET
export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET
  const authHeader = req.headers.get('authorization')

  if (secret && authHeader !== `Bearer ${secret}`) {
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

  const adminUrl = `https://gotejo.com.br/admin`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'IrrigaAgro <noreply@gotejo.com.br>',
      to: [notifyEmail],
      subject: `Novo cadastro: ${companyName ?? email}`,
      html: buildAdminNotificationEmail(email, companyName, userId, adminUrl),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[notify-new-signup] Resend error:', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

function buildAdminNotificationEmail(
  email: string,
  companyName: string | undefined,
  userId: string | undefined,
  adminUrl: string
) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d1520;font-family:system-ui,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#0f1923;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">

    <div style="padding:32px 36px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:22px;font-weight:800;color:#0093D0;">Irriga</span><span style="font-size:22px;font-weight:300;color:#22c55e;">Agro</span>
      <span style="font-size:13px;color:#8899aa;margin-left:12px;">Painel Admin</span>
    </div>

    <div style="padding:32px 36px;">
      <h1 style="font-size:18px;font-weight:700;color:#e2e8f0;margin:0 0 20px;">
        Novo cliente aguardando aprovação
      </h1>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#556677;width:120px;">E-mail</td>
          <td style="padding:8px 0;font-size:13px;color:#e2e8f0;">${email}</td>
        </tr>
        ${companyName ? `
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#556677;">Empresa</td>
          <td style="padding:8px 0;font-size:13px;color:#e2e8f0;">${companyName}</td>
        </tr>` : ''}
        ${userId ? `
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#556677;">User ID</td>
          <td style="padding:8px 0;font-size:11px;color:#556677;font-family:monospace;">${userId}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#556677;">Cadastro</td>
          <td style="padding:8px 0;font-size:13px;color:#e2e8f0;">${new Date().toLocaleString('pt-BR')}</td>
        </tr>
      </table>

      <a
        href="${adminUrl}"
        style="display:inline-block;padding:12px 24px;background:#0093D0;color:#fff;font-weight:600;font-size:14px;border-radius:8px;text-decoration:none;"
      >
        Ir para o painel de administração
      </a>
    </div>

    <div style="padding:20px 36px;border-top:1px solid rgba(255,255,255,0.06);">
      <p style="font-size:12px;color:#334455;margin:0;">
        IrrigaAgro · gotejo.com.br
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

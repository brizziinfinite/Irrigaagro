import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/super-admin'

export async function POST(req: NextRequest) {
  // Autenticar — apenas super-admin pode disparar
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'IrrigaAgro <noreply@gotejo.com.br>',
      to: [email],
      subject: 'Seu acesso ao IrrigaAgro foi liberado!',
      html: buildActivationEmail(companyName ?? 'sua empresa'),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[notify-activation] Resend error:', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

function buildActivationEmail(companyName: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d1520;font-family:system-ui,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#0f1923;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">

    <!-- Header -->
    <div style="padding:32px 36px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:22px;font-weight:800;color:#0093D0;letter-spacing:-0.5px;">Irriga</span><span style="font-size:22px;font-weight:300;color:#22c55e;letter-spacing:-0.5px;">Agro</span>
    </div>

    <!-- Body -->
    <div style="padding:32px 36px;">
      <div style="width:56px;height:56px;border-radius:50%;background:rgba(34,197,94,0.12);border:2px solid rgba(34,197,94,0.3);display:flex;align-items:center;justify-content:center;margin-bottom:24px;">
        <span style="font-size:24px;">✓</span>
      </div>

      <h1 style="font-size:20px;font-weight:700;color:#e2e8f0;margin:0 0 12px;">
        Acesso liberado!
      </h1>

      <p style="font-size:14px;color:#8899aa;line-height:1.7;margin:0 0 16px;">
        Olá! Seu acesso ao IrrigaAgro para <strong style="color:#e2e8f0;">${companyName}</strong> foi aprovado.
        A partir de agora você pode entrar normalmente na plataforma.
      </p>

      <a
        href="https://gotejo.com.br/login"
        style="display:inline-block;padding:12px 24px;background:#0093D0;color:#fff;font-weight:600;font-size:14px;border-radius:8px;text-decoration:none;margin-top:8px;"
      >
        Acessar plataforma
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:20px 36px;border-top:1px solid rgba(255,255,255,0.06);">
      <p style="font-size:12px;color:#334455;margin:0;">
        IrrigaAgro · Gestão inteligente de irrigação · gotejo.com.br
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/super-admin'

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
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acesso liberado — IrrigaAgro</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo / Header -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#0f1923;border-radius:14px;padding:14px 24px;">
                    <span style="font-size:26px;font-weight:800;color:#0093D0;letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Irriga</span><span style="font-size:26px;font-weight:300;color:#22c55e;letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Agro</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card principal -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

              <!-- Faixa verde no topo -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#0093D0 0%,#22c55e 100%);height:6px;"></td>
                </tr>
              </table>

              <!-- Conteúdo -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 40px 36px;">
                <tr>
                  <td>

                    <!-- Ícone de check -->
                    <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                      <tr>
                        <td style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:50%;width:64px;height:64px;text-align:center;vertical-align:middle;">
                          <span style="font-size:28px;line-height:64px;">✓</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Título -->
                    <p style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 12px;line-height:1.3;">
                      Acesso liberado!
                    </p>

                    <!-- Subtítulo -->
                    <p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 20px;">
                      Olá! Sua conta IrrigaAgro para <strong style="color:#0f172a;">${companyName}</strong> foi aprovada e está pronta para uso.
                    </p>

                    <p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 32px;">
                      Você já pode acessar o sistema, cadastrar seus pivôs e safras, e começar a usar o balanço hídrico inteligente.
                    </p>

                    <!-- Botão CTA -->
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-radius:10px;background:#0093D0;box-shadow:0 4px 14px rgba(0,147,208,0.35);">
                          <a href="https://www.irrigaagro.com.br/login"
                             style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                            Acessar o IrrigaAgro →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divisor -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
                      <tr>
                        <td style="border-top:1px solid #e2e8f0;"></td>
                      </tr>
                    </table>

                    <!-- Features rápidas -->
                    <p style="font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">
                      O que você pode fazer agora
                    </p>

                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;vertical-align:top;">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-size:18px;padding-right:12px;vertical-align:top;line-height:1.4;">💧</td>
                              <td style="font-size:14px;color:#475569;line-height:1.6;">Gerenciar o balanço hídrico diário dos seus pivôs</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;vertical-align:top;">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-size:18px;padding-right:12px;vertical-align:top;line-height:1.4;">🌱</td>
                              <td style="font-size:14px;color:#475569;line-height:1.6;">Cadastrar safras e acompanhar cada fase da cultura</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;vertical-align:top;">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-size:18px;padding-right:12px;vertical-align:top;line-height:1.4;">📊</td>
                              <td style="font-size:14px;color:#475569;line-height:1.6;">Receber recomendações de irrigação baseadas em FAO-56</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;text-align:center;">
              <p style="font-size:13px;color:#94a3b8;margin:0 0 6px;">
                IrrigaAgro · Gestão inteligente de irrigação
              </p>
              <p style="font-size:12px;color:#cbd5e1;margin:0;">
                <a href="https://www.irrigaagro.com.br" style="color:#0093D0;text-decoration:none;">www.irrigaagro.com.br</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}

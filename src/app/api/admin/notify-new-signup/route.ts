import { NextRequest, NextResponse } from 'next/server'

// Chamada pelo trigger Supabase via webhook após novo cadastro
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

  const adminUrl = `https://www.irrigaagro.com.br/admin`

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
  const now = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Novo cadastro — IrrigaAgro Admin</title>
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
                    <span style="font-size:11px;color:#556677;margin-left:10px;font-weight:500;vertical-align:middle;">Admin</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card principal -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

              <!-- Faixa azul no topo -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#f59e0b 0%,#0093D0 100%);height:6px;"></td>
                </tr>
              </table>

              <!-- Conteúdo -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 40px 36px;">
                <tr>
                  <td>

                    <!-- Ícone -->
                    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="background:#fffbeb;border:2px solid #fde68a;border-radius:50%;width:56px;height:56px;text-align:center;vertical-align:middle;">
                          <span style="font-size:24px;line-height:56px;">🔔</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Título -->
                    <p style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 8px;line-height:1.3;">
                      Novo cliente aguardando aprovação
                    </p>
                    <p style="font-size:14px;color:#94a3b8;margin:0 0 28px;">
                      ${now}
                    </p>

                    <!-- Dados do cliente -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:28px;">
                      <tr>
                        <td style="padding:20px 24px;">

                          <table width="100%" cellpadding="0" cellspacing="0">
                            ${companyName ? `
                            <tr>
                              <td style="padding:6px 0;width:110px;vertical-align:top;">
                                <span style="font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Empresa</span>
                              </td>
                              <td style="padding:6px 0;">
                                <span style="font-size:14px;font-weight:600;color:#0f172a;">${companyName}</span>
                              </td>
                            </tr>` : ''}
                            <tr>
                              <td style="padding:6px 0;width:110px;vertical-align:top;">
                                <span style="font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">E-mail</span>
                              </td>
                              <td style="padding:6px 0;">
                                <span style="font-size:14px;color:#0f172a;">${email}</span>
                              </td>
                            </tr>
                            ${userId ? `
                            <tr>
                              <td style="padding:6px 0;vertical-align:top;">
                                <span style="font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">User ID</span>
                              </td>
                              <td style="padding:6px 0;">
                                <span style="font-size:11px;color:#94a3b8;font-family:monospace;">${userId}</span>
                              </td>
                            </tr>` : ''}
                          </table>

                        </td>
                      </tr>
                    </table>

                    <!-- Botão CTA -->
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-radius:10px;background:#0093D0;box-shadow:0 4px 14px rgba(0,147,208,0.35);">
                          <a href="${adminUrl}"
                             style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                            Aprovar acesso →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Nota -->
                    <p style="font-size:13px;color:#94a3b8;margin:20px 0 0;line-height:1.6;">
                      O cliente verá uma tela de espera até que você aprove o acesso no painel.
                    </p>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;text-align:center;">
              <p style="font-size:13px;color:#94a3b8;margin:0 0 6px;">
                IrrigaAgro · Painel Administrativo
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

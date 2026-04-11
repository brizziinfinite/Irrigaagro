// Cron — Alerta proativo de tarde (14h BRT / 17h UTC)
// Dispara quando solo vai atingir threshold crítico amanhã

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const resp = await fetch(`${supabaseUrl}/functions/v1/afternoon-alert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
  })

  const data = await resp.json()
  return NextResponse.json(data, { status: resp.ok ? 200 : 500 })
}

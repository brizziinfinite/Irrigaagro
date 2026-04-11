// Cron — Relatório semanal (toda segunda 07h BRT / 10h UTC)
// ETc acumulada, mm irrigados, custo e projeção 7 dias

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const resp = await fetch(`${supabaseUrl}/functions/v1/weekly-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
  })

  const data = await resp.json()
  return NextResponse.json(data, { status: resp.ok ? 200 : 500 })
}

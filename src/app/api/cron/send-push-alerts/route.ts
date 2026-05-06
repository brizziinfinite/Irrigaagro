// Cron — Envia push notifications para alertas críticos de irrigação
// Dispara junto com o afternoon-alert (17h UTC / 14h BRT)
// Regra: max 1 push/dia por usuário, só quando needs_irrigation = true

import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const today = new Date().toISOString().slice(0, 10)

  // Busca todos os daily_management de hoje com needs_irrigation = true
  const { data: urgentManagements, error: mgmtErr } = await supabase
    .from('daily_management')
    .select(`
      id,
      season_id,
      field_capacity_percent,
      seasons!inner(
        pivots!inner(name, farms!inner(company_id))
      )
    `)
    .eq('date', today)
    .eq('needs_irrigation', true)

  if (mgmtErr) {
    return NextResponse.json({ error: mgmtErr.message }, { status: 500 })
  }
  if (!urgentManagements || urgentManagements.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No urgent pivots today' })
  }

  // Agrupa pivôs urgentes por company_id
  const pivotsByCompany = new Map<string, string[]>()
  for (const m of urgentManagements) {
    const season = m.seasons as unknown as { pivots: { name: string; farms: { company_id: string } } }
    const companyId = season.pivots.farms.company_id
    const pivotName = season.pivots.name
    if (!pivotsByCompany.has(companyId)) pivotsByCompany.set(companyId, [])
    pivotsByCompany.get(companyId)!.push(pivotName)
  }

  // Busca membros das empresas com pivôs urgentes
  const companyIds = [...pivotsByCompany.keys()]
  const { data: members } = await supabase
    .from('company_members')
    .select('user_id, company_id')
    .in('company_id', companyIds)

  if (!members || members.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No members found' })
  }

  const userIds = [...new Set(members.map((m) => m.user_id))]

  // Busca subscriptions dos usuários — filtra quem já recebeu push hoje
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, last_sent_at')
    .in('user_id', userIds)

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No push subscriptions' })
  }

  const results = { sent: 0, skipped: 0, failed: 0, expired: 0 }
  const expiredEndpoints: string[] = []

  for (const sub of subscriptions) {
    // Dedup: max 1 push/dia por usuário
    if (sub.last_sent_at && sub.last_sent_at.slice(0, 10) === today) {
      results.skipped++
      continue
    }

    // Determina empresa do usuário (pega a primeira match com pivô urgente)
    const member = members.find((m) => m.user_id === sub.user_id)
    if (!member) continue
    const pivotNames = pivotsByCompany.get(member.company_id)
    if (!pivotNames || pivotNames.length === 0) continue

    const count = pivotNames.length
    const names = pivotNames.slice(0, 2).join(', ') + (count > 2 ? ` +${count - 2}` : '')
    const payload = JSON.stringify({
      title: `IrrigaAgro — Irrigar Hoje`,
      body: `${count} pivô${count > 1 ? 's' : ''} precisam de irrigação: ${names}`,
      tag: `irrigar-hoje-${today}`,
      url: '/manejo',
    })

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      // Atualiza last_sent_at
      await supabase
        .from('push_subscriptions')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('id', sub.id)
      results.sent++
    } catch (err: unknown) {
      const webPushErr = err as { statusCode?: number }
      if (webPushErr.statusCode === 410 || webPushErr.statusCode === 404) {
        // Subscription expirada — remove
        expiredEndpoints.push(sub.endpoint)
        results.expired++
      } else {
        results.failed++
      }
    }
  }

  // Remove subscriptions expiradas
  if (expiredEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints)
  }

  return NextResponse.json({ ...results, urgentPivots: urgentManagements.length })
}

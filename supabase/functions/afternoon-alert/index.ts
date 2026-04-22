import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Alerta proativo de tarde (14h BRT / 17h UTC)
 * Dispara quando a projeção indica que o solo vai atingir o threshold AMANHÃ.
 * Só envia se o contato ainda não recebeu alerta hoje.
 */

async function fetchForecastRain(lat: number, lon: number): Promise<number[]> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('daily', 'precipitation_sum,et0_fao_evapotranspiration')
    url.searchParams.set('timezone', 'America/Sao_Paulo')
    url.searchParams.set('forecast_days', '3')
    const resp = await fetch(url.toString())
    if (!resp.ok) return [0, 0, 0]
    const data = await resp.json()
    return data.daily?.precipitation_sum ?? [0, 0, 0]
  } catch {
    return [0, 0, 0]
  }
}

function projectDaysUntilThreshold(
  adcMm: number,
  ctaMm: number,
  threshold: number,
  etcMm: number,
  forecastRain: number[]
): number {
  if (ctaMm <= 0 || etcMm <= 0) return 99
  const thresholdMm = (threshold / 100) * ctaMm
  let adc = adcMm
  for (let i = 1; i <= 7; i++) {
    const rain = forecastRain[i] ?? 0
    adc = Math.min(ctaMm, adc + rain) - etcMm
    if (adc < 0) adc = 0
    if (adc <= thresholdMm) return i
  }
  return 99
}

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const twoDaysAgo = new Date(now)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const sinceDate = twoDaysAgo.toISOString().slice(0, 10)

    // Buscar contatos ativos com notify_irrigation=true
    const { data: contacts, error } = await supabase
      .from('whatsapp_contacts')
      .select(`
        id, phone, contact_name,
        whatsapp_pivot_subscriptions (
          pivot_id, notify_irrigation,
          pivots ( id, name, alert_threshold_percent, latitude, longitude )
        )
      `)
      .eq('is_active', true)

    if (error) throw error
    if (!contacts?.length) {
      return new Response(JSON.stringify({ message: 'Nenhum contato ativo' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    let sent = 0

    for (const contact of contacts as any[]) {
      const subs = (contact.whatsapp_pivot_subscriptions ?? []).filter(
        (s: any) => s.notify_irrigation
      )
      if (!subs.length) continue

      const pivotIds = subs.map((s: any) => s.pivot_id)

      // Buscar seasons ativas
      const { data: seasons } = await supabase
        .from('seasons')
        .select('id, pivot_id')
        .in('pivot_id', pivotIds)
        .eq('is_active', true)

      const seasonByPivot: Record<string, string> = {}
      for (const s of seasons ?? []) seasonByPivot[s.pivot_id] = s.id
      const seasonIds = Object.values(seasonByPivot)
      if (!seasonIds.length) continue

      // Buscar último balanço
      const { data: mgmtRows } = await supabase
        .from('daily_management')
        .select('season_id, field_capacity_percent, ctda, cta, etc_mm, needs_irrigation')
        .in('season_id', seasonIds)
        .gte('date', sinceDate)
        .order('date', { ascending: false })

      const mgmtBySeason: Record<string, any> = {}
      for (const row of mgmtRows ?? []) {
        if (!mgmtBySeason[row.season_id]) mgmtBySeason[row.season_id] = row
      }

      // Verificar se já enviou alerta hoje para este contato
      const { data: sentToday } = await supabase
        .from('whatsapp_messages_log')
        .select('id')
        .eq('contact_id', contact.id)
        .eq('message_type', 'irrigation_alert')
        .eq('direction', 'outbound')
        .gte('created_at', `${today}T00:00:00`)
        .limit(1)

      if (sentToday && sentToday.length > 0) continue // já alertou hoje

      // Avaliar quais pivôs vão atingir threshold em até 2 dias
      const alertPivots: Array<{ name: string; daysUntil: number }> = []

      for (const sub of subs) {
        const seasonId = seasonByPivot[sub.pivot_id]
        const mgmt = seasonId ? mgmtBySeason[seasonId] : null
        if (!mgmt) continue

        const fc = mgmt.field_capacity_percent
        const threshold = sub.pivots?.alert_threshold_percent ?? 70
        if (fc == null || fc < threshold) continue // já crítico — resumo matinal já avisou

        const adcMm: number = mgmt.ctda ?? 0
        const ctaMm: number = mgmt.cta ?? 0
        const etcMm: number = mgmt.etc_mm ?? 0

        // Buscar previsão de chuva
        const lat = sub.pivots?.latitude
        const lon = sub.pivots?.longitude
        const forecastRain = lat && lon ? await fetchForecastRain(lat, lon) : [0, 0, 0]

        const daysUntil = projectDaysUntilThreshold(adcMm, ctaMm, threshold, etcMm, forecastRain)

        // Alerta quando vai atingir threshold em até 2 dias
        if (daysUntil <= 2) {
          alertPivots.push({ name: sub.pivots?.name || 'Pivô', daysUntil })
        }
      }

      if (!alertPivots.length) continue

      // Monta mensagem diferenciada por urgência
      const hoje = alertPivots.filter(p => p.daysUntil === 1)
      const amanha = alertPivots.filter(p => p.daysUntil === 2)

      let message = `⚠️ *IRRIGAAGRO | Alerta de Irrigação*\n\n`

      if (hoje.length > 0) {
        const lista = hoje.length === 1
          ? `o *${hoje[0].name}*`
          : hoje.map(p => `*${p.name}*`).join(' e ')
        message += `🔴 ${lista} atinge o nível crítico *amanhã*.\n`
        message += `👉 Programe a irrigação *hoje*.\n\n`
      }

      if (amanha.length > 0) {
        const lista = amanha.length === 1
          ? `o *${amanha[0].name}*`
          : amanha.map(p => `*${p.name}*`).join(' e ')
        message += `🟡 ${lista} atinge o nível crítico *em 2 dias*.\n`
        message += `👉 Planeje a irrigação para *amanhã*.\n\n`
      }

      message += `🔗 www.irrigaagro.com.br/manejo`

      await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          phone: contact.phone,
          message,
          contact_id: contact.id,
          message_type: 'irrigation_alert',
        }),
      })

      sent++
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})

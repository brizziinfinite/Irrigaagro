import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ForecastDay {
  date: string
  tmax: number
  tmin: number
  rain: number
  eto: number
  weatherCode: number
}

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code <= 3) return '☁️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '🌨️'
  if (code <= 82) return '🌦️'
  if (code <= 99) return '⛈️'
  return '🌡️'
}

async function fetchForecast(lat: number, lon: number): Promise<ForecastDay[]> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,weather_code')
    url.searchParams.set('timezone', 'America/Sao_Paulo')
    url.searchParams.set('forecast_days', '5')

    const resp = await fetch(url.toString())
    if (!resp.ok) return []
    const data = await resp.json()
    const d = data.daily
    return (d.time ?? []).map((date: string, i: number) => ({
      date,
      tmax: d.temperature_2m_max[i] ?? 0,
      tmin: d.temperature_2m_min[i] ?? 0,
      rain: d.precipitation_sum[i] ?? 0,
      eto: d.et0_fao_evapotranspiration[i] ?? 0,
      weatherCode: d.weather_code[i] ?? 0,
    }))
  } catch {
    return []
  }
}

/**
 * Projeta quantos dias até o solo atingir o threshold crítico.
 * Usa ETc de hoje como estimativa diária e desconta chuva prevista.
 * Retorna a data estimada ou null se >7 dias.
 */
function projectNextIrrigationDate(
  today: string,
  adcMm: number,         // ADc atual em mm
  ctaMm: number,         // CTA em mm
  threshold: number,     // % threshold (ex: 70)
  etcMm: number,         // ETc de hoje em mm/dia
  forecastDays: ForecastDay[]  // previsão (index 0 = hoje)
): { date: string; daysAway: number } | null {
  if (ctaMm <= 0 || etcMm <= 0) return null

  const thresholdMm = (threshold / 100) * ctaMm
  let adc = adcMm

  for (let i = 1; i <= 7; i++) {
    const rain = forecastDays[i]?.rain ?? 0
    adc = Math.min(ctaMm, adc + rain) - etcMm
    if (adc < 0) adc = 0

    if (adc <= thresholdMm) {
      const d = new Date(today + 'T12:00:00')
      d.setDate(d.getDate() + i)
      return {
        date: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        daysAway: i,
      }
    }
  }

  return null
}

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const twoDaysAgo = new Date(now)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const sinceDate = twoDaysAgo.toISOString().slice(0, 10)

    const { data: contacts, error } = await supabase
      .from('whatsapp_contacts')
      .select(`
        id, phone, contact_name, notification_hour,
        whatsapp_pivot_subscriptions (
          pivot_id, notify_daily_summary, notify_irrigation,
          pivots ( id, name, farms ( name ), alert_threshold_percent, irrigation_target_percent, latitude, longitude )
        )
      `)
      .eq('is_active', true)

    if (error) throw error
    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum contato ativo' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    let sent = 0

    for (const contact of contacts as any[]) {
      const subs = (contact.whatsapp_pivot_subscriptions ?? []).filter(
        (s: any) => s.notify_daily_summary || s.notify_irrigation
      )
      if (subs.length === 0) continue

      // Buscar season_id ativo para cada pivot_id
      const pivotIds = subs.map((s: any) => s.pivot_id)
      const { data: seasons } = await supabase
        .from('seasons')
        .select('id, pivot_id')
        .in('pivot_id', pivotIds)
        .eq('is_active', true)

      const seasonByPivot: Record<string, string> = {}
      for (const s of seasons ?? []) {
        seasonByPivot[s.pivot_id] = s.id
      }

      const seasonIds = Object.values(seasonByPivot)

      // Buscar últimos registros de daily_management (com ADc, CTA, ETc, Kc)
      const { data: mgmtRows } = seasonIds.length > 0
        ? await supabase
            .from('daily_management')
            .select('season_id, date, field_capacity_percent, ctda, cta, recommended_depth_mm, needs_irrigation, recommended_speed_percent, etc_mm, eto_mm, kc, rainfall_mm')
            .in('season_id', seasonIds)
            .gte('date', sinceDate)
            .order('date', { ascending: false })
        : { data: [] }

      const mgmtBySeason: Record<string, any> = {}
      for (const row of mgmtRows ?? []) {
        if (!mgmtBySeason[row.season_id]) {
          mgmtBySeason[row.season_id] = row
        }
      }

      // Buscar info de safra (cultura, DAS)
      const { data: seasonDetails } = seasonIds.length > 0
        ? await supabase
            .from('seasons')
            .select('id, pivot_id, planting_date, crops ( name, stage1_days, stage2_days, stage3_days, stage4_days )')
            .in('id', seasonIds)
        : { data: [] }

      const seasonInfoById: Record<string, any> = {}
      for (const s of seasonDetails ?? []) {
        seasonInfoById[s.id] = s
      }

      // Buscar previsão para o primeiro pivô com coordenadas
      let forecast: ForecastDay[] = []
      for (const sub of subs) {
        const lat = sub.pivots?.latitude
        const lon = sub.pivots?.longitude
        if (lat && lon) {
          forecast = await fetchForecast(lat, lon)
          break
        }
      }

      // Verificar se já enviou resumo diário hoje para este contato
      const { data: sentToday } = await supabase
        .from('whatsapp_messages_log')
        .select('id')
        .eq('contact_id', contact.id)
        .in('message_type', ['daily_summary', 'irrigation_alert'])
        .eq('direction', 'outbound')
        .gte('created_at', `${today}T00:00:00`)
        .limit(1)

      if (sentToday && sentToday.length > 0) continue // já enviou resumo hoje

      const dateShort = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const fazendaName = subs[0]?.pivots?.farms?.name || 'Fazenda'

      let hasIrrigationAlert = false
      const criticalPivots: string[] = []
      let okCount = 0, attentionCount = 0, criticalCount = 0

      // Processar cada pivô e calcular priority_score para ordenação
      interface PivotResult {
        line: string
        priorityScore: number
      }
      const pivotResults: PivotResult[] = []

      for (const sub of subs) {
        const pivoName = sub.pivots?.name || 'Pivô'
        const threshold = sub.pivots?.alert_threshold_percent ?? 70
        const seasonId = seasonByPivot[sub.pivot_id]
        const mgmt = seasonId ? mgmtBySeason[seasonId] : null

        // DAS e cultura deste pivô
        const seasonInfo = seasonId ? seasonInfoById[seasonId] : null
        const cropName = seasonInfo?.crops?.name || null
        let das = 0
        if (seasonInfo?.planting_date) {
          const plantedDate = new Date(seasonInfo.planting_date)
          das = Math.floor((now.getTime() - plantedDate.getTime()) / (1000 * 60 * 60 * 24))
        }

        // Fase fenológica
        const crop = seasonInfo?.crops
        const s1 = crop?.stage1_days ?? 15
        const s2 = crop?.stage2_days ?? 35
        const s3 = crop?.stage3_days ?? 40
        const stageLabels = ['', 'Inicial', 'Desenvolvimento', 'Floração', 'Maturação']
        let stageNum = 4
        if (das > 0) {
          if (das <= s1) stageNum = 1
          else if (das <= s1 + s2) stageNum = 2
          else if (das <= s1 + s2 + s3) stageNum = 3
        }
        const stageStr = das > 0 ? ` · F${stageNum} ${stageLabels[stageNum]}` : ''
        const dasStr = das > 0 ? ` · ${das} DAS` : ''
        const cropStr = cropName
          ? ` (${cropName}${stageStr}${dasStr})`
          : (das > 0 ? ` (${das} DAS)` : '')

        if (!mgmt) {
          pivotResults.push({ line: `🚜 *${pivoName}*${cropStr} — ⚫ Sem dados\n💧 CC: — · ETc: —\n👉 _Balanço será atualizado às 20h_`, priorityScore: -1 })
          continue
        }

        const fc = mgmt.field_capacity_percent != null ? mgmt.field_capacity_percent : null
        const etcMm: number = mgmt.etc_mm ?? 0
        const ctaMm: number = mgmt.cta ?? 0
        const adcMm: number = mgmt.ctda ?? 0
        const rainfall = mgmt.rainfall_mm ?? 0
        const deficitMm = ctaMm > 0 ? Math.max(0, ctaMm - adcMm) : 0

        // Projeção de próxima irrigação (necessária para priority_score)
        const proj = etcMm > 0 && ctaMm > 0
          ? projectNextIrrigationDate(today, adcMm, ctaMm, threshold, etcMm, forecast)
          : null
        const daysAway = proj?.daysAway ?? 7

        // Classificação de status (thresholds fixos: OK ≥75%, Atenção 70-74%, Crítico <70%)
        let statusEmoji: string
        let statusLabel: string
        if (fc == null) {
          statusEmoji = '⚫'
          statusLabel = 'Sem dados'
        } else if (fc >= 75) {
          statusEmoji = '🟢'
          statusLabel = 'OK'
          okCount++
        } else if (fc >= 70) {
          statusEmoji = '🟡'
          statusLabel = 'Atenção'
          attentionCount++
        } else {
          statusEmoji = '🔴'
          statusLabel = 'Crítico'
          criticalCount++
        }

        // priority_score = (deficit_mm × 0.5) + ((100 - fc) × 0.3) + (dias_até_irrigação × 0.2)
        const priorityScore = fc != null
          ? (deficitMm * 0.5) + ((100 - fc) * 0.3) + (daysAway * 0.2)
          : 0

        const fcStr = fc != null ? `${fc.toFixed(0)}%` : '—'
        const etcStr = etcMm > 0 ? `${etcMm.toFixed(1)}mm` : '—'
        const rainfallStr = rainfall > 0 ? ` · 🌧️ ${rainfall.toFixed(0)}mm` : ''

        let line = `🚜 *${pivoName}*${cropStr} — ${statusEmoji} ${statusLabel}\n`
        line += `💧 CC: ${fcStr} · ETc: ${etcStr}${rainfallStr}\n`

        if (mgmt.needs_irrigation && sub.notify_irrigation) {
          hasIrrigationAlert = true
          const speed = mgmt.recommended_speed_percent != null ? `${mgmt.recommended_speed_percent}%` : '—'
          const lamina = mgmt.recommended_depth_mm != null ? `${mgmt.recommended_depth_mm.toFixed(1)}mm` : '—'
          line += `🔴 *Irrigar hoje — ${lamina}* (vel. ${speed})`
          criticalPivots.push(pivoName)
        } else if (statusLabel === 'Atenção') {
          line += proj
            ? `🟡 Margem estreita — irrigar até *${proj.date}*`
            : `🟡 Margem estreita — monitore amanhã`
        } else {
          line += proj && proj.daysAway <= 5
            ? `✅ OK — próxima irrigação estimada: *${proj.date}*`
            : `✅ Campo bem abastecido`
        }

        pivotResults.push({ line, priorityScore })
      }

      // Ordenar por priority_score decrescente (mais urgente primeiro)
      pivotResults.sort((a, b) => b.priorityScore - a.priorityScore)
      const pivotLines = pivotResults.map(r => r.line)

      // Situação hídrica geral
      let situacaoLabel: string
      if (criticalCount > 0) situacaoLabel = '🔴 *Irrigação necessária hoje*'
      else if (attentionCount > 0) situacaoLabel = '🟡 *Em atenção*'
      else situacaoLabel = '🟢 *Sob controle*'

      // Montar mensagem
      const divider = '━━━━━━━━━━━━━━━━━━━'

      let messageBody = `🌱 *IRRIGAAGRO | MANEJO DIÁRIO*\n`
      messageBody += `📍 ${fazendaName} · 📅 ${dateShort}\n`
      messageBody += `${situacaoLabel}\n`
      messageBody += `\n${divider}\n\n`

      messageBody += pivotLines.join(`\n\n${divider}\n\n`)
      messageBody += `\n\n${divider}\n`

      // Prioridade do dia
      if (criticalPivots.length > 0) {
        messageBody += `\n⚠️ *Prioridade:* Iniciar pelo *${criticalPivots[0]}*\n`
      }

      // Resumo numérico
      messageBody += `\n📊 ${okCount > 0 ? `🟢 ${okCount} OK` : ''}${attentionCount > 0 ? `  🟡 ${attentionCount} Atenção` : ''}${criticalCount > 0 ? `  🔴 ${criticalCount} Crítico` : ''}\n`

      messageBody += `\n${divider}\n`

      // Previsão 3 dias (D+1, D+2, D+3 — pula hoje)
      const futureForecast = forecast.filter(d => d.date > today).slice(0, 3)
      if (futureForecast.length > 0) {
        messageBody += `\n📆 *Próximos dias:*\n`
        for (const day of futureForecast) {
          const label = new Date(day.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
          const emoji = weatherEmoji(day.weatherCode)
          const rainStr = day.rain >= 2 ? ` · 🌧️ ${day.rain.toFixed(0)}mm` : ''
          // ETc estimada: ETo × Kc médio dos pivôs (ou 0.8 como fallback)
          const avgKc = subs.reduce((sum: number, s: any) => {
            const sid = seasonByPivot[s.pivot_id]
            return sum + (sid && mgmtBySeason[sid]?.kc ? mgmtBySeason[sid].kc : 0.8)
          }, 0) / subs.length
          const etcForecast = (day.eto * avgKc).toFixed(1)
          messageBody += `${emoji} ${label} — ${day.tmax.toFixed(0)}°/${day.tmin.toFixed(0)}° · ETc ~${etcForecast}mm${rainStr}\n`
        }
      }

      messageBody += `\n${divider}\n`
      messageBody += `\n🔗 *Painel completo:* app.irrigaagro.com.br\n`
      messageBody += `💬 _Registre chuva: CHUVA [PIVÔ] [mm]_`

      await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          phone: contact.phone,
          message: messageBody,
          contact_id: contact.id,
          message_type: 'daily_summary',
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

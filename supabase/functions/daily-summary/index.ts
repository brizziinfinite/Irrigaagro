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
    url.searchParams.set('forecast_days', '4')

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

async function fetchMotivationalPhrase(weekday: string, weatherCode: number): Promise<string> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) return ''

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Crie UMA frase curta (máximo 12 palavras) de encorajamento para um agricultor brasileiro.
Contexto: ${weekday}, clima ${weatherCode <= 2 ? 'ensolarado' : weatherCode <= 3 ? 'nublado' : 'com chuva'}.
Regras:
- Tom natural, como um amigo do campo falaria
- Relacionada à terra, lavoura, natureza ou colheita
- Sem clichês corporativos, sem exclamação, sem emoji
- Apenas a frase, sem aspas, sem explicação`
            }]
          }],
          generationConfig: { temperature: 1.2, maxOutputTokens: 64 }
        })
      }
    )
    if (!resp.ok) return ''
    const data = await resp.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    return text.replace(/^["']|["']$/g, '')
  } catch {
    return ''
  }
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

      // Buscar últimos registros de daily_management por season_id
      const { data: mgmtRows } = seasonIds.length > 0
        ? await supabase
            .from('daily_management')
            .select('season_id, date, field_capacity_percent, ctda, recommended_depth_mm, needs_irrigation, recommended_speed_percent, etc_mm, rainfall_mm')
            .in('season_id', seasonIds)
            .gte('date', sinceDate)
            .order('date', { ascending: false })
        : { data: [] }

      // Para cada season, pegar o registro mais recente
      const mgmtBySeason: Record<string, any> = {}
      for (const row of mgmtRows ?? []) {
        if (!mgmtBySeason[row.season_id]) {
          mgmtBySeason[row.season_id] = row
        }
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

      const dateShort = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

      // Determinar fazenda (pegar a do primeiro pivô)
      const fazendaName = subs[0]?.pivots?.farms?.name || 'Fazenda'

      // Determinar situação hídrica geral
      let hasIrrigationAlert = false
      const pivotLines: string[] = []
      const criticalPivots: string[] = []
      let okCount = 0, attentionCount = 0, criticalCount = 0

      // Buscar info de safra (cultura, DAS) para o cabeçalho
      const { data: seasonDetails } = seasonIds.length > 0
        ? await supabase
            .from('seasons')
            .select('id, pivot_id, planting_date, crops ( name )')
            .in('id', seasonIds)
        : { data: [] }

      const seasonInfoById: Record<string, any> = {}
      for (const s of seasonDetails ?? []) {
        seasonInfoById[s.id] = s
      }

      for (const sub of subs) {
        const pivoName = sub.pivots?.name || 'Pivô'
        const threshold = sub.pivots?.alert_threshold_percent ?? 70
        const seasonId = seasonByPivot[sub.pivot_id]
        const mgmt = seasonId ? mgmtBySeason[seasonId] : null

        if (!mgmt) {
          pivotLines.push(`🚜 *${pivoName}* — ⚫ Sem dados\n💧 Solo: —\n👉 _Balanço será atualizado às 20h_`)
          continue
        }

        const fc = mgmt.field_capacity_percent != null ? mgmt.field_capacity_percent : null
        const rainfall = mgmt.rainfall_mm ?? 0

        // Status do pivô
        let statusEmoji: string
        let statusLabel: string
        if (fc == null) {
          statusEmoji = '⚫'
          statusLabel = 'Sem dados'
        } else if (fc >= threshold + 8) {
          statusEmoji = '🟢'
          statusLabel = 'OK'
          okCount++
        } else if (fc >= threshold) {
          statusEmoji = '🟡'
          statusLabel = 'Atenção'
          attentionCount++
        } else {
          statusEmoji = '🔴'
          statusLabel = 'Crítico'
          criticalCount++
        }

        const fcStr = fc != null ? `${fc.toFixed(0)}%` : '—'
        const rainfallStr = `${rainfall.toFixed(0)} mm`

        let line = `🚜 *${pivoName}* — ${statusEmoji} ${statusLabel}\n`
        line += `💧 Solo: ${fcStr}\n`
        line += `🌧️ Chuva: ${rainfallStr}\n`

        if (mgmt.needs_irrigation && sub.notify_irrigation) {
          hasIrrigationAlert = true
          const speed = mgmt.recommended_speed_percent != null
            ? `${mgmt.recommended_speed_percent}%`
            : '—'
          const lamina = mgmt.recommended_depth_mm != null
            ? `${mgmt.recommended_depth_mm.toFixed(1)} mm`
            : '—'
          line += `👉 *Irrigar ${lamina} hoje* (vel. ${speed})`
          criticalPivots.push(pivoName)
        } else if (statusLabel === 'Atenção') {
          line += `👉 *Programar irrigação (próximas 24h)*`
        } else {
          line += `👉 *Sem necessidade de irrigação hoje*`
        }

        pivotLines.push(line)
      }

      // Situação hídrica geral
      let situacaoLabel: string
      if (criticalCount > 0) {
        situacaoLabel = '*Atenção imediata necessária*'
      } else if (attentionCount > 0) {
        situacaoLabel = '*Em atenção*'
      } else {
        situacaoLabel = '*Sob controle*'
      }

      // Buscar info de safra do primeiro pivô com season ativa
      let cropHeader = ''
      for (const sub of subs) {
        const seasonId = seasonByPivot[sub.pivot_id]
        if (seasonId && seasonInfoById[seasonId]) {
          const s = seasonInfoById[seasonId]
          const cropName = s.crops?.name || 'Cultura'
          let das = 0
          if (s.planting_date) {
            const plantedDate = new Date(s.planting_date)
            das = Math.floor((now.getTime() - plantedDate.getTime()) / (1000 * 60 * 60 * 24))
          }
          cropHeader = `🌱 *${cropName}${das > 0 ? ` — ${das} DAS` : ''}*`
          break
        }
      }

      // Montar mensagem
      const divider = '━━━━━━━━━━━━━━━━━━━'

      let messageBody = `🌱 *GOTEJO | MANEJO DIÁRIO*\n\n`
      messageBody += `📍 ${fazendaName}\n`
      messageBody += `📅 ${dateShort}\n`

      if (cropHeader) {
        messageBody += `\n${cropHeader}\n`
      }
      messageBody += `💧 Situação hídrica: ${situacaoLabel}\n`
      messageBody += `\n${divider}\n\n`

      messageBody += pivotLines.join(`\n\n${divider}\n\n`)
      messageBody += `\n\n${divider}\n`

      // Prioridade do dia
      if (criticalPivots.length > 0) {
        messageBody += `\n⚠️ *Prioridade do dia:*\n`
        messageBody += `👉 Iniciar irrigação pelo *${criticalPivots[0]}*\n`
      }

      // Resumo geral
      messageBody += `\n📊 *Resumo geral:*\n`
      messageBody += `🟢 ${okCount} OK | 🟡 ${attentionCount} Atenção | 🔴 ${criticalCount} Crítico\n`

      messageBody += `\n${divider}\n`

      // Previsão
      if (forecast.length > 0) {
        const topWeatherCode = forecast[0].weatherCode
        const hasRainToday = forecast[0].rain > 0
        const highEto = forecast[0].eto > 5

        messageBody += `\n🌤️ *Tendência:*\n`
        if (!hasRainToday) {
          messageBody += `• Sem chuva relevante hoje\n`
        } else {
          messageBody += `• Chuva prevista: ${forecast[0].rain.toFixed(0)} mm hoje\n`
        }
        if (highEto) {
          messageBody += `• Consumo elevado da cultura\n`
        }
      }

      messageBody += `\n${divider}\n`
      messageBody += `\n🔗 *Abrir painel completo:*\nhttps://gotejo.com.br/manejo`

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
          message_type: hasIrrigationAlert ? 'irrigation_alert' : 'daily_summary',
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

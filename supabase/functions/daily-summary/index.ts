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
        .eq('active', true)

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

      const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' })
      const dateShort = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

      // Cabeçalho natural
      let messageBody = `Bom dia! ☀️ Aqui está o resumo de hoje, ${weekday} ${dateShort}.\n`

      let hasIrrigationAlert = false

      for (const sub of subs) {
        const pivoName = sub.pivots?.name || 'Pivô'
        const seasonId = seasonByPivot[sub.pivot_id]
        const mgmt = seasonId ? mgmtBySeason[seasonId] : null

        messageBody += `\n*${pivoName}*\n`

        if (mgmt) {
          const dataLabel = mgmt.date !== today
            ? ` _(dado de ${mgmt.date.split('-').reverse().join('/')})*`
            : ''
          const fc = mgmt.field_capacity_percent != null
            ? `${mgmt.field_capacity_percent.toFixed(0)}%`
            : '—'
          const deficit = mgmt.ctda != null ? `${mgmt.ctda.toFixed(1)} mm` : '—'
          const etc = mgmt.etc_mm != null ? `${mgmt.etc_mm.toFixed(1)} mm` : '—'

          messageBody += `Solo: ${fc} da capacidade${dataLabel}\n`
          messageBody += `Déficit: ${deficit} | ETc: ${etc}`

          if (mgmt.rainfall_mm > 0) {
            messageBody += ` | Chuva: ${mgmt.rainfall_mm.toFixed(1)} mm`
          }
          messageBody += '\n'

          if (mgmt.needs_irrigation && sub.notify_irrigation) {
            hasIrrigationAlert = true
            const speed = mgmt.recommended_speed_percent != null
              ? `${mgmt.recommended_speed_percent}%`
              : '—'
            const lamina = mgmt.recommended_depth_mm != null
              ? `${mgmt.recommended_depth_mm.toFixed(1)} mm`
              : '—'
            messageBody += `⚠️ *Irrigar hoje* — velocidade ${speed}, lâmina ${lamina}\n`
          } else {
            messageBody += `✅ Sem necessidade de irrigar\n`
          }
        } else {
          messageBody += `Sem balanço calculado ainda hoje\n`
        }
      }

      // Previsão
      if (forecast.length > 0) {
        messageBody += `\n*Previsão:*\n`
        for (const day of forecast.slice(0, 4)) {
          const isToday = day.date === today
          const label = isToday
            ? 'Hoje'
            : new Date(day.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
          const emoji = weatherEmoji(day.weatherCode)
          const rainStr = day.rain > 0 ? ` — chuva ${day.rain.toFixed(0)} mm` : ''
          messageBody += `${emoji} ${label}: ${day.tmax.toFixed(0)}°/${day.tmin.toFixed(0)}° | ETo ${day.eto.toFixed(1)} mm${rainStr}\n`
        }
      }

      // Frase motivacional do dia
      const topWeatherCode = forecast.length > 0 ? forecast[0].weatherCode : 0
      const phrase = await fetchMotivationalPhrase(weekday, topWeatherCode)
      if (phrase) {
        messageBody += `\n_${phrase}_`
      }

      // Rodapé simples
      messageBody += `\n\nRegistrar chuva? É só responder: *CHUVA VALLEY 12*`

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

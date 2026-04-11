import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Relatório semanal — toda segunda-feira às 07h BRT (10h UTC)
 * Conteúdo: ETc acumulada vs chuva, mm irrigados + custo, projeção 7 dias
 */

interface ForecastDay {
  date: string
  rain: number
  eto: number
  weatherCode: number
}

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code <= 3) return '☁️'
  if (code <= 67) return '🌧️'
  if (code <= 99) return '⛈️'
  return '🌡️'
}

async function fetchForecast7(lat: number, lon: number): Promise<ForecastDay[]> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('daily', 'precipitation_sum,et0_fao_evapotranspiration,weather_code')
    url.searchParams.set('timezone', 'America/Sao_Paulo')
    url.searchParams.set('forecast_days', '7')
    const resp = await fetch(url.toString())
    if (!resp.ok) return []
    const data = await resp.json()
    const d = data.daily
    return (d.time ?? []).map((date: string, i: number) => ({
      date,
      rain: d.precipitation_sum[i] ?? 0,
      eto: d.et0_fao_evapotranspiration[i] ?? 0,
      weatherCode: d.weather_code[i] ?? 0,
    }))
  } catch {
    return []
  }
}

function projectNextIrrigation(
  adcMm: number, ctaMm: number, threshold: number,
  etcMm: number, forecastDays: ForecastDay[], today: string
): string {
  if (ctaMm <= 0 || etcMm <= 0) return '—'
  const thresholdMm = (threshold / 100) * ctaMm
  let adc = adcMm
  for (let i = 1; i <= 7; i++) {
    const rain = forecastDays[i]?.rain ?? 0
    adc = Math.min(ctaMm, adc + rain) - etcMm
    if (adc < 0) adc = 0
    if (adc <= thresholdMm) {
      const d = new Date(today + 'T12:00:00')
      d.setDate(d.getDate() + i)
      return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
    }
  }
  return '>7 dias'
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

    // Semana passada: D-7 até D-1
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7)
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() - 1)
    const weekStartStr = weekStart.toISOString().slice(0, 10)
    const weekEndStr = weekEnd.toISOString().slice(0, 10)
    const weekLabel = `${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${weekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`

    // Buscar contatos com notify_daily_summary (recebem também o semanal)
    const { data: contacts, error } = await supabase
      .from('whatsapp_contacts')
      .select(`
        id, phone, contact_name,
        whatsapp_pivot_subscriptions (
          pivot_id, notify_daily_summary, notify_irrigation,
          pivots ( id, name, farms ( name ), alert_threshold_percent, latitude, longitude )
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
        (s: any) => s.notify_daily_summary || s.notify_irrigation
      )
      if (!subs.length) continue

      const pivotIds = subs.map((s: any) => s.pivot_id)

      const { data: seasons } = await supabase
        .from('seasons')
        .select('id, pivot_id, planting_date, crops ( name )')
        .in('pivot_id', pivotIds)
        .eq('is_active', true)

      const seasonByPivot: Record<string, any> = {}
      for (const s of seasons ?? []) seasonByPivot[s.pivot_id] = s
      const seasonIds = Object.values(seasonByPivot).map((s: any) => s.id)
      if (!seasonIds.length) continue

      // Balanço da semana passada (7 dias)
      const { data: weekRows } = await supabase
        .from('daily_management')
        .select('season_id, date, etc_mm, rainfall_mm, actual_depth_mm, cost_per_mm_ha, field_capacity_percent, ctda, cta, needs_irrigation')
        .in('season_id', seasonIds)
        .gte('date', weekStartStr)
        .lte('date', weekEndStr)
        .order('date', { ascending: true })

      // Último registro (para projeção)
      const { data: latestRows } = await supabase
        .from('daily_management')
        .select('season_id, date, field_capacity_percent, ctda, cta, etc_mm, needs_irrigation, recommended_depth_mm, recommended_speed_percent')
        .in('season_id', seasonIds)
        .order('date', { ascending: false })
        .limit(seasonIds.length * 2)

      const latestBySeason: Record<string, any> = {}
      for (const row of latestRows ?? []) {
        if (!latestBySeason[row.season_id]) latestBySeason[row.season_id] = row
      }

      // Previsão 7 dias para o primeiro pivô com coords
      let forecast7: ForecastDay[] = []
      for (const sub of subs) {
        const lat = sub.pivots?.latitude
        const lon = sub.pivots?.longitude
        if (lat && lon) { forecast7 = await fetchForecast7(lat, lon); break }
      }

      const fazendaName = subs[0]?.pivots?.farms?.name || 'Fazenda'
      const divider = '━━━━━━━━━━━━━━━━━━━'

      let msg = `📊 *IRRIGAAGRO | RELATÓRIO SEMANAL*\n`
      msg += `📍 ${fazendaName}\n`
      msg += `📆 Semana: ${weekLabel}\n`
      msg += `\n${divider}\n`

      // Resumo por pivô
      for (const sub of subs) {
        const season = seasonByPivot[sub.pivot_id]
        if (!season) continue
        const sid = season.id
        const pivoName = sub.pivots?.name || 'Pivô'
        const cropName = season.crops?.name || null
        const threshold = sub.pivots?.alert_threshold_percent ?? 70

        const rows = (weekRows ?? []).filter((r: any) => r.season_id === sid)

        if (!rows.length) {
          msg += `\n🚜 *${pivoName}* — sem dados na semana\n`
          continue
        }

        const totalEtc = rows.reduce((s: number, r: any) => s + (r.etc_mm ?? 0), 0)
        const totalRain = rows.reduce((s: number, r: any) => s + (r.rainfall_mm ?? 0), 0)
        const totalIrrig = rows.reduce((s: number, r: any) => s + (r.actual_depth_mm ?? 0), 0)
        const totalCostHa = rows.reduce((s: number, r: any) => s + (r.cost_per_mm_ha ?? 0), 0)
        const balance = totalRain + totalIrrig - totalEtc

        // DAS
        let das = 0
        if (season.planting_date) {
          das = Math.floor((now.getTime() - new Date(season.planting_date).getTime()) / 86400000)
        }

        msg += `\n🚜 *${pivoName}*${cropName ? ` — ${cropName}${das > 0 ? ` ${das} DAS` : ''}` : ''}\n`
        msg += `💧 ETc: ${totalEtc.toFixed(1)}mm · Chuva: ${totalRain.toFixed(1)}mm · Irrigado: ${totalIrrig.toFixed(1)}mm\n`
        msg += `${balance >= 0 ? '🟢' : '🔴'} Balanço hídrico: ${balance >= 0 ? '+' : ''}${balance.toFixed(1)}mm\n`

        if (totalIrrig > 0 && totalCostHa > 0) {
          msg += `💰 Custo estimado: R$ ${totalCostHa.toFixed(2)}/ha\n`
        }

        // Projeção próxima irrigação
        const latest = latestBySeason[sid]
        if (latest) {
          const proj = projectNextIrrigation(
            latest.ctda ?? 0, latest.cta ?? 0, threshold,
            latest.etc_mm ?? 0, forecast7, today
          )
          msg += `📅 Próxima irrigação: *${proj}*\n`
        }
      }

      msg += `\n${divider}\n`

      // Previsão 7 dias resumida
      if (forecast7.length > 0) {
        const futureDays = forecast7.filter(d => d.date >= today).slice(0, 7)
        const totalRainForecast = futureDays.reduce((s, d) => s + d.rain, 0)
        const avgEto = futureDays.reduce((s, d) => s + d.eto, 0) / futureDays.length

        msg += `\n🌦️ *Previsão 7 dias:*\n`
        for (const day of futureDays) {
          const label = new Date(day.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
          const emoji = weatherEmoji(day.weatherCode)
          const rainStr = day.rain >= 2 ? ` 🌧️ ${day.rain.toFixed(0)}mm` : ''
          msg += `${emoji} ${label}${rainStr}\n`
        }
        msg += `\n☔ Chuva total prevista: *${totalRainForecast.toFixed(0)}mm*\n`
        msg += `💨 ETo média: *${avgEto.toFixed(1)}mm/dia*\n`
      }

      msg += `\n${divider}\n`
      msg += `\n🔗 *Painel completo:* app.irrigaagro.com.br`

      await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          phone: contact.phone,
          message: msg,
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

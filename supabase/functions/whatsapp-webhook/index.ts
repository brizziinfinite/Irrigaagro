import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE')

// Verifica duplicata de chuva: mesmo pivô + mesma data
async function checkRainDuplicate(
  supabase: ReturnType<typeof createClient>,
  pivotId: string,
  date: string | null
): Promise<boolean> {
  const targetDate = date || new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('rain_reports')
    .select('id')
    .eq('pivot_id', pivotId)
    .eq('observation_date', targetDate)
    .limit(1)
    .single()
  return !!data
}

async function sendWhatsApp(phone: string, text: string) {
  return fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY!,
    },
    body: JSON.stringify({ number: phone, text }),
  })
}

async function interpretWithGPT(transcricao: string, openaiKey: string, pivotNames: string, today: string): Promise<string> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Você é um assistente agrícola. Pivôs disponíveis: ${pivotNames}. Data de hoje: ${today}.
Analise a mensagem e extraia registros de chuva. Responda APENAS com JSON:
{"transcricao":"${transcricao}","tipo":"chuva","registros":[{"pivo":"nome exato","mm":número,"data":"YYYY-MM-DD"}]}
Se não for sobre chuva: {"transcricao":"${transcricao}","tipo":"desconhecido","registros":[]}
Regras: "os dois"/"ambos" = todos os pivôs. Sem data = hoje (${today}).
Mensagem: "${transcricao}"`,
      }],
    }),
  })
  if (!resp.ok) throw new Error(`GPT error: ${resp.status}`)
  const d = await resp.json()
  return d.choices?.[0]?.message?.content || ''
}

async function downloadMedia(messageId: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(
      `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY!,
        },
        body: JSON.stringify({ message: { key: { id: messageId } } }),
      }
    )
    if (!response.ok) return null
    const data = await response.json()
    return {
      base64: data.base64 || data.data,
      mimeType: data.mimetype || data.mimeType || 'image/jpeg',
    }
  } catch (e) {
    console.error('downloadMedia error:', e)
    return null
  }
}

serve(async (req) => {
  try {
    const payload = await req.json()

    const data = payload.data || payload
    const remoteJid: string = data.key?.remoteJid || ''
    const phone = remoteJid.replace('@s.whatsapp.net', '')
    const fromMe: boolean = data.key?.fromMe || false
    const messageId: string = data.key?.id || ''

    if (fromMe || !phone) {
      return new Response('ok', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('id, company_id, contact_name')
      .eq('phone', phone)
      .eq('is_active', true)
      .single()

    if (!contact) {
      return new Response('ok', { status: 200 })
    }

    const { data: subscriptions } = await supabase
      .from('whatsapp_pivot_subscriptions')
      .select('pivot_id, pivots ( id, name )')
      .eq('contact_id', contact.id)

    const subs = (subscriptions ?? []) as Array<{ pivot_id: string; pivots: { id: string; name: string } | null }>

    const textMessage: string =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      ''

    const hasImage: boolean = !!(data.message?.imageMessage)
    const imageCaption: string = data.message?.imageMessage?.caption || ''
    // Áudio só é processado como áudio se não houver texto (texto tem prioridade)
    const hasAudio: boolean = !textMessage && !!(data.message?.audioMessage || data.message?.pttMessage)

    console.log('ROUTING:', { messageType: data.messageType, hasAudio, hasImage, textLen: textMessage.length, msgKeys: data.message ? Object.keys(data.message) : [] })

    let responseText = ''
    let messageType = 'unknown'

    // ── ROTA 0: ÁUDIO → Gemini transcreve + interpreta ──
    if (hasAudio) {
      messageType = 'rain_report'

      const media = await downloadMedia(messageId)

      if (!media) {
        await sendWhatsApp(phone, '❌ Não consegui processar o áudio. Tente enviar novamente ou escreva o comando.')
        return new Response('ok', { status: 200 })
      }

      const geminiKey = Deno.env.get('GEMINI_API_KEY')
      const openaiKey = Deno.env.get('OPENAI_API_KEY')
      const pivotNames = subs.map(s => s.pivots?.name).filter(Boolean).join(', ')
      const today = new Date().toISOString().slice(0, 10)

      if (!geminiKey && !openaiKey) {
        await sendWhatsApp(phone, '❌ IA não configurada. Use o formato texto: CHUVA VALLEY 15')
        return new Response('ok', { status: 200 })
      }

      try {
        let rawText = ''

        // Tenta Gemini primeiro (multimodal — transcreve + interpreta em 1 chamada)
        if (geminiKey) {
          const prompt = `Você é um assistente agrícola. O usuário enviou um áudio pelo WhatsApp.
Pivôs disponíveis: ${pivotNames || 'nenhum cadastrado'}
Data de hoje: ${today}

Transcreva o áudio e extraia registros de chuva se houver. Responda APENAS com JSON:
{
  "transcricao": "texto do que foi dito",
  "tipo": "chuva" | "status" | "resumo" | "desconhecido",
  "registros": [
    { "pivo": "nome exato do pivô", "mm": número, "data": "YYYY-MM-DD" }
  ]
}
Regras:
- Se mencionar "os dois" ou "ambos", aplique a todos os pivôs disponíveis
- Se não especificar data, use hoje (${today})
- Nomes dos pivôs devem ser exatamente como listados acima`

          const geminiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/ogg; codecs=opus', data: media.base64 } }] }],
                generationConfig: { temperature: 0, maxOutputTokens: 512 }
              })
            }
          )

          if (geminiResp.ok) {
            const geminiData = await geminiResp.json()
            rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
            console.log('Gemini audio response:', rawText.slice(0, 300))
          } else {
            const errBody = await geminiResp.text()
            console.warn(`Gemini falhou (${geminiResp.status}), tentando fallback OpenAI. Erro: ${errBody.slice(0, 200)}`)
          }
        }

        // Fallback: OpenAI Whisper (transcrição) + GPT-4o-mini (interpretação)
        if (!rawText && openaiKey) {
          // Converte base64 → Blob para Whisper
          const audioBytes = Uint8Array.from(atob(media.base64), c => c.charCodeAt(0))
          const formData = new FormData()
          formData.append('file', new Blob([audioBytes], { type: 'audio/ogg' }), 'audio.ogg')
          formData.append('model', 'whisper-1')
          formData.append('language', 'pt')

          const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiKey}` },
            body: formData,
          })

          if (!whisperResp.ok) throw new Error(`Whisper error: ${whisperResp.status}`)
          const whisperData = await whisperResp.json()
          const transcricao = whisperData.text || ''
          console.log('Whisper transcricao:', transcricao)

          rawText = await interpretWithGPT(transcricao, openaiKey!, pivotNames, today)
          console.log('GPT interpretation:', rawText.slice(0, 300))
        }

        if (!rawText) throw new Error('Nenhum provedor de IA disponível respondeu')

        // Parse JSON
        const cleaned = rawText.replace(/```json|```/g, '').trim()
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error(`JSON not found. Raw: ${rawText.slice(0, 200)}`)

        const parsed = JSON.parse(jsonMatch[0])
        const transcricao = parsed.transcricao || ''

        if (parsed.tipo === 'chuva' && parsed.registros?.length > 0) {
          const confirmLines: string[] = []
          const skipLines: string[] = []

          for (const reg of parsed.registros) {
            const sub = subs.find(s =>
              s.pivots?.name?.toUpperCase() === reg.pivo?.toUpperCase()
            )
            if (!sub) continue

            const isDuplicate = await checkRainDuplicate(supabase, sub.pivot_id, reg.data || null)
            const dateLabel = reg.data && reg.data !== today
              ? ` em ${reg.data.split('-').reverse().join('/')}`
              : ''

            if (isDuplicate) {
              skipLines.push(`⚠️ ${sub.pivots?.name}${dateLabel} — já registrado`)
              continue
            }

            await supabase.from('rain_reports').insert({
              contact_id: contact.id,
              pivot_id: sub.pivot_id,
              rainfall_mm: reg.mm,
              observation_date: reg.data || null,
              source: 'manual',
            })

            // Alimenta rainfall_records (fonte autoritativa do balanço hídrico)
            await supabase.from('rainfall_records').upsert({
              pivot_id: sub.pivot_id,
              date: reg.data || today,
              rainfall_mm: reg.mm,
              source: 'manual',
              notes: `Registrado via WhatsApp por ${contact.contact_name}`,
            }, { onConflict: 'pivot_id,date' })

            confirmLines.push(`✅ ${reg.mm}mm no pivô ${sub.pivots?.name}${dateLabel}`)
          }

          const transcricaoLabel = transcricao ? `_"${transcricao}"_\n\n` : ''
          const lines = [...confirmLines, ...skipLines]
          responseText = lines.length > 0
            ? `🎙️ ${transcricaoLabel}🌧️ *Resultado:*\n\n${lines.join('\n')}`
            : `🎙️ ${transcricaoLabel}❌ Não encontrei os pivôs mencionados.\nSeus pivôs: ${pivotNames}`

        } else if (parsed.tipo === 'status') {
          const names = subs.map(s => `📍 ${s.pivots?.name}`).join('\n') || 'Nenhum pivô cadastrado'
          responseText = `⚡ *Status dos seus pivôs:*\n\n${names}`

        } else {
          // Pergunta livre por voz → Gemini assistente agrícola com contexto real
          const userQuestion = transcricao || rawText
          if (userQuestion) {
            const pivotIds2 = subs.map(s => s.pivot_id)
            const yesterday2 = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
            const twoDaysAgo2 = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)

            const { data: seasons2 } = await supabase
              .from('seasons')
              .select('id, pivot_id, planting_date, crops ( name, stage1_days, stage2_days, stage3_days, stage4_days )')
              .in('pivot_id', pivotIds2)
              .eq('is_active', true)

            const seasonByPivot2: Record<string, any> = {}
            const seasonIds2: string[] = []
            for (const s of seasons2 ?? []) { seasonByPivot2[s.pivot_id] = s; seasonIds2.push(s.id) }

            const { data: mgmtRows2 } = seasonIds2.length > 0
              ? await supabase.from('daily_management')
                  .select('season_id, date, field_capacity_percent, ctda, cta, etc_mm, eto_mm, kc, rainfall_mm, needs_irrigation, recommended_depth_mm, recommended_speed_percent')
                  .in('season_id', seasonIds2).gte('date', yesterday2).order('date', { ascending: false })
              : { data: [] }

            const { data: weatherRows2 } = pivotIds2.length > 0
              ? await supabase.from('weather_data')
                  .select('pivot_id, date, temp_max, temp_min, humidity_percent, wind_speed_ms, solar_radiation_wm2, eto_mm')
                  .in('pivot_id', pivotIds2).gte('date', twoDaysAgo2).order('date', { ascending: false })
              : { data: [] }

            const pivotContextLines2: string[] = []
            for (const sub of subs) {
              const pivot = sub.pivots
              if (!pivot) continue
              const season = seasonByPivot2[sub.pivot_id]
              const crop = season?.crops
              const mgmt = (mgmtRows2 ?? []).find((m: any) => m.season_id === season?.id && m.date === today)
                ?? (mgmtRows2 ?? []).find((m: any) => m.season_id === season?.id)
              const weather = (weatherRows2 ?? []).find((w: any) => w.pivot_id === sub.pivot_id && w.date === yesterday2)
                ?? (weatherRows2 ?? []).find((w: any) => w.pivot_id === sub.pivot_id)
              let das2 = 0
              if (season?.planting_date) das2 = Math.max(1, Math.round((new Date(today + 'T12:00:00').getTime() - new Date(season.planting_date + 'T12:00:00').getTime()) / 86400000) + 1)
              let faseStr2 = ''
              if (crop && das2 > 0) {
                const s1 = crop.stage1_days ?? 15; const s2 = crop.stage2_days ?? 35; const s3 = crop.stage3_days ?? 40
                const fases = ['Inicial', 'Desenvolvimento', 'Floração', 'Maturação']
                let fase = 3
                if (das2 <= s1) fase = 0; else if (das2 <= s1 + s2) fase = 1; else if (das2 <= s1 + s2 + s3) fase = 2
                faseStr2 = ` | Fase: ${fases[fase]} (F${fase + 1})`
              }
              const mgmtLine2 = mgmt
                ? `CC: ${mgmt.field_capacity_percent?.toFixed(1)}% | ETo: ${mgmt.eto_mm?.toFixed(2)} mm/dia | ETc: ${mgmt.etc_mm?.toFixed(2)} mm/dia | Kc: ${mgmt.kc?.toFixed(2)} | Chuva: ${mgmt.rainfall_mm ?? 0} mm | Irrigar: ${mgmt.needs_irrigation ? `SIM (${mgmt.recommended_depth_mm?.toFixed(1)} mm, vel. ${mgmt.recommended_speed_percent}%)` : 'NÃO'} | Data: ${mgmt.date}`
                : 'Sem registro de balanço hídrico'
              const weatherDate2 = weather?.date ?? 'sem dados'
              const weatherLine2 = weather
                ? `Clima ${weatherDate2}: Tmax ${weather.temp_max}°C | Tmin ${weather.temp_min}°C | UR ${weather.humidity_percent}% | Vento ${weather.wind_speed_ms} m/s | ETo ${weather.eto_mm?.toFixed(2)} mm`
                : 'Sem dados climáticos recentes'
              pivotContextLines2.push(`Pivô: ${pivot.name}` + (crop ? ` | Cultura: ${crop.name} | DAS: ${das2}${faseStr2}` : '') + `\n  ${mgmtLine2}\n  ${weatherLine2}`)
            }

            const systemPrompt2 = `Você é o assistente agrícola do IrrigaAgro, sistema de manejo hídrico FAO-56.
REGRA: Responda SOMENTE perguntas sobre irrigação, manejo hídrico, clima, culturas, balanço hídrico, evapotranspiração, fases fenológicas, energia dos pivôs e operação agrícola. Para outros assuntos: "Só consigo ajudar com informações sobre seus pivôs e manejo hídrico. 🌱"
DADOS DOS PIVÔS (hoje: ${today}):\n${pivotContextLines2.join('\n\n') || 'Sem dados'}
INSTRUÇÕES: Use dados reais acima. Seja direto e objetivo. Máx 300 caracteres. Não invente dados.`

            console.log('AI2 call: geminiKey present=', !!geminiKey, 'question=', userQuestion.slice(0, 80))
            const aiResp2 = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: systemPrompt2 }] },
                  contents: [{ role: 'user', parts: [{ text: userQuestion }] }],
                  generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
                })
              }
            )
            if (aiResp2.ok) {
              const aiData2 = await aiResp2.json()
              const aiText2 = aiData2.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
              responseText = aiText2
                ? `🎙️ _"${transcricao}"_\n\n${aiText2}`
                : `🎙️ _"${transcricao}"_\n\n❓ Não consegui responder. Tente reformular.`
            } else {
              const errBody2 = await aiResp2.text()
              console.error(`Gemini AI2 error ${aiResp2.status}:`, errBody2.slice(0, 300))
              responseText = `🎙️ _"${transcricao}"_\n\n❓ Serviço temporariamente indisponível.`
            }
          } else {
            responseText = `🎙️ Não entendi o áudio. Tente novamente ou escreva:\nCHUVA VALLEY 15 | STATUS`
          }
        }

      } catch (e) {
        console.error('Audio AI error:', e)
        responseText = '❌ Não consegui processar o áudio. Tente escrever:\nCHUVA VALLEY 15\nCHUVA VALLEY 15 07/04'
      }

      await supabase.from('whatsapp_messages_log').insert({
        contact_id: contact.id,
        direction: 'inbound',
        message_type: messageType,
        content: '[áudio]',
        raw_payload: payload,
        status: 'delivered',
      })

      if (responseText) {
        const sendResp = await sendWhatsApp(phone, responseText)
        await supabase.from('whatsapp_messages_log').insert({
          contact_id: contact.id,
          direction: 'outbound',
          message_type: messageType,
          content: responseText,
          status: sendResp.ok ? 'sent' : 'failed',
        })
      }

      return new Response('ok', { status: 200 })
    }

    // ── ROTA 1: IMAGEM → OCR de fatura de energia ──
    if (hasImage) {
      messageType = 'energy_bill'

      await supabase.from('whatsapp_messages_log').insert({
        contact_id: contact.id,
        direction: 'inbound',
        message_type: 'energy_bill',
        content: imageCaption || '[imagem de fatura]',
        raw_payload: payload,
        status: 'delivered',
      })

      await sendWhatsApp(phone, '⏳ Processando sua fatura de energia... Aguarde alguns segundos.')

      const media = await downloadMedia(messageId)

      if (!media) {
        await sendWhatsApp(phone, '❌ Não consegui baixar a imagem. Tente enviar novamente.')
        return new Response('ok', { status: 200 })
      }

      let pivotId: string | null = null
      if (subs.length === 1) {
        pivotId = subs[0].pivot_id
      } else if (imageCaption && subs.length > 1) {
        const captionUpper = imageCaption.toUpperCase().trim()
        const match = subs.find(s => captionUpper.includes(s.pivots?.name?.toUpperCase() ?? ''))
        pivotId = match?.pivot_id ?? null
      }

      if (!pivotId && subs.length > 1) {
        const names = subs.map(s => s.pivots?.name).join(', ')
        await sendWhatsApp(
          phone,
          `📍 Qual pivô é essa fatura?\n\nSeus pivôs: ${names}\n\nReenvie a foto com o nome do pivô na legenda.\nEx: foto + legenda "NORTE"`
        )
        return new Response('ok', { status: 200 })
      }

      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
      const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      const ocrResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-energy-bill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          image_base64: media.base64,
          image_mime_type: media.mimeType,
          contact_id: contact.id,
          pivot_id: pivotId,
          company_id: contact.company_id,
        }),
      })

      const ocrResult = await ocrResponse.json()

      responseText = ocrResult.success
        ? ocrResult.confirmation_message
        : `❌ Não consegui ler a fatura.\n\n💡 Dicas:\n- Boa iluminação\n- Enquadre toda a fatura\n- Evite sombras\n\nTente enviar novamente.`

      await sendWhatsApp(phone, responseText)

      await supabase.from('whatsapp_messages_log').insert({
        contact_id: contact.id,
        direction: 'outbound',
        message_type: 'energy_bill',
        content: responseText,
        status: 'sent',
      })

      return new Response('ok', { status: 200 })
    }

    // ── ROTA 2: TEXTO → Parser de comandos ──
    if (!textMessage) {
      return new Response('ok', { status: 200 })
    }

    const msg = textMessage.toUpperCase().trim()

    if (msg.startsWith('CHUVA')) {
      messageType = 'rain_report'
      const parts = msg.split(/\s+/)
      let pivotId: string | null = null
      let rainfall: number | null = null
      let observationDate: string | null = null

      // Parse data opcional no formato DD/MM ou DD/MM/AAAA
      const parseDatePart = (s: string): string | null => {
        const m2 = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
        if (!m2) return null
        const day = m2[1].padStart(2, '0')
        const month = m2[2].padStart(2, '0')
        const year = m2[3]
          ? (m2[3].length === 2 ? `20${m2[3]}` : m2[3])
          : new Date().getFullYear().toString()
        return `${year}-${month}-${day}`
      }

      // Busca pivô por nome parcial (ex: "VALLEY" encontra "Pivô Valley")
      const findPivot = (token: string) =>
        subs.find(s => {
          const name = s.pivots?.name?.toUpperCase() ?? ''
          return name === token || name.includes(token) || token.includes(name)
        }) ?? null

      // Formatos aceitos:
      // CHUVA VALLEY 15
      // CHUVA VALLEY 15 07/04
      // CHUVA PIVÔ VALLEY 15       ← nome com espaço: agrega tokens até achar número
      // CHUVA 15          (se só tem 1 pivô)
      // CHUVA 15 07/04    (se só tem 1 pivô)

      // Tenta encontrar o índice do token numérico (mm) após "CHUVA"
      let mmIndex = -1
      for (let i = 1; i < parts.length; i++) {
        if (!isNaN(parseFloat(parts[i])) && parts[i].match(/^\d/)) {
          mmIndex = i
          break
        }
      }

      if (mmIndex > 1) {
        // Há tokens antes do número → nome do pivô
        const pivoToken = parts.slice(1, mmIndex).join(' ')
        const match = findPivot(pivoToken)
        if (match) {
          pivotId = match.pivot_id
          rainfall = parseFloat(parts[mmIndex])
          const datePart = parts[mmIndex + 1] ?? null
          if (datePart) observationDate = parseDatePart(datePart)
        }
      } else if (mmIndex === 1) {
        // Sem nome de pivô: CHUVA 15 [data]
        if (subs.length === 1) {
          pivotId = subs[0].pivot_id
          rainfall = parseFloat(parts[1])
          const datePart = parts[2] ?? null
          if (datePart) observationDate = parseDatePart(datePart)
        }
      }

      if (pivotId && rainfall !== null && !isNaN(rainfall)) {
        const name = subs.find(s => s.pivot_id === pivotId)?.pivots?.name || ''
        const dateLabel = observationDate
          ? ` em ${observationDate.split('-').reverse().join('/')}`
          : ''
        const isDuplicate = await checkRainDuplicate(supabase, pivotId, observationDate)
        if (isDuplicate) {
          responseText = `⚠️ Já existe um registro de chuva para o pivô ${name}${dateLabel}.\n\nSe o valor for diferente, entre em contato com o suporte.`
        } else {
          await supabase.from('rain_reports').insert({
            contact_id: contact.id,
            pivot_id: pivotId,
            rainfall_mm: rainfall,
            observation_date: observationDate,
            source: 'manual',
          })

          // Alimenta rainfall_records (fonte autoritativa do balanço hídrico)
          await supabase.from('rainfall_records').upsert({
            pivot_id: pivotId,
            date: observationDate || new Date().toISOString().slice(0, 10),
            rainfall_mm: rainfall,
            source: 'manual',
            notes: `Registrado via WhatsApp por ${contact.contact_name}`,
          }, { onConflict: 'pivot_id,date' })

          responseText = `✅ Registrado: ${rainfall}mm no pivô ${name}${dateLabel}`
        }
      } else if (!pivotId && parts.length >= 3) {
        const names = subs.map(s => s.pivots?.name).join(', ') || 'nenhum'
        responseText = `❌ Pivô não encontrado. Seus pivôs: ${names}\n\nExemplos:\nCHUVA VALLEY 15\nCHUVA VALLEY 15 07/04`
      } else {
        responseText = `❌ Formato inválido.\n\nExemplos:\nCHUVA VALLEY 15\nCHUVA VALLEY 15 07/04`
      }

    } else if (msg === 'SIM') {
      messageType = 'energy_bill'
      const { data: pendingBill } = await supabase
        .from('energy_bills')
        .select('id, reference_month')
        .eq('source', 'whatsapp')
        .eq('confirmed', false)
        .eq('company_id', contact.company_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (pendingBill) {
        await supabase.from('energy_bills').update({ confirmed: true }).eq('id', pendingBill.id)
        responseText = `✅ Fatura de ${pendingBill.reference_month} confirmada e salva!`
      } else {
        responseText = '👍 Recebido!'
      }

    } else if (msg === 'NÃO' || msg === 'NAO') {
      messageType = 'energy_bill'
      const { data: pendingBill } = await supabase
        .from('energy_bills')
        .select('id, reference_month')
        .eq('source', 'whatsapp')
        .eq('confirmed', false)
        .eq('company_id', contact.company_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (pendingBill) {
        await supabase.from('energy_bills').delete().eq('id', pendingBill.id)
        responseText = `🗑️ Fatura descartada. Envie a foto novamente para reprocessar.`
      } else {
        responseText = '📝 Ok, entendido.'
      }

    } else if (msg === 'OK' || msg === 'IRRIGANDO' || msg === 'IRRIGOU') {
      messageType = 'irrigation_confirm'
      // Buscar seasons ativas para os pivôs do contato
      const pivotIds = subs.map(s => s.pivot_id)
      const { data: seasons } = await supabase
        .from('seasons')
        .select('id, pivot_id')
        .in('pivot_id', pivotIds)
        .eq('is_active', true)

      const seasonByPivot: Record<string, string> = {}
      for (const s of seasons ?? []) seasonByPivot[s.pivot_id] = s.id
      const seasonIds = Object.values(seasonByPivot)

      // Buscar último balanço com lâmina recomendada
      const today = new Date().toISOString().slice(0, 10)
      const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
      const { data: mgmtRows } = seasonIds.length > 0
        ? await supabase
            .from('daily_management')
            .select('id, season_id, pivot_id, date, recommended_depth_mm, needs_irrigation')
            .in('season_id', seasonIds)
            .gte('date', twoDaysAgo.toISOString().slice(0, 10))
            .order('date', { ascending: false })
        : { data: [] }

      const mgmtBySeason: Record<string, any> = {}
      for (const row of mgmtRows ?? []) {
        if (!mgmtBySeason[row.season_id]) mgmtBySeason[row.season_id] = row
      }

      // Encontrar pivôs que precisavam irrigar
      const irrigationNeeded = subs.filter(s => {
        const sid = seasonByPivot[s.pivot_id]
        return sid && mgmtBySeason[sid]?.needs_irrigation
      })

      if (irrigationNeeded.length === 0) {
        responseText = '👍 Recebido! Nenhum pivô com irrigação pendente no sistema.'
      } else {
        // Guardar estado pendente no log para aguardar confirmação de lâmina
        const pivoName = irrigationNeeded[0]?.pivots?.name || 'Pivô'
        const sid = seasonByPivot[irrigationNeeded[0].pivot_id]
        const recMm = mgmtBySeason[sid]?.recommended_depth_mm

        // Salvar contexto pendente como mensagem de log com status 'pending_confirmation'
        await supabase.from('whatsapp_messages_log').insert({
          contact_id: contact.id,
          direction: 'inbound',
          message_type: 'irrigation_confirm',
          content: msg,
          raw_payload: { pivot_id: irrigationNeeded[0].pivot_id, season_id: sid, recommended_mm: recMm },
          status: 'pending_lamina',
        })

        const recStr = recMm != null ? ` (ou responda *OK* para usar os *${recMm.toFixed(1)} mm* recomendados)` : ''
        responseText = `💧 *Quantos mm foram aplicados no ${pivoName}?*\n\nDigite o valor em mm${recStr}.`
      }

    } else if (/^\d+([.,]\d+)?$/.test(msg) || msg === 'OK MM') {
      // Resposta numérica após pergunta de lâmina
      messageType = 'irrigation_confirm'
      const { data: pending } = await supabase
        .from('whatsapp_messages_log')
        .select('id, raw_payload, created_at')
        .eq('contact_id', contact.id)
        .eq('status', 'pending_lamina')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (pending) {
        const { pivot_id, season_id, recommended_mm } = pending.raw_payload as any
        const laminaMm = msg === 'OK MM' ? recommended_mm : parseFloat(msg.replace(',', '.'))
        const today = new Date().toISOString().slice(0, 10)

        if (laminaMm > 0) {
          // Registrar irrigação no daily_management
          await supabase
            .from('daily_management')
            .update({ actual_depth_mm: laminaMm, needs_irrigation: false })
            .eq('season_id', season_id)
            .eq('date', today)

          // Marcar irrigation_schedule como done + atualizar lâmina real
          await supabase
            .from('irrigation_schedule')
            .update({ status: 'done', lamina_mm: laminaMm, updated_at: new Date().toISOString() })
            .eq('pivot_id', pivot_id)
            .eq('date', today)
            .in('status', ['planned', 'done'])

          // Marcar pendência como resolvida
          await supabase
            .from('whatsapp_messages_log')
            .update({ status: 'resolved' })
            .eq('id', pending.id)

          const pivName = subs.find(s => s.pivot_id === pivot_id)?.pivots?.name || 'Pivô'
          responseText = `✅ *Irrigação registrada!*\n\n📍 ${pivName}\n💧 Lâmina: ${laminaMm.toFixed(1)} mm\n\nBalanço atualizado no sistema.`
        } else {
          responseText = `❌ Valor inválido. Responda com o número de mm aplicados (ex: *15* ou *12.5*).`
        }
      } else {
        // Sem pendência — pode ser OK para confirmar lâmina recomendada
        responseText = '👍 Recebido!'
      }

    } else if (msg === 'ADIAR') {
      messageType = 'irrigation_confirm'
      responseText = '📝 Adiamento registrado. Acompanhe a previsão.'

    } else if (msg === 'STATUS') {
      messageType = 'manual'
      const names = subs.map(s => `📍 ${s.pivots?.name}`).join('\n') || 'Nenhum pivô cadastrado'
      responseText = `⚡ *Status dos seus pivôs:*\n\n${names}`

    } else if (msg === 'RESUMO') {
      messageType = 'daily_summary'
      responseText = `📊 *Resumo solicitado*\n\nConsulte o app para o balanço hídrico completo.\nhttps://irrigaagro.com.br`

    } else {
      // ── IA: Gemini com contexto real dos dados — chuva + perguntas livres ──
      messageType = 'ai_assistant'
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      const geminiKey = Deno.env.get('GEMINI_API_KEY')

      if (!geminiKey) {
        responseText = `❓ Não entendi sua mensagem.\n\n📋 *Exemplos:*\n"chuva de 15mm no Valley"\nSTATUS — ver pivôs\nRESUMO — link para o app`
      } else {
        // Buscar dados reais dos pivôs para contexto
        const pivotIds = subs.map(s => s.pivot_id)
        const pivotNames = subs.map(s => s.pivots?.name).filter(Boolean).join(', ')

        // Safras ativas
        const { data: seasons } = await supabase
          .from('seasons')
          .select('id, pivot_id, planting_date, crops ( name, stage1_days, stage2_days, stage3_days, stage4_days )')
          .in('pivot_id', pivotIds)
          .eq('is_active', true)

        const seasonByPivot: Record<string, any> = {}
        const seasonIds: string[] = []
        for (const s of seasons ?? []) {
          seasonByPivot[s.pivot_id] = s
          seasonIds.push(s.id)
        }

        // Últimos balanços hídricos (hoje + ontem)
        const { data: mgmtRows } = seasonIds.length > 0
          ? await supabase
              .from('daily_management')
              .select('season_id, date, field_capacity_percent, ctda, cta, etc_mm, eto_mm, kc, rainfall_mm, needs_irrigation, recommended_depth_mm, recommended_speed_percent')
              .in('season_id', seasonIds)
              .gte('date', yesterday)
              .order('date', { ascending: false })
          : { data: [] }

        // Clima recente (ontem e anteantes)
        const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
        const { data: weatherRows } = pivotIds.length > 0
          ? await supabase
              .from('weather_data')
              .select('pivot_id, date, temp_max, temp_min, humidity_percent, wind_speed_ms, solar_radiation_wm2, eto_mm')
              .in('pivot_id', pivotIds)
              .gte('date', twoDaysAgo)
              .order('date', { ascending: false })
          : { data: [] }

        // Montar contexto por pivô
        const pivotContextLines: string[] = []
        for (const sub of subs) {
          const pivot = sub.pivots
          if (!pivot) continue
          const season = seasonByPivot[sub.pivot_id]
          const crop = season?.crops
          const mgmt = (mgmtRows ?? []).find((m: any) => m.season_id === season?.id && m.date === today)
            ?? (mgmtRows ?? []).find((m: any) => m.season_id === season?.id)
          const weather = (weatherRows ?? []).find((w: any) => w.pivot_id === sub.pivot_id && w.date === yesterday)
            ?? (weatherRows ?? []).find((w: any) => w.pivot_id === sub.pivot_id)

          let das = 0
          if (season?.planting_date) {
            das = Math.max(1, Math.round((new Date(today + 'T12:00:00').getTime() - new Date(season.planting_date + 'T12:00:00').getTime()) / 86400000) + 1)
          }

          // Fase fenológica
          let faseStr = ''
          if (crop && das > 0) {
            const s1 = crop.stage1_days ?? 15
            const s2 = crop.stage2_days ?? 35
            const s3 = crop.stage3_days ?? 40
            const fases = ['Inicial', 'Desenvolvimento', 'Floração', 'Maturação']
            let fase = 3
            if (das <= s1) fase = 0
            else if (das <= s1 + s2) fase = 1
            else if (das <= s1 + s2 + s3) fase = 2
            faseStr = ` | Fase: ${fases[fase]} (F${fase + 1})`
          }

          const mgmtLine = mgmt
            ? `CC: ${mgmt.field_capacity_percent?.toFixed(1)}% | ETo: ${mgmt.eto_mm?.toFixed(2)} mm/dia | ETc: ${mgmt.etc_mm?.toFixed(2)} mm/dia | Kc: ${mgmt.kc?.toFixed(2)} | Chuva: ${mgmt.rainfall_mm ?? 0} mm | Irrigar: ${mgmt.needs_irrigation ? `SIM (${mgmt.recommended_depth_mm?.toFixed(1)} mm, vel. ${mgmt.recommended_speed_percent}%)` : 'NÃO'} | Data registro: ${mgmt.date}`
            : 'Sem registro de balanço hídrico'

          const weatherDate = weather?.date ?? 'sem dados'
          const weatherLine = weather
            ? `Clima ${weatherDate}: Tmax ${weather.temp_max}°C | Tmin ${weather.temp_min}°C | UR ${weather.humidity_percent}% | Vento ${weather.wind_speed_ms} m/s | Rad ${weather.solar_radiation_wm2?.toFixed(0)} W/m² | ETo ${weather.eto_mm?.toFixed(2)} mm`
            : 'Sem dados climáticos recentes'

          pivotContextLines.push(
            `Pivô: ${pivot.name}` +
            (crop ? ` | Cultura: ${crop.name} | DAS: ${das}${faseStr}` : '') +
            `\n  Balanço hídrico: ${mgmtLine}` +
            `\n  ${weatherLine}`
          )
        }

        const contexto = pivotContextLines.join('\n\n')

        const systemPrompt = `Você é o assistente agrícola do IrrigaAgro, um sistema de manejo hídrico baseado no método FAO-56.

REGRA PRINCIPAL: Responda SOMENTE perguntas relacionadas a irrigação, manejo hídrico, clima, culturas, balanço hídrico, evapotranspiração, fases fenológicas, energia elétrica dos pivôs e operação agrícola.
Se a pergunta não tiver relação com agricultura/irrigação, responda: "Só consigo ajudar com informações sobre seus pivôs e manejo hídrico. 🌱"

DADOS REAIS DOS PIVÔS DO USUÁRIO (hoje: ${today}):
${contexto || 'Nenhum dado disponível'}

INSTRUÇÕES:
- Use os dados acima para responder com números reais
- ETo = evapotranspiração de referência (demanda atmosférica)
- ETc = evapotranspiração da cultura (ETo × Kc)
- CC% = capacidade de campo atual do solo (0-100%)
- Seja direto e objetivo — mensagem de WhatsApp
- Use emojis com moderação
- Não invente dados que não estão no contexto
- Se perguntado sobre "ontem", use os dados do dia anterior disponíveis
- Máximo 300 caracteres na resposta quando possível`

        try {
          const geminiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: textMessage }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
              })
            }
          )

          if (geminiResp.ok) {
            const geminiData = await geminiResp.json()
            const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

            if (aiText) {
              // Verificar se é uma chuva disfarçada (Gemini pode detectar)
              // Se o texto da IA menciona "registrado" ou contém mm, verificar se é comando de chuva
              responseText = aiText
            } else {
              responseText = `❓ Não consegui processar sua pergunta. Tente reformular.`
            }
          } else {
            const errBody = await geminiResp.text()
            console.error(`Gemini error ${geminiResp.status}:`, errBody.slice(0, 200))
            responseText = `❓ Serviço temporariamente indisponível. Tente novamente em instantes.`
          }
        } catch (e) {
          console.error('AI assistant error:', e)
          responseText = `❓ Erro ao processar. Tente: CHUVA VALLEY 15 | STATUS | RESUMO`
        }
      }
    }

    await supabase.from('whatsapp_messages_log').insert({
      contact_id: contact.id,
      direction: 'inbound',
      message_type: messageType,
      content: textMessage,
      raw_payload: payload,
      status: 'delivered',
    })

    if (responseText) {
      const sendResp = await sendWhatsApp(phone, responseText)
      const sendData = await sendResp.json().catch(() => null)

      await supabase.from('whatsapp_messages_log').insert({
        contact_id: contact.id,
        direction: 'outbound',
        message_type: messageType,
        content: responseText,
        raw_payload: sendData,
        status: sendResp.ok ? 'sent' : 'failed',
      })
    }

    return new Response('ok', { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response('error', { status: 500 })
  }
})

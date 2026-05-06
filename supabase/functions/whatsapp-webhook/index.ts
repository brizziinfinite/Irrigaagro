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

async function sendWhatsAppImage(phone: string, imageUrl: string, caption: string) {
  return fetch(`${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY!,
    },
    body: JSON.stringify({
      number: phone,
      mediatype: 'image',
      media: imageUrl,
      caption,
    }),
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

// Helper: chama process-energy-bill e envia resultado via WhatsApp
async function processEnergyBill(opts: {
  supabase: ReturnType<typeof createClient>
  phone: string
  contact: { id: string; company_id: string }
  media: { base64: string; mimeType: string }
  farmId: string
}) {
  const { supabase, phone, contact, media, farmId } = opts
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const ocrResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-energy-bill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({
      image_base64: media.base64,
      image_mime_type: media.mimeType,
      contact_id: contact.id,
      farm_id: farmId,
      company_id: contact.company_id,
    }),
  })

  const ocrResult = await ocrResponse.json()
  const responseText = ocrResult.success
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
}

async function downloadMedia(messageId: string, remoteJid?: string, fromMe?: boolean): Promise<{ base64: string; mimeType: string } | null> {
  try {
    console.log('downloadMedia: iniciando para messageId=', messageId)
    const key: Record<string, unknown> = { id: messageId }
    if (remoteJid) key.remoteJid = remoteJid
    if (fromMe !== undefined) key.fromMe = fromMe
    const response = await fetch(
      `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY!,
        },
        body: JSON.stringify({ message: { key } }),
      }
    )
    console.log('downloadMedia: status=', response.status)
    if (!response.ok) {
      const errBody = await response.text()
      console.error('downloadMedia: falhou status=', response.status, 'body=', errBody.slice(0, 300))
      return null
    }
    const data = await response.json()
    const base64 = data.base64 || data.data
    const mimeType = data.mimetype || data.mimeType || 'audio/ogg'
    console.log('downloadMedia: keys=', Object.keys(data), 'base64 len=', base64?.length ?? 0, 'mime=', mimeType)
    if (!base64) {
      console.error('downloadMedia: base64 vazio! data=', JSON.stringify(data).slice(0, 200))
      return null
    }
    return { base64, mimeType }
  } catch (e) {
    console.error('downloadMedia error:', e)
    return null
  }
}

// ─── Monta mensagem de escala de umidade para o agricultor ───────────────────
function buildSoilScaleMessage(pivotName: string, seasonName: string | null, soilTexture: string): string {
  // Instruções práticas por textura — linguagem de campo
  const guide: Record<string, { gesto: string; escala: string[] }> = {
    'arenoso': {
      gesto: 'Pegue um punhado de terra seca da profundidade e *aperte na mão fechada por 3 segundos*.',
      escala: [
        '🟫 *1 — SECO:* Escorre entre os dedos, não forma bolinha. Pó solto.',
        '🟤 *2 — POUCO ÚMIDO:* Forma bolinha frágil que esfarela fácil.',
        '🟢 *3 — ÚMIDO (ideal):* Bolinha que mantém a forma na mão aberta.',
        '💧 *4 — MUITO ÚMIDO:* Mão fica molhada, terra escorrega.',
        '🌊 *5 — ENCHARCADO:* Água sai ao apertar. Terra brilhante.',
      ],
    },
    'franco-arenoso': {
      gesto: 'Retire uma amostra a *30 cm*, aperte na mão e abra devagar.',
      escala: [
        '🟫 *1 — SECO:* Não gruda, escorre, cor clara/pálida.',
        '🟤 *2 — POUCO ÚMIDO:* Forma bolinha que racha ao dobrar.',
        '🟢 *3 — ÚMIDO (ideal):* Bolinha firme, levemente fria na mão.',
        '💧 *4 — MUITO ÚMIDO:* Deixa mancha úmida na palma.',
        '🌊 *5 — ENCHARCADO:* Escorrega entre os dedos, brilhante.',
      ],
    },
    'franco': {
      gesto: 'Retire uma amostra a *30 cm* e tente fazer uma *fita* entre o polegar e o indicador.',
      escala: [
        '🟫 *1 — SECO:* Torrão quebra fácil, não molda, cor desbotada.',
        '🟤 *2 — POUCO ÚMIDO:* Molda com dificuldade, fita não forma.',
        '🟢 *3 — ÚMIDO (ideal):* Fita curta de 1-3 cm antes de quebrar.',
        '💧 *4 — MUITO ÚMIDO:* Fita de 3-5 cm, superfície levemente brilhante.',
        '🌊 *5 — ENCHARCADO:* Fita longa e brilhante. Água visível.',
      ],
    },
    'franco-argiloso': {
      gesto: 'Retire uma amostra a *30 cm* e tente fazer uma *fita* entre o polegar e o indicador.',
      escala: [
        '🟫 *1 — SECO:* Solo duro, trincado, rachaduras visíveis.',
        '🟤 *2 — POUCO ÚMIDO:* Firme, quebra com esforço, não forma fita.',
        '🟢 *3 — ÚMIDO (ideal):* Fita de 5-8 cm, plástico, não brilha.',
        '💧 *4 — MUITO ÚMIDO:* Fita longa e brilhante, escorregadio.',
        '🌊 *5 — ENCHARCADO:* Muito escorregadio, água sai ao apertar.',
      ],
    },
    'argiloso': {
      gesto: 'Retire uma amostra a *30 cm* e tente fazer uma *fita* entre o polegar e o indicador.',
      escala: [
        '🟫 *1 — SECO:* Muito duro, rachaduras, impossível moldar.',
        '🟤 *2 — POUCO ÚMIDO:* Duro, difícil de moldar, fita curta.',
        '🟢 *3 — ÚMIDO (ideal):* Fita longa (>8 cm), levemente brilhante.',
        '💧 *4 — MUITO ÚMIDO:* Fita longa e brilhante, muito escorregadio.',
        '🌊 *5 — ENCHARCADO:* Extremamente escorregadio. Água na superfície.',
      ],
    },
  }

  const info = guide[soilTexture] ?? guide['franco']
  const header = `🌱 *${pivotName}*${seasonName ? ` — ${seasonName}` : ''}`

  return `${header}\n\n${info.gesto}\n\n` +
    `${info.escala.join('\n')}\n\n` +
    `_Solo: ${soilTexture}_\n\n` +
    `*Qual numero descreve melhor o seu solo agora?* (1 a 5)`
}

// ─── Formata resposta do diagnóstico para WhatsApp ───────────────────────────
// deno-lint-ignore no-explicit-any
function formatDiagnosisResponse(result: any, pivotName: string, aiAnalysis: any): string {
  const statusEmoji: Record<string, string> = {
    critical: '🚨',
    below_threshold: '⚠️',
    ok: '✅',
    near_fc: '💧',
    saturated: '🌊',
  }
  const emoji = statusEmoji[result.management_status] ?? '🌱'

  const actionText: Record<string, string> = {
    irrigate_now: '*Irrigar hoje!*',
    irrigate_soon: `Programar irrigação para *${result.next_check_date ? result.next_check_date.split('-').reverse().join('/') : 'amanhã'}*`,
    wait: 'Não precisa irrigar ainda.',
    no_action: 'Solo saturado — *não irrigar*.',
  }
  const action = actionText[result.action] ?? 'Monitorar.'

  const fcRaw = result.estimated_fc_percent ?? result.percent_available
  const fcPercent = fcRaw != null ? Math.round(Number(fcRaw)) : '?'
  let msg = `${emoji} *Solo — ${pivotName}*\n`
  msg += `💧 *${fcPercent}% da CC*\n\n`
  msg += `🕒 ${action}\n`

  if (result.recommended_irrigation_mm > 0) {
    msg += `💦 Lâmina: *${result.recommended_irrigation_mm} mm*`
    if (result.hours_estimated) msg += ` (~${result.hours_estimated}h de pivô)`
    msg += '\n'
  }

  if (result.weather_context) {
    msg += `\n${result.weather_context}\n`
  }

  if (aiAnalysis) {
    if (aiAnalysis.agrees_with_user_assessment) {
      msg += `\n📷 Foto confirma análise (IA ${aiAnalysis.confidence}%). Ótimo!`
    } else if (aiAnalysis.confidence >= 60) {
      msg += `\n📷 _Atenção: foto sugere faixa ${aiAnalysis.estimated_behavior_range}. Recomendo repetir._`
    }
  }

  return msg
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

    const hasImage: boolean = !!(data.message?.imageMessage || data.message?.documentMessage)
    const imageCaption: string = data.message?.imageMessage?.caption || data.message?.documentMessage?.caption || ''
    // Áudio só é processado como áudio se não houver texto (texto tem prioridade)
    const hasAudio: boolean = !textMessage && !!(data.message?.audioMessage || data.message?.pttMessage)

    console.log('ROUTING:', { messageType: data.messageType, hasAudio, hasImage, textLen: textMessage.length, msgKeys: data.message ? Object.keys(data.message) : [] })

    let responseText = ''
    let messageType = 'unknown'

    // ── ROTA 0: ÁUDIO → Gemini transcreve + interpreta ──
    if (hasAudio) {
      messageType = 'rain_report'

      // Tenta usar base64 já presente no payload (Evolution API com base64=true no webhook)
      const audioMsg = data.message?.audioMessage || data.message?.pttMessage
      const payloadBase64: string | null = data.message?.base64 || null
      const payloadMime: string = audioMsg?.mimetype || 'audio/ogg; codecs=opus'

      console.log('AUDIO: payloadBase64 len=', payloadBase64?.length ?? 0, 'mime=', payloadMime, 'messageId=', messageId)

      let media: { base64: string; mimeType: string } | null = null

      if (payloadBase64) {
        // Usa o base64 já presente no payload — sem request extra
        media = { base64: payloadBase64, mimeType: payloadMime }
        console.log('AUDIO: usando base64 do payload')
      } else {
        // Fallback: tenta baixar da Evolution API
        console.log('AUDIO: base64 ausente no payload, tentando downloadMedia')
        media = await downloadMedia(messageId, remoteJid, fromMe)
      }

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

Transcreva o áudio e classifique o tipo. Responda APENAS com JSON válido e completo:
{
  "transcricao": "texto exato do que foi dito",
  "tipo": "chuva" | "diagnostico" | "pergunta" | "status" | "desconhecido",
  "registros": [
    { "pivo": "nome exato do pivô", "mm": número, "data": "YYYY-MM-DD" }
  ]
}
Regras de classificação (em ordem de prioridade):
- "chuva": mencionou chuva, milímetros, mm, precipitação com quantidade numérica
- "diagnostico": pediu para TESTAR O SOLO fisicamente (diagnóstico manual, amostrar solo, verificar umidade do solo com a mão/sonda)
- "pergunta": fez uma PERGUNTA sobre dados do sistema (umidade, irrigar, status, balanço, previsão, quando irrigar)
- "status": pediu lista/resumo dos pivôs sem fazer pergunta específica
- "desconhecido": qualquer outro caso
Exemplos → "choveu 15mm no valley" = chuva | "qual a umidade?" = pergunta | "diagnosticar solo" = diagnostico
- Preencha "registros" somente para tipo "chuva"
- Se mencionar "os dois" ou "ambos", aplique a todos os pivôs disponíveis
- Se não especificar data para chuva, use hoje (${today})`

          console.log('GEMINI: iniciando chamada, base64 len=', media.base64.length, 'mime=', 'audio/ogg; codecs=opus')
          let geminiResp: Response
          try {
            geminiResp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/ogg; codecs=opus', data: media.base64 } }] }],
                  generationConfig: { temperature: 0, maxOutputTokens: 1024 }
                })
              }
            )
          } catch (fetchErr: any) {
            console.error('GEMINI: fetch() threw exception:', fetchErr?.message ?? fetchErr)
            throw fetchErr
          }

          console.log('GEMINI: status=', geminiResp.status, 'ok=', geminiResp.ok)
          if (geminiResp.ok) {
            let geminiData: any
            try {
              geminiData = await geminiResp.json()
            } catch (parseErr: any) {
              const rawBody = await geminiResp.text().catch(() => '<unreadable>')
              console.error('GEMINI: failed to parse JSON response. Raw body:', rawBody.slice(0, 500))
              throw parseErr
            }
            rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
            const finishReason = geminiData.candidates?.[0]?.finishReason
            console.log('GEMINI: finishReason=', finishReason, 'rawText len=', rawText.length, 'preview=', rawText.slice(0, 200))
            if (!rawText && finishReason) {
              console.warn('GEMINI: empty text, finishReason=', finishReason, 'full response=', JSON.stringify(geminiData).slice(0, 500))
            }
          } else {
            const errBody = await geminiResp.text()
            console.warn(`GEMINI: falhou status=${geminiResp.status}. Erro: ${errBody.slice(0, 400)}`)
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
              sector_id: null,
              notes: `Registrado via WhatsApp por ${contact.contact_name}`,
            }, { onConflict: 'pivot_id,date,sector_id' })

            confirmLines.push(`✅ ${reg.mm}mm no pivô ${sub.pivots?.name}${dateLabel}`)
          }

          const transcricaoLabel = transcricao ? `_"${transcricao}"_\n\n` : ''
          const lines = [...confirmLines, ...skipLines]
          responseText = lines.length > 0
            ? `🎙️ ${transcricaoLabel}🌧️ *Resultado:*\n\n${lines.join('\n')}`
            : `🎙️ ${transcricaoLabel}❌ Não encontrei os pivôs mencionados.\nSeus pivôs: ${pivotNames}`

        } else if (parsed.tipo === 'diagnostico') {
          // Áudio pediu diagnóstico — inicia fluxo de seleção de pivô
          const pivotList = subs.map((s, i) => `${i + 1} — ${s.pivots?.name}`).join('\n')
          if (subs.length === 1) {
            const foundSub = subs[0]
            const { data: pivotFull } = await supabase.from('pivots').select('soil_texture').eq('id', foundSub.pivot_id).single()
            const soilTexture = pivotFull?.soil_texture ?? 'franco'
            const { data: activeSeason } = await supabase.from('seasons').select('id, name').eq('pivot_id', foundSub.pivot_id).eq('is_active', true).limit(1).single()
            await supabase.from('whatsapp_sessions').upsert({
              phone_number: phone, company_id: contact.company_id,
              current_flow: 'soil_diagnosis', flow_step: 'awaiting_behavior',
              context: { pivot_id: foundSub.pivot_id, pivot_name: foundSub.pivots?.name, soil_texture: soilTexture, season_id: activeSeason?.id ?? null },
              last_interaction: new Date().toISOString(),
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }, { onConflict: 'phone_number' })
            const SCALE_IMAGE_URL3 = 'https://wvwjbzpnujmyvzvadctp.supabase.co/storage/v1/object/public/soil-diagnosis-photos/scale/soil-moisture-scale.png'
            await sendWhatsAppImage(phone, SCALE_IMAGE_URL3, 'Escala de umidade do solo')
            responseText = buildSoilScaleMessage(foundSub.pivots?.name ?? 'Pivô', activeSeason?.name ?? null, soilTexture)
          } else {
            await supabase.from('whatsapp_sessions').upsert({
              phone_number: phone, company_id: contact.company_id,
              current_flow: 'soil_diagnosis', flow_step: 'awaiting_pivot_selection',
              context: {}, last_interaction: new Date().toISOString(),
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }, { onConflict: 'phone_number' })
            responseText = `🌱 *Diagnóstico Manual do Solo*\n\nQual pivô?\n\n${pivotList}\n\nResponda com o número (1, 2...)`
          }

        } else if (parsed.tipo === 'status') {
          const pivotIds_st = subs.map(s => s.pivot_id)
          const { data: seasons_st } = await supabase
            .from('seasons')
            .select('id, pivot_id')
            .in('pivot_id', pivotIds_st)
            .eq('is_active', true)
          const seasonIds_st = (seasons_st ?? []).map((s: any) => s.id)
          const seasonByPivot_st: Record<string, string> = {}
          for (const s of seasons_st ?? []) seasonByPivot_st[s.pivot_id] = s.id
          let lastBalance_st: Record<string, any> = {}
          if (seasonIds_st.length > 0) {
            const { data: recs_st } = await supabase
              .from('daily_management')
              .select('season_id, date, field_capacity_percent, etc_mm, recommended_depth_mm, needs_irrigation')
              .in('season_id', seasonIds_st)
              .order('date', { ascending: false })
              .limit(seasonIds_st.length * 5)
            for (const r of recs_st ?? []) {
              if (!lastBalance_st[r.season_id]) lastBalance_st[r.season_id] = r
            }
          }
          const lines_st = subs.map(s => {
            const name = s.pivots?.name ?? 'Pivô'
            const sid = seasonByPivot_st[s.pivot_id]
            const b = sid ? lastBalance_st[sid] : null
            if (!b) return `📍 *${name}*\n   ⚠️ Sem dados recentes`
            const fc = b.field_capacity_percent != null ? `${Math.round(b.field_capacity_percent)}%` : '—'
            const etc = b.etc_mm != null ? `${b.etc_mm.toFixed(1)}mm` : '—'
            const lam = b.recommended_depth_mm != null ? `${b.recommended_depth_mm.toFixed(1)}mm` : '—'
            const status = b.needs_irrigation ? '🔴 Irrigar' : '🟢 OK'
            return `📍 *${name}*\n   💧 FC: ${fc} | ETc: ${etc}\n   Lâmina rec.: ${lam} | ${status}`
          })
          responseText = `⚡ *Status dos seus pivôs:*\n\n${lines_st.join('\n\n') || 'Nenhum pivô cadastrado'}`

        } else {
          // Pergunta livre por voz → Gemini assistente agrícola com contexto real
          const userQuestion = transcricao || rawText
          if (userQuestion) {
            const pivotIds2 = subs.map(s => s.pivot_id)

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
                  .in('season_id', seasonIds2).order('date', { ascending: false }).limit(seasonIds2.length * 2)
              : { data: [] }

            const { data: weatherRows2 } = pivotIds2.length > 0
              ? await supabase.from('weather_data')
                  .select('pivot_id, date, temp_max, temp_min, humidity_percent, wind_speed_ms, solar_radiation_wm2, eto_mm')
                  .in('pivot_id', pivotIds2).order('date', { ascending: false }).limit(pivotIds2.length * 2)
              : { data: [] }

            const pivotContextLines2: string[] = []
            for (const sub of subs) {
              const pivot = sub.pivots
              if (!pivot) continue
              const season = seasonByPivot2[sub.pivot_id]
              const crop = season?.crops
              const mgmt = (mgmtRows2 ?? []).find((m: any) => m.season_id === season?.id && m.date === today)
                ?? (mgmtRows2 ?? []).find((m: any) => m.season_id === season?.id)
              const weather = (weatherRows2 ?? []).find((w: any) => w.pivot_id === sub.pivot_id)
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

      } catch (e: any) {
        const errMsg = e?.message ?? String(e)
        console.error('Audio AI error:', errMsg)
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

      const media = await downloadMedia(messageId, remoteJid, fromMe)
      if (!media) {
        await sendWhatsApp(phone, '❌ Não consegui baixar a imagem. Tente enviar novamente.')
        return new Response('ok', { status: 200 })
      }

      // Buscar fazendas da empresa do contato
      const { data: farmsData } = await supabase
        .from('farms')
        .select('id, name')
        .eq('company_id', contact.company_id)
        .order('name')

      const farms = (farmsData ?? []) as Array<{ id: string; name: string }>

      if (farms.length === 0) {
        await sendWhatsApp(phone, '❌ Nenhuma propriedade cadastrada. Acesse o app para cadastrar.')
        return new Response('ok', { status: 200 })
      }

      // Uma fazenda → processa direto
      if (farms.length === 1) {
        await sendWhatsApp(phone, '⏳ Processando sua fatura de energia... Aguarde alguns segundos.')
        await processEnergyBill({ supabase, phone, contact, media, farmId: farms[0].id })
        return new Response('ok', { status: 200 })
      }

      // Múltiplas fazendas → guardar imagem na sessão e perguntar qual
      const farmList = farms.map((f, i) => `*${i + 1}.* ${f.name}`).join('\n')
      await supabase.from('whatsapp_sessions').upsert({
        phone_number: phone,
        company_id: contact.company_id,
        current_flow: 'energy_bill_farm',
        flow_step: 'awaiting_farm_selection',
        context: {
          image_base64: media.base64,
          image_mime_type: media.mimeType,
          farms,  // [{ id, name }]
        },
        last_interaction: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
      }, { onConflict: 'phone_number' })

      await sendWhatsApp(
        phone,
        `📍 *Para qual propriedade é essa fatura?*\n\n${farmList}\n\nResponda com o número.`
      )
      return new Response('ok', { status: 200 })
    }

    // ── ROTA 2: TEXTO → Parser de comandos ──
    if (!textMessage && !hasImage) {
      return new Response('ok', { status: 200 })
    }

    const msg = textMessage.toUpperCase().trim()
    const today = new Date().toISOString().slice(0, 10)

    // ── BUSCA SESSÃO ATIVA — feita ANTES de qualquer handler ──────────────────
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('phone_number', phone)
      .single()

    const sessionExpired = session && new Date(session.expires_at) < new Date()

    // ── Sessão: seleção de fazenda para fatura de energia ──────────────────────
    if (session && !sessionExpired && session.current_flow === 'energy_bill_farm' && session.flow_step === 'awaiting_farm_selection') {
      const numStr = msg.trim()
      const num = parseInt(numStr, 10)
      const farms = (session.context?.farms ?? []) as Array<{ id: string; name: string }>

      if (isNaN(num) || num < 1 || num > farms.length) {
        const farmList = farms.map((f, i) => `*${i + 1}.* ${f.name}`).join('\n')
        await sendWhatsApp(phone, `❌ Responda com um número de 1 a ${farms.length}.\n\n${farmList}`)
        return new Response('ok', { status: 200 })
      }

      const selectedFarm = farms[num - 1]

      // Limpar sessão
      await supabase.from('whatsapp_sessions').delete().eq('phone_number', phone)

      await sendWhatsApp(phone, `⏳ Processando fatura para *${selectedFarm.name}*...`)

      const media = {
        base64: session.context.image_base64 as string,
        mimeType: session.context.image_mime_type as string,
      }

      await processEnergyBill({ supabase, phone, contact, media, farmId: selectedFarm.id })
      return new Response('ok', { status: 200 })
    }

    const activeSession = session && !sessionExpired && session.current_flow === 'soil_diagnosis'

    // Se há sessão ativa de diagnóstico, QUALQUER mensagem vai para a máquina de estados
    // (evita que "3", "4", "pular" sejam capturados por outros handlers)
    const diagnosisHandled = activeSession || false

    // Detecta comando de início: "diagnóstico", "diagnostico", "diag solo", "umidade solo", etc.
    const isDiagnosisStart = /diagn[oó]stico|diagn[oó]stic|diagn[oó]sti|diagn[oó]st|diag\s+solo|diag\s+piv[oô]|umidade\s+solo|solo\s+piv|solo\s+diag/i.test(textMessage)

    // ── ROTA 3: MÁQUINA DE ESTADOS — Diagnóstico do Solo ──────────────────────

    // ── 3a. Início do fluxo ────────────────────────────────────────────────
    if (!activeSession && isDiagnosisStart) {
      messageType = 'soil_diagnosis'

      // Extrai nome/número do pivô da mensagem
      const pivotMatch = textMessage.match(/piv[oô]?\s*([a-zA-Z0-9\s]+)/i)
      const pivotHint = pivotMatch?.[1]?.trim().toUpperCase() ?? ''

      // Encontra o pivô
      let foundSub = subs.find(s => {
        const name = s.pivots?.name?.toUpperCase() ?? ''
        return pivotHint && (name === pivotHint || name.includes(pivotHint) || pivotHint.includes(name))
      })
      if (!foundSub && subs.length === 1) foundSub = subs[0]

      if (!foundSub) {
        const pivotList = subs.map((s, i) => `${i + 1} — ${s.pivots?.name}`).join('\n')
        responseText = `🌱 *Diagnóstico Manual do Solo*\n\nQual pivô?\n\n${pivotList}\n\nResponda com o *número* (1, 2...) ou *diagnóstico pivô [nome]*`
        // Cria sessão aguardando seleção de pivô
        await supabase.from('whatsapp_sessions').upsert({
          phone_number: phone,
          company_id: contact.company_id,
          current_flow: 'soil_diagnosis',
          flow_step: 'awaiting_pivot_selection',
          context: {},
          last_interaction: new Date().toISOString(),
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }, { onConflict: 'phone_number' })
      } else {
        // Busca textura cadastrada ou usa padrão
        const { data: pivotFull } = await supabase
          .from('pivots')
          .select('soil_texture')
          .eq('id', foundSub.pivot_id)
          .single()
        const soilTexture = pivotFull?.soil_texture ?? 'franco'

        // Busca safra ativa
        const { data: activeSeason } = await supabase
          .from('seasons')
          .select('id, name')
          .eq('pivot_id', foundSub.pivot_id)
          .eq('is_active', true)
          .limit(1)
          .single()

        // Cria/atualiza sessão
        await supabase.from('whatsapp_sessions').upsert({
          phone_number: phone,
          user_id: contact ? (await supabase.auth.admin.getUserById(contact.id).catch(() => ({ data: { user: null } }))).data.user?.id ?? null : null,
          company_id: contact.company_id,
          current_flow: 'soil_diagnosis',
          flow_step: 'awaiting_behavior',
          context: {
            pivot_id: foundSub.pivot_id,
            pivot_name: foundSub.pivots?.name,
            soil_texture: soilTexture,
            season_id: activeSeason?.id ?? null,
          },
          last_interaction: new Date().toISOString(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }, { onConflict: 'phone_number' })

        const SCALE_IMAGE_URL = 'https://wvwjbzpnujmyvzvadctp.supabase.co/storage/v1/object/public/soil-diagnosis-photos/scale/soil-moisture-scale.png'
        await sendWhatsAppImage(phone, SCALE_IMAGE_URL, 'Escala de umidade do solo — metodo FAO/USDA')
        responseText = buildSoilScaleMessage(foundSub.pivots?.name ?? 'Pivô', activeSeason?.name ?? null, soilTexture)
      }

    // ── 3b. Seleção de pivô por número ────────────────────────────────────
    } else if (activeSession && session.flow_step === 'awaiting_pivot_selection') {
      messageType = 'soil_diagnosis'
      const numMatch = msg.match(/^([1-9]\d*)$/)
      const idx = numMatch ? parseInt(numMatch[1]) - 1 : -1
      const byName = subs.find(s => s.pivots?.name?.toUpperCase().includes(msg))

      const chosenSub = (idx >= 0 && idx < subs.length) ? subs[idx] : (byName ?? null)

      if (!chosenSub) {
        const pivotList = subs.map((s, i) => `${i + 1} — ${s.pivots?.name}`).join('\n')
        responseText = `❌ Opção inválida.\n\n${pivotList}\n\nResponda com o número (1, 2...)`
      } else {
        const { data: pivotFull } = await supabase.from('pivots').select('soil_texture').eq('id', chosenSub.pivot_id).single()
        const soilTexture = pivotFull?.soil_texture ?? 'franco'
        const { data: activeSeason } = await supabase.from('seasons').select('id, name').eq('pivot_id', chosenSub.pivot_id).eq('is_active', true).limit(1).single()

        await supabase.from('whatsapp_sessions').update({
          flow_step: 'awaiting_behavior',
          context: {
            pivot_id: chosenSub.pivot_id,
            pivot_name: chosenSub.pivots?.name,
            soil_texture: soilTexture,
            season_id: activeSeason?.id ?? null,
          },
          last_interaction: new Date().toISOString(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }).eq('phone_number', phone)

        const SCALE_IMAGE_URL2 = 'https://wvwjbzpnujmyvzvadctp.supabase.co/storage/v1/object/public/soil-diagnosis-photos/scale/soil-moisture-scale.png'
        await sendWhatsAppImage(phone, SCALE_IMAGE_URL2, 'Escala de umidade do solo — metodo FAO/USDA')
        responseText = buildSoilScaleMessage(chosenSub.pivots?.name ?? 'Pivô', activeSeason?.name ?? null, soilTexture)
      }

    // ── 3c. Aguardando score (1-5) ─────────────────────────────────────────
    } else if (activeSession && session.flow_step === 'awaiting_behavior') {
      messageType = 'soil_diagnosis'
      const scoreMatch = msg.match(/^[1-5]$/)

      if (!scoreMatch) {
        responseText = '❌ Por favor responda com um número de *1 a 5*.'
      } else {
        const score = parseInt(msg)
        const ctx = session.context as Record<string, unknown>

        // Atualiza sessão com score e passa para próximo passo
        await supabase.from('whatsapp_sessions').update({
          flow_step: 'awaiting_photo',
          context: { ...ctx, behavior_range: score },
          last_interaction: new Date().toISOString(),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }).eq('phone_number', phone)

        responseText = `📸 Perfeito!\n\nSe puder, mande uma *foto da amostra na palma da mão* — a IA vai validar o resultado.\n\nOu responda *pular* para ir direto ao resultado.`
      }

    // ── 3c. Aguardando foto ────────────────────────────────────────────────
    } else if (activeSession && session.flow_step === 'awaiting_photo' && hasImage) {
      messageType = 'soil_diagnosis'
      const ctx = session.context as Record<string, unknown>
      const pivotId = ctx.pivot_id as string
      const seasonId = ctx.season_id as string | null
      const soilTexture = ctx.soil_texture as string
      const behaviorRange = ctx.behavior_range as number

      // Download da imagem
      const media = await downloadMedia(messageId, remoteJid, fromMe)
      let photoUrl: string | null = null
      let aiAnalysis = null

      if (media) {
        // Upload para Supabase Storage
        const ext = 'jpg'
        const storagePath = `${contact.company_id}/${pivotId}/${Date.now()}.${ext}`
        const imageBytes = Uint8Array.from(atob(media.base64), c => c.charCodeAt(0))

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
        const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        const uploadResp = await fetch(
          `${SUPABASE_URL}/storage/v1/object/soil-diagnosis-photos/${storagePath}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'image/jpeg',
            },
            body: imageBytes,
          }
        )

        if (uploadResp.ok) {
          photoUrl = `${SUPABASE_URL}/storage/v1/object/public/soil-diagnosis-photos/${storagePath}`
        }

        // Chama Gemini para validar a foto
        const geminiKey = Deno.env.get('GEMINI_API_KEY')
        if (geminiKey && media.base64) {
          const textureDescPt: Record<string, string> = {
            'arenoso': 'arenoso — não forma fita, grãos visíveis',
            'franco-arenoso': 'franco-arenoso — pouca plasticidade',
            'franco': 'franco — plasticidade moderada, forma fita curta',
            'franco-argiloso': 'franco-argiloso — plástico, forma fita média',
            'argiloso': 'argiloso — muito plástico, fita longa',
          }
          const textureDesc = textureDescPt[soilTexture] ?? soilTexture

          const geminiPrompt = `Você é um especialista em ciência do solo.
Esta é uma foto de uma amostra de solo ${textureDesc}.
O agricultor descreveu o solo como grau ${behaviorRange}/5 (1=seco/crítico, 5=encharcado/excessivo).

Analise a foto e responda APENAS com JSON:
{
  "estimated_behavior_range": <número 1-5>,
  "agrees_with_user_assessment": <true ou false>,
  "confidence": <número 0-100>,
  "visible_color": "<descricao da cor: escuro_umido, medio, claro_seco>"
}
Critérios:
- 1: Solo seco, cor clara/pálida, rachaduras ou pó
- 2: Ligeiramente úmido, cor levemente escurecida
- 3: Úmido, cor média, amostra coesa
- 4: Muito úmido, cor escura, brilho leve
- 5: Encharcado, cor muito escura, água visível`

          try {
            const geminiResp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: geminiPrompt },
                      { inline_data: { mime_type: media.mimeType || 'image/jpeg', data: media.base64 } }
                    ]
                  }],
                  generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 256 }
                })
              }
            )

            if (geminiResp.ok) {
              const geminiData = await geminiResp.json()
              const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
              const cleaned = rawText.replace(/```json|```/g, '').trim()
              const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
              if (jsonMatch) aiAnalysis = JSON.parse(jsonMatch[0])
            }
          } catch (e) {
            console.error('Gemini photo analysis error:', e)
          }
        }
      }

      // Chama Edge Function diagnose-soil
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
      const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      const diagnoseResp = await fetch(`${SUPABASE_URL}/functions/v1/diagnose-soil`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          pivot_id: pivotId,
          season_id: seasonId,
          sample_depth_cm: 30,
          soil_texture: soilTexture,
          behavior_range: behaviorRange,
          photo_url: photoUrl,
          ai_analysis: aiAnalysis,
          source: 'whatsapp',
          company_id: contact.company_id,
        }),
      })

      const result = await diagnoseResp.json()
      responseText = formatDiagnosisResponse(result, (ctx.pivot_name as string) ?? 'Pivô', aiAnalysis)

      // Reset sessão
      await supabase.from('whatsapp_sessions').update({
        current_flow: null, flow_step: null, context: {},
        last_interaction: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }).eq('phone_number', phone)

      // Se divergência alta, envia mensagem adicional após 500ms
      if (result.divergence?.requires_action) {
        await sendWhatsApp(phone, responseText)
        responseText = `⚠️ *Divergência detectada*\n\nModelo previa: ${result.divergence.modeled_percent?.toFixed(0)}% da CC\nVocê mediu: ${result.percent_available?.toFixed(0)}% da CC\nDiferença: ${result.divergence.difference_pct?.toFixed(0)} pontos\n\nPossíveis causas:\n• Distribuição irregular da irrigação\n• Kc da cultura desatualizado\n• Vazamento no pivô\n\nVerifique no app: www.irrigaagro.com.br`
      }

    // ── 3d. Pular foto → vai direto ao resultado ───────────────────────────
    } else if (activeSession && session.flow_step === 'awaiting_photo' && /pular|sem foto|pulando|skip/i.test(textMessage)) {
      messageType = 'soil_diagnosis'
      const ctx = session.context as Record<string, unknown>
      const pivotId = ctx.pivot_id as string
      const seasonId = ctx.season_id as string | null
      const soilTexture = ctx.soil_texture as string
      const behaviorRange = ctx.behavior_range as number

      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
      const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      const diagnoseResp = await fetch(`${SUPABASE_URL}/functions/v1/diagnose-soil`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          pivot_id: pivotId,
          season_id: seasonId,
          sample_depth_cm: 30,
          soil_texture: soilTexture,
          behavior_range: behaviorRange,
          photo_url: null,
          ai_analysis: null,
          source: 'whatsapp',
          company_id: contact.company_id,
        }),
      })

      const result = await diagnoseResp.json()
      responseText = formatDiagnosisResponse(result, (ctx.pivot_name as string) ?? 'Pivô', null)

      // Reset sessão
      await supabase.from('whatsapp_sessions').update({
        current_flow: null, flow_step: null, context: {},
        last_interaction: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }).eq('phone_number', phone)

    // ── 3e. Sessão expirada — informa ao usuário ───────────────────────────
    } else if (session && sessionExpired && session.current_flow === 'soil_diagnosis') {
      messageType = 'soil_diagnosis'
      await supabase.from('whatsapp_sessions').update({
        current_flow: null, flow_step: null, context: {},
      }).eq('phone_number', phone)
      responseText = '⏱️ A sessão de diagnóstico expirou. Para recomeçar, envie:\n\n*diagnóstico pivô [nome]*'

    } else if (msg.startsWith('CHUVA')) {
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
            sector_id: null,
            notes: `Registrado via WhatsApp por ${contact.contact_name}`,
          }, { onConflict: 'pivot_id,date,sector_id' })

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
      const pivotIds_st2 = subs.map(s => s.pivot_id)
      const { data: seasons_st2 } = await supabase
        .from('seasons')
        .select('id, pivot_id')
        .in('pivot_id', pivotIds_st2)
        .eq('is_active', true)
      const seasonIds_st2 = (seasons_st2 ?? []).map((s: any) => s.id)
      const seasonByPivot_st2: Record<string, string> = {}
      for (const s of seasons_st2 ?? []) seasonByPivot_st2[s.pivot_id] = s.id
      let lastBalance_st2: Record<string, any> = {}
      if (seasonIds_st2.length > 0) {
        const { data: recs_st2 } = await supabase
          .from('daily_management')
          .select('season_id, date, field_capacity_percent, etc_mm, recommended_depth_mm, needs_irrigation')
          .in('season_id', seasonIds_st2)
          .order('date', { ascending: false })
          .limit(seasonIds_st2.length * 5)
        for (const r of recs_st2 ?? []) {
          if (!lastBalance_st2[r.season_id]) lastBalance_st2[r.season_id] = r
        }
      }
      const lines_st2 = subs.map(s => {
        const name = s.pivots?.name ?? 'Pivô'
        const sid = seasonByPivot_st2[s.pivot_id]
        const b = sid ? lastBalance_st2[sid] : null
        if (!b) return `📍 *${name}*\n   ⚠️ Sem dados recentes`
        const fc = b.field_capacity_percent != null ? `${Math.round(b.field_capacity_percent)}%` : '—'
        const etc = b.etc_mm != null ? `${b.etc_mm.toFixed(1)}mm` : '—'
        const lam = b.recommended_depth_mm != null ? `${b.recommended_depth_mm.toFixed(1)}mm` : '—'
        const status = b.needs_irrigation ? '🔴 Irrigar' : '🟢 OK'
        return `📍 *${name}*\n   💧 FC: ${fc} | ETc: ${etc}\n   Lâmina rec.: ${lam} | ${status}`
      })
      responseText = `⚡ *Status dos seus pivôs:*\n\n${lines_st2.join('\n\n') || 'Nenhum pivô cadastrado'}`

    } else if (msg === 'RESUMO') {
      messageType = 'daily_summary'
      responseText = `📊 *Resumo solicitado*\n\nConsulte o app para o balanço hídrico completo.\nhttps://irrigaagro.com.br`

    } else {
      // ── IA: Gemini com contexto real dos dados — chuva + perguntas livres ──
      messageType = 'ai_assistant'
      const today = new Date().toISOString().slice(0, 10)
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

        // Últimos balanços hídricos — sem filtro de data (usa o mais recente disponível)
        const { data: mgmtRows } = seasonIds.length > 0
          ? await supabase
              .from('daily_management')
              .select('season_id, date, field_capacity_percent, ctda, cta, etc_mm, eto_mm, kc, rainfall_mm, needs_irrigation, recommended_depth_mm, recommended_speed_percent')
              .in('season_id', seasonIds)
              .order('date', { ascending: false })
              .limit(seasonIds.length * 2)
          : { data: [] }

        // Clima recente — sem filtro de data (usa o mais recente disponível)
        const { data: weatherRows } = pivotIds.length > 0
          ? await supabase
              .from('weather_data')
              .select('pivot_id, date, temp_max, temp_min, humidity_percent, wind_speed_ms, solar_radiation_wm2, eto_mm')
              .in('pivot_id', pivotIds)
              .order('date', { ascending: false })
              .limit(pivotIds.length * 2)
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
          const weather = (weatherRows ?? []).find((w: any) => w.pivot_id === sub.pivot_id)

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

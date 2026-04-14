/**
 * Recalcula as safras ativas diretamente via API Supabase (sem precisar de DNS).
 * Usa o mesmo endpoint da Vercel, mas via service key direto.
 *
 * Uso: SUPABASE_SERVICE_ROLE_KEY=xxx NEXT_PUBLIC_ETO_CORRECTION_FACTOR=0.82 node scripts/recalculate-local.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://wvwjbzpnujmyvzvadctp.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET
const VERCEL_URL = process.env.VERCEL_URL || 'https://irrigaagro-v2.vercel.app'

if (!SERVICE_KEY) {
  console.error('❌  SUPABASE_SERVICE_ROLE_KEY não definida')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: seasons } = await supabase
  .from('seasons')
  .select('id, name')
  .eq('is_active', true)

if (!seasons?.length) {
  console.error('❌  Nenhuma safra ativa')
  process.exit(1)
}

console.log(`\n🌱 ${seasons.length} safra(s) ativa(s)\n`)

// Chama a função Edge do Supabase (invoke) ou diretamente a rota de recálculo
// Como não temos DNS local, chamamos a API functions/v1/recalculate via fetch com service key
// Mas a rota está no Next.js (Vercel). Usaremos o script inline via importação ESM.

// Alternativa: chamar via Supabase REST + RPC (não temos RPC para isso)
// Solução: chamar a rota Vercel diretamente com IP fixo

// IP da Vercel Edge: 76.76.21.21
const VERCEL_IP = '76.76.21.21'

for (const season of seasons) {
  console.log(`▶  ${season.name} (${season.id})`)

  try {
    const resp = await fetch(`https://${VERCEL_IP}/api/cron/recalculate-season`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_SECRET || ''}`,
        'Host': 'gotejo.com.br',
      },
      body: JSON.stringify({ season_id: season.id, last_days: 90 }),
    })

    if (resp.ok) {
      const json = await resp.json()
      console.log(`   ✓  processed=${json.seasons?.[0]?.processed}  skipped=${json.seasons?.[0]?.skipped}`)
    } else {
      console.log(`   ⚠  HTTP ${resp.status}`)
      const txt = await resp.text()
      console.log(`   ${txt.slice(0, 200)}`)
    }
  } catch (e) {
    console.log(`   ❌  ${e.message}`)
  }
}

// GET /api/admin/backfill-rainfall
// Varre weather_data e cria rainfall_records para dias com chuva > 0
// que ainda não têm registro manual. Protegido por CRON_SECRET.
// Parâmetros opcionais: ?from=YYYY-MM-DD&to=YYYY-MM-DD

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { TypedSupabaseClient } from '@/services/base'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as TypedSupabaseClient

  const from = req.nextUrl.searchParams.get('from') ?? '2025-01-01'
  const to   = req.nextUrl.searchParams.get('to')   ?? new Date().toISOString().split('T')[0]

  // Busca todos os pivôs com estação vinculada à fazenda
  const { data: pivots, error: pivotErr } = await (supabase as any)
    .from('pivots')
    .select('id, name, farms!inner(weather_stations(id))')

  if (pivotErr) return NextResponse.json({ error: pivotErr.message }, { status: 500 })

  let inserted = 0
  let skipped = 0
  const errors: string[] = []

  for (const pivot of (pivots ?? [])) {
    const station = pivot.farms?.weather_stations?.[0] ?? null
    if (!station) continue

    // Busca dias com chuva > 0 em weather_data para esta estação
    const { data: weatherRows, error: wErr } = await (supabase as any)
      .from('weather_data')
      .select('date, rainfall_mm')
      .eq('station_id', station.id)
      .gt('rainfall_mm', 0)
      .gte('date', from)
      .lte('date', to)
      .order('date')

    if (wErr) { errors.push(`${pivot.name}: ${wErr.message}`); continue }

    for (const row of (weatherRows ?? [])) {
      // Verifica se já existe registro para este pivô+data
      const { data: existing } = await (supabase as any)
        .from('rainfall_records')
        .select('id, source')
        .eq('pivot_id', pivot.id)
        .eq('date', row.date)
        .is('sector_id', null)
        .maybeSingle()

      if (existing) { skipped++; continue }

      // Insere com source='station' (veio da planilha da estação)
      const { error: insErr } = await (supabase as any)
        .from('rainfall_records')
        .insert({
          pivot_id: pivot.id,
          date: row.date,
          rainfall_mm: row.rainfall_mm,
          source: 'station',
          sector_id: null,
        })

      if (insErr) { errors.push(`${pivot.name}/${row.date}: ${insErr.message}`); continue }
      inserted++
    }
  }

  return NextResponse.json({ from, to, inserted, skipped, errors })
}

# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-03-30] Verificar Rs NASA a cada sessão**
   Do instead: rodar `SELECT date, rs_source, eto_mm FROM weather_data WHERE rs_source = 'plugfield_fallback' ORDER BY date DESC LIMIT 10` para ver se NASA já disponibilizou Rs novos. Quando aparecer `rs_source = 'nasa'`, recalibrar `ETO_PLUGFIELD_CORRECTION_FACTOR`.

2. **[2026-03-31] weather_data só grava se pivot tem weather_station**
   Do instead: o cron `ingest-weather` agora cria automaticamente uma `weather_station` virtual (`Virtual - {nome_pivô}`) quando a fazenda não tem estação cadastrada. Não é necessário criar estação manualmente.

3. **[2026-03-31] pivot_speed_table nunca era salva no banco**
   Do instead: `savePivotSpeedTable(pivotId, rows)` em `src/services/pivots.ts` faz delete+insert. É chamada automaticamente no `handleSubmit` do modal de pivô após `createPivot`/`updatePivot`.

## Shell & Command Reliability
1. **[2026-03-30] Reprocessar daily_management por data específica**
   Do instead: chamar `GET /api/cron/daily-balance?date=YYYY-MM-DD&force=true` para reprocessar um dia pontual sem apagar outros.

## Domain Behavior Guardrails
1. **[2026-03-30] ETo plugfield precisa de fator de correção**
   Do instead: aplicar `ETO_PLUGFIELD_CORRECTION_FACTOR=0.82` (env var na Vercel) quando `rs_source='plugfield_fallback'`. Fator baseado em comparação Davis 4.0mm vs FAO-56 sem correção 4.88mm.

2. **[2026-03-30] Rs deve vir de NASA, não de Plugfield**
   Do instead: `ingest-weather` tenta NASA POWER primeiro para Rs; só usa Plugfield como fallback. Conversão: `rsMJ / 0.0864 = W/m²`.

3. **[2026-03-30] daily-balance deve processar D-1, não hoje**
   Do instead: `weather_data` só tem D-1 (estação gera às 03h). Processar hoje = sem dados da estação = ETo Open-Meteo sem fator. Processar D-1 = usa `eto_mm` já corrigido do banco.

## User Directives
1. **[2026-03-31] Pivô Valley id: 43f3357c-8a8a-4418-9f79-3e8df01a3158**
   Do instead: ao debugar dados do Pivô Valley, usar este id nas queries diretas ao Supabase.

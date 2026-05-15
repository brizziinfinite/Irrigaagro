# Melhorias Planejadas — IrrigaAgro v2

Backlog de funcionalidades, correções e débitos técnicos.

---

## CORREÇÕES DA AUDITORIA (2026-03-24)

Resultado da auditoria completa de segurança, dados, erros e consistência.
Legenda: `[ ]` pendente · `[x]` feito

---

### P0 — CRÍTICA (bloqueia produção)

- [x] **1. Escopo de empresa ativo (client + server)** ✅ 2026-03-25
- [x] **2. /relatorios — queries sem company filter** ✅ 2026-03-25
- [x] **3. API /extract-energy-bill sem validação de ownership** ✅ 2026-03-25
- [x] **4. management.ts:listActiveManagementSeasonContexts sem company filter** ✅ 2026-03-25
- [x] **5. /precipitacoes — pivotId não validado antes de CRUD** ✅ 2026-03-25

---

### P1 — ALTA (risco funcional)

- [x] **6. /pivos — origem climática desalinhada com backend** ✅ 2026-03-25
- [x] **7. Shell de navegação — links e comportamento** ✅ 2026-03-25
- [x] **8. /dashboard — error handling e degradação** ✅ 2026-03-25
- [x] **9. Error boundaries globais** ✅ 2026-03-25

---

### P2 — MÉDIA (robustez e qualidade)

- [x] **10. /fazendas — error handling** ✅ 2026-03-25
- [x] **11. /precipitacoes — importação frágil** ✅ 2026-03-25
- [x] **12. /pivos — error state não funcional** ✅ 2026-03-25
- [x] **13. /safras — error handling ausente** ✅ 2026-03-25
- [x] **14. /estacoes — validação e retry** ✅ 2026-03-25
- [x] **15. /manejo — mix visual e consistência** ✅ 2026-03-25

---

### P3 — BAIXA (polish)

- [x] **16. Dashboard: HistoryBlock mistura dados reais com teóricos** ✅ 2026-03-25
- [x] **17. Types: PivotWeatherConfig genérico demais** ✅ 2026-03-25
- [x] **18. Lib: edge cases em water-balance.ts** ✅ 2026-03-25

---

## FUNCIONALIDADES

---

## ✅ Sistema de aprovação de clientes
**Status:** ✅ Implementado em 2026-04-27

Novo cliente se cadastra → fica em `pending` → Brizzi aprova → cliente acessa.

- [x] Migration: `status text DEFAULT 'pending'` em `companies`
- [x] `proxy.ts`: `pending`/`suspended` → `/aguardando`; `/admin` bloqueado para não super-admins
- [x] Página `/aguardando`: polling 15s, detecta aprovação e redireciona automaticamente
- [x] Página `/admin`: KPIs, filtros, Ativar/Suspender/Reativar
- [x] `RESEND_API_KEY`, `ADMIN_NOTIFY_EMAIL`, `WEBHOOK_SECRET` nas env vars Vercel
- [x] E-mail para Brizzi: notificação de novo cadastro via Resend
- [x] E-mail para cliente: confirmação de ativação via Resend
- [x] Trigger `on_new_user_notify` no Supabase

**Pendente:** configurar domínio `irrigaagro.com.br` no painel Resend para envio via domínio próprio

---

## 🗺️ Mapa interativo dos pivôs (Dashboard)
**Status:** ✅ Implementado em 2026-03-17

Pivôs exibidos como marcadores circulares coloridos no mapa satélite (Leaflet + Esri).
Cores por status de irrigação, popup com ETo/ETc/Chuva e barra de umidade, animação de pulso.

---

## 📊 Timeline comparativa (Manejo Diário)
**Status:** ✅ Implementado em 2026-04-22

`WaterBalanceChart.tsx` integrado em `/manejo`. Exibe ETo, ETc, Chuva e ADc% nos últimos registros da safra.
Cores por zona de segurança, tooltip com % da CC, área de onda animada na umidade atual.

---

## 🎯 UX orientada à decisão — Manejo Diário
**Status:** ✅ Implementado em 2026-04-23 · branch `refactor/manejo-decision-ux` mergeado no `main`

Refatoração completa da `/manejo/page.tsx` para experiência premium orientada à decisão.
Nenhuma lógica ou cálculo foi alterado — somente apresentação.

- **DecisionHero**: hierarquia tipográfica 4 linhas — título / número dominante 56px / contexto 2 itens / pivô
- **Lâmina em mm** como âncora visual principal (ou % umidade quando não precisa irrigar)
- **CTA primário** irresistível: gradient red/blue por status, hover `scale(1.02)`, active `scale(0.98)`
- **Context Strip**: 4 métricas (Umidade, Margem, Lâmina rec., ETc) em grid responsivo
- **Plano semanal com hierarquia temporal**: amanhã (peso 700, barra 100%), depois de amanhã (600, 70%), futuro (400, 45%)
- **Paleta neon eliminada**: substituída por brand colors (#0093D0, #22c55e, #ef4444, #d97706)
- **Zonas do gráfico suavizadas**: fillOpacity 0.02–0.03 para não competir com dados

---

## 🔀 Split-view comparação (Precipitações)
**Status:** ✅ Implementado em 2026-04-22

Botão "Comparar" em `/precipitacoes` abre segundo painel com seletor de pivô e mês independente.
Dois calendários sincronizados lado a lado com registros de chuva de cada pivô/período.

---

## 📄 Relatórios visuais (/relatorios)
**Status:** ✅ Implementado

KPIs por safra (total irrigado, ETc, eficiência hídrica, total de chuva), gráfico SVG de balanço,
tabela comparativa por período (7/10/15 dias), exportação CSV com BOM para Excel.
Link no sidebar sem badge "em breve".

---

## 🌡️ Integração estação meteorológica
**Status:** ✅ Implementado em 2026-03-26

Tabela `weather_stations` e `weather_data` populadas. Página `/estacoes` para cadastro.
Cadeia de fallback no cron: Plugfield → Google Sheets → Open-Meteo.
Estação Plugfield ativa: device 3228, 248 dias históricos importados.

---

## 🩺 Diagnóstico Manual do Solo
**Status:** Phase 1 + 2 + 3 + 4 ✅ — completo

- **Phase 1** ✅ 2026-04-22 — Wizard web 5 passos, tabela `soil_manual_diagnosis`, storage bucket
- **Phase 2** ✅ 2026-04-22 — WhatsApp state machine (`whatsapp_sessions`), edge function `diagnose-soil`
  - Flow: "diagnóstico" → lista pivôs → score 1-5 → foto/pular → resultado %CC + lâmina
- **Phase 3** ✅ 2026-05-05 — Página `/diagnostico-solo/historico`: gráfico evolução (balanço vs diagnóstico), KPIs, lista detalhada com scores por profundidade e modal de foto
- **Phase 4** ✅ 2026-05-05 — Calibração manual: botão aparece quando divergência ≥ 15pp, atualiza `daily_management` com nota de auditoria

---

## 🧪 Granulometria do Solo — Saxton & Rawls (2006)
**Status:** ✅ Implementado em 2026-05-04 · branch `feat/granulometric-soil-input`

Agricultor informa Areia/Silte/Argila/MO (%) e o sistema calcula CC, PMP e Ds automaticamente usando as Pedotransfer Functions (PTF) de Saxton & Rawls (2006). Três modos disponíveis:

- **Modo 1 — Sem análise**: tabela de texturas (5 classes FAO-56) — fallback para quem não tem laudo
- **Modo 2 — Análise granulométrica**: Areia/Silte/Argila/MO → CC/PMP/Ds calculados + classe textural USDA
- **Modo 3 — CC/PMP/Ds direto**: campos manuais para quem já tem os valores do laboratório

- `src/lib/soil/saxton-rawls.ts`: PTF completa (Equações 1-6), `calculateSoilProperties()`, `classifyTexture()` (triângulo USDA)
- `src/lib/soil/__tests__/saxton-rawls.test.ts`: 14 testes Vitest passando
- `src/components/pivots/SoilParametersInput.tsx`: componente com os 3 modos acima
- Migration: 7 colunas em `pivots` (`soil_input_method`, `soil_sand_pct`, `soil_silt_pct`, `soil_clay_pct`, `soil_organic_matter_pct`, `soil_texture_class`, `soil_texture`)
- Referências técnicas removidas da UI (sem FAO-56, Saxton & Rawls, PTF, kPa na tela do agricultor)

**Deploy:** ✅ Em produção — branch mergeada no main (verificado 2026-05-05)

---

## 🧱 Textura do solo — Seletor FAO-56
**Status:** ✅ Implementado em 2026-04-27 · ⚠️ Supersedido pelo sistema granulométrico em 2026-05-04

Integrado como "Modo 1" dentro de `SoilParametersInput`. Lógica e dados mantidos em `src/lib/soil-textures.ts`.

---

## 🌱 Culturas — Edição de culturas padrão
**Status:** ✅ Implementado em 2026-05-04

- Botão editar agora aparece também nas culturas padrão (system-wide, `company_id = null`)
- Ao editar uma cultura padrão e salvar, cria automaticamente uma cópia personalizada para a empresa — sem proliferação de "(cópia)" no nome
- Fix: `updateCrop` removido `.select().single()` que travava silenciosamente sob RLS (bug idêntico ao `updateFarm`)

---

## 📊 Alerta de cron com erros — super admin
**Status:** ✅ Implementado em 2026-05-04

`daily-balance/route.ts` envia e-mail via Resend para `ADMIN_NOTIFY_EMAIL` quando `errors > 0` ou `ok === 0`.
Só o super admin recebe — agricultor não vê nada. Resolve o problema do cron que falhou em 03/05 sem nenhum aviso.

---

## 🌾 Multi-cultura por pivô + Rateio de energia
**Status:** ✅ Implementado em 2026-05-04 · branch `feat/multi-season-per-pivot`

Suporte a N safras ativas no mesmo pivô (ex: 200ha com soja 70ha + milho 70ha + batata doce 60ha).
Rateio automático da conta de energia proporcional à área de cada cultura.

- Migration: `area_ha numeric(8,2)` em `seasons`
- Modal de safras: campo "Área desta cultura no pivô (ha)" — opcional (vazio = área total)
- Sidebar: N safras ativas exibidas com contagem + nomes separados por `·`
- Relatórios energia: bloco "Rateio de Energia por Cultura" — agrupa por pivô, calcula proporção por área, barra visual, fallback igualitário com aviso
- Balanço hídrico: sem mudança — `daily_management` já é por `season_id`, múltiplas safras geram registros independentes automaticamente

---

## 📅 Cronograma de safra — marcador "hoje"
**Status:** ✅ Implementado em 2026-05-04

`PhaseTimeline` em `/safras/page.tsx` agora mostra:
- Badge "Hoje — DAS X: Fase Mid" com cor da fase atual
- Linha branca vertical na posição exata do dia atual na barra de fases
- "Safra encerrada (DAS X)" quando ciclo já terminou

---

## 🎨 Polish UX — Safras, Culturas, Estações, WhatsApp, Diagnóstico
**Status:** ✅ Implementado em 2026-04-27

### Safras
Cards transformados em resumos de saúde: badge Ideal/Atenção/Crítico, umidade 32px, interpretação textual, ETc pill, CTA "Abrir manejo →", data relativa ("hoje"/"ontem").

### Culturas
Kc renomeado (Inicial/Crescimento/Final), linguagem natural, pill de ciclo, busca em tempo real, `SectionHeader` com barra colorida, CTA "Usar na safra →".

### Estações
Campos agrupados por categoria, resumo da última leitura no topo, histórico paginado (10/página), data padrão D-1, rótulos legíveis de origem, delete discreto.

### WhatsApp — Central de alertas
4 KPIs (contatos / pivôs / alertas / próximo envio), cards enriquecidos com chips de alerta e status, bloco "Como funciona", botão "Pivôs e alertas" com badge.

### Diagnóstico de Pivô — Centro operacional
Hero com borda dinâmica por status, interpretações textuais nas 4 métricas (ETo/Chuva/Manejo/Rota), botão "Gerar manejo agora" funcional, alertas humanizados com título + ação, timestamp de atualização.

---

## ✨ Padrão Tipográfico Global
**Status:** ✅ Implementado em 2026-04-27 · branch `feat/typography-system`

Aplicado em 16 arquivos (todas as páginas + componentes do dashboard). Regras fixas:

- **Título de página**: `fontSize: 24, fontWeight: 600, letterSpacing: '-0.025em'`
- **Valores KPI grandes**: `fontSize: 28, letterSpacing: '-0.025em'`
- **Valores médios (tabela)**: `fontSize: 14, fontWeight: 600`
- **Labels de card**: `fontSize: 12, color: '#94a3b8'`
- **Descrições de apoio**: `fontSize: 12, color: '#94a3b8', lineHeight: 1.625`
- **Headers de seção/accordion (uppercase)**: `fontSize: 12, color: '#cbd5e1', letterSpacing: '0.16em'`
- **Texto corpo/parágrafo**: `fontSize: 14, color: '#94a3b8', lineHeight: 1.625`
- **Texto terciário/muted**: `fontSize: 12, color: '#64748b'`
- **Labels de formulário**: `fontSize: 13, color: '#94a3b8'`
- **Rótulos badge/meta**: `fontSize: 11`
- **REGRA**: NUNCA usar classes Tailwind (Turbopack bug → 0px). Sempre inline `style={{}}`

---

## ⚡ Performance — Desktop e Mobile
**Status:** ✅ Implementado em 2026-04-28 · ✅ Lighthouse 97/100 em 2026-05-05

### Resultados Lighthouse (2026-05-05 — produção `irrigaagro.com.br`)
| Métrica | Antes | Depois |
|---|---|---|
| Performance | 46 | **97** |
| Accessibility | 93 | **100** |
| Best Practices | 75 | **100** |
| SEO | — | **91** |
| TBT | 6.400ms | **50ms** |
| FCP | ~3s | **0.9s** |
| LCP | ~7s | **2.4s** |

### Correções aplicadas em 2026-05-05
- **Cloudflare DNS Only**: registros A e CNAME `www` alterados de "Com proxy" → "Somente DNS" — eliminou `cdn-cgi/challenge-platform/scripts/jsd/main.js` (responsável por 6.400ms de TBT)
- **Font size mínimo 12px**: `IrrigaAgroLogo` tagline `Math.max(12, ...)` + labels login page 11→12px
- **aria-label** no botão show/hide senha (Accessibility 93→100)
- **favicon.ico** em `public/` (corrige 404 no Best Practices)
- **browserslist** modernos no `package.json` — remove polyfills `Array.at/flat/flatMap` (~14KB)
- **InstallBanner** iOS PWA wired no `AppShell`

### Correções anteriores (2026-04-28)
- `proxy.ts`: cookie `co_status` (TTL 5min) elimina query ao Supabase por navegação — ganho 200-600ms por página
- `AdminClient.tsx`: invalida cookie ao ativar/suspender empresa
- `next.config.ts`: `compress: true` + `optimizePackageImports` para lucide-react, date-fns, recharts

---

## 🌧️ Precipitação ↔ Manejo Diário (sync bidirecional)
**Status:** ✅ Corrigido e aprimorado em 2026-04-28 / 2026-04-30

- Modal de lançamento de chuva agora aguarda o recálculo do balanço hídrico antes de fechar
- **Trigger banco** `trg_rainfall_to_daily_management`: qualquer INSERT/UPDATE em `rainfall_records` recalcula automaticamente `rainfall_mm`, `ctda` e `field_capacity_percent` no `daily_management`
- Corrigido `onConflict: 'pivot_id,date,sector_id'` em webhook WhatsApp e ingest-weather (estava falhando silenciosamente)
- Krebbs agora recebe dados de chuva da estação Plugfield (faltava `gid` no `weather_config`)

---

## 📱 PWA — Ícone e manifest
**Status:** ✅ Implementado em 2026-05-05

Ícone PWA corrigido: substituído por logo oficial do IrrigaAgro (gota + barras de gráfico).
Gerados `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` e `apple-touch-icon.png`.

- `public/manifest.json`: `start_url` em `/dashboard`, `display: standalone`, orientação portrait, theme color da marca e ícone maskable dedicado
- `src/app/layout.tsx`: manifest, iOS web app metadata, apple touch icon, viewport fit e `themeColor: #0093D0`
- `src/proxy.ts`: libera `manifest.json`, `sw.js`, `offline.html` e `/icons/*` sem redirecionar para login
- `public/sw.js`: service worker manual com cache-first para assets e network-first para rotas principais visitadas (`/dashboard`, `/manejo`, `/relatorios`, `/precipitacoes`, `/lancamentos`)
- `public/offline.html`: fallback sem conexão com mensagem de último estado carregado
- Supabase e `/api/*` ficam fora do cache para não servir dados/ações sensíveis obsoletas
- Deploy de produção validado em `https://irrigaagro.com.br`:
  - `/manifest.json`, `/sw.js`, `/offline.html` e `/login` retornando 200
  - Screenshot mobile da tela de login conferido via Chrome headless

#### 6. Notificações Push ✅ Implementado 2026-05-05
- [x] Web Push API + `web-push` npm package
- [x] Tabela `push_subscriptions` no Supabase (user_id, endpoint, keys, last_sent_at)
- [x] Cron `/api/cron/send-push-alerts` às 17h UTC — agrupa pivôs urgentes por empresa
- [x] Toggle `PushNotificationToggle` no header — 3 estados (ativo/bloqueado/inativo)
- [x] Dedup: máximo 1 push/dia por usuário via `last_sent_at`
- [x] Cleanup automático de subscriptions expiradas (HTTP 410/404)
- [x] iOS: banner educativo `InstallBanner` (não dá solicitar install automaticamente)

### Checklist de qualidade PWA
- [x] Lighthouse PWA score ≥ 90 — ⚠️ Lighthouse 12 removeu categoria PWA separada; checklist substituído por métricas reais abaixo
- [ ] Instalável no Chrome Android e Safari iOS — requer teste em dispositivo físico
- [x] Ícone correto na tela inicial (sem fundo branco no iOS)
- [x] Splash screen com fundo `#0d1520`
- [x] Funciona offline para rotas visitadas recentemente (último estado cacheado)
- [x] `display: standalone` (sem barra de URL)
- [x] Theme color `#0093D0` na status bar do Android
- [x] `favicon.ico` público (sem 404) — corrigido 2026-05-05
- [x] Acessibilidade ≥ 90 (Lighthouse 12: **100**) — font-size ≥12px, aria-labels, contraste — corrigido 2026-05-05
- [x] Performance ≥ 90 (Lighthouse 12: **97**) — DNS Only + browserslist + favicon — corrigido 2026-05-05
- [x] Best Practices **100** — favicon.ico sem 404, sem cdn-cgi — corrigido 2026-05-05

---

## 🎙️ WhatsApp — Processamento de áudio (voz)
**Status:** ✅ Corrigido em 2026-04-30

- `maxOutputTokens` aumentado de 512 → 1024 (JSON era cortado antes de fechar)
- Adicionado tipo `"pergunta"` no prompt do Gemini (antes perguntas por voz caíam em `"diagnostico"`)
- Gemini 2.5 Flash processa áudio + transcreve + classifica em 1 chamada
- OpenAI Whisper mantido como fallback

---

## 🐛 Bugs corrigidos em 2026-05-05 (segunda parte da sessão)

### Fazendas — layout mobile quebrado
**Status:** ✅ Corrigido em 2026-05-05

Cards quebravam word-by-word em telas estreitas. Causa: `flexWrap` no container externo fazia botões de ação competirem com o texto.

- Reestruturado: ícone fixo à esquerda (44×44px), bloco de info com `flex:1 minWidth:0`
- Nome da fazenda + botões editar/excluir na mesma linha (`flex-start + gap`)
- CTA "Manejo" movido para baixo do bloco de info
- Sem `flexWrap` no container externo — layout nunca quebra

### Safras — FC% errado (mostrava 100% ou valor desatualizado)
**Status:** ✅ Corrigido em 2026-05-05

Página safras mostrava 79% (D-1 do banco) enquanto dashboard mostrava valor projetado correto.

- Causa: `getLastManagementBySeason` seleciona apenas 5 campos (sem `ctda`) → `projectAdcToDate` interpretava como "sem histórico" → retornava `initial_adc_percent = 100`
- Fix: substituído por `listDailyManagementBySeason` → `history[0]` tem `ctda` completo
- `SeasonFull` enriquecida com `_pivot` e `_farm` para passar ao `projectAdcToDate`
- Threshold usa `season._pivot?.alert_threshold_percent ?? 70`

### Diagnóstico de Pivô — precipitação de 2019 e "Origem desconhecida"
**Status:** ✅ Corrigido em 2026-05-05

- **Chuva 2019**: `listRainfallByPivotIds` sem filtro de data + ordem ascending → `[0]` era o registro mais antigo. Fix: passa `date, date` como `dateFrom/dateTo` + ordem `descending`
- **"Origem desconhecida"**: `etoSource` estava hardcoded `null`. Fix: computed de `climateSnapshot` — `'Estação climática'` ou `'Dados meteorológicos'`
- **Termos técnicos ocultos**: `getEtoSourceLabel` agora passa strings legíveis sem exibir "Plugfield", "FAO-56" ou "Open-Meteo" ao usuário

### Push alerts — SQL com colunas inexistentes
**Status:** ✅ Corrigido em 2026-05-05

- `seasons_1.company_id` não existe em `seasons` → query falhava silenciosamente
- `daily_management.pivot_id` não existe (tem `season_id`) → seleção errada
- Fix: derivar `company_id` via `pivots!inner(name, farms!inner(company_id))`; usar `season_id` no select

---

## 📐 NDVI — Cálculo automático de área dos talhões
**Status:** ✅ Implementado em 2026-05-12

- Fórmula de Shoelace com aproximação esférica (raio 6371000m) → hectares
- Preenche campo "Área (ha)" automaticamente ao fechar o polígono no mapa
- Badge "calculado do mapa" vs edição manual (borda âmbar + botão recalcular)
- MultiPolygon: soma de todas as áreas

---

## 📱 PWA — Suporte Android/Chrome (beforeinstallprompt)
**Status:** ✅ Implementado em 2026-05-12

- `InstallBanner.tsx` reescrito: captura `beforeinstallprompt`, exibe botão "Instalar app"
- iOS Safari mantém fluxo manual
- [ ] Testar em dispositivo físico Android + iOS

---

## 🎨 Migração CSS vars — todas as páginas
**Status:** ✅ Implementado em 2026-05-12

~3300 cores hardcoded → CSS custom properties em 45 arquivos.
Facilita manutenção e qualquer futura mudança de tema.

---

## 🛰️ NDVI Satélite — Monitoramento por Sentinel-2
**Status:** ✅ Implementado em 2026-05-06 · branch `feat/ndvi`

Página `/ndvi` com monitoramento de NDVI via Sentinel-2 (Planet Labs Insights Platform) para pivôs e talhões.

### Infraestrutura
- [x] Migration: tabela `ndvi_cache` (`pivot_id` ou `talhao_id`, `data_imagem`, `ndvi_medio/min/max`, `cobertura_nuvens_pct`, `imagem_url`, `fonte`)
- [x] Migration: tabela `talhoes` (`company_id`, `farm_id`, `name`, `area_ha`, `color`, `polygon_geojson`, `notes`)
- [x] Storage bucket `campo-ndvi` (público, PNG, max 10MB)
- [x] `polygon_geojson` adicionado à tabela `pivots` — gerado automaticamente ao salvar pivô (círculo 64 pontos)
- [x] Secret `PLANET_API_KEY` configurado nos Supabase Secrets
- [x] Edge function `ndvi-fetch` deployada — suporte a `pivot_id` e `talhao_id`
  - Auth: `Authorization: api-key <KEY>` (Planet Labs, não OAuth)
  - Statistics API → NDVI valores; Process API → PNG colorido salvo no Storage
  - Cache 10 dias; histórico 120 dias; intervalo 30 dias (`P30D`)
  - Retorna `sem_credenciais`, `ultima_atualizacao`, `dias_desde_ultima`
  - `sem_credenciais=true`: retorna cache existente em vez de erro 422

### Frontend
- [x] `src/hooks/useNdvi.ts` — 4 exports: `useNdviMultiplos`, `useNdviComparativo`, `useNdvi`, `useRefreshNdvi`, `classificarNdvi`
  - `useRefreshNdvi` aceita `{ pivot_id? } | { talhao_id? }`, expõe `error`
- [x] `src/services/talhoes.ts` — CRUD completo (`listTalhoesByCompany`, `createTalhao`, `updateTalhao`, `deleteTalhao`)
- [x] `src/app/(app)/ndvi/TalhaoMapDraw.tsx` — Leaflet + Geoman (polígono + retângulo), `existingPolygon`, `onPolygonChange`
- [x] `src/app/(app)/ndvi/page.tsx` — página completa
  - 3 abas: Pivôs / Talhões / Comparativo
  - Ranking pior→melhor NDVI com tendência (↑↓—) e variação %
  - CRUD de talhões com mapa de desenho de polígono
  - `NdviDetalhe` reutilizado para pivôs e talhões
  - Diagnóstico determinístico: 7 casos, `caindoForte`, `altaNuvens`, NDVI numérico real
  - Badge NDVI sobreposto na imagem satellite (valor + label colorido)
  - Legenda inline de 5 blocos coloridos `baixo → alto NDVI`
  - Coluna "Nuvens %" na tabela de leituras (âmbar quando >60%)
  - Estado vazio com botão inline "Atualizar agora"
  - Estado de erro com botão "Tentar novamente"
  - Datas via `date-fns/ptBR` (`d MMM yyyy`)
  - Header mostra `ultima_atualizacao` + `dias_desde_ultima`
  - Aviso `sem_credenciais` com `Info` icon
- [x] `src/types/database.ts` — `polygon_geojson` em `Pivot` e `PivotInsert`
- [x] `src/components/layout/Sidebar.tsx` — item "NDVI Satélite" com ícone Satellite no OPERACIONAL

---

## 🛰️ NDVI — Ativar credenciais Copernicus (próxima sessão)
**Status:** ⏳ Pendente — credenciais criadas mas OAuth retorna `unauthorized_client`

### Contexto
- Merge `feat/ndvi` → `main` feito em 2026-05-11, build limpo, rota `/ndvi` ativa em produção
- Edge function `ndvi-fetch` reescrita para Copernicus Data Space (mesmo padrão CampoPro)
- OAuth client criado em `shapps.dataspace.copernicus.eu` com nome "IrrigaAgro"
- `SENTINEL_CLIENT_ID=sh-4423891e-58ad-48c4-969e-cdffb2dfd73e` configurado no Supabase
- `SENTINEL_CLIENT_SECRET=UfILnzcJil3TmenT9rIiYPPICLkSODHD` configurado no Supabase

### O que fazer na próxima sessão
1. Testar token via curl (pode ter ativado após alguns minutos):
   ```bash
   curl -s -X POST "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&client_id=sh-4423891e-58ad-48c4-969e-cdffb2dfd73e&client_secret=UfILnzcJil3TmenT9rIiYPPICLkSODHD"
   ```
2. Se ainda der `unauthorized_client`: recriar o OAuth client no painel `shapps.dataspace.copernicus.eu` → Account Settings → OAuth clients → + Create
3. Após token funcionar: clicar "Atualizar via Satélite" nos dois pivôs e verificar PNG no Storage `campo-ndvi`

---

## 🌍 Fertilidade e nutrição
**Status:** Ideia futura

Integrar histórico de adubação ao balanço hídrico para correlação com rendimento.
Requer novo módulo e tabelas.

---

## 🔒 Auditoria de Segurança e Qualidade — 2026-05-13
**Status:** ✅ Concluído

### Fase 0 — Segurança
- [x] Webhook `notify-new-signup` fail-closed: retorna 503 se `WEBHOOK_SECRET` ausente (era fail-open)
- [x] `NEXT_PUBLIC_SUPER_ADMIN_EMAILS` removido — `isSuperAdmin` calculado server-side em `layout.tsx` e passado como prop
- [x] SW cache: removido cache de HTML autenticado; SW só faz fallback para `/offline.html` em erro de rede; bumped `irrigaagro-v4`
- [x] Next.js atualizado para 16.2.6

### Fase 1 — Qualidade
- [x] ESLint: 191 → 42 warnings (restantes são `no-explicit-any` em scripts de infra — deixados intencionalmente)
- [x] `argsIgnorePattern: '^_'` no `eslint.config.mjs`
- [x] `fromUntyped(client, table)` helper em `services/base.ts`
- [x] `ScheduleHistory.tsx`: ternário como statement → `if/else`
- [x] `PivotMap.tsx`: `<a>` → `<Link>`
- [x] `next.config.ts`: `remotePatterns` para Supabase Storage
- [x] `TalhaoMapDraw.tsx`: `@ts-expect-error` obsoletos removidos
- [x] Bug React: `NavItem` definido dentro de `Sidebar` → movido para fora (componente criado em render = re-mount em cada render)
- [x] Bug React: `Math.random()` em `Input.tsx` → `useId()` (Input + Select)
- [x] Bug React: `Date.now()` em `UltimaAtualizacao.tsx` → `useRef(Date.now())`
- [x] Bug React: JSX dentro de try/catch em `dashboard/page.tsx` → refatorado com variável de erro

### Fase 2 — Mobile
- [x] `RecommendationsMatrix.tsx`: `overflow: 'hidden'` → `overflow: 'clip'` — libera `overflowX: auto` interno para scroll horizontal em 390px
- [x] AppShell main padding: `clamp(16px, 4vw, 24px) clamp(12px, 4vw, 28px)`
- [x] Auditadas: manejo, lancamentos, relatorios — sem overflow real (minWidth em tabelas é intencional)

---

## PRÓXIMAS MELHORIAS (backlog priorizado — 2026-05-15)

### 🔴 Alta prioridade

#### 🛰️ NDVI Copernicus — ativar credenciais OAuth
**Status:** ✅ Resolvido em 2026-05-15

Client antigo `sh-4423891e...` invalidado. Novo client criado e testado com sucesso.
- `SENTINEL_CLIENT_ID=sh-823f6b85-25bd-41e3-8f13-ba695ad68306`
- Secrets atualizados no Supabase + `ndvi-fetch` redeployada
- Token retorna `access_token` válido (expires_in: 1800s)

**Próximo:** clicar "Atualizar via Satélite" nos dois pivôs em `/ndvi` para verificar PNG no Storage `campo-ndvi`.

---

#### 🌾 Fazenda Krebbs — parâmetros de solo
**Status:** ⏳ Pendente

Pivô Krebbs tem CC, PM, Ds = null. Preencher em `/pivos` → editar → Parâmetros de Solo.
Valores de referência (Latossolo Vermelho argiloso):
- CC ≈ 28-32%, PM ≈ 14-16%, Ds ≈ 1.2-1.3 g/cm³

---

#### 🔔 Push notifications — testar e validar
**Status:** ✅ Testado em 2026-05-15 — cron funciona, retorna `sent:0` corretamente quando FC% > threshold

Verificado: 2 subscriptions no DB, cron roda, avalia `needs_irrigation`, não envia quando FC%=88-90% (acima do threshold 70%). Fluxo completo OK. Só não foi possível testar push real pois pivôs não estão urgentes — validar quando FC% cair abaixo do threshold.

---

#### 🗓️ Calendário de manejo — merge para main
**Status:** ✅ Mergeado no `main` em 2026-05-15

Toggle Semana|Mês em `/lancamentos`, CalendarView.tsx, chips planejado/realizado/cancelado, navegação por mês, clique navega para semana correta. Responsivo (chips desktop, dots mobile).

---

### 🟢 Baixa prioridade / Futuro

#### 📧 Email Resend — domínio próprio
**Status:** ✅ Configurado e funcionando (2026-05-13)

#### 📱 Testes PWA em dispositivo físico
**Status:** ✅ Testado e funcionando (2026-05-13)

#### 💬 WhatsApp — alertas automáticos
**Status:** ✅ Testado e funcionando em produção (2026-05-13)

#### 📊 Relatório PDF exportável
Gerar PDF com balanço hídrico do período, gráficos e recomendações — para enviar ao produtor.

#### 🌐 Integração Valley AgSense API
Buscar automaticamente horas de funcionamento dos pivôs Valley para calcular lâmina real aplicada.

#### 📡 Integração Ecowitt WS2910
Estação meteorológica Ecowitt — importar dados via API local ou Ecowitt cloud.

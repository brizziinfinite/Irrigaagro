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

## 🔴 PRIORIDADE ALTA — Sistema de aprovação de clientes
**Status:** Pendente — implementar na próxima sessão (2026-04-25)

Novo cliente se cadastra → fica em `pending` → Brizzi aprova → cliente acessa.

**O que implementar (em ordem):**
- [ ] **Migration**: `status text DEFAULT 'pending'` em `companies`
- [ ] **Middleware** (`src/middleware.ts`): verifica `status` da company após login; `pending` → `/aguardando`
- [ ] **Página `/aguardando`**: tela informativa para cliente aguardar aprovação
- [ ] **Página `/admin`**: lista companies (pending/active/suspended), botões Ativar/Suspender — super-admin only
- [ ] **Resend**: criar conta, domínio `gotejo.com.br`, `RESEND_API_KEY` nas env vars Vercel
- [ ] **E-mail para Brizzi**: novo cadastro → notificação com nome/e-mail do cliente + link `/admin`
- [ ] **E-mail para cliente**: ativação → e-mail automático confirmando acesso liberado

**Dependências:**
- `isSuperAdmin()` já existe em `src/lib/super-admin.ts`
- Trigger `handle_new_user()` já cria a company — só adicionar `status = 'pending'`

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
**Status:** Phase 1 + 2 ✅ — Phase 3-5 pendentes

- **Phase 1** ✅ 2026-04-22 — Wizard web 5 passos, tabela `soil_manual_diagnosis`, storage bucket
- **Phase 2** ✅ 2026-04-22 — WhatsApp state machine (`whatsapp_sessions`), edge function `diagnose-soil`
  - Flow: "diagnóstico" → lista pivôs → score 1-5 → foto/pular → resultado %CC + lâmina
- **Phase 3** [ ] — Página `/diagnostico-solo/historico` com gráficos de evolução
- **Phase 4** [ ] — Calibração automática do balanço quando diagnóstico diverge do calculado

---

## 📱 PWA / Notificações push
**Status:** Pendente

O produtor precisa ser alertado no celular quando um pivô atinge status vermelho.

**O que implementar:**
- `manifest.json` + service worker (Next.js PWA)
- Edge Function que roda diariamente e envia push para pivôs críticos
- Configuração de horário e threshold de alerta por usuário

---

## 🌍 Fertilidade e nutrição
**Status:** Ideia futura

Integrar histórico de adubação ao balanço hídrico para correlação com rendimento.
Requer novo módulo e tabelas.

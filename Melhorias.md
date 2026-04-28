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

**Pendente:** configurar domínio `gotejo.com.br` no painel Resend para envio via domínio próprio

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
- **Phase 3** [ ] — Página `/diagnostico-solo/historico` com gráficos de evolução por pivô
- **Phase 4** [ ] — Calibração automática do balanço quando diagnóstico diverge do calculado

---

## 🧱 Textura do solo — Seletor FAO-56
**Status:** ✅ Implementado em 2026-04-27 · branch `feat/soil-texture-selector` mergeado no `main`

Agricultores sem análise de laboratório podem selecionar a classe textural do solo para auto-preencher CC, PM e Ds com valores FAO-56 canônicos.

- 5 cartões: Argiloso / Franco-Argiloso / Franco / Franco-Arenoso / Arenoso
- Posicionado fora de `showAdvanced` (sempre visível no formulário de pivôs)
- Auto-fill CC/PM/Ds ao clicar; deselect automático ao editar manualmente
- Migration: coluna `soil_texture text` em `pivots`
- `src/lib/soil-textures.ts`: constante `FAO_SOIL_TEXTURES` com 5 classes

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

## 📱 PWA — Próxima sessão prioritária
**Status:** Pendente — implementar na próxima sessão

O IrrigaAgro precisa funcionar como app nativo no celular do produtor rural: instalável na tela inicial, funcionando offline (pelo menos leitura do último estado), com ícones e splash screen corretos.

### O que implementar (em ordem):

#### 1. Web App Manifest (`public/manifest.json`)
```json
{
  "name": "IrrigaAgro",
  "short_name": "IrrigaAgro",
  "description": "Irrigação inteligente — monitoramento de pivôs",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#0d1520",
  "theme_color": "#0093D0",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
- Adicionar `<link rel="manifest" href="/manifest.json" />` no `layout.tsx`
- Adicionar `<meta name="theme-color" content="#0093D0" />` e `<meta name="apple-mobile-web-app-capable" content="yes" />`

#### 2. Ícones PWA (`public/icons/`)
- Gerar `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` a partir do SVG do logo IrrigaAgro
- Ferramenta: https://maskable.app ou sharp no Node.js
- Maskable: padding de 20% (safe zone), fundo `#0d1520`

#### 3. Service Worker com `next-pwa`
```bash
npm install next-pwa
```
Configurar em `next.config.ts`:
```ts
import withPWA from 'next-pwa'
export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    // Cache das páginas do app
    { urlPattern: /^\/(dashboard|manejo|relatorios|precipitacoes)/, handler: 'NetworkFirst', options: { cacheName: 'pages', expiration: { maxEntries: 20, maxAgeSeconds: 3600 } } },
    // Cache de assets estáticos
    { urlPattern: /\/_next\/static\//, handler: 'CacheFirst', options: { cacheName: 'next-static' } },
  ]
})
```

#### 4. Offline fallback (`public/offline.html`)
- Página simples com logo e "Sem conexão — dados do último acesso disponíveis"
- Mostrar os últimos dados cacheados do dashboard

#### 5. Meta tags iOS (`app/layout.tsx`)
```tsx
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="IrrigaAgro" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

#### 6. Notificações Push (opcional — fase 2)
- Usar Web Push API + `web-push` npm package
- Tabela `push_subscriptions` no Supabase (user_id, endpoint, keys)
- Edge Function `send-push-alert` disparada pelo cron `afternoon-alert`
- Payload: `{ title: "Irrigar hoje", body: "Pivô Krebbs: 64% — irrigar amanhã" }`

### Checklist de qualidade PWA
- [ ] Lighthouse PWA score ≥ 90
- [ ] Instalável no Chrome Android e Safari iOS
- [ ] Ícone correto na tela inicial (sem fundo branco no iOS)
- [ ] Splash screen com fundo `#0d1520`
- [ ] Funciona offline (mostra último estado cacheado)
- [ ] `display: standalone` (sem barra de URL)
- [ ] Theme color `#0093D0` na status bar do Android

---

## 🌍 Fertilidade e nutrição
**Status:** Ideia futura

Integrar histórico de adubação ao balanço hídrico para correlação com rendimento.
Requer novo módulo e tabelas.

# Melhorias Planejadas — IrrigaAgro v2

Backlog de funcionalidades, correções e débitos técnicos.

---

## CORREÇÕES DA AUDITORIA (2026-03-24)

Resultado da auditoria completa de segurança, dados, erros e consistência.
Legenda: `[ ]` pendente · `[x]` feito

---

### P0 — CRÍTICA (bloqueia produção)

- [ ] **1. Escopo de empresa ativo (client + server)**
  - `switchCompany` no AuthContext não persiste escolha
  - Server-side (dashboard page.tsx) sempre usa "a primeira empresa"
  - Contamina dashboard, listas e leituras em todas as páginas
  - Arquivos: `src/contexts/AuthContext.tsx`, `src/app/(app)/dashboard/page.tsx`

- [ ] **2. /relatorios — queries sem company filter**
  - Página não usa `useAuth()`, queries diretas retornam dados de TODAS as empresas
  - `supabase.from('seasons').select('*')` sem `.eq('company_id', ...)`
  - `supabase.from('pivots').select(...)` sem filtro de farm_id
  - Migrar para service layer com company scoping
  - Arquivo: `src/app/(app)/relatorios/page.tsx:873-957`

- [ ] **3. API /extract-energy-bill sem validação de ownership**
  - Aceita qualquer `pivot_id` sem verificar se pertence à empresa do usuário
  - Validar ownership: user → company → farms → pivots antes de aceitar upload
  - Arquivo: `src/app/api/extract-energy-bill/route.ts`

- [ ] **4. management.ts:listActiveManagementSeasonContexts sem company filter**
  - Retorna safras ativas de TODAS as empresas do banco
  - Adicionar filtro por company_id (farms → seasons)
  - Arquivo: `src/services/management.ts:104-129`

- [ ] **5. /precipitacoes — pivotId não validado antes de CRUD**
  - `upsertRainfallRecord` não verifica se pivotId pertence aos pivots do usuário
  - ImportModal não valida pivotId antes de importar CSV
  - Arquivo: `src/app/(app)/precipitacoes/page.tsx`

---

### P1 — ALTA (risco funcional)

- [ ] **6. /pivos — origem climática desalinhada com backend**
  - UI permite configurar fontes (Google Sheets, FieldClimate) que o backend não consome
  - Esconder/desativar fontes não suportadas ou implementar consumo real
  - Arquivo: `src/app/(app)/pivos/page.tsx:472-494`

- [ ] **7. Shell de navegação — links e comportamento**
  - Sidebar não inclui links para `/precipitacoes`, `/estacoes`, `/diagnostico-pivo`
  - Link `/configuracoes` é morto (página não existe)
  - Header mostra safra fixa, contexto falso
  - Menu mobile: comportamento inconsistente entre AppShell e Sidebar
  - Arquivos: `src/components/layout/Sidebar.tsx`, `Header.tsx`, `AppShell.tsx`

- [ ] **8. /dashboard — error handling e degradação**
  - Sem try-catch em `page.tsx:36` (`getDashboardDataForUser`)
  - Sem `error.tsx` boundary no diretório
  - SoilGaugesBlock legenda fixa (>60%, 40-60%, <40%) conflita com threshold dinâmico (70%)
  - CompactKpis: `Math.max(0, ...)` esconde desperdício quando actual > recommended
  - Arquivos: `src/app/(app)/dashboard/page.tsx`, `SoilGaugesBlock.tsx`, `CompactKpis.tsx`

- [ ] **9. Error boundaries globais**
  - Adicionar `error.tsx` em `/dashboard`, `/manejo`, `/relatorios`
  - Fallback UI em vez de erro 500

---

### P2 — MÉDIA (robustez e qualidade)

- [ ] **10. /fazendas — error handling**
  - Endurecer tratamento de erro e feedback operacional
  - Alinhar com padrão de `/diagnostico-pivo`
  - Arquivo: `src/app/(app)/fazendas/page.tsx`

- [ ] **11. /precipitacoes — importação frágil**
  - Parser CSV sem retry, datas inválidas silenciadas
  - Unmount durante import não cancela upsert
  - Sem feedback granular (linha por linha)
  - Arquivo: `src/app/(app)/precipitacoes/page.tsx` (ImportModal)

- [ ] **12. /pivos — error state não funcional**
  - `loadError` declarado mas nunca setado no `loadData` try-catch
  - CUC: input manual aceita qualquer número (deveria 0-100)
  - Arquivo: `src/app/(app)/pivos/page.tsx`

- [ ] **13. /safras — error handling ausente**
  - Sem error state declarado, falhas silenciosas
  - `initial_adc_percent` aceita qualquer valor (sem validação 0-100)
  - Arquivo: `src/app/(app)/safras/page.tsx`

- [ ] **14. /estacoes — validação e retry**
  - Weather data carrega sem re-validar company ownership
  - `api_provider` sem zod validation
  - Sem retry logic
  - Arquivo: `src/app/(app)/estacoes/page.tsx`

- [ ] **15. /manejo — mix visual e consistência**
  - Mix de inline CSS + Tailwind (linha 1062)
  - Mensagens de erro genéricas sem distinção de causa
  - Arquivo: `src/app/(app)/manejo/page.tsx`

---

### P3 — BAIXA (polish)

- [ ] **16. Dashboard: HistoryBlock mistura dados reais com teóricos**
  - `actual_depth_mm ?? recommended_depth_mm` no histórico
  - Arquivo: `src/app/(app)/dashboard/HistoryBlock.tsx:29`

- [ ] **17. Types: PivotWeatherConfig genérico demais**
  - `[key: string]: Json` — deveria especificar keys conhecidas
  - Arquivo: `src/types/database.ts`

- [ ] **18. Lib: edge cases em water-balance.ts**
  - `getDayOfYear` sem validação de data inválida
  - `calcCAD` se `fFactor=0` → divisão por zero em `calcKs`
  - Arquivo: `src/lib/water-balance.ts`

---

## SEQUÊNCIA DE COMMITS RECOMENDADA

```
1. fix: active company scope across client and server
2. refactor(relatorios): migrate to scoped services
3. fix(api): validate pivot ownership in extract-energy-bill
4. fix(services): add company filter to listActiveManagementSeasonContexts
5. fix(precipitacoes): validate pivotId before CRUD operations
6. fix(pivos): align weather source UI with supported operations
7. fix(shell): navigation links, mobile menu, header context
8. fix(dashboard): error handling, gauges legend, economy metric
9. feat: add error.tsx boundaries to critical pages
10. fix(fazendas,safras,estacoes): error states and validation
11. fix(precipitacoes): harden import parsing
12. fix(manejo): visual consistency and error messages
```

---

## FUNCIONALIDADES (BACKLOG)

---

## 🗺️ Mapa interativo dos pivôs (Dashboard)
**Status:** ✅ Implementado em 2026-03-17

Pivôs exibidos como marcadores circulares coloridos no mapa satélite (Leaflet + Esri).
Cores por status de irrigação, popup com ETo/ETc/Chuva e barra de umidade, animação de pulso.

---

## 📊 Timeline comparativa (Manejo Diário)
**Status:** Pendente

Gráfico de linhas sobrepostas mostrando ETo, ETc e Precipitação ao longo dos últimos 30 dias.
Inspirado no split-view de layers do Aerobotics.

**O que implementar:**
- Componente `WaterBalanceChart.tsx` com SVG ou Recharts
- Dados: buscar `daily_management` dos últimos 30 dias da safra selecionada
- Linhas: ETo (âmbar), ETc (azul), Chuva (ciano), ADc% (verde)
- Área sombreada entre ETc e Chuva (déficit hídrico)
- Posicionar abaixo do formulário no `/manejo`

---

## 🔀 Split-view comparação (Precipitações)
**Status:** Pendente

Comparar dois meses lado a lado ou dois pivôs no mesmo período.

**O que implementar:**
- Botão "Comparar" no header da página `/precipitacoes`
- Segundo seletor de mês/pivô
- Layout 2 colunas com calendários sincronizados
- Chips de diff: "+12mm vs mês anterior"

---

## 📄 Relatórios visuais (/relatorios)
**Status:** Pendente — sidebar mostra "em breve"

Página de análise histórica por safra.

**O que implementar:**
- Seletor de safra + intervalo de datas
- KPIs: total irrigado (mm), total ETc, eficiência hídrica (ETc/IRN), total de chuva
- Gráfico de barras: IRN aplicado por semana
- Gráfico de linha: ADc% ao longo do ciclo
- Tabela exportável (CSV) com todos os registros de `daily_management`
- Remover badge "em breve" do sidebar ao implementar

---

## 🌡️ Integração estação meteorológica
**Status:** Pendente

Tabelas `weather_stations` e `weather_data` já existem no banco.

**O que implementar:**
- Página `/estacoes` para cadastrar estações (FieldClimate, Davis, INMET)
- Busca automática de dados climáticos no manejo diário
- Substituir input manual por dados da estação vinculada ao pivô

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

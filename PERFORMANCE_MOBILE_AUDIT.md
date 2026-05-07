# PERFORMANCE_MOBILE_AUDIT.md
> IrrigaAgro v2 — Auditoria de Performance Mobile
> Data: 2026-05-07 | Stack: Next.js 15 + React 19 + TypeScript + Tailwind v4 + Supabase

---

## RESUMO EXECUTIVO

**3 categorias de problema:**
1. **Queries sem limite** → memory leak + timeout em produção com dados reais
2. **Bundle pesado** → recharts importado estaticamente em 4 páginas
3. **Componentes gigantes** → 4 arquivos com 1000–2200 linhas cada, múltiplos useEffect em cascata

**PWA:** 95% correto. Faltam preconnect headers e otimização de imagens.

---

## GARGALOS CRÍTICOS (P0)

### G1 — 34 queries `select('*')` sem `.limit()`

**Risco:** Timeout + memory leak em produção com 1000+ registros

| Arquivo | Queries problemáticas |
|---------|----------------------|
| `src/services/crops.ts:12` | `.select('*')` sem limit |
| `src/services/pivots.ts:79` | `.select('*')` sem limit |
| `src/services/farms.ts:12` | `.select('*')` sem limit |
| `src/services/rainfall.ts:45,67` | `.select('*')` sem limit |
| `src/services/management.ts:146,243` | `.select('*')` sem limit |
| `src/services/irrigation-schedule.ts:21,38,60` | `.select('*')` sem limit (só :167 tem limit) |
| `src/services/weather-stations.ts:20,40` | `.select('*')` sem limit |
| `src/services/weather-data.ts:27` | `.select('*')` sem limit (45,67,133 OK) |
| `src/services/pivot-sectors.ts:16` | `.select('*')` sem limit |
| `src/services/companies.ts:27` | `.select('*')` sem limit |
| `src/services/whatsapp-contacts.ts:22` | `.select('*')` sem limit |
| `src/services/talhoes.ts:31` | `.select('*')` sem limit |
| `src/contexts/AuthContext.tsx:96,133` | `.select('*')` sem limit |
| `src/hooks/useNdvi.ts:86,134` | `.select('*')` sem limit |
| `src/app/(app)/lancamentos/page.tsx:1766` | `.select('*')` pivot_speed_table, sem limit, type-unsafe |
| `src/app/(app)/diagnostico-solo/page.tsx:279,302` | `.select('*')` sem limit |
| `src/app/(app)/ndvi/page.tsx:634,643` | `.select('*')` sem limit |
| `src/app/(app)/relatorios/page.tsx:1214,1266` | `.select('*')` (só :1214 tem `.limit(24)`) |

**Fix:** Adicionar `.limit(50)` ou `.limit(100)` em cada uma. Padrão recomendado por tabela:
- `daily_management`: `.limit(90)` (3 meses = suficiente para gráficos)
- `rainfall_records`: `.limit(365)` (1 ano)
- `irrigation_schedule`: `.limit(30)` (agendamentos recentes)
- demais: `.limit(100)`

**Risco do fix:** Baixo. Pode exigir paginação manual em telas que mostram histórico longo (ex: lançamentos).

---

### G2 — Recharts importado estaticamente em 4 páginas (~60KB por bundle)

| Arquivo | Import | Impacto |
|---------|--------|---------|
| `src/app/(app)/manejo/page.tsx:39-40` | `import { ... } from 'recharts'` | Bloqueia render da página |
| `src/app/(app)/relatorios/page.tsx` | `import { ... } from 'recharts'` | Bloqueia render |
| `src/app/(app)/precipitacoes/page.tsx` | `import { ... } from 'recharts'` | Bloqueia render |
| `src/app/(app)/dashboard/DashboardClient.tsx:22` | `import { ... } from 'recharts'` | Bloqueia render |

**Fix:** Usar `next/dynamic` para cada componente que usa Recharts:
```typescript
const WaterBalanceChart = dynamic(
  () => import('./WaterBalanceChart'),
  { ssr: false, loading: () => <div style={{ height: 300, background: 'rgba(255,255,255,0.04)', borderRadius: 8 }} /> }
)
```

**Risco:** Baixo. Não afeta dados, só timing de render. Adicionar skeleton loader para UX.

---

### G3 — Componentes gigantes com múltiplos useEffect em cascata

| Arquivo | Linhas | useEffects | Risco |
|---------|--------|-----------|-------|
| `src/app/(app)/lancamentos/page.tsx` | 2.184 | Não contado | Alto |
| `src/app/(app)/precipitacoes/page.tsx` | 2.112 | Não contado | Alto |
| `src/app/(app)/manejo/page.tsx` | 2.105 | **8** | Crítico |
| `src/app/(app)/relatorios/page.tsx` | 1.834 | Não contado | Alto |
| `src/app/(app)/diagnostico-solo/page.tsx` | 1.017 | Parcial | Médio |

**manejo/page.tsx — 8 useEffect identificados:**
- `useEffect (814-821)`: event listener `focus` — `loadHistory` deve ser `useCallback`
- `useEffect (827-849)`: fetch clima — sem `AbortController`, usa flag `cancelled` (OK mas incompleto)
- `useEffect (860-880)`: sync `history+date+editingRecord` — deps corretas ✅

**Fix:** Dividir cada arquivo em subcomponentes (max 400-500 linhas por arquivo). Ex: `manejo/` → `ManejoForm.tsx` + `ManejoHistory.tsx` + `ManejoCharts.tsx` + `ManejoActions.tsx`.

**Risco:** Médio-alto. Refatoração estrutural — exige testes manuais de todas as interações.

---

## GARGALOS ALTOS (P1)

### G4 — Sem lazy loading para Recharts/SVG em páginas pesadas

Apenas 3 dynamic imports existentes no projeto:
- `PivotMap` em `DashboardClient.tsx:25-36` ✅
- `PivotMiniMapDynamic` em `pivos/page.tsx:21-36` ✅
- `TalhaoMapDrawDynamic` em `ndvi/page.tsx:39-50` ✅

**Faltam:**
- `WaterBalanceChart` em manejo
- Todos os componentes Recharts em relatorios, precipitacoes, dashboard

---

### G5 — Leaflet CSS importado inline em PivotMap

**Arquivo:** `src/app/(app)/dashboard/PivotMap.tsx:4`
```typescript
import 'leaflet/dist/leaflet.css'  // ~8KB, bloqueia render
```

O CSS é carregado no bundle do componente. Como PivotMap já é `dynamic()`, o impacto é limitado — mas ainda atrasa o render do mapa.

**Fix:** Mover `import 'leaflet/dist/leaflet.css'` para o layout ou usar `link rel="preload"` no `<head>`.

**Risco:** Baixo.

---

### G6 — AuthContext sem AbortController

**Arquivo:** `src/contexts/AuthContext.tsx:92-150`

Funções `fetchFarmsForCompany()` e `fetchUserCompanies()` são async e não têm cancel em caso de unmount. Em mobile com navegação rápida, pode causar:
- State update em componente desmontado
- Requisições duplicadas (mount → unmount → remount)

**Fix:**
```typescript
const controller = new AbortController()
const { data } = await supabase.from('farms').select('*').abortSignal(controller.signal)
return () => controller.abort()
```

**Risco:** Baixo. Supabase JS 2.x suporta `abortSignal`.

---

### G7 — Imagens não otimizadas

| Arquivo | Tamanho | Problema |
|---------|---------|---------|
| `public/screenshots/dashboard.png` | 197KB | Screenshot usada no manifest PWA |
| `public/soil-moisture-scale.png` | 157KB | Imagem diagnóstico, carregada em WhatsApp flow |
| `public/icon-512.png` | 124KB | Poderia ser WebP |
| `public/icon-512-maskable.png` | 94KB | Poderia ser WebP |

**Nenhuma página usa `next/image`** — sem compressão automática, sem lazy loading de imagens.

**Fix:** Substituir `<img>` por `<Image>` do Next.js nas páginas. Para PWA icons: converter para WebP com fallback PNG.

**Risco:** Baixo para `next/image`. Médio para ícones PWA (testar instalação após mudança).

---

### G8 — 20-30 requisições HTTP por mapa (tiles Esri)

**Arquivo:** `src/app/(app)/dashboard/PivotMap.tsx`

Cada vez que o mapa renderiza, carrega tiles de satellite imagery (Esri) + reference layer. Em 3G/4G rural, isso causa:
- LCP alto (mapa é elemento principal do dashboard)
- Bateria drena rápido

**Fix:** Configurar zoom máximo inicial menor (`zoom: 14` → `zoom: 12`) para reduzir tiles. Adicionar `attribution: false` para remover requisição de logo.

**Risco:** Baixo (visual apenas).

---

## GARGALOS MÉDIOS (P2)

### G9 — Sem preconnect/dns-prefetch para serviços externos

**Arquivo:** `src/app/layout.tsx`

Faltam no `<head>`:
```html
<link rel="preconnect" href="https://wvwjbzpnujmyvzvadctp.supabase.co" />
<link rel="preconnect" href="https://services.arcgisonline.com" />
<link rel="dns-prefetch" href="https://server.arcgisonline.com" />
```

**Impacto:** ~100-300ms de delay na primeira requisição Supabase e primeiro tile do mapa.

**Risco:** Zero.

---

### G10 — Sem bundle analyzer configurado

Impossível saber o tamanho real de cada chunk sem `@next/bundle-analyzer`.

**Fix:**
```bash
npm install --save-dev @next/bundle-analyzer
```
```typescript
// next.config.ts
const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: process.env.ANALYZE === 'true' })
export default withBundleAnalyzer(nextConfig)
```

**Risco:** Zero (só dev dependency).

---

### G11 — `useCallback` não usado em callbacks de eventos

**Arquivo:** `src/app/(app)/manejo/page.tsx:814`

`loadHistory` passado como dep do useEffect mas não é `useCallback` — recria a cada render, causando re-runs desnecessários do efeito.

**Fix:**
```typescript
const loadHistory = useCallback(async (seasonId: string) => { ... }, [seasonId])
```

**Risco:** Baixo. Aplicar apenas em funções passadas como deps de useEffect ou props de componentes filhos.

---

### G12 — PivotMap dependency array incompleto

**Arquivo:** `src/app/(app)/dashboard/PivotMap.tsx:261`

```typescript
}, [pivotsWithCoords.length])  // falta: onPivotClick
```

`onPivotClick` é callback passado por prop — não está nas deps. Callback pode ficar stale se o pai mudar.

**Fix:** Adicionar `onPivotClick` nas deps OU garantir que pai usa `useCallback` para esse prop.

**Risco:** Baixo (bug latente, não visível hoje).

---

### G13 — react-email em bundle de produção

**package.json:** `react-email` e `@react-email/components` são `dependencies` (não `devDependencies`).

Esses pacotes são usados apenas para templates de e-mail (Server-side). Se Next.js não fizer tree-shaking correto, entram no bundle cliente.

**Fix:** Mover para `devDependencies` ou garantir que os imports de e-mail só existem em `src/emails/` (nunca importados por páginas cliente).

**Risco:** Baixo.

---

## ESTADO DO PWA

| Item | Status | Detalhe |
|------|--------|---------|
| `manifest.json` | ✅ Completo | standalone, theme_color, icons 4 tamanhos |
| Service Worker | ✅ Implementado | Cache-first estático, network-first navegação |
| Offline fallback | ✅ | `/offline.html` ou `/dashboard` |
| Push notifications | ✅ | Handler customizado |
| Viewport meta | ✅ | `viewportFit: 'cover'` |
| Apple touch icons | ✅ | Múltiplos tamanhos |
| Preconnect headers | ❌ Faltam | Supabase + Esri tiles |
| Imagens WebP | ❌ Faltam | Ícones em PNG (~500KB total) |
| Service Worker update flow | ⚠️ Verificar | Sem `skipWaiting` confirmado |

---

## ÍNDICES SUPABASE RECOMENDADOS

> **Não aplicar sem autorização. Sugerir apenas.**

| Tabela | Coluna(s) | Motivo |
|--------|-----------|--------|
| `daily_management` | `(season_id, date DESC)` | Queries de histórico por safra |
| `daily_management` | `(pivot_id, date DESC)` | Dashboard busca último registro por pivô |
| `irrigation_schedule` | `(season_id, scheduled_date)` | Calendário de irrigação |
| `rainfall_records` | `(pivot_id, date DESC)` | Histórico de precipitações por pivô |
| `weather_data` | `(station_id, date DESC)` | Ingest diário busca último registro |
| `energy_bills` | `(company_id, bill_date DESC)` | Histórico de contas por empresa |

**Verificar antes de criar:** alguns já podem existir. Rodar `\d nome_tabela` no SQL Editor do Supabase.

---

## ORDEM DE EXECUÇÃO RECOMENDADA

### Fase 1 — Quick Wins (2-4h, risco baixo)
1. **G9** — Adicionar preconnect/dns-prefetch em `layout.tsx` (5 min, risco zero)
2. **G10** — Instalar bundle analyzer (10 min, risco zero)
3. **G3/G11** — Adicionar `useCallback` em `loadHistory` no manejo (15 min, risco baixo)
4. **G5** — Mover `import 'leaflet/dist/leaflet.css'` para layout (10 min, risco baixo)

### Fase 2 — Bundle Reduction (4-8h, risco baixo-médio)
5. **G2** — Lazy load Recharts em `manejo/page.tsx` e `relatorios/page.tsx` (1h)
6. **G2** — Lazy load Recharts em `precipitacoes/page.tsx` e `DashboardClient.tsx` (1h)
7. **G13** — Mover react-email para devDependencies (15 min)
8. **G7** — Converter imagens para WebP e usar `next/image` nas páginas (2h)

### Fase 3 — Queries (4-8h, risco médio)
9. **G1** — Adicionar `.limit()` em services/ (prioridade: management, rainfall, irrigation) (2h)
10. **G1** — Adicionar `.limit()` em contexts/AuthContext.tsx (30 min)
11. **G6** — AbortController em AuthContext (1h)
12. **G1** — Adicionar `.limit()` em páginas diretas (lancamentos, diagnostico, ndvi) (1h)

### Fase 4 — Refatoração Estrutural (2-4 dias, risco alto — exige testes manuais)
13. **G3** — Dividir `manejo/page.tsx` em 4-5 componentes (1 dia)
14. **G3** — Dividir `lancamentos/page.tsx` em subcomponentes + adicionar type safety (1 dia)
15. **G3** — Dividir `relatorios/page.tsx` com paginação (1 dia)
16. **G12** — Fix dependency array PivotMap (30 min, mas testar mapa)

### Fase 5 — Índices DB (15 min por índice, risco baixo com CONCURRENTLY)
17. Aplicar índices sugeridos na seção acima (testar em branch Supabase primeiro)

---

## MUDANÇAS SEGURAS SEM VALIDAÇÃO MANUAL

- G9: preconnect headers
- G10: bundle analyzer (só dev)
- G13: mover react-email para devDependencies
- G1: adicionar `.limit()` em services/ (exceto se tela mostra todos os registros intencionalmente)

## MUDANÇAS QUE PRECISAM DE VALIDAÇÃO MANUAL

- G2: lazy loading Recharts → verificar que gráficos aparecem corretamente em mobile
- G3: divisão de componentes → testar todos os fluxos interativos (formulários, histórico, submissão)
- G5: mover Leaflet CSS → verificar que mapa renderiza sem FOUC (flash of unstyled content)
- G6: AbortController → verificar que login/logout não quebra fetches em andamento
- G7: next/image → verificar aspect ratio de imagens em mobile e desktop
- G12: PivotMap deps → testar click em pivô no dashboard

---

## MÉTRICAS BASELINE (estimadas sem Lighthouse)

| Métrica | Estimativa atual | Meta |
|---------|-----------------|------|
| Bundle inicial (JS) | ~400-500KB gzip | <200KB |
| Recharts por página | ~60KB gzip | 0 (lazy) |
| Queries sem limit | 34 | 0 |
| Páginas >1000 linhas | 4 | 0 |
| Lazy dynamic imports | 3 | 10+ |
| Imagens otimizadas (WebP) | 0% | 100% |

---

*Gerado automaticamente por auditoria Claude Code — não alterar código sem revisão*

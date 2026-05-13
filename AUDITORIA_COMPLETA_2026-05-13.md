# Auditoria completa - IrrigaAgro v2

Data: 2026-05-13
Alvo auditado: `irrigaagro-v2` (Next.js 16, Supabase, PWA, Vercel Cron)

## Resumo executivo

O aplicativo esta funcional e compila em producao, mas ainda nao esta em nivel 10/10. A base de produto e boa: existe dashboard, manejo, programacao, relatorios, NDVI, WhatsApp, diagnosticos, PWA e automacoes. O principal gargalo agora nao e falta de funcionalidade; e maturidade operacional: seguranca de dependencias/secrets, governanca de acesso, consistencia visual, mobile real e reducao de debito React/TypeScript.

Pontuacao atual estimada:

| Area | Nota | Leitura |
| --- | ---: | --- |
| Produto/fluxos | 7.5 | Completo, mas precisa organizar hierarquia e rotinas criticas. |
| UI/UX desktop | 7.0 | Visual bom, porem ainda com cara de tela montada por modulo, nao sistema unico. |
| Mobile | 5.5 | Existe responsividade, mas ha overflow real e varios grids/tabelas dependem de rolagem horizontal. |
| Seguranca | 5.0 | Ha vulnerabilidades em dependencias, `.env` versionado e exposicao desnecessaria de admin/public env. |
| Qualidade tecnica | 7.0 | Build/test verdes, mas lint aponta 191 warnings e muitos `any` em pontos sensiveis. |
| PWA/offline | 6.5 | Boa intencao para campo, mas cache de HTML autenticado precisa ser revisto. |

## Verificacoes executadas

- `npm run lint`: passou, com 191 warnings.
- `npm test`: 3 arquivos, 45 testes, todos passaram.
- `npm run build`: passou em producao com Next 16.1.6.
- `npm audit --audit-level=moderate`: falhou por vulnerabilidades conhecidas.
- Chrome headless em `/login`: desktop renderiza; mobile 390x844 mostra overflow/corte lateral.

## Achados criticos

### 1. Dependencias com vulnerabilidades altas

`npm audit` reportou 8 vulnerabilidades: 5 altas, 2 moderadas e 1 baixa.

Pacotes relevantes:

- `next@16.1.6`: varios advisories de alta severidade envolvendo proxy/middleware bypass, cache poisoning, DoS, SSRF e XSS em cenarios especificos.
- `vite@8.0.0 - 8.0.4`: path traversal/arbitrary file read no dev server.
- `fast-uri`, `flatted`, `picomatch`, `postcss`, `brace-expansion`.

Acao recomendada:

1. Atualizar Next para a versao segura sugerida pelo audit (`16.2.6` no momento desta auditoria).
2. Rodar `npm audit fix`.
3. Retestar `lint`, `test`, `build` e smoke visual.
4. Validar se `@react-email/ui` continua exigindo Next vulneravel como dependencia transitiva.

### 2. `.env` versionado no Git

`git ls-files` mostra `.env` e `.env.example` versionados. `.env.local` esta ignorado, mas `.env` entrou no commit inicial.

Impacto:

- Risco de vazamento historico de configuracoes e chaves.
- Mesmo quando contem apenas anon key, isso normaliza guardar configuracao sensivel no repositorio.
- O ambiente local possui variaveis de alto risco em `.env.local`: service role, APIs de IA, Resend, VAPID, webhook e cron secret.

Acao recomendada:

1. Remover `.env` do indice Git.
2. Manter apenas `.env.example` sem valores reais.
3. Rotacionar qualquer chave que ja tenha aparecido em commit, diario, script ou deploy.
4. Revisar historico do Git antes de publicar ou compartilhar o repositorio.

### 3. Webhook aberto quando `WEBHOOK_SECRET` nao existe

Arquivo: `src/app/api/admin/notify-new-signup/route.tsx`

O endpoint so bloqueia quando `WEBHOOK_SECRET` existe:

```ts
if (secret && authHeader !== `Bearer ${secret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

Impacto:

- Em ambiente sem secret, qualquer chamada publica pode disparar notificacao de novo cadastro.
- Pode gerar spam operacional ou consumo indevido do provedor de email.

Acao recomendada:

- Falhar fechado: se `WEBHOOK_SECRET` nao estiver configurado, retornar 500/503.
- Validar payload e aplicar rate limit.

### 4. Admin parcialmente controlado por env publica

Arquivos:

- `src/proxy.ts`
- `src/components/layout/Sidebar.tsx`
- `src/lib/super-admin.ts`

Problema:

- O proxy ainda aceita fallback para `NEXT_PUBLIC_SUPER_ADMIN_EMAILS`.
- A sidebar decide exibir menu Admin diretamente no browser usando `NEXT_PUBLIC_SUPER_ADMIN_EMAILS`.

Impacto:

- Emails de admin podem ir para o bundle publico.
- A UI e a autorizacao ficam desalinhadas.

Acao recomendada:

- Usar apenas `SUPER_ADMIN_EMAILS` no servidor.
- No cliente, chamar `/api/auth/is-super-admin` ou incluir permissao server-side no layout.
- Remover `NEXT_PUBLIC_SUPER_ADMIN_EMAILS` do fluxo.

### 5. Service worker cacheia HTML de rotas autenticadas

Arquivo: `public/sw.js`

Rotas como `/dashboard`, `/manejo`, `/relatorios`, `/precipitacoes` e `/lancamentos` sao cacheadas como navegacao.

Impacto:

- O app pode mostrar HTML autenticado antigo quando offline.
- Depois de logout, troca de usuario, empresa suspensa ou device compartilhado, pode haver exposicao de dados em cache.

Acao recomendada:

- Nao cachear HTML autenticado com dados SSR.
- Cachear apenas shell estatico/offline e assets.
- Se offline operacional for obrigatorio, criar storage local criptografado/escopado por usuario e limpar no logout.

## Achados importantes

### 6. Headers de seguranca incompletos

`vercel.json` define cache para SW/manifest/icons, mas nao define headers de hardening.

Faltam, pelo menos:

- `Content-Security-Policy` ou CSP em modo report-only inicialmente.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- politica clara para `frame-ancestors`.

O app usa `dangerouslySetInnerHTML` para registrar service worker e CSS inline. Isso dificulta CSP forte. Melhor mover o registro para componente client com `useEffect`.

### 7. RLS parcial nas migrations versionadas

As migrations auditadas mostram RLS bem definida para `irrigation_schedule`, `energy_bills` e WhatsApp. Porem varias tabelas centrais usadas pelo app (`farms`, `pivots`, `seasons`, `daily_management`, `weather_data`, `company_members`, `companies`, etc.) nao aparecem com migrations completas neste repositorio.

Acao recomendada:

- Exportar/registrar schema completo do Supabase.
- Rodar auditoria tabela a tabela: RLS habilitado, policies de select/insert/update/delete, storage policies e permissoes de service role.

### 8. Bug provavel em conta de energia

Arquivo: `src/app/api/extract-energy-bill/route.ts`

O update em `energy_bills` filtra por `farm_id`, mas a migration da tabela define `pivot_id`, nao `farm_id`.

Impacto:

- `cost_per_mm_ha` pode nao ser atualizado apos upload.
- Isso pode gerar KPI inconsistente nos relatorios/dashboard.

### 9. Mobile com overflow real no login

Evidencia:

- Screenshot 390x844 em `/login` cortou o texto "Criar conta" e o rodape.

Provavel causa:

- O painel de login usa `maxWidth: 480` dentro de layout flex com `overflow: hidden`, alem de elementos com largura minima/nowrap.

Acao recomendada:

- Corrigir a largura do painel mobile com `minWidth: 0`, `maxWidth: '100%'`, `overflowX: hidden` somente depois de eliminar a causa.
- Remover textos `nowrap` onde nao sao essenciais.
- Validar em 360, 390, 430, 768 e desktop.

### 10. UI inconsistente por excesso de estilos inline

Ha muitos componentes/paginas com `style={{ ... }}` grandes, grids manuais e tokens repetidos. Isso torna dificil garantir consistencia visual, estados, breakpoints e acessibilidade.

Acao recomendada:

- Criar componentes base reais para: `PageHeader`, `Toolbar`, `MetricCard`, `DataTable`, `StatusChip`, `Modal`, `EmptyState`, `FormField`.
- Reduzir radius padrao de cards para 8-12px em SaaS operacional.
- Unificar densidade, espacamento e hierarquia.

## Maturidade de UX/UI

Estado atual: bom, mas ainda nao premium.

Principais problemas estruturais:

- Dashboard e telas operacionais competem por peso visual; ha muitos cards com mesma importancia.
- Login usa estetica mais "hero/marketing"; o produto interno pede uma linguagem mais operacional, confiavel e densa.
- Mobile parece adaptado depois, nao pensado como uso primario de campo.
- Tabelas e grids dependem de rolagem horizontal, o que e aceitavel em alguns casos, mas nao deve ser o padrao em fluxos de lancamento rapido.

Prioridades de UX:

1. Corrigir mobile do login e shell.
2. Redesenhar dashboard para deixar "o que irrigar hoje" como decisao principal.
3. Padronizar filtros, seletores de fazenda/safra e estados vazios.
4. Tornar manejo/lancamentos o fluxo mais rapido do produto, com menos rolagem e melhor acao primaria.
5. Criar tratamento consistente para dados ausentes, dados atrasados e dados estimados.

## Qualidade tecnica

Pontos positivos:

- Build de producao passa.
- Testes existentes passam.
- Separacao de services existe.
- Supabase server/client esta separado.
- Cron endpoints principais usam `CRON_SECRET`.

Debitos:

- 191 warnings no lint.
- Muitos `any` em services e APIs sensiveis.
- Hooks com dependencias ausentes.
- `Math.random()` durante render em componentes de input.
- Estado sincronizado diretamente em effects em varios pontos.
- Componentes criados dentro de render.
- `_pages_legacy` ainda contem client Supabase legado com anon key hardcoded.

## Plano para chegar em 10/10

### Fase 0 - Seguranca imediata

1. Atualizar dependencias vulneraveis.
2. Remover `.env` do Git e rotacionar chaves expostas.
3. Fechar webhook quando secret ausente.
4. Remover `NEXT_PUBLIC_SUPER_ADMIN_EMAILS`.
5. Revisar cache do service worker em rotas autenticadas.

### Fase 1 - Estabilidade e confiabilidade

1. Corrigir bug de `energy_bills.farm_id`.
2. Baixar warnings de lint de 191 para menos de 30.
3. Tipar services Supabase mais sensiveis.
4. Adicionar testes para APIs criticas: webhook, admin, upload de conta, recalculate season.

### Fase 2 - Mobile e UX operacional

1. Corrigir overflow de login.
2. Auditar `dashboard`, `manejo`, `lancamentos`, `pivos` e `relatorios` em 360/390/430/768/1440.
3. Substituir grids quebradicos por componentes responsivos.
4. Criar padrao de mobile para tabelas: cards resumidos + detalhe expandido.

### Fase 3 - Design system

1. Consolidar tokens de cor, radius, sombra, spacing e tipografia.
2. Criar componentes base compartilhados.
3. Eliminar estilos inline repetitivos das telas principais.
4. Uniformizar loading, empty, error, disabled e success states.

### Fase 4 - Produto premium

1. Transformar dashboard em cockpit de decisao diaria.
2. Melhorar confianca dos dados: origem, frescor, estimado/manual/estacao.
3. Criar alertas operacionais priorizados.
4. Adicionar trilha de auditoria para acoes importantes: irrigacao, recalculo, importacao, ajuste manual.

## Proximo passo recomendado

Executar a Fase 0 primeiro. Ela reduz risco real antes de investir em polimento visual.

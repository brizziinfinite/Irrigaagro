# Motor de Irrigação — IrrigaAgro

## Visão Geral

O IrrigaAgro implementa balanço hídrico diário seguindo a metodologia FAO-56 (Penman-Monteith). O motor calcula a necessidade de irrigação considerando evapotranspiração, chuva efetiva, características do solo e estágio da cultura.

## Conceitos Fundamentais

### CTA — Capacidade Total de Água Disponível (mm)

```
CTA = ((CC - PM) / 10) × Ds × profundidade_raiz_cm
```

- **CC**: Capacidade de Campo (% gravimétrica)
- **PM**: Ponto de Murcha Permanente (%)
- **Ds**: Densidade do solo (g/cm³)
- **profundidade_raiz_cm**: Profundidade efetiva da raiz

Exemplo: CC=39.6%, PM=16.1%, Ds=1.2, raiz=25cm → CTA = 70.5mm

### CAD — Capacidade de Água Disponível antes do estresse (mm)

```
CAD = CTA × (1 - f)
```

- **f**: Fração de depleção permitida (FAO-56 Tabela 22)
- Para milho: f=0.55 → CAD = CTA × 0.45

Quando o ADc cai abaixo da CAD, a planta entra em estresse hídrico.

### ADc — Água Disponível no solo (mm)

Balanço diário:
```
ADc(t) = ADc(t-1) + chuva_efetiva + irrigação - ETc
```

A chuva efetiva é limitada ao espaço livre no perfil: `min(chuva, CTA - ADc)`.

### ETo — Evapotranspiração de Referência (mm/dia)

Calculada pela equação de Penman-Monteith FAO-56:
```
ETo = [0.408 × Δ × (Rn - G) + γ × (900/(T+273)) × u₂ × (es - ea)] / [Δ + γ × (1 + 0.34 × u₂)]
```

Fontes (em ordem de prioridade):
1. Estação Plugfield (corrigida)
2. weather_data calculada
3. Cálculo Penman-Monteith com dados do formulário

### ETc — Evapotranspiração da Cultura (mm/dia)

```
ETc = ETo × Kc × Ks
```

- **Kc**: Coeficiente de cultura (varia por fase)
- **Ks**: Coeficiente de estresse (1 quando ADc >= CAD, senão ADc/CAD)

## Fases da Cultura (FAO-56)

| Fase | Kc | Comportamento |
|------|-----|---------------|
| 1 — Inicial | Kc ini (constante) | Germinação e estabelecimento |
| 2 — Desenvolvimento | Interpolado ini→mid | Crescimento vegetativo |
| 3 — Médio | Kc mid (constante) | Florescimento e enchimento |
| 4 — Final | Interpolado mid→final | Maturação |

## Modo Individual vs Conjugado

### Pivô Individual

Opera independentemente. Decide irrigar quando:
```
déficit_projetado >= CAD
```

onde `déficit_projetado = (CTA - ADc) + ETc × 1 dia`

### Pivô Conjugado

Dois ou mais pivôs compartilham a mesma bomba. Cada pivô tem:
- **Intervalo de retorno** (dias): tempo entre voltas
- **Lâmina máx por evento** (mm): limite operacional por volta
- **Capacidade média** (mm/dia): quanto o pivô consegue repor por dia

Cada pivô conjugado tem:
- **Intervalo de retorno** (dias): tempo entre voltas
- **Velocidade preferida** (%): velocidade que o agricultor usa no dia a dia (ex: 50% → 8.1mm)
- **Velocidade mínima** (%): máximo que o pivô aguenta (ex: 42% → 9.4mm)

O sistema calcula a lâmina automaticamente a partir da velocidade + geometria do pivô.

O sistema projeta o déficit até a próxima volta:
```
déficit_projetado = depleção_atual + ETc × dias_retorno
```

**IMPORTANTE**: Chuva prevista NÃO entra na decisão de irrigar. Somente chuvas que de fato ocorreram são contabilizadas no balanço.

O limite operacional é o menor entre CAD e lâmina máxima (velocidade mínima):
```
limite_operacional = min(CAD, lâmina_na_velocidade_mínima)
```

Ao recomendar irrigação, o sistema sugere a velocidade:
- Se a lâmina preferida cobre o déficit → sugere velocidade preferida
- Se não cobre → sugere velocidade mínima (lâmina máxima)
- Se nem a máxima cobre → alerta de risco operacional

### Status de Recomendação

| Status | Condição | Ação |
|--------|----------|------|
| `ok` | déficit projetado < 70% limite operacional | Sem necessidade |
| `queue` | 70% ≤ déficit projetado < 100% limite | Colocar na fila |
| `irrigate_today` | déficit projetado ≥ limite | Irrigar hoje (sugere velocidade) |
| `operational_risk` | ETc por ciclo > lâmina máx do pivô | Alerta: demanda > oferta |

## Cadastro de Culturas

### Presets FAO-56

10 culturas pré-configuradas: Milho, Soja, Feijão, Trigo, Algodão, Cana, Tomate, Batata, Cebola, Pastagem.

O botão "Usar preset FAO-56" no formulário de nova cultura preenche automaticamente:
- Kc (ini/mid/final)
- Duração das 4 fases
- Profundidade de raiz por fase
- Fator f por fase

Os valores podem ser customizados após a seleção.

### Parâmetros por Fase

Para cada cultura, configurar:
- **Duração** (dias)
- **Kc**: Constante (fases 1 e 3) ou interpolado (fases 2 e 4)
- **Profundidade da raiz** (cm)
- **Fator f**: Fração de depleção permitida

## Fluxo de Cálculo

1. Calcular DAS (Dias Após Semeadura)
2. Determinar fase, Kc, raiz, f_factor
3. Calcular CTA, CAD
4. Resolver ETo (prioridade: estação > calculada)
5. Calcular ETc = ETo × Kc
6. Calcular ADc = ADc anterior + chuva + irrigação - ETc
7. Calcular Ks, status semáforo
8. Gerar recomendação (individual ou conjugada)
9. Projetar 7 dias à frente

## Arquivos Relevantes

| Arquivo | Função |
|---------|--------|
| `src/lib/water-balance.ts` | Motor FAO-56 (funções puras) |
| `src/lib/crop-presets.ts` | Presets de culturas |
| `src/lib/calculations/management-balance.ts` | Orquestrador de cálculo |
| `src/lib/calculations/eto-resolution.ts` | Resolução de ETo (fontes) |
| `src/services/recommendations.ts` | Projeção 7 dias + Open-Meteo |
| `src/lib/__tests__/water-balance.test.ts` | Testes unitários |

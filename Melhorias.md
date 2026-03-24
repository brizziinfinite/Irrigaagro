# Melhorias Planejadas — IrrigaAgro v2

Backlog de funcionalidades inspiradas no design Aerobotics (Precision insights for growers)
e outras ideias levantadas durante o desenvolvimento.

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

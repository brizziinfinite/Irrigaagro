# AI CONTEXT — IRRIGAAGRO

## 🎯 VISÃO DO PROJETO
Sistema de gestão de irrigação com foco em manejo automático de pivôs centrais.

Objetivo:
Gerar recomendação de irrigação baseada em clima, solo, cultura e histórico.

---

## 🏗️ ARQUITETURA

- Frontend oficial: `irrigaagro-v2` (Next.js)
- Backend: Supabase
- Base antiga: `irrigaagro` (Vite) → usada como fonte de lógica

Regra:
- v2 = produto
- v1 = fonte de lógica

---

## ⚙️ ESTADO ATUAL

Já implementado na v2:

- Auth + empresa ativa
- Tipagem de banco
- Services base

Módulos migrados:
- farms
- pivots
- crops
- seasons
- rainfall
- weather_stations
- weather_data

Todos conectados ao Supabase real

---

## 🌦️ REGRA CLIMÁTICA (CRÍTICA)

Ordem obrigatória de dados climáticos:

1. estação do pivô
2. estação da fazenda
3. Open-Meteo (geolocalização)
4. manual

---

## 🌱 REGRA DE ETo (CRÍTICA)

- NÃO usar ETo de API como valor final
- APIs fornecem apenas variáveis climáticas
- ETo oficial do sistema = Penman-Monteith local

---

## 📊 DADOS MAIS IMPORTANTES DO SISTEMA

### Obrigatórios:
- clima (temp, umidade, vento, radiação)
- chuva
- solo (capacidade de campo, ponto de murcha, f)
- cultura + fase
- pivô
- safra ativa

Sem isso:
→ NÃO gerar manejo automático

---

## 🧠 REGRAS DE DESENVOLVIMENTO

- usar services (não acessar Supabase direto nas páginas)
- usar empresa ativa via contexto central
- não duplicar lógica
- não misturar código da v1 diretamente
- portar lógica da v1 com adaptação

---

## 🚫 RESTRIÇÕES

- NÃO refatorar UI sem necessidade
- NÃO mudar layout sem pedido explícito
- NÃO criar lógica fora dos services
- NÃO usar dados simulados

---

## 🎯 FOCO ATUAL

Sistema em fase de estruturação funcional.

Prioridade:
→ consolidar backend lógico antes de evoluir UI

---

## 📌 FILOSOFIA DO PRODUTO

- primeiro funcionar
- depois otimizar
- depois embelezar

---

## 🧭 PRÓXIMOS PASSOS (GERAL)

1. management (manejo)
2. automação
3. diagnóstico
4. integração climática automática
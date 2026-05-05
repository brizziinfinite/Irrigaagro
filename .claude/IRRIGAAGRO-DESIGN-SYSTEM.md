
# IrrigaAgro — Design System & Visual Standards

## Identidade Visual

O IrrigaAgro usa tema ESCURO AZULADO nas superfícies (fundo, cards, bordas, sidebar).
O VERDE é usado para elementos SEMÂNTICOS: status OK, safra ativa, "Agro" no logo, indicadores positivos.
A cor brand principal é AZUL #0093D0.

---

## Paleta de Cores — Fonte da Verdade

### Superfícies (fundo, cards, inputs, sidebar, bordas)
```
Background geral:     #080e14
Sidebar:              #0d1520
Cards:                #0f1923
Sub-cards / inputs:   #141e2b
Elevado / hover:      #1a2535
Bordas:               rgba(255,255,255,0.06)
Bordas emphasis:      rgba(255,255,255,0.1)
```

### Texto
```
Principal:     #e2e8f0
Secundário:    #8899aa
Muted/labels:  #556677
```

### Brand
```
Azul principal:   #0093D0
Azul escuro:      #005A8C
```

### Status semântico (MANTER — verde é PERMITIDO aqui)
```
Irrigando:         #06b6d4  (ciano)
OK / Positivo:     #22c55e  (verde) PERMITIDO
Atenção:           #f59e0b  (amber)
Irrigar Agora:     #ef4444  (vermelho)
Sem safra:         #556677  (muted)
```

### Verde PERMITIDO em:
- Status "OK" de pivôs → #22c55e
- Badge de safra ativa → #22c55e com background semitransparente
- "Agro" no logo → #22c55e
- Braço do pivô no logo SVG → #4ade80
- Indicadores positivos (economia, umidade boa) → #22c55e
- Barras de progresso quando umidade está boa → #22c55e

### PROIBIDO: Verde em SUPERFÍCIES de tema
Estes tons verdes NÃO devem ser usados como fundo de cards, sidebar, bordas ou background geral:
```
#040703, #0b1a0e, #111f14, #162219, #1f3022, #1a2e1d, #1c2e20, #2a3d2d
```

Estes tons verdes NÃO devem ser usados para texto base ou muted:
```
#3a5240, #535c3e, #7a9e82, #becec0, #ecefec
```

O accent brand #4a9e1a e #166502 devem ser trocados por #0093D0 e #005A8C.
MAS #22c55e verde continua para status semântico.

---

## Tabela de Migração — Find & Replace

```
SUPERFÍCIE/TEXTO (trocar)     →    NOVO VALOR
#040703                       →    #080e14
#0b1a0e                       →    #080e14
#111f14                       →    #0f1923
#162219                       →    #141e2b
#1c2e20                       →    #1a2535
#1f3022                       →    rgba(255,255,255,0.06)
#1a2e1d                       →    rgba(255,255,255,0.06)
#2a3d2d                       →    rgba(255,255,255,0.08)
#3a5240                       →    #556677
#535c3e                       →    #556677
#7a9e82                       →    #8899aa
#a9b4a2                       →    #8899aa
#becec0                       →    #cbd5e1
#ecefec                       →    #e2e8f0
#4a9e1a (accent brand)        →    #0093D0
#166502 (accent brand dark)   →    #005A8C
rgb(74 158 26 (accent bg)     →    rgba(0,147,208
rgb(17 31 20 (glass bg)       →    rgb(13 21 32
rgb(26 125 3 (pulse)          →    rgba(0, 147, 208
```

---

## Espaçamento & Layout

### AppShell (container principal)
```
Padding do <main>: p-5 md:p-7 lg:p-8
```

### Páginas de conteúdo
```
Container: flex flex-col gap-5 (sem max-w restritivo nas páginas)
Exceção: Onboarding/modais podem manter max-w-2xl
```

### Cards
```
borderRadius: 14px (cards) / 10px (sub-cards) / 8px (inputs/badges)
padding:      18px 20px (cards) / 10px 14px (sub-cards)
gap:          14px entre cards
```

### Tipografia
```
Títulos:    fontSize 20-24, fontWeight 700, color #e2e8f0
Subtítulos: fontSize 13, color #8899aa
Labels:     fontSize 10-11, fontWeight 700, uppercase, letterSpacing 0.06em, color #556677
Valores:    fontSize 28-32, fontWeight 700-800, fontFamily var(--font-mono)
```

### Botões
```
Primário:    linear-gradient(135deg, #005A8C, #0093D0), color #fff, shadow rgba(0,147,208,0.4)
Secundário:  rgba(0,147,208,0.1), border rgba(0,147,208,0.2), color #0093D0
```

---

## Logo Sidebar
```
SVG pivô: crosshair + braço diagonal em #4ade80
Container: 42px, borderRadius 12px, background rgba(0,147,208,0.15), border rgba(0,147,208,0.28)
Texto: "Irriga" fontWeight 800 cor #0093D0 + "Agro" fontWeight 400 cor #22c55e, fontSize 22
Subtítulo: "Irrigação de Precisão" fontSize 9, uppercase, letterSpacing 0.1em, cor #556677
```

---

## Comando de Validação
```bash
# Deve retornar ZERO linhas:
grep -rn "#0b1a0e\|#111f14\|#162219\|#1f3022\|#3a5240\|#535c3e\|#7a9e82\|#4a9e1a\|#166502" src/
```

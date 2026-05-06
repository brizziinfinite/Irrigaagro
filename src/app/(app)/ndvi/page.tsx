'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '@/hooks/useAuth'
import { listFarmsByCompany } from '@/services/farms'
import { listPivotsByFarmIds } from '@/services/pivots'
import {
  listTalhoesByCompany,
  createTalhao,
  updateTalhao,
  deleteTalhao,
  type Talhao,
} from '@/services/talhoes'
import {
  useNdviMultiplos,
  useNdviComparativo,
  useRefreshNdvi,
  classificarNdvi,
  type NdviComparativoItem,
  type NdviRegistro,
  type NdviTalhaoResponse,
} from '@/hooks/useNdvi'
import { createClient } from '@/lib/supabase/client'
import type { Pivot } from '@/types/database'
import {
  Satellite, RefreshCw, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Info, ChevronRight, BarChart3, Layers,
  Plus, Pencil, Trash2, X, Save, MapPin,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import PivotSpinner from '@/components/ui/PivotSpinner'

const TalhaoMapDrawDynamic = dynamic(
  () => import('./TalhaoMapDraw').then(m => ({ default: m.TalhaoMapDraw })),
  { ssr: false, loading: () => <div style={{ height: 360, background: '#0d1520', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#556677', fontSize: 13 }}>Carregando mapa…</div> }
)

// ─── Cores ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#0b1320', card: '#0f1923', border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)', text: '#e2e8f0', sec: '#8899aa',
  muted: '#556677', brand: '#0093D0', green: '#22c55e', red: '#ef4444', amber: '#f59e0b',
}

const COR_MAP = {
  red:     { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   titulo: '#f87171', desc: '#fca5a5', rec: '#fca5a5' },
  amber:   { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  titulo: '#fbbf24', desc: '#fcd34d', rec: '#fcd34d' },
  yellow:  { bg: 'rgba(234,179,8,0.08)',   border: 'rgba(234,179,8,0.2)',   titulo: '#facc15', desc: '#fde68a', rec: '#fde68a' },
  green:   { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   titulo: '#4ade80', desc: '#86efac', rec: '#86efac' },
  emerald: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)',  titulo: '#34d399', desc: '#6ee7b7', rec: '#6ee7b7' },
}

type DiagCor = keyof typeof COR_MAP

function gerarDiagnostico(
  ndvi: number | null,
  tendencia: 'subindo' | 'caindo' | 'estavel' | null,
  variacaoPct: number | null,
  nuvens: number | null,
): { cor: DiagCor; titulo: string; descricao: string; recomendacao: string } | null {
  if (ndvi == null) return null
  const caindo = tendencia === 'caindo'
  const subindo = tendencia === 'subindo'
  const altaNuvens = nuvens != null && nuvens > 60
  const caindoForte = caindo && variacaoPct != null && variacaoPct < -15
  const ndviStr = ndvi.toFixed(2)
  const varPct = variacaoPct != null ? variacaoPct.toFixed(0) + '%' : '—'

  if (altaNuvens) return {
    cor: 'amber',
    titulo: 'Cobertura de nuvens alta',
    descricao: `${nuvens!.toFixed(0)}% de nuvens. NDVI de ${ndviStr} pode estar subestimado.`,
    recomendacao: 'Aguardar período de céu limpo para leitura mais precisa.',
  }
  if (ndvi < 0.2) return {
    cor: 'red',
    titulo: 'Vegetação severamente comprometida',
    descricao: caindo
      ? `NDVI em ${ndviStr} e em queda — situação crítica e agravando. Possível perda de stand, senescência acelerada ou estresse hídrico severo.`
      : `NDVI em ${ndviStr} indica cobertura vegetal mínima. Solo exposto, emergência falha ou estágio inicial muito precoce.`,
    recomendacao: 'Visitar talhão imediatamente. Verificar stand, disponibilidade hídrica e pragas de solo.',
  }
  if (ndvi < 0.35) return {
    cor: 'red',
    titulo: 'Vegetação em situação crítica',
    descricao: caindoForte
      ? `NDVI em ${ndviStr} com queda acentuada (${varPct}). Declínio acelerado — possível doença, praga ou estresse severo.`
      : subindo
      ? `NDVI em ${ndviStr}, mas com tendência positiva. Cultura pode estar em estabelecimento ou se recuperando.`
      : `NDVI em ${ndviStr} indica baixa atividade fotossintética. Cultura pode estar em dormência ou sob estresse.`,
    recomendacao: 'Priorizar monitoramento de campo. Verificar nutrição, irrigação e patógenos.',
  }
  if (ndvi < 0.5) return {
    cor: caindo ? 'amber' : 'yellow',
    titulo: caindo ? 'Vegetação em alerta — queda detectada' : 'Vegetação em desenvolvimento moderado',
    descricao: caindo
      ? `NDVI em ${ndviStr} com tendência de queda (${varPct}). Monitorar se o declínio representa início de senescência ou estresse.`
      : subindo
      ? `NDVI em ${ndviStr} em ascensão — cultura provavelmente em fase de crescimento ativo.`
      : `NDVI em ${ndviStr} indica cobertura moderada. Esperado em fases de desenvolvimento inicial ou pós-emergência.`,
    recomendacao: caindo
      ? 'Inspecionar campo. Avaliar déficit hídrico, deficiências nutricionais ou doenças foliares.'
      : 'Garantir disponibilidade de nutrientes e água para suportar crescimento.',
  }
  if (ndvi < 0.65) return {
    cor: 'yellow',
    titulo: caindo ? 'Vegetação saudável em leve declínio' : subindo ? 'Vegetação em pleno desenvolvimento' : 'Vegetação moderada — dentro do esperado',
    descricao: caindo
      ? `NDVI em ${ndviStr} com queda. Pode indicar início de maturação ou estresse pontual.`
      : subindo
      ? `NDVI em ${ndviStr} e crescendo — cultura em fase vegetativa ativa com boa cobertura do dossel.`
      : `NDVI em ${ndviStr}. Boa atividade fotossintética e cobertura adequada para a fase.`,
    recomendacao: caindo
      ? 'Verificar se declínio é parte do ciclo normal (maturação) ou sinal de problema.'
      : 'Manter manejo. Checar necessidade de adubação de cobertura se ainda em fase vegetativa.',
  }
  if (ndvi < 0.8) return {
    cor: 'green',
    titulo: caindo ? 'Vegetação saudável — atenção à queda' : 'Vegetação saudável e vigorosa',
    descricao: caindo
      ? `NDVI em ${ndviStr} com tendência de queda (${varPct}). Pode ser início natural de senescência ou queda precoce.`
      : `NDVI em ${ndviStr}. Excelente cobertura e alta atividade fotossintética. Cultura em ótimo estado.`,
    recomendacao: caindo
      ? 'Confirmar se é senescência esperada para o estágio. Se não for, investigar causas.'
      : 'Manter manejo. Condição favorável para bom potencial produtivo.',
  }
  return {
    cor: 'emerald',
    titulo: 'Vegetação em condição máxima',
    descricao: `NDVI em ${ndviStr} — nível excepcional de vigor. Dossel fechado, alta atividade fotossintética e excelente cobertura do solo.`,
    recomendacao: 'Manter manejo. Monitorar doenças que preferem condições de dossel fechado (fungos).',
  }
}

function fmtData(iso: string) {
  return format(parseISO(iso), "d MMM yyyy", { locale: ptBR })
}
function fmtDataCurta(iso: string) {
  return format(parseISO(iso), "dd/MM", { locale: ptBR })
}
function diasAtras(iso: string) {
  const diff = Math.floor((Date.now() - parseISO(iso).getTime()) / 86400000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  return `${diff}d atrás`
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function NdviKpiCard({ nome, ndvi, data, tendencia, variacaoPct, selecionado, onClick }: {
  nome: string; ndvi: number | null; data: string | null
  tendencia: 'subindo' | 'caindo' | 'estavel' | null; variacaoPct: number | null
  selecionado: boolean; onClick: () => void
}) {
  const cls = classificarNdvi(ndvi)
  const TendIcon = tendencia === 'subindo' ? TrendingUp : tendencia === 'caindo' ? TrendingDown : Minus
  const tendCor = tendencia === 'subindo' ? C.green : tendencia === 'caindo' ? C.red : C.muted
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      background: selecionado ? 'rgba(0,147,208,0.1)' : C.card,
      border: `1px solid ${selecionado ? C.brand : C.border}`,
      borderRadius: 12, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{nome}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: cls.corFundo + '22', color: cls.cor, border: `1px solid ${cls.cor}44`, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>{cls.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: ndvi != null ? cls.cor : C.muted, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {ndvi != null ? ndvi.toFixed(2) : '—'}
        </span>
        {tendencia && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <TendIcon size={13} color={tendCor} />
            {variacaoPct != null && <span style={{ fontSize: 11, fontWeight: 700, color: tendCor, fontVariantNumeric: 'tabular-nums' }}>{variacaoPct > 0 ? '+' : ''}{variacaoPct.toFixed(1)}%</span>}
          </div>
        )}
      </div>
      {data && <span style={{ fontSize: 11, color: C.muted }}>{diasAtras(data)} · {fmtData(data)}</span>}
    </button>
  )
}

// ─── Comparativo Card ─────────────────────────────────────────────────────────
function ComparativoCard({ nome, comp, onClick }: { nome: string; comp: NdviComparativoItem; onClick: () => void }) {
  const cls = classificarNdvi(comp.atual?.ndvi_medio ?? null)
  const TendIcon = comp.tendencia === 'subindo' ? TrendingUp : comp.tendencia === 'caindo' ? TrendingDown : Minus
  const tendCor = comp.tendencia === 'subindo' ? C.green : comp.tendencia === 'caindo' ? C.red : C.muted
  const tendBg = comp.tendencia === 'subindo' ? 'rgba(34,197,94,0.1)' : comp.tendencia === 'caindo' ? 'rgba(239,68,68,0.1)' : 'rgba(85,102,119,0.1)'
  return (
    <button onClick={onClick} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s ease', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{nome}</span>
        <ChevronRight size={14} color={C.muted} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: cls.cor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{comp.atual?.ndvi_medio != null ? comp.atual.ndvi_medio.toFixed(2) : '—'}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: cls.corFundo + '22', color: cls.cor, border: `1px solid ${cls.cor}44`, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>{cls.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {comp.tendencia && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: tendBg, padding: '4px 10px', borderRadius: 8 }}>
            <TendIcon size={12} color={tendCor} />
            {comp.variacaoPct != null && <span style={{ fontSize: 11, fontWeight: 700, color: tendCor, fontVariantNumeric: 'tabular-nums' }}>{comp.variacaoPct > 0 ? '+' : ''}{comp.variacaoPct.toFixed(1)}%</span>}
          </div>
        )}
        {comp.anterior?.ndvi_medio != null && <span style={{ fontSize: 11, color: C.muted }}>Anterior: {comp.anterior.ndvi_medio.toFixed(2)}</span>}
      </div>
      {comp.atual?.data_imagem && <span style={{ fontSize: 10, color: C.muted }}>{diasAtras(comp.atual.data_imagem)} · {fmtData(comp.atual.data_imagem)}</span>}
    </button>
  )
}

function LegendaNdvi() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 8 }}>
      {[['#888','< 0'], ['#dc2626','0–0.2 Crítico'], ['#c74f00','0.2–0.35 Estressado'], ['#c7c700','0.35–0.5 Moderado'], ['#00c800','0.5–0.7 Bom'], ['#007a00','> 0.7 Excelente']].map(([cor, label]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: cor, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: C.sec }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

function NdviTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  const cls = classificarNdvi(v)
  return (
    <div style={{ background: '#0d1520', border: `1px solid ${C.borderHover}`, borderRadius: 10, padding: '8px 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: cls.cor, fontVariantNumeric: 'tabular-nums' }}>{v.toFixed(3)}</div>
      <div style={{ fontSize: 10, color: cls.cor, marginTop: 2 }}>{cls.label}</div>
    </div>
  )
}

// ─── Detalhe NDVI de um item (pivô ou talhão) ─────────────────────────────────
function NdviDetalhe({
  name, detalhe, loadingDetalhe, hasPolygon, compSel, onRefresh, refreshing, refreshError,
}: {
  name: string
  detalhe: NdviTalhaoResponse | null
  loadingDetalhe: boolean
  hasPolygon: boolean
  compSel: NdviComparativoItem | null
  onRefresh: () => void
  refreshing: boolean
  refreshError?: string | null
}) {
  const ultimoNdvi: NdviRegistro | null = detalhe?.historico
    ? ([...detalhe.historico].reverse().find(h => h.ndvi_medio != null) ?? null) : null
  const diag = gerarDiagnostico(
    ultimoNdvi?.ndvi_medio ?? null,
    compSel?.tendencia ?? null,
    compSel?.variacaoPct ?? null,
    ultimoNdvi?.cobertura_nuvens_pct ?? null,
  )
  const dadosGrafico = (detalhe?.historico ?? []).filter(h => h.ndvi_medio != null)
    .map(h => ({ data: fmtDataCurta(h.data_imagem), ndvi: Number(h.ndvi_medio!.toFixed(4)) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{name}</div>
          {detalhe?.ultima_atualizacao
            ? <div style={{ fontSize: 11, color: C.muted }}>
                Última imagem: {fmtData(detalhe.ultima_atualizacao)}
                {detalhe.dias_desde_ultima != null && ` · ${detalhe.dias_desde_ultima}d atrás`}
              </div>
            : ultimoNdvi?.data_imagem
            ? <div style={{ fontSize: 11, color: C.muted }}>Última leitura: {fmtData(ultimoNdvi.data_imagem)} · {diasAtras(ultimoNdvi.data_imagem)}</div>
            : null
          }
        </div>
        <button onClick={onRefresh} disabled={refreshing || loadingDetalhe} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.brand, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: refreshing ? 0.6 : 1, minHeight: 36 }}>
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : undefined }} />
          {refreshing ? 'Buscando...' : 'Atualizar via Satélite'}
        </button>
      </div>

      {detalhe?.sem_credenciais && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10 }}>
          <Info size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.amber }}>Credenciais Sentinel Hub não configuradas</div>
            <div style={{ fontSize: 12, color: '#fcd34d', marginTop: 2 }}>
              Configure <code>PLANET_API_KEY</code> nos Secrets da Edge Function para buscar imagens de satélite reais.
            </div>
          </div>
        </div>
      )}

      {refreshError && refreshError !== 'SENTINEL_NOT_CONFIGURED' && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#fca5a5' }}>{refreshError}</div>
          </div>
          <button onClick={onRefresh} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#f87171', cursor: 'pointer' }}>Tentar novamente</button>
        </div>
      )}

      {diag && (() => {
        const c = COR_MAP[diag.cor]
        return (
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 6 }}>Diagnóstico IA</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.titulo, marginBottom: 4 }}>{diag.titulo}</div>
            <div style={{ fontSize: 12, color: c.desc, lineHeight: 1.5, marginBottom: 8 }}>{diag.descricao}</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: c.rec, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recomendação: </span>
            <span style={{ fontSize: 11, color: c.rec }}>{diag.recomendacao}</span>
          </div>
        )
      })()}

      {!hasPolygon && (
        <div style={{ background: 'rgba(0,147,208,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
          <MapPin size={28} color={C.muted} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: C.sec }}>Polígono não cadastrado</div>
        </div>
      )}

      {ultimoNdvi?.imagem_url && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Imagem NDVI · {ultimoNdvi.data_imagem && fmtData(ultimoNdvi.data_imagem)}</div>
            {ultimoNdvi.cobertura_nuvens_pct != null && (
              <span style={{ fontSize: 10, color: ultimoNdvi.cobertura_nuvens_pct > 60 ? C.amber : C.muted }}>
                ☁ {ultimoNdvi.cobertura_nuvens_pct.toFixed(0)}% nuvens
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <img src={ultimoNdvi.imagem_url} alt="NDVI" style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }} />
            {/* Badge NDVI sobreposto */}
            {ultimoNdvi.ndvi_medio != null && (() => {
              const cls = classificarNdvi(ultimoNdvi.ndvi_medio)
              return (
                <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(13,21,32,0.85)', border: `1px solid ${cls.cor}66`, borderRadius: 10, padding: '6px 12px', backdropFilter: 'blur(4px)' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: cls.cor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{ultimoNdvi.ndvi_medio.toFixed(2)}</div>
                  <div style={{ fontSize: 9, color: cls.cor, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{cls.label}</div>
                </div>
              )
            })()}
          </div>
          {/* Legenda inline de cores (barra compacta) */}
          <div style={{ padding: '8px 14px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {['#dc1e14','#dc5000','#c8c800','#00c800','#009600'].map((c, i) => (
                <div key={i} style={{ width: 20, height: 12, borderRadius: 3, background: c }} />
              ))}
            </div>
            <span style={{ fontSize: 10, color: C.muted }}>baixo → alto NDVI</span>
            <div style={{ flex: 1 }} />
            <LegendaNdvi />
          </div>
        </div>
      )}

      {dadosGrafico.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Histórico NDVI</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dadosGrafico} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="data" tick={{ fill: C.muted, fontSize: 10 }} />
              <YAxis domain={[0, 1]} tick={{ fill: C.muted, fontSize: 10 }} />
              <Tooltip content={<NdviTooltip />} />
              <ReferenceLine y={0.7} stroke="#15803d" strokeDasharray="4 2" label={{ value: 'Excelente', fill: '#15803d', fontSize: 9 }} />
              <ReferenceLine y={0.5} stroke="#ca8a04" strokeDasharray="4 2" label={{ value: 'Moderado', fill: '#ca8a04', fontSize: 9 }} />
              <ReferenceLine y={0.2} stroke="#dc2626" strokeDasharray="4 2" label={{ value: 'Crítico', fill: '#dc2626', fontSize: 9 }} />
              <Area type="monotone" dataKey="ndvi" stroke="#4ade80" strokeWidth={2} fill="url(#ndviGrad)" dot={{ r: 4, fill: '#4ade80' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {detalhe && detalhe.historico.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Leituras recentes</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  {['Data', 'NDVI Médio', 'Mín', 'Máx', 'Nuvens %', 'Classificação'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', color: C.muted, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...detalhe.historico].reverse().slice(0, 8).map((r: NdviRegistro) => {
                  const cls = classificarNdvi(r.ndvi_medio)
                  return (
                    <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: '8px 12px', color: C.sec }}>{r.data_imagem && fmtData(r.data_imagem)}</td>
                      <td style={{ padding: '8px 12px', color: cls.cor, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.ndvi_medio != null ? r.ndvi_medio.toFixed(3) : '—'}</td>
                      <td style={{ padding: '8px 12px', color: C.sec, fontVariantNumeric: 'tabular-nums' }}>{r.ndvi_min != null ? r.ndvi_min.toFixed(3) : '—'}</td>
                      <td style={{ padding: '8px 12px', color: C.sec, fontVariantNumeric: 'tabular-nums' }}>{r.ndvi_max != null ? r.ndvi_max.toFixed(3) : '—'}</td>
                      <td style={{ padding: '8px 12px', color: r.cobertura_nuvens_pct != null && r.cobertura_nuvens_pct > 60 ? C.amber : C.sec, fontVariantNumeric: 'tabular-nums' }}>
                        {r.cobertura_nuvens_pct != null ? r.cobertura_nuvens_pct.toFixed(0) + '%' : '—'}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: cls.corFundo + '22', color: cls.cor, border: `1px solid ${cls.cor}44`, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cls.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loadingDetalhe && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><PivotSpinner size={40} label="Buscando dados..." /></div>}

      {!loadingDetalhe && detalhe?.historico?.length === 0 && !detalhe?.sem_credenciais && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '36px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Satellite size={36} color={C.muted} />
          <div style={{ fontSize: 14, fontWeight: 600, color: C.sec }}>Nenhuma imagem disponível nos últimos 120 dias</div>
          <div style={{ fontSize: 12, color: C.muted, maxWidth: 280 }}>
            {hasPolygon
              ? 'Clique em "Atualizar via Satélite" para buscar imagens do Sentinel-2.'
              : 'Desenhe o polígono para habilitar o monitoramento por satélite.'}
          </div>
          {hasPolygon && (
            <button onClick={onRefresh} disabled={refreshing} style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, background: C.brand, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: refreshing ? 0.6 : 1 }}>
              <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : undefined }} />
              Atualizar agora
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Modal de criação/edição de talhão ────────────────────────────────────────
function TalhaoModal({
  talhao, farms, companyId, onClose, onSaved,
}: {
  talhao?: Talhao | null
  farms: Array<{ id: string; name: string }>
  companyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(talhao?.name ?? '')
  const [farmId, setFarmId] = useState(talhao?.farm_id ?? '')
  const [areaHa, setAreaHa] = useState(talhao?.area_ha?.toString() ?? '')
  const [color, setColor] = useState(talhao?.color ?? '#22c55e')
  const [notes, setNotes] = useState(talhao?.notes ?? '')
  const [polygon, setPolygon] = useState<Record<string, unknown> | null>(talhao?.polygon_geojson ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Nome obrigatório.'); return }
    setSaving(true)
    try {
      const data = {
        company_id: companyId,
        name: name.trim(),
        farm_id: farmId || null,
        area_ha: areaHa ? Number(areaHa) : null,
        color,
        notes: notes || null,
        polygon_geojson: polygon,
      }
      if (talhao) {
        await updateTalhao(talhao.id, data)
      } else {
        await createTalhao(data)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  // Farm center for map
  const farmLat = -22.88
  const farmLng = -50.36

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{talhao ? 'Editar Talhão' : 'Novo Talhão'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.sec, display: 'flex', minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#f87171' }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: C.sec, fontWeight: 600, display: 'block', marginBottom: 6 }}>Nome *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Talhão Norte" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#0d1520', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.sec, fontWeight: 600, display: 'block', marginBottom: 6 }}>Área (ha)</label>
              <input value={areaHa} onChange={e => setAreaHa(e.target.value)} type="number" placeholder="Ex: 45.5" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#0d1520', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.sec, fontWeight: 600, display: 'block', marginBottom: 6 }}>Fazenda</label>
              <select value={farmId} onChange={e => setFarmId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#0d1520', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                <option value="">Nenhuma</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.sec, fontWeight: 600, display: 'block', marginBottom: 6 }}>Cor</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 40, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', cursor: 'pointer', padding: 2 }} />
                {['#22c55e','#0093D0','#f59e0b','#ef4444','#8b5cf6','#06b6d4'].map(c => (
                  <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: C.sec, fontWeight: 600, display: 'block', marginBottom: 6 }}>Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Informações adicionais..." style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#0d1520', color: C.text, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          {/* Mapa de desenho */}
          <div>
            <label style={{ fontSize: 12, color: C.sec, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Polígono {polygon ? <span style={{ color: C.green }}>✓ desenhado</span> : <span style={{ color: C.amber }}>(obrigatório para NDVI)</span>}
            </label>
            <TalhaoMapDrawDynamic
              existingPolygon={polygon}
              onPolygonChange={setPolygon}
              height={320}
              centerLat={farmLat}
              centerLng={farmLng}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', color: C.sec, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: C.brand, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
              <Save size={14} />{saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
type Aba = 'pivotos' | 'talhoes' | 'comparativo'

export default function NdviPage() {
  const { company } = useAuth()
  const [farms, setFarms] = useState<Array<{ id: string; name: string }>>([])
  const [pivots, setPivots] = useState<Pivot[]>([])
  const [talhoes, setTalhoes] = useState<Talhao[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Aba>('pivotos')

  // Pivô selecionado
  const [pivotSel, setPivotSel] = useState<string | null>(null)
  const [pivotDetalhe, setPivotDetalhe] = useState<NdviTalhaoResponse | null>(null)
  const [loadingPivotDetalhe, setLoadingPivotDetalhe] = useState(false)

  // Talhão selecionado
  const [talhaoSel, setTalhaoSel] = useState<string | null>(null)
  const [talhaoDetalhe, setTalhaoDetalhe] = useState<NdviTalhaoResponse | null>(null)
  const [loadingTalhaoDetalhe, setLoadingTalhaoDetalhe] = useState(false)

  // Modal talhão
  const [modalTalhao, setModalTalhao] = useState<Talhao | null | 'new'>(null)

  const { mutate: refreshNdvi, pending: refreshing, error: refreshErrorPivot } = useRefreshNdvi()
  const { mutate: refreshNdviTalhao, pending: refreshingTalhao, error: refreshErrorTalhao } = useRefreshNdvi()

  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    const farmsData = await listFarmsByCompany(company.id)
    setFarms(farmsData)
    const [pivotsData, talhoesData] = await Promise.all([
      listPivotsByFarmIds(farmsData.map(f => f.id)),
      listTalhoesByCompany(company.id),
    ])
    setPivots(pivotsData as Pivot[])
    setTalhoes(talhoesData)
    if (pivotsData.length > 0 && !pivotSel) setPivotSel(pivotsData[0].id)
    if (talhoesData.length > 0 && !talhaoSel) setTalhaoSel(talhoesData[0].id)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id])

  useEffect(() => { loadData() }, [loadData])

  // IDs para hooks
  const pivotIds = useMemo(() => pivots.map(p => p.id), [pivots])
  const talhaoIds = useMemo(() => talhoes.map(t => t.id), [talhoes])
  const allIds = useMemo(() => [...pivotIds, ...talhaoIds], [pivotIds, talhaoIds])

  const ndviMultiplosPivots = useNdviMultiplos(pivotIds)
  const ndviMultiplosTalhoes = useNdviMultiplos(talhaoIds)
  const ndviComparativoPivots = useNdviComparativo(pivotIds)
  const ndviComparativoTalhoes = useNdviComparativo(talhaoIds)

  // Carrega detalhe pivô
  const loadPivotDetalhe = useCallback(async (pid: string) => {
    setLoadingPivotDetalhe(true)
    const supabase = createClient()
    const { data } = await supabase.from('ndvi_cache').select('*').eq('pivot_id', pid).order('data_imagem', { ascending: true })
    setPivotDetalhe({ pivot_id: pid, pivot_name: '', entity_name: pivots.find(p => p.id === pid)?.name ?? '', historico: (data ?? []) as NdviRegistro[], alertas: [] })
    setLoadingPivotDetalhe(false)
  }, [pivots])

  // Carrega detalhe talhão
  const loadTalhaoDetalhe = useCallback(async (tid: string) => {
    setLoadingTalhaoDetalhe(true)
    const supabase = createClient()
    const { data } = await supabase.from('ndvi_cache').select('*').eq('talhao_id', tid).order('data_imagem', { ascending: true })
    setTalhaoDetalhe({ talhao_id: tid, pivot_id: undefined, pivot_name: '', entity_name: talhoes.find(t => t.id === tid)?.name ?? '', historico: (data ?? []) as NdviRegistro[], alertas: [] })
    setLoadingTalhaoDetalhe(false)
  }, [talhoes])

  useEffect(() => { if (pivotSel) loadPivotDetalhe(pivotSel) }, [pivotSel, loadPivotDetalhe])
  useEffect(() => { if (talhaoSel) loadTalhaoDetalhe(talhaoSel) }, [talhaoSel, loadTalhaoDetalhe])

  // Rankings
  const rankingPivots = useMemo(() => pivots.map(p => {
    const rec = ndviMultiplosPivots.find(n => n.pivot_id === p.id)
    const comp = ndviComparativoPivots.find(c => c.pivot_id === p.id)
    return { id: p.id, nome: p.name, ndvi: rec?.ndvi_medio ?? null, data: rec?.data_imagem ?? null, tendencia: comp?.tendencia ?? null, variacaoPct: comp?.variacaoPct ?? null, hasPolygon: !!p.polygon_geojson }
  }).sort((a, b) => (a.ndvi ?? -1) - (b.ndvi ?? -1)), [pivots, ndviMultiplosPivots, ndviComparativoPivots])

  const rankingTalhoes = useMemo(() => talhoes.map(t => {
    const rec = ndviMultiplosTalhoes.find(n => n.pivot_id === t.id)
    const comp = ndviComparativoTalhoes.find(c => c.pivot_id === t.id)
    return { id: t.id, nome: t.name, ndvi: rec?.ndvi_medio ?? null, data: rec?.data_imagem ?? null, tendencia: comp?.tendencia ?? null, variacaoPct: comp?.variacaoPct ?? null, hasPolygon: !!t.polygon_geojson, color: t.color }
  }).sort((a, b) => (a.ndvi ?? -1) - (b.ndvi ?? -1)), [talhoes, ndviMultiplosTalhoes, ndviComparativoTalhoes])

  // KPIs globais
  const comDadoPivots = rankingPivots.filter(r => r.ndvi != null)
  const comDadoTalhoes = rankingTalhoes.filter(r => r.ndvi != null)
  const todosComDado = [...comDadoPivots, ...comDadoTalhoes]
  const ndviMedio = todosComDado.length ? todosComDado.reduce((s, r) => s + r.ndvi!, 0) / todosComDado.length : null

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <PivotSpinner size={52} label="Carregando..." />
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '20px 16px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #0093D0, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Satellite size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>NDVI Satélite</h1>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Sentinel-2 · pivôs e talhões</p>
          </div>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', background: C.card, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {([
            { id: 'pivotos', label: 'Pivôs', icon: <BarChart3 size={13} />, count: pivots.length },
            { id: 'talhoes', label: 'Talhões', icon: <Layers size={13} />, count: talhoes.length },
            { id: 'comparativo', label: 'Comparativo', icon: <ChevronRight size={13} />, count: null },
          ] as const).map(({ id, label, icon, count }) => (
            <button key={id} onClick={() => setAba(id)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: aba === id ? C.brand : 'transparent', color: aba === id ? '#fff' : C.sec,
              fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s ease',
            }}>
              {icon}{label}
              {count !== null && <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '1px 5px' }}>{count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        {([
          { label: 'Total monitorado', value: `${todosComDado.length}/${pivots.length + talhoes.length}`, sub: 'com dados NDVI', cor: C.brand },
          { label: 'NDVI médio', value: ndviMedio != null ? ndviMedio.toFixed(2) : '—', sub: classificarNdvi(ndviMedio).label, cor: classificarNdvi(ndviMedio).cor },
          { label: 'Pivôs', value: String(pivots.length), sub: `${comDadoPivots.length} com dados`, cor: C.brand },
          { label: 'Talhões', value: String(talhoes.length), sub: `${comDadoTalhoes.length} com dados`, cor: '#8b5cf6' },
        ] as const).map(({ label, value, sub, cor }) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: cor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: C.sec, marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Aba Pivôs ────────────────────────────────────────────── */}
      {aba === 'pivotos' && (
        pivots.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
            <Satellite size={40} color={C.muted} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nenhum pivô cadastrado</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(0,2fr)', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Menor → Maior NDVI</div>
              {rankingPivots.map(({ id, nome, ndvi, data, tendencia, variacaoPct }) => (
                <NdviKpiCard key={id} nome={nome} ndvi={ndvi} data={data} tendencia={tendencia} variacaoPct={variacaoPct} selecionado={pivotSel === id} onClick={() => setPivotSel(id)} />
              ))}
            </div>
            <div>
              {pivotSel && (
                <NdviDetalhe
                  name={pivots.find(p => p.id === pivotSel)?.name ?? ''}
                  detalhe={pivotDetalhe}
                  loadingDetalhe={loadingPivotDetalhe}
                  hasPolygon={!!pivots.find(p => p.id === pivotSel)?.polygon_geojson}
                  compSel={ndviComparativoPivots.find(c => c.pivot_id === pivotSel) ?? null}
                  onRefresh={() => refreshNdvi({ pivot_id: pivotSel! }, (res) => { setPivotDetalhe(res) })}
                  refreshing={refreshing}
                  refreshError={refreshErrorPivot}
                />
              )}
            </div>
          </div>
        )
      )}

      {/* ── Aba Talhões ──────────────────────────────────────────── */}
      {aba === 'talhoes' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: C.sec }}>{talhoes.length} talhão{talhoes.length !== 1 ? 'es' : ''} cadastrado{talhoes.length !== 1 ? 's' : ''}</div>
            <button
              onClick={() => setModalTalhao('new')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.brand, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 36 }}
            >
              <Plus size={14} /> Novo Talhão
            </button>
          </div>

          {talhoes.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
              <Layers size={40} color={C.muted} style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>Nenhum talhão cadastrado</div>
              <div style={{ fontSize: 12, color: C.muted }}>Crie talhões para monitorar qualquer área por satélite — sequeiro, pastagem, APP, etc.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(0,2fr)', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Menor → Maior NDVI</div>
                {rankingTalhoes.map(({ id, nome, ndvi, data, tendencia, variacaoPct, color }) => (
                  <div key={id} style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color, borderRadius: '3px 0 0 3px' }} />
                    <div style={{ paddingLeft: 6 }}>
                      <NdviKpiCard nome={nome} ndvi={ndvi} data={data} tendencia={tendencia} variacaoPct={variacaoPct} selecionado={talhaoSel === id} onClick={() => setTalhaoSel(id)} />
                    </div>
                    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                      <button onClick={e => { e.stopPropagation(); setModalTalhao(talhoes.find(t => t.id === id) ?? null) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4, display: 'flex' }}><Pencil size={12} /></button>
                      <button onClick={async e => { e.stopPropagation(); if (confirm('Excluir talhão?')) { await deleteTalhao(id); loadData() } }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, padding: 4, display: 'flex' }}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                {talhaoSel && (
                  <NdviDetalhe
                    name={talhoes.find(t => t.id === talhaoSel)?.name ?? ''}
                    detalhe={talhaoDetalhe}
                    loadingDetalhe={loadingTalhaoDetalhe}
                    hasPolygon={!!talhoes.find(t => t.id === talhaoSel)?.polygon_geojson}
                    compSel={ndviComparativoTalhoes.find(c => c.pivot_id === talhaoSel) ?? null}
                    onRefresh={() => refreshNdviTalhao({ talhao_id: talhaoSel! }, (res) => { setTalhaoDetalhe(res) })}
                    refreshing={refreshingTalhao}
                    refreshError={refreshErrorTalhao}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Aba Comparativo ──────────────────────────────────────── */}
      {aba === 'comparativo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {pivots.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Pivôs</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                {ndviComparativoPivots.map(comp => {
                  const pivot = pivots.find(p => p.id === comp.pivot_id)
                  if (!pivot) return null
                  return <ComparativoCard key={comp.pivot_id} nome={pivot.name} comp={comp} onClick={() => { setPivotSel(comp.pivot_id); setAba('pivotos') }} />
                })}
              </div>
            </div>
          )}
          {talhoes.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Talhões</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                {ndviComparativoTalhoes.map(comp => {
                  const talhao = talhoes.find(t => t.id === comp.pivot_id)
                  if (!talhao) return null
                  return <ComparativoCard key={comp.pivot_id} nome={talhao.name} comp={comp} onClick={() => { setTalhaoSel(comp.pivot_id); setAba('talhoes') }} />
                })}
              </div>
            </div>
          )}
          {pivots.length === 0 && talhoes.length === 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
              <Satellite size={40} color={C.muted} style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nenhum dado para comparar</div>
            </div>
          )}
        </div>
      )}

      {/* Modal talhão */}
      {modalTalhao !== null && (
        <TalhaoModal
          talhao={modalTalhao === 'new' ? null : modalTalhao}
          farms={farms}
          companyId={company?.id ?? ''}
          onClose={() => setModalTalhao(null)}
          onSaved={loadData}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

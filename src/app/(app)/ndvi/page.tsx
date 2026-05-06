'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { listFarmsByCompany } from '@/services/farms'
import { listPivotsByFarmIds } from '@/services/pivots'
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
  Satellite,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Info,
  ChevronRight,
  BarChart3,
  Layers,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import PivotSpinner from '@/components/ui/PivotSpinner'

// ─── Cores ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#0b1320',
  card: '#0f1923',
  surface: '#0d1520',
  border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
  text: '#e2e8f0',
  sec: '#8899aa',
  muted: '#556677',
  brand: '#0093D0',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
}

// ─── Diagnóstico IA determinístico ────────────────────────────────────────────
interface Diagnostico {
  titulo: string
  descricao: string
  recomendacao: string
  cor: 'red' | 'amber' | 'yellow' | 'green' | 'emerald'
}

const COR_MAP = {
  red:     { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   titulo: '#f87171', desc: '#fca5a5', rec: '#fca5a5' },
  amber:   { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  titulo: '#fbbf24', desc: '#fcd34d', rec: '#fcd34d' },
  yellow:  { bg: 'rgba(234,179,8,0.08)',   border: 'rgba(234,179,8,0.2)',   titulo: '#facc15', desc: '#fde68a', rec: '#fde68a' },
  green:   { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   titulo: '#4ade80', desc: '#86efac', rec: '#86efac' },
  emerald: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)',  titulo: '#34d399', desc: '#6ee7b7', rec: '#6ee7b7' },
}

function gerarDiagnostico(
  ndvi: number | null,
  tendencia: 'subindo' | 'caindo' | 'estavel' | null,
  variacaoPct: number | null,
): Diagnostico | null {
  if (ndvi == null) return null
  const caindo = tendencia === 'caindo'
  const subindo = tendencia === 'subindo'

  if (ndvi < 0.2) return {
    cor: 'red',
    titulo: 'Vegetação severamente comprometida',
    descricao: 'NDVI extremamente baixo indica solo exposto, cultura morta ou falha severa no stand.',
    recomendacao: 'Verificar estado da cultura in loco imediatamente. Avaliar replantio.',
  }
  if (ndvi < 0.35) return {
    cor: 'red',
    titulo: 'Vegetação em situação crítica',
    descricao: caindo
      ? `Queda de ${variacaoPct != null ? Math.abs(variacaoPct).toFixed(1) + '%' : ''} detectada. Estresse hídrico severo.`
      : 'Biomassa muito baixa para o estádio fenológico esperado.',
    recomendacao: 'Verificar irrigação, pragas e doenças. Considerar amostragem de solo.',
  }
  if (ndvi < 0.5) return {
    cor: caindo ? 'amber' : 'yellow',
    titulo: caindo ? 'Vegetação em alerta — queda detectada' : 'Vegetação em desenvolvimento moderado',
    descricao: caindo
      ? `Declínio de ${variacaoPct != null ? Math.abs(variacaoPct).toFixed(1) + '%' : ''} na última leitura.`
      : 'Vigor vegetativo abaixo do potencial. Possível deficiência.',
    recomendacao: 'Revisar irrigação e fertirrigação. Monitorar próxima passagem.',
  }
  if (ndvi < 0.65) return {
    cor: 'yellow',
    titulo: subindo ? 'Vegetação em recuperação' : 'Vegetação moderada — dentro do esperado',
    descricao: subindo
      ? `Melhora de ${variacaoPct != null ? variacaoPct.toFixed(1) + '%' : ''} no período. Resposta positiva ao manejo.`
      : 'Biomassa dentro do esperado para a fase vegetativa.',
    recomendacao: 'Manter manejo atual. Observar uniformidade na área.',
  }
  if (ndvi < 0.8) return {
    cor: 'green',
    titulo: 'Vegetação saudável e vigorosa',
    descricao: 'Alta atividade fotossintética. Cultura bem estabelecida com bom potencial produtivo.',
    recomendacao: 'Manter irrigação e nutrição. Monitorar cobertura.',
  }
  return {
    cor: 'emerald',
    titulo: 'Vegetação em condição máxima',
    descricao: 'NDVI excelente. Biomassa máxima — condição ideal para máxima produtividade.',
    recomendacao: 'Manter o manejo. Nenhuma intervenção necessária.',
  }
}

// ─── Formatações ──────────────────────────────────────────────────────────────
function fmtData(iso: string) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function diasAtras(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso + 'T12:00:00Z').getTime()) / 86400000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  return `${diff}d atrás`
}

// ─── Card de KPI no ranking ────────────────────────────────────────────────────
function NdviKpiCard({
  nome, ndvi, data, tendencia, variacaoPct, selecionado, onClick,
}: {
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
      borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
      textAlign: 'left', width: '100%', transition: 'all 0.15s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, textAlign: 'left' }}>{nome}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: cls.corFundo + '22', color: cls.cor, border: `1px solid ${cls.cor}44`,
          letterSpacing: '0.04em', textTransform: 'uppercase' as const,
        }}>{cls.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: ndvi != null ? cls.cor : C.muted, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {ndvi != null ? ndvi.toFixed(2) : '—'}
        </span>
        {tendencia && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <TendIcon size={13} color={tendCor} />
            {variacaoPct != null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: tendCor, fontVariantNumeric: 'tabular-nums' }}>
                {variacaoPct > 0 ? '+' : ''}{variacaoPct.toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>
      {data && <span style={{ fontSize: 11, color: C.muted }}>{diasAtras(data)} · {fmtData(data)}</span>}
    </button>
  )
}

// ─── Card comparativo ─────────────────────────────────────────────────────────
function ComparativoCard({ nome, comp, onClick }: { nome: string; comp: NdviComparativoItem; onClick: () => void }) {
  const cls = classificarNdvi(comp.atual?.ndvi_medio ?? null)
  const TendIcon = comp.tendencia === 'subindo' ? TrendingUp : comp.tendencia === 'caindo' ? TrendingDown : Minus
  const tendCor = comp.tendencia === 'subindo' ? C.green : comp.tendencia === 'caindo' ? C.red : C.muted
  const tendBg = comp.tendencia === 'subindo' ? 'rgba(34,197,94,0.1)' : comp.tendencia === 'caindo' ? 'rgba(239,68,68,0.1)' : 'rgba(85,102,119,0.1)'

  return (
    <button onClick={onClick} style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px',
      cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s ease',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{nome}</span>
        <ChevronRight size={14} color={C.muted} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: cls.cor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {comp.atual?.ndvi_medio != null ? comp.atual.ndvi_medio.toFixed(2) : '—'}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: cls.corFundo + '22', color: cls.cor, border: `1px solid ${cls.cor}44`,
          letterSpacing: '0.04em', textTransform: 'uppercase' as const,
        }}>{cls.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {comp.tendencia && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: tendBg, padding: '4px 10px', borderRadius: 8 }}>
            <TendIcon size={12} color={tendCor} />
            {comp.variacaoPct != null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: tendCor, fontVariantNumeric: 'tabular-nums' }}>
                {comp.variacaoPct > 0 ? '+' : ''}{comp.variacaoPct.toFixed(1)}%
              </span>
            )}
          </div>
        )}
        {comp.anterior?.ndvi_medio != null && (
          <span style={{ fontSize: 11, color: C.muted }}>Anterior: {comp.anterior.ndvi_medio.toFixed(2)}</span>
        )}
      </div>
      {comp.atual?.data_imagem && (
        <span style={{ fontSize: 10, color: C.muted }}>{diasAtras(comp.atual.data_imagem)} · {fmtData(comp.atual.data_imagem)}</span>
      )}
    </button>
  )
}

// ─── Legenda NDVI ─────────────────────────────────────────────────────────────
function LegendaNdvi() {
  const itens = [
    { cor: '#888', label: '< 0' },
    { cor: '#dc2626', label: '0–0.2 Crítico' },
    { cor: '#c74f00', label: '0.2–0.35 Estressado' },
    { cor: '#c7c700', label: '0.35–0.5 Moderado' },
    { cor: '#00c800', label: '0.5–0.7 Bom' },
    { cor: '#007a00', label: '> 0.7 Excelente' },
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 8 }}>
      {itens.map(({ cor, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: cor, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: C.sec }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function NdviTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string
}) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  const cls = classificarNdvi(v)
  return (
    <div style={{
      background: '#0d1520', border: `1px solid ${C.borderHover}`, borderRadius: 10,
      padding: '8px 12px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
    }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: cls.cor, fontVariantNumeric: 'tabular-nums' }}>
        {v.toFixed(3)}
      </div>
      <div style={{ fontSize: 10, color: cls.cor, marginTop: 2 }}>{cls.label}</div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function NdviPage() {
  const { company } = useAuth()
  const [pivots, setPivots] = useState<Pivot[]>([])
  const [loading, setLoading] = useState(true)
  const [modo, setModo] = useState<'ranking' | 'comparativo'>('ranking')
  const [pivotSelecionado, setPivotSelecionado] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<NdviTalhaoResponse | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const { mutate: refreshNdvi, pending: refreshing } = useRefreshNdvi()

  useEffect(() => {
    if (!company?.id) return
    setLoading(true)
    listFarmsByCompany(company.id).then((farms) => {
      listPivotsByFarmIds(farms.map((f) => f.id)).then((ps) => {
        setPivots(ps as Pivot[])
        if (ps.length > 0) setPivotSelecionado(ps[0].id)
        setLoading(false)
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id])

  const pivotIds = useMemo(() => pivots.map((p) => p.id), [pivots])
  const ndviMultiplos = useNdviMultiplos(pivotIds)
  const ndviComparativo = useNdviComparativo(pivotIds)

  // Carrega detalhe direto do banco quando pivô muda
  const loadDetalhe = useCallback(async (pid: string) => {
    setLoadingDetalhe(true)
    const supabase = createClient()
    const { data: rows } = await supabase
      .from('ndvi_cache')
      .select('*')
      .eq('pivot_id', pid)
      .order('data_imagem', { ascending: true })
    setDetalhe({
      pivot_id: pid,
      pivot_name: pivots.find((p) => p.id === pid)?.name ?? '',
      historico: (rows ?? []) as NdviRegistro[],
      alertas: [],
    })
    setLoadingDetalhe(false)
  }, [pivots])

  useEffect(() => {
    if (pivotSelecionado) loadDetalhe(pivotSelecionado)
  }, [pivotSelecionado, loadDetalhe])

  // Ranking
  const ranking = useMemo(() => pivots.map((p) => {
    const rec = ndviMultiplos.find((n) => n.pivot_id === p.id)
    const comp = ndviComparativo.find((c) => c.pivot_id === p.id)
    return {
      pivot: p,
      ndvi: rec?.ndvi_medio ?? null,
      data: rec?.data_imagem ?? null,
      tendencia: comp?.tendencia ?? null,
      variacaoPct: comp?.variacaoPct ?? null,
    }
  }).sort((a, b) => (a.ndvi ?? -1) - (b.ndvi ?? -1)), [pivots, ndviMultiplos, ndviComparativo])

  // KPIs
  const comDado = ranking.filter((r) => r.ndvi != null)
  const ndviMedio = comDado.length
    ? comDado.reduce((s, r) => s + r.ndvi!, 0) / comDado.length
    : null
  const semPolygon = pivots.filter((p) => !p.polygon_geojson).length

  // Detalhe do pivô selecionado
  const compSel = ndviComparativo.find((c) => c.pivot_id === pivotSelecionado) ?? null
  const ultimoNdvi: NdviRegistro | null = detalhe?.historico
    ? ([...detalhe.historico].reverse().find((h) => h.ndvi_medio != null) ?? null)
    : null
  const diag = gerarDiagnostico(
    ultimoNdvi?.ndvi_medio ?? null,
    compSel?.tendencia ?? null,
    compSel?.variacaoPct ?? null,
  )

  const dadosGrafico = (detalhe?.historico ?? [])
    .filter((h) => h.ndvi_medio != null)
    .map((h) => ({ data: fmtData(h.data_imagem), ndvi: Number(h.ndvi_medio!.toFixed(4)) }))

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
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #0093D0, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Satellite size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>NDVI Satélite</h1>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Sentinel-2 · monitoramento de vegetação</p>
          </div>
        </div>

        <div style={{ display: 'flex', background: C.card, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {(['ranking', 'comparativo'] as const).map((m) => (
            <button key={m} onClick={() => setModo(m)} style={{
              padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: modo === m ? C.brand : 'transparent',
              color: modo === m ? '#fff' : C.sec,
              fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s ease',
            }}>
              {m === 'ranking' ? <BarChart3 size={13} /> : <Layers size={13} />}
              {m === 'ranking' ? 'Ranking' : 'Comparativo'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {([
          { label: 'Pivôs monitorados', value: `${comDado.length}/${pivots.length}`, sub: 'com dados NDVI', cor: C.brand },
          { label: 'NDVI médio', value: ndviMedio != null ? ndviMedio.toFixed(2) : '—', sub: classificarNdvi(ndviMedio).label, cor: classificarNdvi(ndviMedio).cor },
          { label: 'Dados recentes', value: String(comDado.filter((r) => { const d = Math.floor((Date.now() - new Date((r.data ?? '') + 'T12:00:00Z').getTime()) / 86400000); return d < 30 }).length), sub: '< 30 dias', cor: C.green },
          { label: 'Sem polígono', value: String(semPolygon), sub: 'pivôs sem área', cor: semPolygon > 0 ? C.amber : C.muted },
        ] as const).map(({ label, value, sub, cor }) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: cor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: C.sec, marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Alertas de config */}
      {semPolygon > 0 && (
        <div style={{ background: 'rgba(0,147,208,0.08)', border: '1px solid rgba(0,147,208,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Info size={16} color={C.brand} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: '#7dd3fc' }}>
            {semPolygon} pivô{semPolygon > 1 ? 's' : ''} sem polígono cadastrado. Adicione o polígono no cadastro do pivô para habilitar NDVI por satélite.
          </div>
        </div>
      )}

      {pivots.length === 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
          <Satellite size={40} color={C.muted} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nenhum pivô cadastrado</div>
        </div>
      )}

      {/* Modo Comparativo */}
      {modo === 'comparativo' && pivots.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {ndviComparativo.map((comp) => {
            const pivot = pivots.find((p) => p.id === comp.pivot_id)
            if (!pivot) return null
            return (
              <ComparativoCard key={comp.pivot_id} nome={pivot.name} comp={comp}
                onClick={() => { setPivotSelecionado(comp.pivot_id); setModo('ranking') }} />
            )
          })}
          {pivots.filter((p) => !ndviComparativo.find((c) => c.pivot_id === p.id)).map((p) => (
            <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</span>
              <span style={{ fontSize: 12, color: C.muted }}>Sem dados — clique em Atualizar</span>
            </div>
          ))}
        </div>
      )}

      {/* Modo Ranking */}
      {modo === 'ranking' && pivots.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(0,2fr)', gap: 16 }}>

          {/* Lista */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Menor → Maior NDVI
            </div>
            {ranking.map(({ pivot, ndvi, data, tendencia, variacaoPct }) => (
              <NdviKpiCard key={pivot.id} nome={pivot.name} ndvi={ndvi} data={data}
                tendencia={tendencia} variacaoPct={variacaoPct}
                selecionado={pivotSelecionado === pivot.id}
                onClick={() => setPivotSelecionado(pivot.id)} />
            ))}
          </div>

          {/* Detalhe */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pivotSelecionado && (
              <>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                      {pivots.find((p) => p.id === pivotSelecionado)?.name}
                    </div>
                    {ultimoNdvi?.data_imagem && (
                      <div style={{ fontSize: 11, color: C.muted }}>
                        Última leitura: {fmtData(ultimoNdvi.data_imagem)} · {diasAtras(ultimoNdvi.data_imagem)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => refreshNdvi(pivotSelecionado!, (res) => {
                      setDetalhe(res)
                    })}
                    disabled={refreshing || loadingDetalhe}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: C.brand, color: '#fff', border: 'none', borderRadius: 8,
                      padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      opacity: refreshing ? 0.6 : 1, minHeight: 36,
                    }}
                  >
                    <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : undefined }} />
                    {refreshing ? 'Buscando...' : 'Atualizar via Satélite'}
                  </button>
                </div>

                {/* Alerta sem credenciais */}
                {detalhe?.error === 'SENTINEL_NOT_CONFIGURED' && (
                  <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.amber }}>Sentinel Hub não configurado</div>
                      <div style={{ fontSize: 12, color: '#fcd34d', marginTop: 2 }}>
                        Configure <code>SENTINEL_CLIENT_ID</code> e <code>SENTINEL_CLIENT_SECRET</code> nos Secrets da Edge Function no painel Supabase.
                      </div>
                    </div>
                  </div>
                )}

                {/* Diagnóstico IA */}
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

                {/* Imagem PNG */}
                {(() => {
                  const pivot = pivots.find((p) => p.id === pivotSelecionado)
                  if (!pivot?.polygon_geojson) {
                    return (
                      <div style={{ background: 'rgba(0,147,208,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
                        <Satellite size={28} color={C.muted} style={{ marginBottom: 8 }} />
                        <div style={{ fontSize: 13, color: C.sec }}>Polígono não cadastrado</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Adicione o polígono do pivô para visualizar imagens NDVI por satélite.</div>
                      </div>
                    )
                  }
                  if (ultimoNdvi?.imagem_url) {
                    return (
                      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Imagem NDVI · {ultimoNdvi.data_imagem && fmtData(ultimoNdvi.data_imagem)}
                          </div>
                        </div>
                        <img src={ultimoNdvi.imagem_url} alt="NDVI" style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }} />
                        <div style={{ padding: '8px 14px 12px' }}><LegendaNdvi /></div>
                      </div>
                    )
                  }
                  return null
                })()}

                {/* Gráfico */}
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

                {/* Tabela */}
                {detalhe && detalhe.historico.length > 0 && (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Leituras recentes</div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                            {['Data', 'NDVI Médio', 'Mín', 'Máx', 'Classificação'].map((h) => (
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
                                <td style={{ padding: '8px 12px', color: cls.cor, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                  {r.ndvi_medio != null ? r.ndvi_medio.toFixed(3) : '—'}
                                </td>
                                <td style={{ padding: '8px 12px', color: C.sec, fontVariantNumeric: 'tabular-nums' }}>{r.ndvi_min != null ? r.ndvi_min.toFixed(3) : '—'}</td>
                                <td style={{ padding: '8px 12px', color: C.sec, fontVariantNumeric: 'tabular-nums' }}>{r.ndvi_max != null ? r.ndvi_max.toFixed(3) : '—'}</td>
                                <td style={{ padding: '8px 12px' }}>
                                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: cls.corFundo + '22', color: cls.cor, border: `1px solid ${cls.cor}44`, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {cls.label}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Loading detalhe */}
                {loadingDetalhe && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <PivotSpinner size={40} label="Buscando dados..." />
                  </div>
                )}

                {/* Estado vazio */}
                {!loadingDetalhe && detalhe?.historico?.length === 0 && !detalhe?.error && (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
                    <Satellite size={32} color={C.muted} style={{ marginBottom: 10 }} />
                    <div style={{ fontSize: 14, color: C.sec, marginBottom: 6 }}>Nenhum dado NDVI ainda</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      Clique em <strong style={{ color: C.brand }}>Atualizar via Satélite</strong> para buscar imagens do Sentinel-2.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import type { Pivot } from '@/types/database'
import {
  RESULT_META,
  type DiagnosisResult,
} from '@/lib/soil-diagnosis'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts'
import {
  Loader2, ChevronDown, ArrowLeft, Droplets,
  History, Camera, AlertTriangle, CheckCircle2, Clock, Sliders,
} from 'lucide-react'
import Link from 'next/link'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DiagnosisRecord {
  id: string
  pivot_id: string
  season_id: string | null
  diagnosed_at: string
  depth_0_20_score: number
  depth_20_40_score: number
  depth_40_60_score: number
  weighted_score: number
  result: DiagnosisResult
  estimated_fc_percent: number
  notes: string | null
  photo_url: string | null
  pivots?: { name: string } | null
}

interface DailyBalance {
  date: string
  field_capacity_percent: number
}

interface ChartPoint {
  date: string
  label: string
  diagnosis: number | null
  model: number | null
  diff: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function DivBadge({ diff }: { diff: number | null }) {
  if (diff == null) return null
  const color = diff > 20 ? '#ef4444' : diff > 10 ? '#f59e0b' : '#22c55e'
  const icon = diff > 20 ? '⚠' : diff > 10 ? '~' : '✓'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      background: `${color}18`, border: `1px solid ${color}40`,
      color, fontSize: 11, fontWeight: 600,
    }}>
      {icon} {diff.toFixed(0)}pp
    </span>
  )
}

function ResultBadge({ result, size = 'md' }: { result: DiagnosisResult; size?: 'sm' | 'md' }) {
  const meta = RESULT_META[result]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'sm' ? '2px 8px' : '4px 12px',
      borderRadius: 99,
      background: `${meta.color}18`, border: `1px solid ${meta.color}40`,
      color: meta.color, fontWeight: 600,
      fontSize: size === 'sm' ? 11 : 13,
    }}>
      {meta.icon} {meta.label}
    </span>
  )
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const colors: Record<number, string> = {
    1: '#ef4444', 2: '#f97316', 3: '#38bdf8', 4: '#22c55e', 5: '#a78bfa',
  }
  const color = colors[score] ?? '#778899'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, color: '#778899', width: 48, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(score / 5) * 100}%`, background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, width: 14, textAlign: 'right' }}>{score}</span>
    </div>
  )
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0f1923', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: '#8899aa', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, display: 'flex', gap: 8, marginBottom: 3 }}>
          <span>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{p.value?.toFixed(0)}% CC</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DiagnosticoHistoricoPage() {
  const { company } = useAuth()
  const companyId = company?.id ?? null
  const supabase = createClient()

  const [pivots, setPivots] = useState<Pivot[]>([])
  const [selectedPivotId, setSelectedPivotId] = useState('')
  const [records, setRecords] = useState<DiagnosisRecord[]>([])
  const [balances, setBalances] = useState<DailyBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [photoModal, setPhotoModal] = useState<string | null>(null)
  const [calibrating, setCalibrating] = useState<string | null>(null)   // id do diagnóstico sendo calibrado
  const [calibrated, setCalibrated] = useState<Set<string>>(new Set())  // ids já calibrados nessa sessão

  // Carregar pivôs da empresa
  useEffect(() => {
    if (!companyId) return
    supabase
      .from('pivots')
      .select('*, farms!inner(company_id)')
      .eq('farms.company_id', companyId)
      .then(({ data }) => {
        const list = data ?? []
        setPivots(list)
        if (list.length === 1) setSelectedPivotId(list[0].id)
      })
  }, [companyId])

  // Carregar diagnósticos + balanço do pivô selecionado
  useEffect(() => {
    if (!selectedPivotId || !companyId) return
    setLoading(true)

    const since = new Date()
    since.setDate(since.getDate() - 90)
    const sinceISO = since.toISOString().slice(0, 10)

    Promise.all([
      supabase
        .from('soil_manual_diagnosis')
        .select('*, pivots(name)')
        .eq('pivot_id', selectedPivotId)
        .eq('company_id', companyId)
        .gte('diagnosed_at', sinceISO)
        .order('diagnosed_at', { ascending: true }),

      supabase
        .from('daily_management')
        .select('date, field_capacity_percent')
        .eq('pivot_id', selectedPivotId)
        .gte('date', sinceISO)
        .order('date', { ascending: true }),
    ]).then(([{ data: diag }, { data: bal }]) => {
      setRecords(diag ?? [])
      setBalances(bal ?? [])
      setLoading(false)
    })
  }, [selectedPivotId, companyId])

  // Montar série para o gráfico — une balanço diário (linha) + diagnósticos (pontos)
  const chartData = useMemo<ChartPoint[]>(() => {
    // Índice diagnósticos por data (dia)
    const diagByDate: Record<string, DiagnosisRecord> = {}
    for (const r of records) {
      const day = r.diagnosed_at.slice(0, 10)
      diagByDate[day] = r
    }

    // Base: todos os dias do balanço
    const points: ChartPoint[] = balances.map(b => {
      const diag = diagByDate[b.date]
      const diff = diag != null ? Math.abs(diag.estimated_fc_percent - b.field_capacity_percent) : null
      return {
        date: b.date,
        label: fmtDate(b.date),
        model: b.field_capacity_percent,
        diagnosis: diag?.estimated_fc_percent ?? null,
        diff,
      }
    })

    // Adicionar diagnósticos em dias sem balanço
    for (const [day, diag] of Object.entries(diagByDate)) {
      if (!balances.find(b => b.date === day)) {
        points.push({
          date: day,
          label: fmtDate(day),
          model: null,
          diagnosis: diag.estimated_fc_percent,
          diff: null,
        })
      }
    }

    return points.sort((a, b) => a.date.localeCompare(b.date))
  }, [records, balances])

  // KPIs
  const kpis = useMemo(() => {
    if (!records.length) return null
    const last = records[records.length - 1]
    const divergences = records
      .map(r => {
        const bal = balances.find(b => b.date === r.diagnosed_at.slice(0, 10))
        return bal ? Math.abs(r.estimated_fc_percent - bal.field_capacity_percent) : null
      })
      .filter((d): d is number => d != null)

    const avgDiff = divergences.length
      ? divergences.reduce((s, d) => s + d, 0) / divergences.length
      : null

    const byResult = records.reduce<Record<string, number>>((acc, r) => {
      acc[r.result] = (acc[r.result] ?? 0) + 1
      return acc
    }, {})

    return { last, avgDiff, byResult, total: records.length }
  }, [records, balances])

  // ─── Calibração ───────────────────────────────────────────────────────────
  async function handleCalibrate(rec: DiagnosisRecord, matchingBal: DailyBalance) {
    if (!confirm(
      `Calibrar o modelo para ${fmtDate(matchingBal.date)}?\n\n` +
      `Balanço calculado: ${matchingBal.field_capacity_percent.toFixed(0)}% da CC\n` +
      `Diagnóstico manual: ${rec.estimated_fc_percent}% da CC\n\n` +
      `O valor do dia será substituído pelo diagnóstico de campo.`
    )) return

    setCalibrating(rec.id)
    try {
      // Buscar o registro de daily_management pelo pivot_id + date
      const date = rec.diagnosed_at.slice(0, 10)
      const { data: dmRows, error: fetchErr } = await supabase
        .from('daily_management')
        .select('id, notes, pivot_id')
        .eq('pivot_id', rec.pivot_id)
        .eq('date', date)
        .limit(1)

      if (fetchErr || !dmRows?.length) {
        alert('Registro de balanço não encontrado para esta data.')
        return
      }

      const dm = dmRows[0]
      const prevNote = dm.notes ? dm.notes + ' | ' : ''
      const calibNote = `Calibrado por diagnóstico manual em ${new Date().toLocaleDateString('pt-BR')} (${matchingBal.field_capacity_percent.toFixed(0)}%→${rec.estimated_fc_percent}%)`

      const { error: updateErr } = await supabase
        .from('daily_management')
        .update({
          field_capacity_percent: rec.estimated_fc_percent,
          notes: prevNote + calibNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dm.id)

      if (updateErr) {
        alert('Erro ao calibrar: ' + updateErr.message)
        return
      }

      // Atualizar estado local do balanço
      setBalances(prev => prev.map(b =>
        b.date === date
          ? { ...b, field_capacity_percent: rec.estimated_fc_percent }
          : b
      ))
      setCalibrated(prev => new Set([...prev, rec.id]))
    } finally {
      setCalibrating(null)
    }
  }

  return (
    <div style={{ padding: '24px 24px 80px', maxWidth: 860, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <Link href="/diagnostico-solo" style={{ color: '#8899aa', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <History size={20} color="#0093D0" />
            Histórico de Diagnósticos
          </h1>
          <p style={{ color: '#8899aa', fontSize: 13, marginTop: 2 }}>
            Evolução da umidade do solo — diagnóstico manual vs. balanço hídrico calculado
          </p>
        </div>
      </div>

      {/* Seletor de pivô */}
      <div style={{ marginBottom: 24, position: 'relative', maxWidth: 320 }}>
        <select
          value={selectedPivotId}
          onChange={e => setSelectedPivotId(e.target.value)}
          style={{
            width: '100%', padding: '10px 36px 10px 12px',
            background: '#0f1923', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, color: selectedPivotId ? '#e2e8f0' : '#778899',
            fontSize: 14, appearance: 'none', cursor: 'pointer',
          }}
        >
          <option value="">Selecione um pivô…</option>
          {pivots.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <ChevronDown size={14} color="#778899" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48, color: '#778899' }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {!loading && selectedPivotId && records.length === 0 && (
        <div style={{
          padding: 32, textAlign: 'center',
          background: '#0f1923', borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.06)', color: '#778899', fontSize: 13,
        }}>
          <Droplets size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
          Nenhum diagnóstico registrado nos últimos 90 dias para este pivô.
        </div>
      )}

      {!loading && records.length > 0 && (
        <>
          {/* KPIs */}
          {kpis && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12, marginBottom: 24,
            }}>
              {/* Último diagnóstico */}
              <div style={{ background: '#0f1923', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '16px 18px' }}>
                <div style={{ fontSize: 11, color: '#778899', fontWeight: 500, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={11} /> ÚLTIMO DIAGNÓSTICO
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', color: RESULT_META[kpis.last.result].color }}>
                  {kpis.last.estimated_fc_percent}%
                </div>
                <div style={{ marginTop: 4 }}>
                  <ResultBadge result={kpis.last.result} size="sm" />
                </div>
                <div style={{ fontSize: 11, color: '#778899', marginTop: 4 }}>
                  {fmtDateTime(kpis.last.diagnosed_at)}
                </div>
              </div>

              {/* Total diagnósticos */}
              <div style={{ background: '#0f1923', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '16px 18px' }}>
                <div style={{ fontSize: 11, color: '#778899', fontWeight: 500, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <History size={11} /> TOTAL (90 DIAS)
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', color: '#0093D0' }}>
                  {kpis.total}
                </div>
                <div style={{ fontSize: 11, color: '#778899', marginTop: 4 }}>
                  {Object.entries(kpis.byResult).map(([r, n]) => (
                    <span key={r} style={{ marginRight: 6 }}>
                      {RESULT_META[r as DiagnosisResult]?.icon} {n}
                    </span>
                  ))}
                </div>
              </div>

              {/* Divergência média */}
              <div style={{ background: '#0f1923', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '16px 18px' }}>
                <div style={{ fontSize: 11, color: '#778899', fontWeight: 500, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={11} /> DIVERGÊNCIA MÉDIA
                </div>
                {kpis.avgDiff != null ? (
                  <>
                    <div style={{
                      fontSize: 28, fontWeight: 700, fontFamily: 'monospace',
                      color: kpis.avgDiff > 20 ? '#ef4444' : kpis.avgDiff > 10 ? '#f59e0b' : '#22c55e',
                    }}>
                      {kpis.avgDiff.toFixed(0)}pp
                    </div>
                    <div style={{ fontSize: 11, color: '#778899', marginTop: 4 }}>
                      {kpis.avgDiff > 20 ? 'Alta — considere calibrar o modelo'
                        : kpis.avgDiff > 10 ? 'Moderada — monitorar'
                        : 'Baixa — modelo alinhado'}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: '#778899', marginTop: 8 }}>Sem balanço p/ comparar</div>
                )}
              </div>

              {/* Cobertura de fotos */}
              <div style={{ background: '#0f1923', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '16px 18px' }}>
                <div style={{ fontSize: 11, color: '#778899', fontWeight: 500, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Camera size={11} /> FOTOS
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', color: '#a78bfa' }}>
                  {records.filter(r => r.photo_url).length}/{kpis.total}
                </div>
                <div style={{ fontSize: 11, color: '#778899', marginTop: 4 }}>diagnósticos com foto</div>
              </div>
            </div>
          )}

          {/* Gráfico: Diagnóstico vs Balanço Hídrico */}
          {chartData.length > 0 && (
            <div style={{
              background: '#0f1923', borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.06)',
              padding: '20px 16px 12px', marginBottom: 24,
            }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4, paddingLeft: 4 }}>
                Evolução da Umidade do Solo
              </h2>
              <p style={{ fontSize: 12, color: '#778899', marginBottom: 16, paddingLeft: 4 }}>
                Linha: balanço hídrico calculado · Pontos: diagnóstico manual
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#778899', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 105]}
                    tick={{ fill: '#778899', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: '#8899aa', paddingTop: 8 }}
                    formatter={(v) => <span style={{ color: '#8899aa' }}>{v}</span>}
                  />

                  {/* Zona de alerta (abaixo de 70%) */}
                  <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1}
                    label={{ value: '70%', fill: '#f59e0b', fontSize: 9, position: 'insideTopLeft' }} />

                  {/* Balanço calculado */}
                  <Area
                    name="Balanço calculado"
                    dataKey="model"
                    type="monotone"
                    stroke="#0093D0"
                    fill="rgba(0,147,208,0.08)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />

                  {/* Diagnóstico manual */}
                  <Line
                    name="Diagnóstico manual"
                    dataKey="diagnosis"
                    type="monotone"
                    stroke="#22c55e"
                    strokeWidth={0}
                    dot={{ r: 6, fill: '#22c55e', stroke: '#0f1923', strokeWidth: 2 }}
                    activeDot={{ r: 8 }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Lista de registros */}
          <div style={{ background: '#0f1923', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                Registros detalhados
              </h2>
            </div>

            {[...records].reverse().map((rec, i) => {
              const meta = RESULT_META[rec.result]
              const matchingBal = balances.find(b => b.date === rec.diagnosed_at.slice(0, 10))
              const diff = matchingBal
                ? Math.abs(rec.estimated_fc_percent - matchingBal.field_capacity_percent)
                : null

              return (
                <div
                  key={rec.id}
                  style={{
                    padding: '16px 20px',
                    borderBottom: i < records.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  {/* Linha topo: data + badge + divergência */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#8899aa', fontWeight: 500 }}>
                      {fmtDateTime(rec.diagnosed_at)}
                    </span>
                    <ResultBadge result={rec.result} size="sm" />
                    {diff != null && <DivBadge diff={diff} />}
                    <span style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: meta.color }}>
                      {rec.estimated_fc_percent}%
                    </span>
                  </div>

                  {/* Scores por profundidade */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                    <ScoreBar label="0-20 cm" score={rec.depth_0_20_score} />
                    <ScoreBar label="20-40 cm" score={rec.depth_20_40_score} />
                    <ScoreBar label="40-60 cm" score={rec.depth_40_60_score} />
                  </div>

                  {/* Comparação com modelo + botão calibrar */}
                  {matchingBal && (() => {
                    const isCalibrated = calibrated.has(rec.id)
                    const showBtn = diff != null && diff >= 15 && !isCalibrated
                    return (
                      <div style={{ marginBottom: rec.photo_url || rec.notes ? 10 : 0 }}>
                        <div style={{
                          display: 'flex', gap: 16, padding: '8px 12px',
                          background: 'rgba(255,255,255,0.03)', borderRadius: showBtn ? '8px 8px 0 0' : 8,
                          alignItems: 'center',
                        }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#778899', marginBottom: 2 }}>Diagnóstico</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e' }}>{rec.estimated_fc_percent}%</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#778899', marginBottom: 2 }}>Balanço</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0093D0' }}>{matchingBal.field_capacity_percent.toFixed(0)}%</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#778899', marginBottom: 2 }}>Diferença</div>
                            <DivBadge diff={diff} />
                          </div>
                          {/* Já calibrado nessa sessão */}
                          {isCalibrated && (
                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#22c55e' }}>
                              <CheckCircle2 size={14} /> Calibrado
                            </div>
                          )}
                        </div>

                        {/* Botão calibrar — só aparece quando diff ≥ 15pp */}
                        {showBtn && (
                          <button
                            onClick={() => handleCalibrate(rec, matchingBal)}
                            disabled={calibrating === rec.id}
                            style={{
                              width: '100%', padding: '8px 14px',
                              borderRadius: '0 0 8px 8px',
                              border: '1px solid rgba(245,158,11,0.3)',
                              borderTop: 'none',
                              background: 'rgba(245,158,11,0.06)',
                              color: '#f59e0b', fontSize: 12, fontWeight: 600,
                              cursor: calibrating === rec.id ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                          >
                            {calibrating === rec.id
                              ? <><Loader2 size={13} className="animate-spin" /> Calibrando…</>
                              : <><Sliders size={13} /> Calibrar modelo com este diagnóstico</>
                            }
                          </button>
                        )}
                      </div>
                    )
                  })()}

                  {/* Foto + notas */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {rec.photo_url && (
                      <button
                        onClick={() => setPhotoModal(rec.photo_url!)}
                        style={{
                          flexShrink: 0, width: 56, height: 56, borderRadius: 8,
                          overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)',
                          background: 'transparent', cursor: 'pointer', padding: 0,
                        }}
                      >
                        <img
                          src={rec.photo_url}
                          alt="Solo"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </button>
                    )}
                    {rec.notes && (
                      <p style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.5, margin: 0 }}>
                        {rec.notes}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Modal de foto */}
      {photoModal && (
        <div
          onClick={() => setPhotoModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, cursor: 'pointer',
          }}
        >
          <img
            src={photoModal}
            alt="Foto do solo"
            style={{
              maxWidth: '90vw', maxHeight: '85vh',
              borderRadius: 12, boxShadow: '0 0 40px rgba(0,0,0,0.8)',
            }}
          />
          <div style={{
            position: 'absolute', top: 20, right: 20,
            background: 'rgba(255,255,255,0.12)', borderRadius: 99,
            padding: '4px 12px', color: '#e2e8f0', fontSize: 12,
          }}>
            clique para fechar
          </div>
        </div>
      )}

    </div>
  )
}

'use client'

import Link from 'next/link'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import { Satellite } from 'lucide-react'
import type { DailyManagement, Farm, Pivot } from '@/types/database'
import type { ManagementSeasonContext } from '@/services/management'
import { calcDAS } from '@/lib/calculations/management-balance'
import { getStageInfoForDas, calcCTA, calcCAD } from '@/lib/water-balance'

interface Props {
  pivot: Pivot
  farm: Farm | null
  context: ManagementSeasonContext | null
  history: DailyManagement[]
  today: string
}

// ─── Soil Diagram — idêntico ao do manejo ────────────────────

type PivotIrrigationStatus = 'azul' | 'verde' | 'amarelo' | 'vermelho'

const PIVOT_STATUS_CONFIG: Record<PivotIrrigationStatus, { label: string; color: string; bg: string; border: string }> = {
  azul:     { label: 'Irrigando',     color: '#06b6d4', bg: 'rgb(6 182 212 / 0.12)',   border: 'rgb(6 182 212 / 0.25)'   },
  verde:    { label: 'OK',            color: '#22c55e', bg: 'rgb(34 197 94 / 0.12)',    border: 'rgb(34 197 94 / 0.25)'   },
  amarelo:  { label: 'Atenção',       color: '#f59e0b', bg: 'rgb(245 158 11 / 0.12)',   border: 'rgb(245 158 11 / 0.25)'  },
  vermelho: { label: 'Irrigar Agora', color: '#ef4444', bg: 'rgb(239 68 68 / 0.12)',    border: 'rgb(239 68 68 / 0.25)'   },
}

function resolvePivotStatus(adcMm: number, cadMm: number, ctaMm: number, threshold: number | null): PivotIrrigationStatus {
  const pct = ctaMm > 0 ? (adcMm / ctaMm) * 100 : 100
  const th = threshold ?? 70
  const warningPct = th * 1.15
  if (pct >= warningPct) return 'verde'
  if (pct >= th) return 'amarelo'
  return 'vermelho'
}

function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(decimals)
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

interface SoilDiagramRichProps {
  ctaMm: number
  cadMm: number
  adcMm: number
  recommendedDepthMm: number
  eto: number | null
  etc: number | null
  kc: number | null
  das: number
  cropStage: number
  rootDepthCm: number
  cropName: string | null
  farmName: string
  pivotName: string
  date: string
  areaHa: number | null
  alertThresholdPct: number | null
}

function SoilDiagramRich({
  ctaMm, cadMm, adcMm, recommendedDepthMm,
  eto, etc, kc, das, cropStage, rootDepthCm,
  cropName, farmName, pivotName, date, areaHa, alertThresholdPct,
}: SoilDiagramRichProps) {
  const status = resolvePivotStatus(adcMm, cadMm, ctaMm, alertThresholdPct)
  const cfg = PIVOT_STATUS_CONFIG[status]
  const stageLabels = ['', 'Inicial', 'Desenv.', 'Médio', 'Final']
  const cropEmojis: Record<string, string> = {
    milho: '🌽', soja: '🌱', trigo: '🌾', algodao: '🪴', algodão: '🪴', feijao: '🫘', feijão: '🫘',
  }
  const cropEmoji = Object.entries(cropEmojis).find(([k]) => cropName?.toLowerCase().includes(k))?.[1] ?? '🌱'

  const USABLE = 75
  const mmToPct = ctaMm > 0 ? USABLE / ctaMm : 1
  const adcTopPct     = adcMm * mmToPct
  const cadLinePct    = cadMm * mmToPct
  const ctaTopPct     = USABLE
  const deficitMm     = Math.max(0, ctaMm - adcMm)
  const deficitTopPct = ctaTopPct
  const deficitBotPct = adcTopPct
  const fieldCapacityPercent = ctaMm > 0 ? (adcMm / ctaMm) * 100 : 0
  const H = 240

  return (
    <div style={{ background: '#0f1923', border: `1px solid ${cfg.border}`, borderRadius: 14, overflow: 'hidden' }}>

      {/* ── Header: info da safra ── */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0', lineHeight: 1.3 }}>{pivotName}</p>
          <p style={{ fontSize: 12, color: '#556677', marginTop: 2 }}>
            <span style={{ color: '#8899aa' }}>{farmName}</span>
            {cropName && <> · <span style={{ color: '#0093D0' }}>{cropName}</span></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {recommendedDepthMm > 0 && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Irrigar Hoje</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: cfg.color, fontFamily: 'var(--font-mono)' }}>{fmtNum(recommendedDepthMm)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span></p>
            </div>
          )}
          {areaHa != null && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Área</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{areaHa.toFixed(1)} <span style={{ fontSize: 11, color: '#8899aa' }}>ha</span></p>
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ETo</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>{fmtNum(eto)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span></p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ETc</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{fmtNum(etc)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span></p>
          </div>
        </div>
      </div>

      {/* ── Linha secundária: Cultura / Fase / Data ── */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Cultura', value: cropName ?? '—' },
          { label: 'Fase', value: `${cropStage}ª (${das} dias)` },
          { label: 'Data', value: fmtDate(date) },
          { label: 'DAS', value: `${das}` },
          { label: 'Kc', value: fmtNum(kc, 3) },
        ].map(({ label, value }) => (
          <div key={label}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#445566', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ fontSize: 13, color: '#e2e8f0', marginTop: 1 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Bloco cinza ETc + emoji ── */}
      <div style={{ margin: '14px 20px', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#8899aa' }}>ETc</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#06b6d4', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>{fmtNum(etc)} <span style={{ fontSize: 13, fontWeight: 400 }}>mm</span></p>
          </div>
          <span style={{ fontSize: 28 }}>〰️</span>
          <span style={{ fontSize: 10, color: '#556677' }}>↑↑↑</span>
        </div>
        <span style={{ fontSize: 36, flex: 1, textAlign: 'center' }}>{cropEmoji}</span>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#8899aa' }}>{stageLabels[cropStage] ?? `Fase ${cropStage}`}</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>{das} <span style={{ fontSize: 12, fontWeight: 400, color: '#556677' }}>dias</span></p>
        </div>
      </div>

      {/* ── Diagrama de solo ── */}
      <div style={{ margin: '0 20px 20px', position: 'relative', borderRadius: 12, overflow: 'hidden', height: H }}>

        {/* Fundo total */}
        <div style={{ position: 'absolute', inset: 0, background: '#0e7490' }} />

        {/* Camada de água disponível */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: `${adcTopPct}%`,
          background: '#06b6d4', transition: 'height 0.5s ease',
        }} />

        {/* Área de déficit */}
        {deficitMm > 0 && (
          <div style={{
            position: 'absolute', left: 0, right: 0,
            bottom: `${deficitBotPct}%`,
            height: `${Math.max(0, deficitTopPct - deficitBotPct)}%`,
            background: 'rgba(20,30,45,0.88)',
          }} />
        )}

        {/* Linha verde — superfície */}
        <div style={{ position: 'absolute', bottom: `${ctaTopPct}%`, left: 0, right: 0, height: 3, background: '#22c55e', zIndex: 3 }} />

        {/* Linha amarela — limite CAD */}
        <div style={{ position: 'absolute', bottom: `${cadLinePct}%`, left: 0, right: 0, height: 3, background: '#facc15', zIndex: 3 }} />

        {/* Linha vermelha — ponto de murcha */}
        <div style={{ position: 'absolute', bottom: '1%', left: 0, right: 0, height: 3, background: '#ef4444', zIndex: 3 }} />

        {/* Label déficit — canto superior direito */}
        {deficitMm > 0 && (
          <div style={{ position: 'absolute', top: `${100 - ctaTopPct + 4}%`, right: 12, zIndex: 5 }}>
            <div style={{ background: 'rgba(30,41,59,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '5px 10px' }}>
              <p style={{ fontSize: 10, color: '#94a3b8' }}>{recommendedDepthMm > 0 ? 'Déficit Hoje' : 'Espaço Livre'}</p>
              <p style={{ fontSize: 14, fontWeight: 800, color: recommendedDepthMm > 0 ? cfg.color : '#556677', fontFamily: 'var(--font-mono)' }}>{fmtNum(deficitMm)} mm</p>
            </div>
          </div>
        )}

        {/* Label Disponível — esquerda dentro do ciano */}
        <div style={{ position: 'absolute', bottom: `${Math.max(2, adcTopPct * 0.4)}%`, left: 12, zIndex: 5 }}>
          <div style={{ background: 'rgba(15,25,35,0.85)', borderRadius: 6, padding: '4px 10px' }}>
            <p style={{ fontSize: 10, color: '#94a3b8' }}>Disponível</p>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(adcMm)} mm</p>
          </div>
        </div>

        {/* Sonda vertical */}
        <div style={{
          position: 'absolute', left: '50%', top: `${100 - ctaTopPct}%`, bottom: '4%',
          width: 8, background: 'linear-gradient(to bottom, #94a3b8, #64748b)',
          borderRadius: 4, transform: 'translateX(-50%)', zIndex: 4,
        }}>
          <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#475569' }} />
        </div>

        {/* Label profundidade de manejo */}
        <div style={{ position: 'absolute', left: '50%', bottom: `${Math.max(8, adcTopPct * 0.35)}%`, transform: 'translateX(-40%)', zIndex: 5 }}>
          <div style={{ background: 'rgba(15,25,35,0.9)', borderRadius: 6, padding: '4px 10px', whiteSpace: 'nowrap' }}>
            <p style={{ fontSize: 10, color: '#94a3b8' }}>Prof. de Manejo</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(rootDepthCm, 0)} cm</p>
          </div>
        </div>

        {/* CC% e status — canto superior esquerdo */}
        <div style={{ position: 'absolute', top: `${100 - ctaTopPct + 6}%`, left: 8, zIndex: 5 }}>
          <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '3px 8px' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: cfg.color }}>{fmtNum(fieldCapacityPercent, 0)}% · {cfg.label}</p>
          </div>
        </div>
      </div>

      {/* ── Legenda ── */}
      <div style={{ padding: '0 20px 14px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { color: '#22c55e', label: 'Superfície' },
          { color: '#06b6d4', label: 'Água disponível' },
          { color: '#facc15', label: 'Limite CAD' },
          { color: '#ef4444', label: 'Ponto de murcha' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 3, background: color, borderRadius: 2 }} />
            <span style={{ fontSize: 10, color: '#445566' }}>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Satellite size={9} style={{ color: '#445566' }} />
          <span style={{ fontSize: 10, color: '#334455' }}>ETo via cálculo local · média</span>
        </div>
      </div>
    </div>
  )
}

// ─── Metric chip ──────────────────────────────────────────────

function Chip({ label, value, sub, color = '#e2e8f0' }: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      padding: '14px 16px',
      minWidth: 0,
    }}>
      <p style={{ fontSize: 10, color: '#445566', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
        {label}
      </p>
      <p style={{ fontSize: 20, fontWeight: 800, margin: '5px 0 0', color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 10, color: '#445566', margin: '3px 0 0' }}>{sub}</p>
      )}
    </div>
  )
}

// ─── Evolution Chart ──────────────────────────────────────────

function AccumItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{label}:</p>
      <p style={{ fontSize: 13, color: '#8899aa', margin: '2px 0 0' }}>{value}</p>
    </div>
  )
}

function EvolutionChart({ history, pivotName, seasonName, fFactor }: {
  history: DailyManagement[]
  pivotName: string
  seasonName: string
  fFactor: number
}) {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))

  const stageDates = new Set<string>()
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].crop_stage !== sorted[i - 1].crop_stage) stageDates.add(sorted[i].date)
  }

  const chartData = sorted.map(m => ({
    date: new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    irrigation: m.actual_depth_mm ?? 0,
    rainfall: m.rainfall_mm ?? 0,
    moisture: m.field_capacity_percent ?? null,
    stageChange: stageDates.has(m.date) ? m.field_capacity_percent : null,
  }))

  const safetyPct = Math.round(fFactor * 100)

  // ── Acumulados ──
  const totalIrrigation = sorted.reduce((s, m) => s + (m.actual_depth_mm ?? 0), 0)
  const totalRainfall   = sorted.reduce((s, m) => s + (m.rainfall_mm ?? 0), 0)

  // ETCp = ETo × Kc (sem estresse), ETC = etc_mm (com Ks)
  const totalEtcp = sorted.reduce((s, m) => {
    const etcp = (m.eto_mm != null && m.kc != null) ? m.eto_mm * m.kc : (m.etc_mm ?? 0)
    return s + etcp
  }, 0)
  const totalEtc = sorted.reduce((s, m) => s + (m.etc_mm ?? 0), 0)

  // Excesso total = soma dos dias onde ADc ultrapassou CTA (irn_mm registra isso)
  const excessTotal = sorted.reduce((s, m) => s + (m.irn_mm ?? 0), 0)

  // Excesso de irrigação = irrigação aplicada acima do necessário
  const excessIrrigation = sorted.reduce((s, m) => {
    const applied  = m.actual_depth_mm ?? 0
    const needed   = m.recommended_depth_mm ?? 0
    return s + Math.max(0, applied - needed)
  }, 0)

  // Reduções: (ETCp - ETC) / ETCp
  const reducaoEtcp = totalEtcp > 0 ? ((totalEtcp - totalEtc) / totalEtcp) * 100 : 0

  // Excesso de irrigação %: excesso / irrigação total
  const excessIrrigationPct = totalIrrigation > 0 ? (excessIrrigation / totalIrrigation) * 100 : 0

  const lastDate = sorted.length > 0
    ? new Date(sorted[sorted.length - 1].date + 'T12:00:00').toLocaleDateString('pt-BR')
    : '—'

  if (chartData.length === 0) {
    return (
      <p style={{ color: '#445566', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
        Nenhum registro de manejo ainda.
      </p>
    )
  }

  return (
    <div>
      {/* Chart */}
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 50, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#445566', fontSize: 10 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            tickLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
          />
          <YAxis
            yAxisId="mm"
            tick={{ fill: '#445566', fontSize: 10 }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            yAxisId="pct" orientation="right"
            domain={[0, 100]}
            tick={{ fill: '#445566', fontSize: 10 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#e2e8f0', fontSize: 12 }}
            labelStyle={{ color: '#8899aa', marginBottom: 4 }}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <ReferenceLine yAxisId="pct" y={100}        stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5} />
          <ReferenceLine yAxisId="pct" y={safetyPct}  stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5} />
          <ReferenceLine yAxisId="pct" y={0}          stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5} />

          <Bar yAxisId="mm" dataKey="irrigation" name="Irrigação (mm)"    fill="#22d3ee" radius={[3,3,0,0]} maxBarSize={14} />
          <Bar yAxisId="mm" dataKey="rainfall"   name="Precipitação (mm)" fill="rgba(200,210,220,0.65)" radius={[3,3,0,0]} maxBarSize={14} />

          <Line yAxisId="pct" type="monotone" dataKey="moisture"    name="% Campo"       stroke="#0093D0" strokeWidth={2.5} dot={false} connectNulls />
          <Line yAxisId="pct" type="monotone" dataKey="stageChange" name="Troca de fase"  stroke="transparent" strokeWidth={0}
            dot={{ fill: '#f59e0b', r: 6, strokeWidth: 2, stroke: '#0d1520' }}
            activeDot={false} connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, paddingLeft: 4 }}>
        {[
          { color: '#22c55e', label: 'CC (100%)', line: true },
          { color: '#f59e0b', label: `Umid. Segurança (${safetyPct}%)`, line: true },
          { color: '#ef4444', label: 'P. Murcha', line: true },
          { color: '#0093D0', label: '% Campo', line: true },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
            <span style={{ fontSize: 10, color: '#556677' }}>{label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#22d3ee' }} />
          <span style={{ fontSize: 10, color: '#556677' }}>Irrigação (mm)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(200,210,220,0.65)' }} />
          <span style={{ fontSize: 10, color: '#556677' }}>Precipitação (mm)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', border: '2px solid #0d1520' }} />
          <span style={{ fontSize: 10, color: '#556677' }}>Fase</span>
        </div>
      </div>

      {/* ── Valores Acumulados (estilo concorrente) ── */}
      <div style={{
        marginTop: 28,
        paddingTop: 20,
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0', margin: '0 0 16px' }}>
          Valores Acumulados
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <AccumItem label="Equipamento"         value={pivotName} />
          <AccumItem label="Parcela"             value={seasonName} />
          <AccumItem label="Irrigação"           value={`${totalIrrigation.toFixed(0)} mm`} />
          <AccumItem label="ETCp"                value={`${totalEtcp.toFixed(2)} mm`} />
          <AccumItem label="Precipitação"        value={`${totalRainfall.toFixed(0)} mm`} />
          <AccumItem label="ETC"                 value={`${totalEtc.toFixed(2)} mm`} />
          <AccumItem label="Excesso Total"       value={`${excessTotal.toFixed(2)} mm`} />
          <AccumItem label="Excesso de Irrigação" value={`${excessIrrigation.toFixed(2)} mm`} />
          <AccumItem label="Redução de ETCp"    value={`${reducaoEtcp.toFixed(2)} %`} />
          <AccumItem label="Excesso Irrigação %" value={`${excessIrrigationPct.toFixed(2)} %`} />
          <AccumItem label="Dias Registrados"    value={String(sorted.length)} />
          <AccumItem label="Último Registro"     value={lastDate} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

export function PivotDetailClient({ pivot, farm, context, history, today }: Props) {
  const { season, crop } = context ?? {}

  const das       = season?.planting_date ? calcDAS(season.planting_date, today) : 0
  const stageInfo = crop ? getStageInfoForDas(crop, das) : null

  const CC      = season?.field_capacity ?? 0
  const PM      = season?.wilting_point  ?? 0
  const Ds      = season?.bulk_density   ?? 1.0
  const fFactor = stageInfo?.fFactor ?? season?.f_factor ?? 0.5

  const ctaMm = stageInfo ? calcCTA(CC, PM, Ds, stageInfo.rootDepthCm) : 0
  const cadMm = calcCAD(ctaMm, fFactor)

  const lastMgmt  = history.length > 0 ? history[0] : null   // DESC order
  const adcMm     = lastMgmt?.ctda ?? (ctaMm * ((season?.initial_adc_percent ?? 100) / 100))
  const adcPct    = ctaMm > 0 ? (adcMm / ctaMm) * 100 : 0
  const deficitMm = Math.max(0, cadMm - adcMm)

  const statusColor = deficitMm > 0 ? '#ef4444' : adcPct < 80 ? '#f59e0b' : '#22c55e'
  const statusLabel = deficitMm > 0 ? 'Irrigar' : adcPct < 80 ? 'Atenção' : 'OK'

  const areaHa = pivot.length_m ? (Math.PI * pivot.length_m ** 2) / 10000 : null

  return (
    <div style={{ padding: '0 0 48px', maxWidth: 1040, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: '#445566', textDecoration: 'none', marginBottom: 10,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Dashboard
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#e2e8f0', margin: 0, letterSpacing: '-0.02em' }}>
              {pivot.name}
            </h1>
            <p style={{ fontSize: 13, color: '#445566', margin: '3px 0 0' }}>
              {farm?.name ?? ''}{season ? ` · ${season.name}` : ''}
            </p>
          </div>

          <div style={{
            marginLeft: 'auto',
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 16px', borderRadius: 99,
            background: `${statusColor}18`,
            border: `1px solid ${statusColor}45`,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>
              {statusLabel} · {Math.round(adcPct)}% campo
            </span>
          </div>
        </div>
      </div>

      {!season ? (
        <div style={{
          background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: 48, textAlign: 'center',
        }}>
          <p style={{ color: '#445566', fontSize: 14, marginBottom: 16 }}>
            Nenhuma safra ativa para este pivô.
          </p>
          <Link href="/safras" style={{
            display: 'inline-block', padding: '9px 22px', borderRadius: 10,
            background: '#0093D0', color: '#fff', textDecoration: 'none',
            fontSize: 13, fontWeight: 700,
          }}>
            Criar safra
          </Link>
        </div>
      ) : (
        <>
          {/* ── Row 1: diagrama completo ── */}
          <div style={{ marginBottom: 16 }}>
            {ctaMm > 0 ? (
              <SoilDiagramRich
                ctaMm={ctaMm}
                cadMm={cadMm}
                adcMm={adcMm}
                recommendedDepthMm={deficitMm}
                eto={lastMgmt?.eto_mm ?? null}
                etc={lastMgmt?.etc_mm ?? null}
                kc={stageInfo?.kc ?? lastMgmt?.kc ?? null}
                das={das}
                cropStage={stageInfo?.stage ?? 1}
                rootDepthCm={stageInfo?.rootDepthCm ?? 25}
                cropName={crop?.name ?? null}
                farmName={farm?.name ?? ''}
                pivotName={pivot.name}
                date={lastMgmt?.date ?? today}
                areaHa={areaHa}
                alertThresholdPct={pivot.alert_threshold_percent ?? null}
              />
            ) : (
              <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 48, textAlign: 'center' }}>
                <p style={{ color: '#445566', fontSize: 14 }}>Configure CC, PM e densidade do solo na safra.</p>
              </div>
            )}
          </div>

          {/* ── Row 2: Gráfico evolução (largura total) ── */}
          <div style={{
            background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, padding: 20,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#445566', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Evolução — Histórico Completo
            </span>
            <div style={{ marginTop: 16 }}>
              <EvolutionChart
                history={history}
                pivotName={pivot.name}
                seasonName={season.name}
                fFactor={fFactor}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
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

// ─── Soil Diagram ─────────────────────────────────────────────

function SoilDiagram({ ctaMm, cadMm, adcMm }: { ctaMm: number; cadMm: number; adcMm: number }) {
  const adcPct  = ctaMm > 0 ? Math.min(100, (adcMm / ctaMm) * 100) : 0
  const cadPct  = ctaMm > 0 ? Math.min(100, (cadMm / ctaMm) * 100) : 50
  const deficitMm = Math.max(0, cadMm - adcMm)

  // pixel positions from top (diagram = 100% at top, 0% at bottom)
  const H = 260
  const adcTopPx = H - (H * adcPct) / 100
  const cadTopPx = H - (H * cadPct) / 100

  const isLow = adcPct < cadPct

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', width: '100%' }}>
      {/* Diagram column */}
      <div style={{ position: 'relative', width: 180, flexShrink: 0 }}>
        <div style={{
          position: 'relative', height: H,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.10)',
          background: '#0a1219',
        }}>
          {/* Deficit zone — top */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: adcTopPx,
            background: isLow ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.02)',
          }} />

          {/* Available water zone */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: H - adcTopPx,
            background: 'rgba(0,147,208,0.22)',
          }} />

          {/* CC line — top (green) */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#22c55e', zIndex: 3 }} />

          {/* CAD line — amber */}
          <div style={{ position: 'absolute', top: cadTopPx, left: 0, right: 0, height: 2, background: '#f59e0b', zIndex: 3 }} />

          {/* ADc level — blue */}
          <div style={{ position: 'absolute', top: adcTopPx - 1, left: 0, right: 0, height: 3, background: '#0093D0', zIndex: 4 }} />

          {/* PM line — bottom (red) */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: '#ef4444', zIndex: 3 }} />

          {/* Center % label */}
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: Math.max(adcTopPx + 8, H / 2 - 20),
            textAlign: 'center', zIndex: 5,
          }}>
            <span style={{
              fontSize: 32, fontWeight: 900, fontFamily: 'var(--font-mono)',
              color: '#e2e8f0', lineHeight: 1,
              textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            }}>
              {Math.round(adcPct)}%
            </span>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>
              % campo
            </p>
          </div>
        </div>
      </div>

      {/* Legend column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4, flex: 1 }}>
        {[
          { color: '#22c55e', label: 'CC (cap. campo)', value: `${ctaMm.toFixed(0)} mm` },
          { color: '#0093D0', label: 'Disponível (ADc)', value: `${adcMm.toFixed(0)} mm` },
          { color: '#f59e0b', label: 'Manejo (CAD)', value: `${cadMm.toFixed(0)} mm` },
          {
            color: '#ef4444',
            label: deficitMm > 0 ? 'Déficit' : 'Ponto de murcha',
            value: deficitMm > 0 ? `${deficitMm.toFixed(0)} mm` : '0 mm',
          },
        ].map(({ color, label, value }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 3, background: color, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#556677' }}>{label}</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', fontFamily: 'var(--font-mono)', paddingLeft: 36 }}>
              {value}
            </span>
          </div>
        ))}
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
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 6, right: 16, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#445566', fontSize: 9 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            tickLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
          />
          <YAxis yAxisId="mm" tick={{ fill: '#445566', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            yAxisId="pct" orientation="right"
            domain={[0, 100]}
            tick={{ fill: '#445566', fontSize: 10 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, color: '#e2e8f0', fontSize: 12 }}
            labelStyle={{ color: '#8899aa', marginBottom: 4 }}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <ReferenceLine yAxisId="pct" y={100}        stroke="#22c55e" strokeDasharray="4 3" strokeWidth={1.5} />
          <ReferenceLine yAxisId="pct" y={safetyPct}  stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
          <ReferenceLine yAxisId="pct" y={0}          stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} />

          <Bar yAxisId="mm" dataKey="irrigation" name="Irrigação (mm)"   fill="#0093D0" radius={[3,3,0,0]} maxBarSize={16} />
          <Bar yAxisId="mm" dataKey="rainfall"   name="Precipitação (mm)" fill="rgba(255,255,255,0.7)" radius={[3,3,0,0]} maxBarSize={16} />

          <Line yAxisId="pct" type="monotone" dataKey="moisture"    name="% Campo"      stroke="#0093D0" strokeWidth={2} dot={false} connectNulls />
          <Line yAxisId="pct" type="monotone" dataKey="stageChange" name="Troca de fase" stroke="transparent" strokeWidth={0}
            dot={{ fill: '#f59e0b', r: 5, strokeWidth: 2, stroke: '#0d1520' }}
            activeDot={false} connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, paddingLeft: 4 }}>
        {[
          { color: '#22c55e', label: 'CC (100%)' },
          { color: '#f59e0b', label: `Umid. Segurança (${safetyPct}%)` },
          { color: '#ef4444', label: 'P. Murcha' },
          { color: '#0093D0', label: '% Campo' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
            <span style={{ fontSize: 10, color: '#556677' }}>{label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#0093D0' }} />
          <span style={{ fontSize: 10, color: '#556677' }}>Irrigação (mm)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.7)' }} />
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
          {/* ── Row 1: métricas + diagrama ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 16, marginBottom: 16 }}>

            {/* Métricas */}
            <div style={{
              background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16, padding: 20,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#445566', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Métricas Atuais
              </span>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Chip
                  label="Irrigar"
                  value={deficitMm > 0 ? `${deficitMm.toFixed(0)} mm` : '—'}
                  color={deficitMm > 0 ? '#ef4444' : '#22c55e'}
                />
                <Chip
                  label="ETc"
                  value={lastMgmt?.etc_mm != null ? `${lastMgmt.etc_mm.toFixed(1)} mm` : '—'}
                />
                <Chip
                  label="Cultura"
                  value={crop?.name ?? '—'}
                />
                <Chip
                  label="Fase"
                  value={stageInfo ? `F${stageInfo.stage}` : '—'}
                  sub={das > 0 ? `DAS ${das}` : undefined}
                />
                <Chip
                  label="Área"
                  value={areaHa ? `${areaHa.toFixed(0)} ha` : '—'}
                />
                <Chip
                  label="Últ. Registro"
                  value={lastMgmt?.date
                    ? new Date(lastMgmt.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                    : '—'}
                />
              </div>

              {/* Sub-row: Kc / Prof / f */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Chip label="Kc"    value={stageInfo ? stageInfo.kc.toFixed(2) : '—'} color="#0093D0" />
                <Chip label="Prof." value={stageInfo ? `${Math.round(stageInfo.rootDepthCm)} cm` : '—'} />
                <Chip label="f"     value={fFactor.toFixed(2)} color="#f59e0b" />
              </div>
            </div>

            {/* Balanço Hídrico */}
            <div style={{
              background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16, padding: 20,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#445566', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Balanço Hídrico
              </span>
              <div style={{ marginTop: 16 }}>
                {ctaMm > 0 ? (
                  <SoilDiagram ctaMm={ctaMm} cadMm={cadMm} adcMm={adcMm} />
                ) : (
                  <p style={{ color: '#445566', fontSize: 12, textAlign: 'center', padding: '32px 0' }}>
                    Configure CC, PM e densidade do solo na safra.
                  </p>
                )}
              </div>
            </div>
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

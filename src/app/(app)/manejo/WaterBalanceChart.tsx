'use client'

import { BarChart2 } from 'lucide-react'
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea,
} from 'recharts'
import type { DailyManagement } from '@/types/database'

interface Props {
  history: DailyManagement[]
  threshold?: number
  pivotName?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, threshold }: any) {
  if (!active || !payload?.length) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adcEntry = payload.find((p: any) => p.dataKey === 'adc')
  const pct = adcEntry ? Number(adcEntry.value) : null
  const zone = pct === null ? null
    : pct >= threshold * 1.15 ? { label: 'Zona Segura', color: '#22c55e' }
    : pct >= threshold       ? { label: 'Zona de Atenção', color: '#f59e0b' }
    : { label: 'Zona Crítica', color: '#ef4444' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dasEntry = payload.find((p: any) => p.dataKey === 'das')
  const dasVal = dasEntry ? Number(dasEntry.value) : null

  return (
    <div style={{
      background: 'rgba(10,18,28,0.97)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      padding: '12px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(12px)',
      minWidth: 172,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{label}</p>
        {dasVal !== null && (
          <span style={{ fontSize: 10, color: '#556677', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '1px 6px' }}>
            DAS {dasVal}
          </span>
        )}
      </div>
      {payload.map((entry: any, i: number) => {  // eslint-disable-line @typescript-eslint/no-explicit-any
        if (entry.dataKey === 'das') return null
        if (entry.value === 0 && (entry.dataKey === 'rain' || entry.dataKey === 'irr')) return null
        const isAdc = entry.dataKey === 'adc'
        const isIrrig = entry.dataKey === 'irr'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#8899aa', flex: 1 }}>{entry.name}:</span>
            <span style={{ fontSize: 12, color: isIrrig ? '#22d3ee' : '#fff', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {Number(entry.value).toFixed(1)}{isAdc ? '%' : ' mm'}
            </span>
          </div>
        )
      })}
      {zone && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 10, color: zone.color, fontWeight: 600 }}>
          ● {zone.label}
        </div>
      )}
    </div>
  )
}

export default function WaterBalanceChart({ history, threshold = 70, pivotName }: Props) {
  if (history.length < 2) return null

  const data = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map(r => ({
      date: r.date.slice(5),                          // "MM-DD" for axis
      dateLabel: r.date.substring(8, 10) + '/' + r.date.substring(5, 7),
      das: r.das ?? null,
      eto: r.eto_mm ?? 0,
      etc: r.etc_mm ?? 0,
      rain: r.rainfall_mm ?? 0,
      irr: r.actual_depth_mm ?? 0,
      adc: r.field_capacity_percent ?? 0,
    }))

  const hasIrrigation = data.some(d => d.irr > 0)

  return (
    <div style={{
      background: 'linear-gradient(160deg, #0a1218, #0f1923)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <BarChart2 size={14} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Balanço Hídrico — Últimos 30 dias</span>
        {pivotName && (
          <span style={{ fontSize: 11, color: '#0093D0', background: 'rgba(0,147,208,0.10)', border: '1px solid rgba(0,147,208,0.2)', borderRadius: 6, padding: '2px 8px' }}>
            {pivotName}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#556677' }}>
            <div style={{ width: 10, height: 3, background: '#f59e0b', borderRadius: 2 }} /> ETo
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#556677' }}>
            <div style={{ width: 10, height: 3, background: '#22d3ee', borderRadius: 2 }} /> ETc
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#556677' }}>
            <div style={{ width: 8, height: 8, background: 'rgba(200,220,255,0.65)', borderRadius: 2 }} /> Chuva
          </span>
          {hasIrrigation && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#556677' }}>
              <div style={{ width: 8, height: 8, background: 'rgba(0,147,208,0.75)', borderRadius: 2 }} /> Irrigação
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#556677' }}>
            <div style={{ width: 10, height: 3, background: '#22c55e', borderRadius: 2 }} /> Umidade %
          </span>
        </div>
      </div>

      {/* Zone badges */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 20px 0', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
          Zona Segura ≥{Math.round(threshold * 1.15)}%
        </span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
          Atenção {threshold}–{Math.round(threshold * 1.15 - 1)}%
        </span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
          Crítico &lt;{threshold}%
        </span>
      </div>

      {/* Chart */}
      <div style={{ padding: '12px 16px 0 0', width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="wbcMoistureArea" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgba(239,68,68,0.22)" />
                <stop offset={`${threshold}%`} stopColor="rgba(239,68,68,0.22)" />
                <stop offset={`${threshold}%`} stopColor="rgba(34,197,94,0.10)" />
                <stop offset="100%" stopColor="rgba(34,197,94,0.10)" />
              </linearGradient>
              <linearGradient id="wbcMoistureStroke" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset={`${threshold}%`} stopColor="#ef4444" />
                <stop offset={`${threshold}%`} stopColor="#22c55e" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>

            <YAxis yAxisId="left" orientation="left" stroke="rgba(255,255,255,0.06)" tick={{ fill: '#445566', fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="rgba(255,255,255,0.06)" tick={{ fill: '#445566', fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
            <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.06)" tick={{ fill: '#445566', fontSize: 10 }} tickLine={false} axisLine={false} dy={8} minTickGap={24} />
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
            <Tooltip content={<CustomTooltip threshold={threshold} />} cursor={{ fill: 'rgba(255,255,255,0.025)' }} />

            {/* Stress zones */}
            <ReferenceArea yAxisId="right" y1={threshold * 1.15} y2={100} fill="rgba(34,197,94,0.04)" />
            <ReferenceArea yAxisId="right" y1={threshold} y2={threshold * 1.15} fill="rgba(245,158,11,0.05)" />
            <ReferenceArea yAxisId="right" y1={0} y2={threshold} fill="rgba(239,68,68,0.05)" />

            <ReferenceLine y={100} yAxisId="right" stroke="#22c55e" strokeDasharray="4 4" opacity={0.35} />
            <ReferenceLine y={threshold * 1.15} yAxisId="right" stroke="#22c55e" strokeDasharray="2 6" opacity={0.3} />
            <ReferenceLine
              y={threshold}
              yAxisId="right"
              stroke="#f59e0b"
              strokeDasharray="4 4"
              opacity={0.5}
              label={{ value: `${threshold}%`, position: 'insideTopRight', fill: '#f59e0b', fontSize: 9, dy: -4 }}
            />

            {/* Hidden DAS line — only used for tooltip data */}
            <Line yAxisId="left" type="monotone" dataKey="das" name="DAS" stroke="transparent" dot={false} legendType="none" />

            {/* Moisture area (right axis) */}
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="adc"
              name="Umidade"
              fill="url(#wbcMoistureArea)"
              stroke="url(#wbcMoistureStroke)"
              strokeWidth={2.5}
              dot={{ r: 0 }}
              activeDot={{ r: 4, stroke: '#0f1923', strokeWidth: 2 }}
            />

            {/* Rain */}
            <Bar yAxisId="left" dataKey="rain" name="Chuva" fill="rgba(200,220,255,0.65)" radius={[3, 3, 0, 0]} maxBarSize={16} />

            {/* Irrigation */}
            {hasIrrigation && (
              <Bar yAxisId="left" dataKey="irr" name="Irrigação" fill="rgba(0,147,208,0.75)" radius={[3, 3, 0, 0]} maxBarSize={16} />
            )}

            {/* ETo — dashed amber */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="eto"
              name="ETo"
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={{ r: 0 }}
              activeDot={{ r: 3, stroke: '#0f1923', strokeWidth: 2 }}
            />

            {/* ETc — solid cyan */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="etc"
              name="ETc"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ r: 0 }}
              activeDot={{ r: 3, stroke: '#0f1923', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 20px 12px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#334455' }}>Zona colorida = nível de estresse hídrico</span>
        <span style={{ fontSize: 10, color: '#334455' }}>Traço âmbar = limiar crítico ({threshold}%)</span>
      </div>
    </div>
  )
}

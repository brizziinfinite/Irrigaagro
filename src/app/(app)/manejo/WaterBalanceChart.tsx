'use client'

import { BarChart2 } from 'lucide-react'
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import type { DailyManagement } from '@/types/database'

interface Props {
  history: DailyManagement[]
  threshold?: number          // alert_threshold_percent (ex: 70%)
  irrigationTarget?: number   // irrigation_target_percent (ex: 80%)
  fieldCapacity?: number | null   // CC em % volumétrica (ex: 30.49)
  wiltingPoint?: number | null    // PM em % volumétrica (ex: 16.1)
  pivotName?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, cc, pm }: any) {
  if (!active || !payload?.length) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moistEntry = payload.find((p: any) => p.dataKey === 'umidVol')
  const umid = moistEntry ? Number(moistEntry.value) : null
  const dasEntry = payload.find((p: any) => p.dataKey === 'das')  // eslint-disable-line @typescript-eslint/no-explicit-any
  const dasVal = dasEntry ? Number(dasEntry.value) : null

  let zoneLabel = null
  let zoneColor = '#22c55e'
  if (umid !== null && cc && pm) {
    const range = cc - pm
    const pct = range > 0 ? ((umid - pm) / range) * 100 : 0
    if (pct >= 80)      { zoneLabel = 'Zona Segura';    zoneColor = '#22c55e' }
    else if (pct >= 70) { zoneLabel = 'Zona de Atenção'; zoneColor = '#f59e0b' }
    else                { zoneLabel = 'Zona Crítica';   zoneColor = '#ef4444' }
  }

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
        const isUmid  = entry.dataKey === 'umidVol'
        const isIrrig = entry.dataKey === 'irr'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#8899aa', flex: 1 }}>{entry.name}:</span>
            <span style={{ fontSize: 12, color: isIrrig ? '#22d3ee' : '#fff', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {Number(entry.value).toFixed(isUmid ? 2 : 1)}{isUmid ? '%' : ' mm'}
            </span>
          </div>
        )
      })}
      {zoneLabel && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 10, color: zoneColor, fontWeight: 600 }}>
          ● {zoneLabel}
        </div>
      )}
    </div>
  )
}

export default function WaterBalanceChart({
  history,
  threshold = 70,
  irrigationTarget = 80,
  fieldCapacity,
  wiltingPoint,
  pivotName,
}: Props) {
  if (history.length < 2) return null

  const cc = fieldCapacity ?? null
  const pm = wiltingPoint ?? null
  const hasVolAxis = cc !== null && pm !== null && cc > pm

  // Converte field_capacity_percent (0–100%) para % volumétrica real
  // umid_vol = PM + (pct/100) × (CC - PM)
  const toVol = (pct: number | null): number | null => {
    if (pct === null) return null
    if (!hasVolAxis) return pct
    return pm! + (pct / 100) * (cc! - pm!)
  }

  // Linhas de referência em % volumétrica
  const lineCC     = hasVolAxis ? cc!                                    : 100
  const lineSeg    = hasVolAxis ? pm! + (irrigationTarget / 100) * (cc! - pm!) : irrigationTarget
  const lineCrit   = hasVolAxis ? pm! + (threshold / 100) * (cc! - pm!) : threshold
  const linePM     = hasVolAxis ? pm!                                    : 0

  const data = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map(r => ({
      dateLabel: r.date.substring(8, 10) + '/' + r.date.substring(5, 7),
      das:     r.das ?? null,
      eto:     r.eto_mm ?? 0,
      etc:     r.etc_mm ?? 0,
      rain:    r.rainfall_mm ?? 0,
      irr:     r.actual_depth_mm ?? 0,
      umidVol: toVol(r.field_capacity_percent ?? null),
    }))

  const hasIrrigation = data.some(d => d.irr > 0)

  // Domínio do eixo Y direito
  const yMin = hasVolAxis ? Math.floor(pm! - 0.5)  : 0
  const yMax = hasVolAxis ? Math.ceil(cc! + 0.5)   : 100
  const yDomain: [number, number] = [yMin, yMax]

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
            <div style={{ width: 10, height: 3, background: '#22c55e', borderRadius: 2 }} /> Umidade
          </span>
        </div>
      </div>

      {/* Zone badges */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 20px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
          Zona Segura ≥{lineSeg.toFixed(hasVolAxis ? 1 : 0)}{hasVolAxis ? '%' : '%'}
        </span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
          Atenção {lineCrit.toFixed(hasVolAxis ? 1 : 0)}–{(lineSeg - 0.1).toFixed(hasVolAxis ? 1 : 0)}%
        </span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
          Crítico &lt;{lineCrit.toFixed(hasVolAxis ? 1 : 0)}%
        </span>
        {hasVolAxis && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#445566' }}>
            CC {cc!.toFixed(1)}% · PM {pm!.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Chart */}
      <div style={{ padding: '12px 16px 0 0', width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="wbcMoistureArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(34,197,94,0.10)" />
                <stop offset="100%" stopColor="rgba(239,68,68,0.15)" />
              </linearGradient>
            </defs>

            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="rgba(255,255,255,0.06)"
              tick={{ fill: '#445566', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={yDomain}
              stroke="rgba(255,255,255,0.06)"
              tick={{ fill: '#445566', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={v => `${v.toFixed(hasVolAxis ? 1 : 0)}`}
            />
            <XAxis
              dataKey="dateLabel"
              stroke="rgba(255,255,255,0.06)"
              tick={{ fill: '#445566', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              dy={8}
              minTickGap={24}
            />
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
            <Tooltip content={<CustomTooltip cc={cc} pm={pm} />} cursor={{ fill: 'rgba(255,255,255,0.025)' }} />

            {/* ── Linhas de referência ── */}
            {/* CC — capacidade de campo */}
            <ReferenceLine
              yAxisId="right" y={lineCC}
              stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1.5} opacity={0.6}
              label={{ value: `CC ${lineCC.toFixed(hasVolAxis ? 1 : 0)}%`, position: 'insideTopRight', fill: '#22c55e', fontSize: 9, dy: -4 }}
            />
            {/* Umidade de segurança */}
            <ReferenceLine
              yAxisId="right" y={lineSeg}
              stroke="#22c55e" strokeDasharray="2 5" strokeWidth={1} opacity={0.4}
              label={{ value: `Seg ${lineSeg.toFixed(hasVolAxis ? 1 : 0)}%`, position: 'insideTopRight', fill: '#22c55e', fontSize: 9, dy: -4 }}
            />
            {/* Limiar crítico */}
            <ReferenceLine
              yAxisId="right" y={lineCrit}
              stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} opacity={0.55}
              label={{ value: `Crit ${lineCrit.toFixed(hasVolAxis ? 1 : 0)}%`, position: 'insideTopRight', fill: '#f59e0b', fontSize: 9, dy: -4 }}
            />
            {/* PM — ponto de murcha */}
            {hasVolAxis && (
              <ReferenceLine
                yAxisId="right" y={linePM}
                stroke="#ef4444" strokeDasharray="2 5" strokeWidth={1} opacity={0.4}
                label={{ value: `PM ${linePM.toFixed(1)}%`, position: 'insideTopRight', fill: '#ef4444', fontSize: 9, dy: 10 }}
              />
            )}

            {/* Hidden DAS — só para tooltip */}
            <Line yAxisId="left" type="monotone" dataKey="das" name="DAS" stroke="transparent" dot={false} legendType="none" />

            {/* Umidade volumétrica (eixo direito) */}
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="umidVol"
              name="Umidade"
              fill="url(#wbcMoistureArea)"
              stroke="url(#wbcMoistureStroke)"
              strokeWidth={2.5}
              dot={{ r: 0 }}
              activeDot={{ r: 4, stroke: '#0f1923', strokeWidth: 2 }}
            />

            {/* Chuva */}
            <Bar yAxisId="left" dataKey="rain" name="Chuva" fill="rgba(200,220,255,0.65)" radius={[3, 3, 0, 0]} maxBarSize={16} />

            {/* Irrigação */}
            {hasIrrigation && (
              <Bar yAxisId="left" dataKey="irr" name="Irrigação" fill="rgba(0,147,208,0.75)" radius={[3, 3, 0, 0]} maxBarSize={16} />
            )}

            {/* ETo */}
            <Line yAxisId="left" type="monotone" dataKey="eto" name="ETo" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 0 }} activeDot={{ r: 3, stroke: '#0f1923', strokeWidth: 2 }} />

            {/* ETc */}
            <Line yAxisId="left" type="monotone" dataKey="etc" name="ETc" stroke="#22d3ee" strokeWidth={2} dot={{ r: 0 }} activeDot={{ r: 3, stroke: '#0f1923', strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 20px 12px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#334455' }}>Eixo direito: % volumétrica de umidade do solo</span>
        <span style={{ fontSize: 10, color: '#334455' }}>Barras: escala esquerda (mm)</span>
      </div>
    </div>
  )
}

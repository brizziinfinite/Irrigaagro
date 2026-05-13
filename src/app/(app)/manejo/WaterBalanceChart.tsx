'use client'

import { BarChart2 } from 'lucide-react'
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import type { DailyManagement } from '@/types/database'

interface Props {
  history: DailyManagement[]
  threshold?: number              // alert_threshold_percent (ex: 70%)
  fFactor?: number | null         // f_factor do estágio atual
  fieldCapacity?: number | null   // CC em % volumétrica (ex: 30.49)
  wiltingPoint?: number | null    // PM em % volumétrica (ex: 16.1)
  pivotName?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, lineSeg, lineCrit, cc, pm }: any) {
  if (!active || !payload?.length) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moistEntry = payload.find((p: any) => p.dataKey === 'umidVol' || p.dataKey === 'umidVolOk' || p.dataKey === 'umidVolWarn')
  const umid = moistEntry ? Number(moistEntry.value) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dasEntry = payload.find((p: any) => p.dataKey === 'das')
  const dasVal = dasEntry ? Number(dasEntry.value) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fcPctEntry = payload.find((p: any) => p.dataKey === 'fcPct')
  const fcPct = fcPctEntry ? Number(fcPctEntry.value) : (
    umid !== null && cc !== null && pm !== null && cc > pm
      ? Math.round(((umid - pm) / (cc - pm)) * 100)
      : null
  )

  let zoneLabel = null
  let zoneColor = '#22c55e'
  if (umid !== null) {
    if (lineSeg !== null && umid >= lineSeg)        { zoneLabel = 'Seguro';           zoneColor = '#38bdf8' }
    else if (lineCrit !== null && umid >= lineCrit) { zoneLabel = 'Alerta';           zoneColor = '#f59e0b' }
    else                                            { zoneLabel = 'Estresse Hídrico'; zoneColor = '#ef4444' }
  }

  const seen = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const displayEntries = payload.filter((entry: any) => {
    if (entry.dataKey === 'das') return false
    if (entry.value === null || entry.value === undefined) return false
    if (entry.value === 0 && (entry.dataKey === 'rain' || entry.dataKey === 'irr')) return false
    // Unifica as duas séries de umidade numa só linha no tooltip
    const key = (entry.dataKey === 'umidVolOk' || entry.dataKey === 'umidVolWarn') ? 'umid' : entry.dataKey
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return (
    <div style={{
      background: 'var(--color-surface-bg)',
      border: '1px solid var(--color-surface-border)',
      borderRadius: 10,
      padding: '10px 14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(16px)',
      minWidth: 160,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, paddingBottom: 5, borderBottom: '1px solid var(--color-surface-border2)' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{label}</p>
        {dasVal !== null && (
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', background: 'var(--color-surface-border2)', borderRadius: 4, padding: '1px 5px' }}>
            DAS {dasVal}
          </span>
        )}
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {displayEntries.map((entry: any, i: number) => {
        const isUmid  = entry.dataKey === 'umidVolOk' || entry.dataKey === 'umidVolWarn'
        const isIrrig = entry.dataKey === 'irr'
        const name    = isUmid ? 'Umidade' : entry.name
        const color   = isUmid ? (umid !== null && lineSeg !== null && umid >= lineSeg ? '#38bdf8' : '#ef4444') : entry.color
        return (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flex: 1 }}>{name}:</span>
              <span style={{ fontSize: 12, color: isIrrig ? '#22d3ee' : 'var(--color-text)', fontWeight: 700, fontFamily: 'monospace' }}>
                {Number(entry.value).toFixed(isUmid ? 1 : 1)}{isUmid ? '%' : ' mm'}
              </span>
            </div>
            {isUmid && fcPct !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
                <div style={{ width: 7, height: 7, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flex: 1 }}>% da CC:</span>
                <span style={{ fontSize: 12, color: color, fontWeight: 700, fontFamily: 'monospace' }}>
                  {fcPct.toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        )
      })}
      {zoneLabel && (
        <div style={{ marginTop: 7, paddingTop: 5, borderTop: '1px solid var(--color-surface-border2)', fontSize: 10, color: zoneColor, fontWeight: 600, letterSpacing: '0.02em' }}>
          ● {zoneLabel}
        </div>
      )}
    </div>
  )
}

export default function WaterBalanceChart({
  history,
  threshold = 70,
  fFactor,
  fieldCapacity,
  wiltingPoint,
  pivotName,
}: Props) {
  if (history.length < 2) return null

  const cc = fieldCapacity ?? null
  const pm = wiltingPoint ?? null
  const hasVolAxis = cc !== null && pm !== null && cc > pm

  // Converte field_capacity_percent (0–100%) para % volumétrica real
  const toVol = (pct: number | null): number | null => {
    if (pct === null) return null
    if (!hasVolAxis) return pct
    return pm! + (pct / 100) * (cc! - pm!)
  }

  // Linhas de referência
  const f        = fFactor ?? 0.40
  const lineCC   = hasVolAxis ? cc!                                    : null
  const lineSeg  = hasVolAxis ? pm! + (cc! - pm!) * (1 - f)           : null
  const lineCrit = hasVolAxis ? pm! + (threshold / 100) * (cc! - pm!) : null
  const linePM   = hasVolAxis ? pm!                                    : null

  const sorted = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)

  // Dois segmentos de umidade: OK (verde) e WARN (vermelho)
  // No ponto de cruzamento AMBAS as séries recebem lineSeg — sem gap
  const vols = sorted.map(r => toVol(r.field_capacity_percent ?? null))

  const data = sorted.map((r, i) => {
    const vol  = vols[i]
    const prev = i > 0 ? vols[i - 1] : null
    const next = i < vols.length - 1 ? vols[i + 1] : null

    let umidVolOk: number | null   = null
    let umidVolWarn: number | null = null

    if (vol !== null && lineSeg !== null) {
      const isWarn     = vol < lineSeg
      const wasOk      = prev !== null && prev >= lineSeg
      const willBeWarn = next !== null && next < lineSeg

      if (!isWarn) {
        // Ponto OK — aparece na série verde
        umidVolOk = vol
        // Se o próximo cruza para baixo: coloca lineSeg aqui e também abre o vermelho
        if (willBeWarn) {
          umidVolOk   = lineSeg
          umidVolWarn = lineSeg
        }
      } else {
        // Ponto WARN — aparece na série vermelha
        umidVolWarn = vol
        // Se o anterior estava acima: já teremos iniciado o vermelho em lineSeg no step anterior
        // Mas também coloca lineSeg aqui para conectar sem gap
        if (wasOk) {
          umidVolOk   = lineSeg
          umidVolWarn = lineSeg
        }
      }
    } else if (vol !== null) {
      // Sem eixo volumétrico — usa linha única OK
      umidVolOk = vol
    }

    return {
      dateLabel:   r.date.substring(8, 10) + '/' + r.date.substring(5, 7),
      das:         r.das ?? null,
      eto:         r.eto_mm ?? 0,
      etc:         r.etc_mm ?? 0,
      rain:        r.rainfall_mm ?? 0,
      irr:         r.actual_depth_mm ?? 0,
      umidVol:     vol,
      umidVolOk,
      umidVolWarn,
    }
  })

  const hasIrrigation = data.some(d => d.irr > 0)

  const yMin = hasVolAxis ? Math.floor(pm! - 0.5) : 0
  const yMax = hasVolAxis ? Math.ceil(cc! + 0.5)  : 100
  const yDomain: [number, number] = [yMin, yMax]

  // Cor atual do último ponto (para badge no header)
  const lastVol   = data[data.length - 1]?.umidVol ?? null
  const currentOk = lastVol !== null && lineSeg !== null ? lastVol >= lineSeg : null

  return (
    <div style={{
      background: 'linear-gradient(160deg, var(--color-surface-bg) 0%, var(--color-surface-sidebar) 100%)',
      border: '1px solid var(--color-surface-border2)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--color-surface-border2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <BarChart2 size={14} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '0.01em' }}>Balanço Hídrico</span>
        {pivotName && (
          <span style={{ fontSize: 11, color: '#0093D0', background: 'rgba(0,147,208,0.10)', border: '1px solid rgba(0,147,208,0.18)', borderRadius: 6, padding: '2px 8px' }}>
            {pivotName}
          </span>
        )}
        {currentOk !== null && lastVol !== null && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: currentOk ? '#38bdf8' : '#ef4444',
            background: currentOk ? 'rgba(56,189,248,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${currentOk ? 'rgba(56,189,248,0.2)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: 6, padding: '2px 8px',
            fontFamily: 'monospace',
          }}>
            {lastVol.toFixed(1)}% {currentOk ? '✓' : '↓'}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { color: '#38bdf8',               dot: false, label: 'Umidade OK'  },
            { color: '#ef4444',               dot: false, label: 'Umidade ↓'   },
            { color: '#60a5fa',               dot: false, label: 'CC'          },
            { color: '#fb923c',               dot: false, label: 'Seg'         },
            { color: '#ef4444',               dot: false, label: 'PM'          },
            { color: '#f59e0b', dashed: true, dot: false, label: 'Alerta'      },
            { color: '#f59e0b',               dot: false, label: 'ETo'         },
            { color: '#22d3ee',               dot: false, label: 'ETc'         },
            { color: 'rgba(180,210,255,0.7)', bar: true,  label: 'Chuva'       },
            ...(hasIrrigation ? [{ color: 'rgba(0,147,208,0.8)', bar: true, label: 'Irrigação' }] : []),
          ].map(({ color, dashed, bar, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--color-text-muted)' }}>
              {bar
                ? <div style={{ width: 7, height: 10, background: color, borderRadius: '2px 2px 0 0' }} />
                : dashed
                  ? <svg width="14" height="3"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" /></svg>
                  : <div style={{ width: 12, height: 2.5, background: color, borderRadius: 2 }} />
              }
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Zone badges */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 20px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        {lineSeg !== null && (
          <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.18)', color: '#38bdf8' }}>
            Seguro ≥ {lineSeg.toFixed(1)}%
          </span>
        )}
        {lineCrit !== null && lineSeg !== null && (
          <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', color: '#f59e0b' }}>
            Alerta {lineCrit.toFixed(1)} – {(lineSeg - 0.1).toFixed(1)}%
          </span>
        )}
        {lineCrit !== null && (
          <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', color: '#ef4444' }}>
            Estresse &lt; {lineCrit.toFixed(1)}%
          </span>
        )}
        {hasVolAxis && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-secondary)' }}>
            CC {cc!.toFixed(1)}% · PM {pm!.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Chart */}
      <div style={{ padding: '10px 12px 0 0', width: '100%', height: 300, position: 'relative' }}>
        <style>{`
          @keyframes wbcWave1 { from { transform: translateX(0); } to { transform: translateX(-50%); } }
          @keyframes wbcWave2 { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        `}</style>
        {/* Onda animada — flutua na superfície da umidade atual */}
        {hasVolAxis && lastVol !== null && (() => {
          // Mapeamento do valor volumétrico para posição Y em pixels
          // Recharts: margin top=6, bottom=0, mas eixos e labels ocupam ~30px no fundo
          const chartTopPx   = 6
          const chartBottomPx = 30   // espaço do eixo X
          const plotH = 300 - chartTopPx - chartBottomPx
          const pct = (yMax - lastVol) / (yMax - yMin)   // 0 = topo, 1 = base
          const waveTopPx = chartTopPx + pct * plotH
          const isOk = currentOk !== false
          const waveColor = isOk ? '#38bdf8' : '#ef4444'
          const enc = encodeURIComponent(waveColor)
          return (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute',
                top: waveTopPx - 7,
                left: 0, width: '200%', height: 14,
                animation: 'wbcWave1 3s linear infinite',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 14'%3E%3Cpath d='M0,7 C50,1 100,13 150,7 C200,1 250,13 300,7 C350,1 400,13 400,7 L400,14 L0,14 Z' fill='${enc}' opacity='0.40'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'repeat-x', backgroundSize: '400px 14px',
              }} />
              <div style={{
                position: 'absolute',
                top: waveTopPx - 3,
                left: 0, width: '200%', height: 9,
                animation: 'wbcWave2 2s linear infinite reverse',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 9'%3E%3Cpath d='M0,4 C60,0 130,9 200,4 C270,0 340,9 400,4 L400,9 L0,9 Z' fill='${enc}' opacity='0.20'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'repeat-x', backgroundSize: '400px 9px',
              }} />
            </div>
          )
        })()}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="wbcRainGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(180,210,255,0.80)" />
                <stop offset="100%" stopColor="rgba(180,210,255,0.30)" />
              </linearGradient>
              <linearGradient id="wbcIrrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0,147,208,0.90)" />
                <stop offset="100%" stopColor="rgba(0,147,208,0.40)" />
              </linearGradient>
              {/* Preenchimento "coluna d'água" — azul oceano quando OK */}
              <linearGradient id="wbcWaterOk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="rgba(56,189,248,0.25)" />
                <stop offset="100%" stopColor="rgba(56,189,248,0.06)" />
              </linearGradient>
              {/* Preenchimento "coluna d'água" — vermelho quando WARN */}
              <linearGradient id="wbcWaterWarn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="rgba(239,68,68,0.25)" />
                <stop offset="100%" stopColor="rgba(239,68,68,0.07)" />
              </linearGradient>
            </defs>

            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="transparent"
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={yDomain}
              stroke="transparent"
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={38}
              tickFormatter={v => `${v.toFixed(1)}`}
            />
            <XAxis
              dataKey="dateLabel"
              stroke="transparent"
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              dy={6}
              minTickGap={28}
            />
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="rgba(255,255,255,0.025)" />
            <Tooltip
              content={<CustomTooltip lineSeg={lineSeg} lineCrit={lineCrit} cc={cc} pm={pm} />}
              cursor={{ stroke: 'var(--color-surface-border2)', strokeWidth: 1, fill: 'rgba(255,255,255,0.015)' }}
            />

            {/* ── Linhas de referência ── */}
            {lineCC !== null && (
              <ReferenceLine yAxisId="right" y={lineCC}
                stroke="#60a5fa" strokeWidth={1.5} opacity={0.7}
                label={{ value: `CC ${lineCC.toFixed(1)}%`, position: 'insideBottomLeft', fill: '#60a5fa', fontSize: 9, dx: 6, dy: 12 }}
              />
            )}
            {lineSeg !== null && (
              <ReferenceLine yAxisId="right" y={lineSeg}
                stroke="#fb923c" strokeWidth={1.5} opacity={0.8}
                label={{ value: `Seg ${lineSeg.toFixed(1)}%`, position: 'insideBottomLeft', fill: '#fb923c', fontSize: 9, dx: 6, dy: 12 }}
              />
            )}
            {linePM !== null && (
              <ReferenceLine yAxisId="right" y={linePM}
                stroke="#ef4444" strokeWidth={1.5} opacity={0.7}
                label={{ value: `PM ${linePM.toFixed(1)}%`, position: 'insideBottomLeft', fill: '#ef4444', fontSize: 9, dx: 6, dy: 12 }}
              />
            )}
            {lineCrit !== null && (
              <ReferenceLine yAxisId="right" y={lineCrit}
                stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} opacity={0.55}
                label={{ value: `Alerta ${lineCrit.toFixed(1)}%`, position: 'insideBottomLeft', fill: '#f59e0b', fontSize: 9, dx: 6, dy: 12 }}
              />
            )}

            {/* Hidden DAS — só para tooltip */}
            <Line yAxisId="left" type="monotone" dataKey="das" name="DAS" stroke="transparent" dot={false} legendType="none" />

            {/* Chuva */}
            <Bar yAxisId="left" dataKey="rain" name="Chuva" fill="url(#wbcRainGrad)" radius={[3, 3, 0, 0]} maxBarSize={14} />

            {/* Irrigação */}
            {hasIrrigation && (
              <Bar yAxisId="left" dataKey="irr" name="Irrigação" fill="url(#wbcIrrGrad)" radius={[3, 3, 0, 0]} maxBarSize={14} />
            )}

            {/* ETo */}
            <Line
              yAxisId="left" type="monotone" dataKey="eto" name="ETo"
              stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.75}
              dot={{ r: 0 }} activeDot={{ r: 3, stroke: 'var(--color-surface-bg)', strokeWidth: 2 }}
            />

            {/* ETc */}
            <Line
              yAxisId="left" type="monotone" dataKey="etc" name="ETc"
              stroke="#22d3ee" strokeWidth={1.5} opacity={0.75}
              dot={{ r: 0 }} activeDot={{ r: 3, stroke: 'var(--color-surface-bg)', strokeWidth: 2 }}
            />

            {/* Área "coluna d'água" OK — azul oceano, da PM até a umidade atual */}
            {hasVolAxis && (
              <Area
                yAxisId="right" type="monotone" dataKey="umidVolOk" name="Umidade"
                stroke="#38bdf8" strokeWidth={2.5}
                fill="url(#wbcWaterOk)"
                dot={{ r: 0 }} activeDot={{ r: 4, stroke: 'var(--color-surface-bg)', strokeWidth: 2 }}
                connectNulls={false}
                baseValue={linePM ?? yMin}
              />
            )}
            {!hasVolAxis && (
              <Line
                yAxisId="right" type="monotone" dataKey="umidVolOk" name="Umidade"
                stroke="#38bdf8" strokeWidth={2.5}
                dot={{ r: 0 }} activeDot={{ r: 4, stroke: 'var(--color-surface-bg)', strokeWidth: 2 }}
                connectNulls={false}
              />
            )}

            {/* Área "coluna d'água" WARN — vermelha, da PM até a umidade atual */}
            {hasVolAxis && (
              <Area
                yAxisId="right" type="monotone" dataKey="umidVolWarn" name="Umidade ↓"
                stroke="#ef4444" strokeWidth={2.5}
                fill="url(#wbcWaterWarn)"
                dot={{ r: 0 }} activeDot={{ r: 4, stroke: 'var(--color-surface-bg)', strokeWidth: 2 }}
                connectNulls={false}
                baseValue={linePM ?? yMin}
              />
            )}
            {!hasVolAxis && (
              <Line
                yAxisId="right" type="monotone" dataKey="umidVolWarn" name="Umidade ↓"
                stroke="#ef4444" strokeWidth={2.5}
                dot={{ r: 0 }} activeDot={{ r: 4, stroke: 'var(--color-surface-bg)', strokeWidth: 2 }}
                connectNulls={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 20px 10px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: '#223344', letterSpacing: '0.03em' }}>EIXO DIREITO: % vol. umidade · EIXO ESQUERDO: mm</span>
      </div>
    </div>
  )
}

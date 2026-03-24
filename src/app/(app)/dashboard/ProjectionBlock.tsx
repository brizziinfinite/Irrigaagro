'use client'

import type { ProjectionDay } from '@/lib/water-balance'
import type { Season } from '@/types/database'

interface ProjectionBlockProps {
  projectionBySeason: Record<string, ProjectionDay[]>
  activeSeasons: Season[]
}

function pctColor(pct: number, threshold = 70): string {
  if (pct >= threshold) return '#22c55e'
  if (pct >= threshold - 10) return '#f59e0b'
  return '#ef4444'
}

export function ProjectionBlock({ projectionBySeason, activeSeasons }: ProjectionBlockProps) {
  // Merge all projections day by day (average across pivots)
  const dayMap = new Map<string, { pct: number[]; depth: number; speed: number | null }>()

  for (const season of activeSeasons) {
    const proj = projectionBySeason[season.id] ?? []
    for (const day of proj) {
      const existing = dayMap.get(day.date) ?? { pct: [], depth: 0, speed: null }
      existing.pct.push(day.fieldCapacityPercent)
      existing.depth = Math.max(existing.depth, day.recommendedDepthMm)
      if (day.recommendedSpeedPercent != null) existing.speed = day.recommendedSpeedPercent
      dayMap.set(day.date, existing)
    }
  }

  const days = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 7)
    .map(([date, d]) => ({
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      pct: d.pct.length > 0 ? d.pct.reduce((a, b) => a + b, 0) / d.pct.length : 0,
      depth: d.depth,
      speed: d.speed,
    }))

  const hasData = days.length > 0

  return (
    <div style={{
      background: '#0f1923',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: 18,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: '#556677',
        }}>
          Projeção 7 dias
        </span>
      </div>

      {!hasData ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date()
            d.setDate(d.getDate() + i + 1)
            const label = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 8,
                background: '#0d1520',
              }}>
                <span style={{ fontSize: 11, color: '#556677', width: 90, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 99 }} />
                <span style={{ fontSize: 11, color: '#556677', fontFamily: 'var(--font-mono)', width: 36, textAlign: 'right' }}>—</span>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {days.map(({ date, label, pct, depth, speed }) => {
            const color = pctColor(pct)
            const needsIrrig = depth > 0
            const barW = Math.min(100, Math.max(0, pct))

            return (
              <div key={date} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 8,
                background: needsIrrig ? `${color}0a` : '#0d1520',
                border: `1px solid ${needsIrrig ? `${color}25` : 'transparent'}`,
              }}>
                <span style={{
                  fontSize: 10, color: '#8899aa', width: 90, flexShrink: 0,
                  textTransform: 'capitalize',
                }}>
                  {label}
                </span>
                <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    width: `${barW}%`, height: '100%',
                    background: color, borderRadius: 99,
                    transition: 'width 0.4s',
                  }} />
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color, width: 36, textAlign: 'right', flexShrink: 0,
                }}>
                  {Math.round(pct)}%
                </span>
                {needsIrrig ? (
                  <span style={{
                    fontSize: 9, fontWeight: 700, color,
                    background: `${color}15`, border: `1px solid ${color}30`,
                    borderRadius: 4, padding: '2px 5px', flexShrink: 0, whiteSpace: 'nowrap',
                  }}>
                    {depth.toFixed(1)}mm{speed ? ` · ${speed}%` : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: 9, color: '#445566', width: 52, flexShrink: 0 }}>OK</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

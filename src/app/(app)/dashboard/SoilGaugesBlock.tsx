'use client'

import type { DailyManagement } from '@/types/database'

interface SoilGaugesBlockProps {
  pivots: Array<{ id: string; name: string; alert_threshold_percent?: number | null }>
  lastManagementByPivot: Record<string, DailyManagement>
  activePivotIds: Set<string>
}

function gaugeColor(pct: number, threshold: number): string {
  if (pct >= threshold) return '#22c55e'
  if (pct >= threshold - 10) return '#f59e0b'
  return '#ef4444'
}

function GaugeCircle({ pct, color, size = 110 }: { pct: number; color: string; size?: number }) {
  const r = size * 0.41
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x={cx} y={cy - 2} textAnchor="middle" fill="#e2e8f0" fontSize="22" fontWeight="700"
        fontFamily="var(--font-mono)" dominantBaseline="central">
        {Math.round(pct)}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#556677" fontSize="10">%</text>
    </svg>
  )
}

export function SoilGaugesBlock({ pivots, lastManagementByPivot, activePivotIds }: SoilGaugesBlockProps) {
  const activePivots = pivots.filter(p => activePivotIds.has(p.id))

  return (
    <div style={{
      background: '#0f1923',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      height: '100%',
    }}>
      {/* Header */}
      <span style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: '#556677',
      }}>
        Umidade do Solo
      </span>

      {activePivots.length === 0 ? (
        <p style={{ fontSize: 12, color: '#556677', textAlign: 'center', padding: '20px 0' }}>
          Nenhum pivô com safra ativa.
        </p>
      ) : (
        <>
          {/* Gauges */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center',
            flex: 1, alignItems: 'center',
          }}>
            {activePivots.map(pivot => {
              const m = lastManagementByPivot[pivot.id]
              const pct = m?.field_capacity_percent ?? null
              const threshold = pivot.alert_threshold_percent ?? 70
              const color = pct !== null ? gaugeColor(pct, threshold) : '#556677'

              return (
                <div key={pivot.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  {pct !== null ? (
                    <GaugeCircle pct={pct} color={color} />
                  ) : (
                    <svg width="110" height="110" viewBox="0 0 110 110">
                      <circle cx="55" cy="55" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
                      <text x="55" y="58" textAnchor="middle" fill="#556677" fontSize="14">—</text>
                    </svg>
                  )}
                  <span style={{
                    fontSize: 11, color: '#8899aa', fontWeight: 600,
                    textAlign: 'center', maxWidth: 110,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {pivot.name}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { color: '#22c55e', label: '>60%' },
              { color: '#f59e0b', label: '40-60%' },
              { color: '#ef4444', label: '<40%' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 10, color: '#556677' }}>{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

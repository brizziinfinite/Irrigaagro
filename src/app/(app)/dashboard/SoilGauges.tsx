'use client'

import type { DailyManagement } from '@/types/database'

interface SoilGaugesProps {
  pivots: Array<{ id: string; name: string; alert_threshold_percent?: number | null }>
  lastManagementByPivot: Record<string, DailyManagement>
  activePivotIds: Set<string>
}

function gaugeColor(pct: number, threshold: number): string {
  if (pct >= threshold) return '#22c55e'
  if (pct >= threshold - 10) return '#f59e0b'
  return '#ef4444'
}

function GaugeCircle({ pct, color }: { pct: number; color: string }) {
  const r = 45
  const circumference = 2 * Math.PI * r
  const offset = circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference

  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      {/* Track */}
      <circle cx="55" cy="55" r={r} fill="none" stroke="#1f3022" strokeWidth="7" />
      {/* Value arc */}
      <circle
        cx="55" cy="55" r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 55 55)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      {/* Texto central */}
      <text x="55" y="53" textAnchor="middle" fill="#ecefec" fontSize="22" fontWeight="700"
        fontFamily="var(--font-mono)">
        {Math.round(pct)}
      </text>
      <text x="55" y="68" textAnchor="middle" fill="#535c3e" fontSize="10">%</text>
    </svg>
  )
}

export function SoilGauges({ pivots, lastManagementByPivot, activePivotIds }: SoilGaugesProps) {
  const activePivots = pivots.filter(p => activePivotIds.has(p.id))

  return (
    <div style={{
      background: '#111f14',
      border: '1px solid #1f3022',
      borderRadius: 14,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: '#3a5240',
        }}>
          Umidade do Solo
        </span>
      </div>

      {activePivots.length === 0 ? (
        <p style={{ fontSize: 12, color: '#535c3e', textAlign: 'center', padding: '12px 0' }}>
          Nenhum pivô com safra ativa.
        </p>
      ) : (
        <>
          {/* Gauges */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'center',
          }}>
            {activePivots.map(pivot => {
              const m = lastManagementByPivot[pivot.id]
              const pct = m?.field_capacity_percent ?? null
              const threshold = pivot.alert_threshold_percent ?? 70
              const color = pct !== null ? gaugeColor(pct, threshold) : '#3a5240'

              return (
                <div key={pivot.id} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  {pct !== null ? (
                    <GaugeCircle pct={pct} color={color} />
                  ) : (
                    <svg width="110" height="110" viewBox="0 0 110 110">
                      <circle cx="55" cy="55" r="45" fill="none" stroke="#1f3022" strokeWidth="7" />
                      <text x="55" y="58" textAnchor="middle" fill="#3a5240" fontSize="14">—</text>
                    </svg>
                  )}
                  <span style={{
                    fontSize: 11, color: '#7a9e82', fontWeight: 600,
                    textAlign: 'center', maxWidth: 110,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {pivot.name}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Legenda */}
          <div style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}>
            {[
              { color: '#22c55e', label: 'Ideal' },
              { color: '#f59e0b', label: 'Atenção' },
              { color: '#ef4444', label: 'Crítico' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 10, color: '#535c3e' }}>{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

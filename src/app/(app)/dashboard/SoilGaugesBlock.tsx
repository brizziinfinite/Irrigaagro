'use client'

import type { DailyManagement } from '@/types/database'

interface SoilGaugesBlockProps {
  pivots: Array<{ id: string; name: string; alert_threshold_percent?: number | null }>
  lastManagementByPivot: Record<string, DailyManagement>
  activePivotIds: Set<string>
}

// Paleta unificada: Verde ≥75% | Âmbar 60–75% | Vermelho <60%
function gaugeColor(pct: number, _threshold: number): string {
  if (pct >= 75) return '#22c55e'
  if (pct >= 60) return '#f59e0b'
  return '#ef4444'
}

function GaugeCircle({ pct, color, size = 110 }: { pct: number; color: string; size?: number }) {
  const r = size * 0.41
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="7" />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <span style={{
          fontSize: 24, fontWeight: 900, color: '#fff',
          fontFamily: 'var(--font-mono)', lineHeight: 1, textShadow: `0 0 8px ${color}40`
        }}>
          {Math.round(pct)}
        </span>
        <span style={{ fontSize: 10, color: '#687b8d', fontWeight: 800, marginTop: 2 }}>%</span>
      </div>
    </div>
  )
}

export function SoilGaugesBlock({ pivots, lastManagementByPivot, activePivotIds }: SoilGaugesBlockProps) {
  const activePivots = pivots.filter(p => activePivotIds.has(p.id))

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(18,24,32,0.97), rgba(13,18,26,0.98))',
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(12px)',
      borderRadius: 20,
      padding: '26px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      height: '100%',
    }}>
      {/* Header */}
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.09em', color: '#556677',
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

          {/* Legend — based on pivot thresholds */}
          {(() => {
            const thresholds = activePivots.map(p => p.alert_threshold_percent ?? 70)
            const avgThreshold = thresholds.length > 0
              ? Math.round(thresholds.reduce((a, b) => a + b, 0) / thresholds.length)
              : 70
            return (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {[
                  { color: '#22c55e', label: '≥75%' },
                  { color: '#f59e0b', label: '60–75%' },
                  { color: '#ef4444', label: '<60%' },
                ].map(({ color, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 10, color: '#556677' }}>{label}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

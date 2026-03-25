'use client'

import type { DailyManagement } from '@/types/database'

interface CompactKpisProps {
  summary: {
    totalPivots: number
    activePivots: number
    handledToday: number
    pivotsWithAlerts: number
  }
  lastManagementBySeason: Record<string, DailyManagement>
}

function fmtVal(n: number | null | undefined, dec = 1): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(dec)
}

export function CompactKpis({ summary, lastManagementBySeason }: CompactKpisProps) {
  const managements = Object.values(lastManagementBySeason)
  const latest = managements.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null

  const aguaHoje = managements.reduce((sum, m) => sum + (m.recommended_depth_mm ?? 0), 0)

  // Economia: % water saved vs potential (simplified — show ratio of actual vs recommended)
  const totalRecommended = managements.reduce((s, m) => s + (m.recommended_depth_mm ?? 0), 0)
  const totalActual = managements.reduce((s, m) => s + (m.actual_depth_mm ?? 0), 0)
  const economiaPercent = totalRecommended > 0
    ? Math.max(0, Math.round(((totalRecommended - totalActual) / totalRecommended) * 100))
    : null

  // Horas operacionais (sum durations from recommended speeds)
  const totalHoras = managements.reduce((s, m) => {
    if (!m.recommended_speed_percent || m.recommended_speed_percent === 0) return s
    return s // We don't have time_360_h here, so just show handledToday
  }, 0)

  const kpis = [
    { label: 'Água Hoje', value: aguaHoje > 0 ? aguaHoje.toFixed(1) : '0', unit: 'mm', emoji: '💧', color: '#22d3ee' },
    { label: 'Economia', value: economiaPercent !== null ? `${economiaPercent}` : '—', unit: '%', emoji: '📉', color: '#22c55e' },
    { label: 'Horas Op.', value: String(summary.handledToday), unit: 'reg', emoji: '⏱', color: '#f59e0b' },
    { label: 'Alertas', value: String(summary.pivotsWithAlerts), unit: '', emoji: '⚠️', color: '#ef4444' },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr 1.5fr',
      gap: 12,
    }}>
      {/* 4 KPI cards */}
      {kpis.map(({ label, value, unit, emoji, color }) => (
        <div key={label} style={{
          background: '#0f1923',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: '#556677',
            }}>
              {label}
            </span>
            <span style={{ fontSize: 14 }}>{emoji}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{
              fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-mono)',
              color, lineHeight: 1,
            }}>
              {value}
            </span>
            {unit && (
              <span style={{ fontSize: 12, color: '#556677' }}>{unit}</span>
            )}
          </div>
        </div>
      ))}

      {/* Clima card */}
      <div style={{
        background: '#0f1923',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8,
      }}>
        {/* Temp */}
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Temp
          </span>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f59e0b', lineHeight: 1 }}>
              {latest?.temp_max != null ? `${Math.round(latest.temp_max)}°` : '—'}
            </span>
          </div>
          <span style={{ fontSize: 10, color: '#556677' }}>
            min {latest?.temp_min != null ? `${Math.round(latest.temp_min)}°` : '—'}
          </span>
        </div>

        {/* Umid Ar */}
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Umid. Ar
          </span>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#22d3ee', lineHeight: 1 }}>
              {latest?.humidity_percent != null ? `${Math.round(latest.humidity_percent)}%` : '—'}
            </span>
          </div>
          <span style={{ fontSize: 10, color: '#556677' }}>
            vento {latest?.wind_speed_ms != null ? fmtVal(latest.wind_speed_ms, 0) : '—'}
          </span>
        </div>

        {/* ETo */}
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            ETo
          </span>
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#a78bfa', lineHeight: 1 }}>
              {latest?.eto_mm != null ? fmtVal(latest.eto_mm) : '—'}
            </span>
          </div>
          <span style={{ fontSize: 10, color: '#556677' }}>mm/dia</span>
        </div>
      </div>
    </div>
  )
}

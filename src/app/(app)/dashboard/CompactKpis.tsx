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

  // Economia: % water saved vs potential — negative means over-irrigation
  const totalRecommended = managements.reduce((s, m) => s + (m.recommended_depth_mm ?? 0), 0)
  const totalActual = managements.reduce((s, m) => s + (m.actual_depth_mm ?? 0), 0)
  const economiaPercent = totalRecommended > 0
    ? Math.round(((totalRecommended - totalActual) / totalRecommended) * 100)
    : null

  // Horas operacionais (sum durations from recommended speeds)
  const totalHoras = managements.reduce((s, m) => {
    if (!m.recommended_speed_percent || m.recommended_speed_percent === 0) return s
    return s // We don't have time_360_h here, so just show handledToday
  }, 0)

  const kpis = [
    { label: 'Água Hoje', value: aguaHoje > 0 ? aguaHoje.toFixed(1) : '0', unit: 'mm', emoji: '💧', color: '#00E5FF' }, // Ciano Neon
    { label: 'Economia', value: economiaPercent !== null ? `${economiaPercent}` : '—', unit: '%', emoji: '📉', color: economiaPercent !== null && economiaPercent < 0 ? '#FF3366' : '#39FF14' }, // Limão Neon / Rosa Neon
    { label: 'Manejos', value: String(summary.handledToday), unit: '', emoji: '⏱', color: '#FFEA00' }, // Amarelo Elétrico
    { label: 'Alertas', value: String(summary.pivotsWithAlerts), unit: '', emoji: '⚠️', color: '#FF3366' }, // Rosa Neon
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 16,
    }}>
      {/* 4 KPI cards */}
      {kpis.map(({ label, value, unit, emoji, color }) => (
        <div key={label} style={{
          background: 'linear-gradient(145deg, rgba(22, 27, 33, 0.9), rgba(15, 19, 24, 0.95))',
          border: `1px solid rgba(255,255,255,0.03)`,
          borderTop: `1px solid ${color}30`, // Subtle top glowing border
          borderRadius: 20,
          padding: '20px 24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: '#687b8d',
            }}>
              {label}
            </span>
            <span style={{ fontSize: 16, opacity: 0.8 }}>{emoji}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontSize: 34, fontWeight: 900, fontFamily: 'var(--font-mono)',
              color, lineHeight: 1, letterSpacing: '-0.03em',
              textShadow: `0 0 20px ${color}66`, // Mega Glow
            }}>
              {value}
            </span>
            {unit && (
              <span style={{ fontSize: 14, fontWeight: 700, color: '#687b8d' }}>{unit}</span>
            )}
          </div>
        </div>
      ))}

      {/* Clima card */}
      <div style={{
        background: 'linear-gradient(145deg, rgba(22, 27, 33, 0.9), rgba(15, 19, 24, 0.95))',
        border: '1px solid rgba(255,255,255,0.03)',
        borderRadius: 20,
        padding: '20px 24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 16,
        gridColumn: '1 / -1', // span as full row on mobile and large setups
      }}>
        {/* Temp */}
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Temp
          </span>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 900, fontFamily: 'var(--font-mono)', color: '#FFEA00', lineHeight: 1, textShadow: '0 0 16px rgba(255,234,0,0.4)' }}>
              {latest?.temp_max != null ? `${Math.round(latest.temp_max)}°` : '—'}
            </span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#556677', marginTop: 4, display: 'block' }}>
            min {latest?.temp_min != null ? `${Math.round(latest.temp_min)}°` : '—'}
          </span>
        </div>

        {/* Umid Ar */}
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Umidade
          </span>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 900, fontFamily: 'var(--font-mono)', color: '#00E5FF', lineHeight: 1, textShadow: '0 0 16px rgba(0,229,255,0.4)' }}>
              {latest?.humidity_percent != null ? `${Math.round(latest.humidity_percent)}%` : '—'}
            </span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#556677', marginTop: 4, display: 'block' }}>
            vento {latest?.wind_speed_ms != null ? fmtVal(latest.wind_speed_ms, 0) : '—'}
          </span>
        </div>

        {/* ETo */}
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            ETo Total
          </span>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 900, fontFamily: 'var(--font-mono)', color: '#B542FF', lineHeight: 1, textShadow: '0 0 16px rgba(181,66,255,0.4)' }}>
              {latest?.eto_mm != null ? fmtVal(latest.eto_mm) : '—'}
            </span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#556677', marginTop: 4, display: 'block' }}>mm/dia</span>
        </div>
      </div>
    </div>
  )
}

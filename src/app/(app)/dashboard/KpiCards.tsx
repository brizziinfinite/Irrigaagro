'use client'

import { Droplets, CircleDot, ClipboardCheck, AlertTriangle } from 'lucide-react'
import type { DailyManagement } from '@/types/database'

interface KpiCardsProps {
  summary: {
    totalPivots: number
    activePivots: number
    handledToday: number
    pivotsWithAlerts: number
    aguaHojeMm: number
  }
  lastManagementBySeason: Record<string, DailyManagement>
}

export function KpiCards({ summary }: KpiCardsProps) {
  const aguaHoje = summary.aguaHojeMm

  const cards = [
    {
      label: 'Água Hoje',
      value: aguaHoje > 0 ? aguaHoje.toFixed(1) : '0',
      unit: 'mm',
      subtitle: 'Lâmina recomendada total',
      color: '#22d3ee',
      Icon: Droplets,
    },
    {
      label: 'Pivôs Ativos',
      value: String(summary.activePivots),
      unit: `de ${summary.totalPivots}`,
      subtitle: 'Com safra em andamento',
      color: '#22c55e',
      Icon: CircleDot,
    },
    {
      label: 'Manejo Hoje',
      value: String(summary.handledToday),
      unit: `de ${summary.totalPivots}`,
      subtitle: 'Registros do dia',
      color: '#f59e0b',
      Icon: ClipboardCheck,
    },
    {
      label: 'Alertas',
      value: String(summary.pivotsWithAlerts),
      unit: summary.pivotsWithAlerts === 1 ? 'pivô' : 'pivôs',
      subtitle: 'Atenção operacional',
      color: summary.pivotsWithAlerts > 0 ? '#ef4444' : '#778899',
      Icon: AlertTriangle,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(({ label, value, unit, subtitle, color, Icon }) => (
        <div key={label} style={{
          background: 'linear-gradient(145deg, rgba(18,24,32,0.95), rgba(13,18,26,0.98))',
          border: '1px solid rgba(255,255,255,0.06)',
          borderTop: `1px solid ${color}25`,
          borderRadius: 16,
          padding: '16px 16px 14px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Ambient glow */}
          <div style={{
            position: 'absolute', top: -20, right: -20, width: 80, height: 80,
            borderRadius: '50%', pointerEvents: 'none',
            background: `radial-gradient(circle, ${color}10 0%, transparent 70%)`,
          }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              color: '#94a3b8',
              lineHeight: 1.4,
            }}>
              {label}
            </span>
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: `${color}15`,
              border: `1px solid ${color}28`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={15} style={{ color }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <span className="text-3xl sm:text-4xl" style={{
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              textShadow: `0 0 20px ${color}40`,
            }}>
              {value}
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{unit}</span>
          </div>

          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, lineHeight: 1.625, fontWeight: 500 }}>{subtitle}</p>
        </div>
      ))}
    </div>
  )
}

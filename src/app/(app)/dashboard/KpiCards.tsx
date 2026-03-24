'use client'

import { Droplets, CircleDot, ClipboardCheck, AlertTriangle } from 'lucide-react'
import type { DailyManagement } from '@/types/database'

interface KpiCardsProps {
  summary: {
    totalPivots: number
    activePivots: number
    handledToday: number
    pivotsWithAlerts: number
  }
  lastManagementBySeason: Record<string, DailyManagement>
}

export function KpiCards({ summary, lastManagementBySeason }: KpiCardsProps) {
  const aguaHoje = Object.values(lastManagementBySeason)
    .reduce((sum, m) => sum + (m.recommended_depth_mm ?? 0), 0)

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
      color: '#ef4444',
      Icon: AlertTriangle,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(({ label, value, unit, subtitle, color, Icon }) => (
        <div key={label} style={{
          background: '#0f1923',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#556677',
            }}>
              {label}
            </span>
            <Icon size={14} style={{ color }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{
              fontSize: 32,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color,
              lineHeight: 1,
            }}>
              {value}
            </span>
            <span style={{ fontSize: 11, color: '#556677' }}>{unit}</span>
          </div>
          <p style={{ fontSize: 11, color: '#556677', marginTop: 4 }}>{subtitle}</p>
        </div>
      ))}
    </div>
  )
}

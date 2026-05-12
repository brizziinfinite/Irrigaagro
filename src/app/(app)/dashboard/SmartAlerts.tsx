'use client'

import Link from 'next/link'
import { AlertTriangle, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import type { DailyManagement } from '@/types/database'
import type { PivotDiagnostic } from '@/services/pivot-diagnostics'

interface SmartAlertsProps {
  pivots: Array<{ id: string; name: string; alert_threshold_percent?: number | null }>
  lastManagementByPivot: Record<string, DailyManagement>
  diagnosticsByPivot: Record<string, PivotDiagnostic>
  activePivotIds: Set<string>
}

type AlertTipo = 'urgente' | 'aviso' | 'info'

interface AlertItem {
  tipo: AlertTipo
  msg: string
  pivotId: string
}

const ALERT_CONFIG: Record<AlertTipo, { color: string; bg: string; border: string; Icon: typeof AlertCircle }> = {
  urgente: { color: '#ef4444', bg: 'rgb(239 68 68 / 0.08)',  border: 'rgb(239 68 68 / 0.2)',  Icon: AlertCircle   },
  aviso:   { color: '#f59e0b', bg: 'rgb(245 158 11 / 0.08)', border: 'rgb(245 158 11 / 0.2)', Icon: AlertTriangle },
  info:    { color: '#22d3ee', bg: 'rgb(34 211 238 / 0.08)', border: 'rgb(34 211 238 / 0.2)', Icon: CheckCircle2  },
}

export function SmartAlerts({ pivots, lastManagementByPivot, diagnosticsByPivot, activePivotIds }: SmartAlertsProps) {
  const alerts: AlertItem[] = []

  for (const pivot of pivots) {
    if (!activePivotIds.has(pivot.id)) continue
    const m = lastManagementByPivot[pivot.id]
    const pct = m?.field_capacity_percent ?? null
    const diag = diagnosticsByPivot[pivot.id]

    // Paleta unificada: <60% = urgente | 60–75% = aviso | ≥75% = info
    if (pct !== null && pct < 60) {
      alerts.push({ tipo: 'urgente', msg: `${pivot.name} — solo a ${pct.toFixed(0)}% — irrigar imediatamente`, pivotId: pivot.id })
    } else if (pct !== null && pct < 75) {
      alerts.push({ tipo: 'aviso', msg: `${pivot.name} — solo a ${pct.toFixed(0)}% — irrigar nos próximos 2 dias`, pivotId: pivot.id })
    } else if (pct !== null) {
      alerts.push({ tipo: 'info', msg: `${pivot.name} — solo a ${pct.toFixed(0)}% — confortável`, pivotId: pivot.id })
    }

    if (diag?.alerts?.length > 0) {
      for (const alert of diag.alerts) {
        alerts.push({ tipo: 'aviso', msg: `${pivot.name} — ${alert}`, pivotId: pivot.id })
      }
    }
  }

  return (
    <div style={{
      background: 'var(--color-surface-card)',
      border: '1px solid var(--color-surface-border2)',
      borderRadius: 14,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Info size={12} style={{ color: '#f59e0b' }} />
        <span style={{
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.16em', color: '#cbd5e1',
        }}>
          Alertas Inteligentes
        </span>
        {alerts.length > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 700,
            background: 'rgb(239 68 68 / 0.12)', color: '#ef4444',
            border: '1px solid rgb(239 68 68 / 0.25)',
            borderRadius: 99, padding: '1px 7px',
          }}>
            {alerts.filter(a => a.tipo === 'urgente').length > 0
              ? `${alerts.filter(a => a.tipo === 'urgente').length} urgente(s)`
              : `${alerts.length}`}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.625 }}>Nenhum alerta no momento.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((alert, i) => {
            const cfg = ALERT_CONFIG[alert.tipo]
            const Icon = cfg.Icon
            return (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '9px 12px',
                borderRadius: 10,
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
              }}>
                <Icon size={13} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 14, color: '#94a3b8', flex: 1, lineHeight: 1.625 }}>
                  {alert.msg}
                </span>
                {alert.tipo === 'urgente' && (
                  <Link href="/manejo" style={{
                    flexShrink: 0,
                    fontSize: 11, fontWeight: 700,
                    color: '#ef4444',
                    background: 'rgb(239 68 68 / 0.12)',
                    border: '1px solid rgb(239 68 68 / 0.25)',
                    borderRadius: 6,
                    padding: '3px 8px',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}>
                    Irrigar Agora
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

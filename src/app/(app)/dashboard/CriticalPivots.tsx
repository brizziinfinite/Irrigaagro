'use client'

import Link from 'next/link'
import type { DailyManagement, Pivot } from '@/types/database'
import type { PivotDiagnostic } from '@/services/pivot-diagnostics'

interface CriticalPivotsProps {
  pivots: Array<Pivot & { farms: { id: string; name: string } | null }>
  lastManagementByPivot: Record<string, DailyManagement>
  activePivotIds: Set<string>
  diagnosticsByPivot: Record<string, PivotDiagnostic>
}

type PivotStatus = 'critico' | 'atencao' | 'ok'

const STATUS_STYLE: Record<PivotStatus, { color: string; bg: string; border: string; label: string }> = {
  critico: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', label: 'URGENTE' },
  atencao: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', label: 'ATENÇÃO' },
  ok:      { color: '#22c55e', bg: '#141e2b',                border: 'rgba(255,255,255,0.06)', label: '' },
}

export function CriticalPivots({ pivots, lastManagementByPivot, activePivotIds, diagnosticsByPivot }: CriticalPivotsProps) {
  const items: Array<{
    pivot: Pivot & { farms: { id: string; name: string } | null }
    pct: number | null
    status: PivotStatus
    diag: PivotDiagnostic | null
  }> = []

  for (const pivot of pivots) {
    if (!activePivotIds.has(pivot.id)) continue
    const m = lastManagementByPivot[pivot.id]
    const threshold = pivot.alert_threshold_percent ?? 70
    const pct = m?.field_capacity_percent ?? null
    let status: PivotStatus = 'ok'
    if (pct !== null && pct < threshold - 10) status = 'critico'
    else if (pct !== null && pct < threshold) status = 'atencao'
    items.push({ pivot, pct, status, diag: diagnosticsByPivot[pivot.id] ?? null })
  }

  // Sort: critico first, then atencao, then ok
  const order: Record<PivotStatus, number> = { critico: 0, atencao: 1, ok: 2 }
  items.sort((a, b) => order[a.status] - order[b.status])

  const urgentCount = items.filter(i => i.status === 'critico').length

  return (
    <div style={{
      background: '#0f1923',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      height: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: '#556677',
        }}>
          Pivôs Críticos
        </span>
        {urgentCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            background: 'rgba(239,68,68,0.12)', color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 99, padding: '2px 8px',
          }}>
            {urgentCount} urgente{urgentCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: '#556677', padding: '16px 0', textAlign: 'center' }}>
          Nenhum pivô com safra ativa.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(({ pivot, pct, status }) => {
            const s = STATUS_STYLE[status]
            return (
              <div key={pivot.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12,
                background: s.bg, border: `1px solid ${s.border}`,
              }}>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{pivot.name}</span>
                    {s.label && (
                      <span style={{
                        fontSize: 8, fontWeight: 800, color: s.color,
                        background: `${s.color}20`, border: `1px solid ${s.color}40`,
                        borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {s.label}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: '#556677', marginTop: 2 }}>
                    {pivot.farms?.name ?? ''}
                  </p>
                </div>

                {/* Percentage */}
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <span style={{
                    fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)',
                    color: s.color, lineHeight: 1,
                  }}>
                    {pct !== null ? `${Math.round(pct)}%` : '—'}
                  </span>
                  <p style={{ fontSize: 9, color: '#556677', marginTop: 2 }}>umidade</p>
                </div>

                {/* Action */}
                {status === 'critico' ? (
                  <Link href="/manejo" style={{
                    fontSize: 11, fontWeight: 700, color: '#ef4444',
                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 8, padding: '6px 12px', textDecoration: 'none',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    Irrigar →
                  </Link>
                ) : status === 'atencao' ? (
                  <Link href="/manejo" style={{
                    fontSize: 11, fontWeight: 700, color: '#f59e0b',
                    background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: 8, padding: '6px 12px', textDecoration: 'none',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    Ver pivô →
                  </Link>
                ) : (
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: '#22c55e',
                    flexShrink: 0,
                  }}>
                    {pct !== null ? `${Math.round(pct)}%` : ''}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

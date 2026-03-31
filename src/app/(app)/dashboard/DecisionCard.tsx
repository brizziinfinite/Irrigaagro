'use client'

import Link from 'next/link'
import { Droplets, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import type { DailyManagement, Pivot, Season } from '@/types/database'

interface DecisionCardProps {
  pivots: Array<Pivot & { farms: { id: string; name: string } | null }>
  activeSeasons: Season[]
  lastManagementByPivot: Record<string, DailyManagement>
  summary: {
    totalPivots: number
    activePivots: number
    handledToday: number
    pivotsWithAlerts: number
  }
}

export function DecisionCard({ pivots, activeSeasons, lastManagementByPivot, summary }: DecisionCardProps) {
  const activePivotIds = new Set(activeSeasons.map(s => s.pivot_id).filter(Boolean))

  let criticos = 0
  let atencao = 0
  let ok = 0

  for (const pivot of pivots) {
    if (!activePivotIds.has(pivot.id)) continue
    const m = lastManagementByPivot[pivot.id]
    const threshold = pivot.alert_threshold_percent ?? 70
    const warningPct = threshold * 1.15  // ×1,15 alinhado ao getIrrigationStatus
    const pct = m?.field_capacity_percent ?? null
    if (pct === null) { ok++; continue }
    if (pct < threshold) criticos++
    else if (pct < warningPct) atencao++
    else ok++
  }

  const needsIrrigation = criticos > 0 || atencao > 0
  const noPivots = summary.activePivots === 0

  const bg = noPivots
    ? '#0f1923'
    : needsIrrigation
      ? 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(245,158,11,0.06))'
      : 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,211,238,0.04))'

  const borderColor = noPivots
    ? 'rgba(255,255,255,0.06)'
    : needsIrrigation
      ? 'rgba(239,68,68,0.2)'
      : 'rgba(34,197,94,0.2)'

  const mainColor = noPivots ? '#556677' : needsIrrigation ? '#ef4444' : '#22c55e'
  const Icon = needsIrrigation ? AlertCircle : CheckCircle2

  return (
    <div style={{
      background: bg,
      border: `1px solid ${borderColor}`,
      borderRadius: 16,
      padding: '22px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
        {/* Icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: `${mainColor}18`,
          border: `1px solid ${mainColor}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={24} style={{ color: mainColor }} />
        </div>

        {/* Text */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 22, fontWeight: 800, color: mainColor,
              letterSpacing: '-0.01em', lineHeight: 1.2,
            }}>
              {noPivots ? 'SEM SAFRA ATIVA' : needsIrrigation ? 'IRRIGAR HOJE: SIM' : 'IRRIGAR HOJE: NÃO'}
            </span>
            {criticos > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 99, padding: '3px 10px',
              }}>
                {criticos} crítico{criticos > 1 ? 's' : ''}
              </span>
            )}
            {atencao > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 99, padding: '3px 10px',
              }}>
                {atencao} atenção
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#8899aa', marginTop: 4 }}>
            {noPivots
              ? 'Configure uma safra para iniciar o monitoramento.'
              : needsIrrigation
                ? `${criticos + atencao} de ${summary.activePivots} pivô${summary.activePivots > 1 ? 's' : ''} precisa${criticos + atencao > 1 ? 'm' : ''} de irrigação`
                : `${ok} pivô${ok > 1 ? 's' : ''} com umidade adequada · ${summary.handledToday} manejo(s) hoje`}
          </p>
        </div>
      </div>

      {/* CTA */}
      <Link href="/manejo" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
        background: needsIrrigation
          ? 'linear-gradient(135deg, #b91c1c, #ef4444)'
          : 'linear-gradient(135deg, #005A8C, #0093D0)',
        color: '#fff', textDecoration: 'none', flexShrink: 0,
        boxShadow: needsIrrigation
          ? '0 4px 16px rgba(239,68,68,0.3)'
          : '0 4px 16px rgba(0,147,208,0.3)',
      }}>
        <Droplets size={14} />
        Manejo Diário
        <ArrowRight size={14} />
      </Link>
    </div>
  )
}

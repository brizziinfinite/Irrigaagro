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

  const textShadowGlow = needsIrrigation 
    ? '0 0 20px rgba(255, 51, 102, 0.4)' 
    : noPivots ? 'none' : '0 0 20px rgba(0, 229, 255, 0.4)'

  return (
    <div className="p-4 sm:p-6" style={{
      background: 'linear-gradient(145deg, rgba(22, 27, 33, 0.9), rgba(15, 19, 24, 0.95))',
      border: `1px solid rgba(255,255,255,0.03)`,
      borderTop: `1px solid ${mainColor}40`,
      borderRadius: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        {/* Glow Icon Container — oculto no mobile para dar espaço ao texto */}
        <div className="hidden sm:flex w-[52px] h-[52px]" style={{
          borderRadius: 14, flexShrink: 0,
          background: `${mainColor}1A`,
          border: `1px solid ${mainColor}40`,
          boxShadow: `inset 0 0 16px ${mainColor}20, 0 0 16px ${mainColor}20`,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={26} style={{ color: mainColor, filter: `drop-shadow(0 0 6px ${mainColor})` }} />
        </div>

        {/* Deep Typography */}
        <div style={{ minWidth: 0 }}>
          <span className="text-lg sm:text-xl" style={{
            display: 'block', fontWeight: 900, color: mainColor,
            letterSpacing: '-0.02em', lineHeight: 1.2,
            textShadow: textShadowGlow,
          }}>
            {noPivots ? 'SEM SAFRA ATIVA' : needsIrrigation ? 'IRRIGAR HOJE: SIM' : 'IRRIGAR HOJE: NÃO'}
          </span>
          {/* Badges numa linha separada */}
          {(criticos > 0 || atencao > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {criticos > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: 'rgba(255,51,102,0.15)', color: '#FF3366',
                  border: '1px solid rgba(255,51,102,0.3)',
                  borderRadius: 99, padding: '2px 8px',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {criticos} crítico{criticos > 1 ? 's' : ''}
                </span>
              )}
              {atencao > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: 'rgba(255,234,0,0.15)', color: '#FFEA00',
                  border: '1px solid rgba(255,234,0,0.3)',
                  borderRadius: 99, padding: '2px 8px',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {atencao} atenção
                </span>
              )}
            </div>
          )}
          <p style={{ fontSize: 12, fontWeight: 600, color: '#687b8d', marginTop: 4 }}>
            {noPivots
              ? 'Configure uma safra para iniciar o monitoramento.'
              : needsIrrigation
                ? `${criticos + atencao} de ${summary.activePivots} pivô${summary.activePivots > 1 ? 's' : ''} precisa${criticos + atencao > 1 ? 'm' : ''} de irrigação`
                : `${ok} pivô${ok > 1 ? 's' : ''} com umidade adequada · ${summary.handledToday} manejo(s) hoje`}
          </p>
        </div>
      </div>

      {/* Cyberpunk Glow CTA */}
      <Link href="/manejo" className="w-full sm:w-auto justify-center" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '11px 20px', borderRadius: 12, fontSize: 13, fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.04em',
        background: needsIrrigation
          ? 'linear-gradient(135deg, #FF3366, #E60039)'
          : 'linear-gradient(135deg, #00B4D8, #00E5FF)',
        color: needsIrrigation ? '#FFFFFF' : '#0F1923',
        textDecoration: 'none', flexShrink: 0,
        boxShadow: needsIrrigation
          ? '0 6px 24px rgba(255,51,102,0.5)'
          : '0 6px 24px rgba(0,229,255,0.4)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <Droplets size={15} strokeWidth={2.5} />
        Manejo Diário
        <ArrowRight size={15} strokeWidth={2.5} />
      </Link>
    </div>
  )
}

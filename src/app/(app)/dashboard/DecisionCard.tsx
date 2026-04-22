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
  const criticoNames: string[] = []
  const atencaoNames: string[] = []

  for (const pivot of pivots) {
    if (!activePivotIds.has(pivot.id)) continue
    const m = lastManagementByPivot[pivot.id]
    const threshold = pivot.alert_threshold_percent ?? 70
    const warningPct = pivot.irrigation_target_percent ?? (threshold * 1.15)
    const pct = m?.field_capacity_percent ?? null
    if (pct === null) { ok++; continue }
    if (pct < threshold) { criticos++; criticoNames.push(pivot.name) }
    else if (pct < warningPct) { atencao++; atencaoNames.push(pivot.name) }
    else ok++
  }

  // Nomes dos pivôs que precisam de ação
  const urgentNames = [...criticoNames, ...atencaoNames]

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

  const glowShadow = needsIrrigation
    ? '0 0 40px rgba(239,68,68,0.12), 0 12px 40px rgba(0,0,0,0.5)'
    : noPivots ? '0 8px 32px rgba(0,0,0,0.4)'
    : '0 0 40px rgba(34,197,94,0.08), 0 12px 40px rgba(0,0,0,0.5)'

  return (
    <div style={{
      background: needsIrrigation
        ? 'linear-gradient(145deg, rgba(30, 16, 18, 0.97), rgba(15, 19, 24, 0.98))'
        : noPivots
          ? 'linear-gradient(145deg, rgba(18, 22, 28, 0.97), rgba(12, 16, 21, 0.98))'
          : 'linear-gradient(145deg, rgba(14, 22, 18, 0.97), rgba(12, 17, 22, 0.98))',
      border: `1px solid ${needsIrrigation ? 'rgba(239,68,68,0.18)' : noPivots ? 'rgba(255,255,255,0.05)' : 'rgba(34,197,94,0.15)'}`,
      borderTop: `2px solid ${mainColor}60`,
      borderRadius: 20,
      padding: '28px 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 20,
      flexWrap: 'wrap',
      boxShadow: glowShadow,
      backdropFilter: 'blur(16px)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow top-left ambient */}
      <div style={{
        position: 'absolute', top: -60, left: -40, width: 200, height: 200,
        borderRadius: '50%', pointerEvents: 'none',
        background: `radial-gradient(circle, ${mainColor}12 0%, transparent 70%)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0, position: 'relative' }}>
        {/* Glow Icon Container */}
        <div className="hidden sm:flex" style={{
          width: 64, height: 64,
          borderRadius: 18, flexShrink: 0,
          background: `${mainColor}15`,
          border: `1px solid ${mainColor}35`,
          boxShadow: `inset 0 0 20px ${mainColor}15, 0 0 24px ${mainColor}20`,
          alignItems: 'center', justifyContent: 'center',
          display: 'flex',
        }}>
          <Icon size={30} style={{ color: mainColor, filter: `drop-shadow(0 0 8px ${mainColor})` }} />
        </div>

        {/* Deep Typography */}
        <div style={{ minWidth: 0 }}>
          <span className="text-2xl sm:text-3xl" style={{
            display: 'block', fontWeight: 900, color: mainColor,
            letterSpacing: '-0.03em', lineHeight: 1.1,
            textShadow: textShadowGlow,
          }}>
            {noPivots ? 'SEM SAFRA ATIVA' : needsIrrigation ? 'IRRIGAR HOJE: SIM' : 'IRRIGAR HOJE: NÃO'}
          </span>

          {/* Badges */}
          {(criticos > 0 || atencao > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {criticos > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: 'rgba(255,51,102,0.15)', color: '#FF3366',
                  border: '1px solid rgba(255,51,102,0.3)',
                  borderRadius: 99, padding: '3px 10px',
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
                  borderRadius: 99, padding: '3px 10px',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {atencao} atenção
                </span>
              )}
            </div>
          )}

          {/* Pivot names or subtitle */}
          {needsIrrigation && !noPivots ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              {criticoNames.map(name => (
                <span key={name} style={{
                  fontSize: 13, fontWeight: 700,
                  color: '#ef4444',
                  textShadow: '0 0 14px rgba(239,68,68,0.6)',
                  letterSpacing: '0.01em',
                }}>
                  {name}
                </span>
              ))}
              {atencaoNames.map(name => (
                <span key={name} style={{
                  fontSize: 13, fontWeight: 700,
                  color: '#f59e0b',
                  textShadow: '0 0 14px rgba(245,158,11,0.6)',
                  letterSpacing: '0.01em',
                }}>
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, fontWeight: 500, color: '#687b8d', marginTop: 6, lineHeight: 1.5 }}>
              {noPivots
                ? 'Configure uma safra para iniciar o monitoramento.'
                : `${ok} pivô${ok > 1 ? 's' : ''} com umidade adequada · ${summary.handledToday} manejo(s) hoje`}
            </p>
          )}
        </div>
      </div>

      {/* CTA */}
      <Link href="/manejo" style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '13px 24px', borderRadius: 14, fontSize: 13, fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        background: needsIrrigation
          ? 'linear-gradient(135deg, #FF3366, #E60039)'
          : 'linear-gradient(135deg, #00B4D8, #00E5FF)',
        color: needsIrrigation ? '#FFFFFF' : '#0F1923',
        textDecoration: 'none', flexShrink: 0,
        boxShadow: needsIrrigation
          ? '0 6px 28px rgba(255,51,102,0.5)'
          : '0 6px 28px rgba(0,229,255,0.4)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
      }}>
        <Droplets size={16} strokeWidth={2.5} />
        Manejo Diário
        <ArrowRight size={16} strokeWidth={2.5} />
      </Link>
    </div>
  )
}

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

  // Usa needs_irrigation do banco — mesma fonte que a seção Recomendações
  // Garante consistência: se recomendações dizem "em 3 dias", banner também diz NÃO
  let criticos = 0
  let atencao = 0
  let ok = 0
  const criticoNames: string[] = []
  const atencaoNames: string[] = []

  for (const pivot of pivots) {
    if (!activePivotIds.has(pivot.id)) continue
    const m = lastManagementByPivot[pivot.id]

    if (m?.needs_irrigation) {
      // needs_irrigation=true → irrigar hoje (urgente)
      criticos++
      criticoNames.push(pivot.name)
    } else {
      // Sem dado ou não precisa hoje — verificar threshold para "atenção" (abaixo do threshold mas cron não confirmou)
      const pct = m?.field_capacity_percent ?? null
      const threshold = pivot.alert_threshold_percent ?? 70
      if (pct !== null && pct < threshold) {
        atencao++
        atencaoNames.push(pivot.name)
      } else {
        ok++
      }
    }
  }

  // criticos = needs_irrigation true (cron confirmou)
  // atencao  = abaixo do threshold mas cron não confirmou irrigação hoje
  const needsIrrigationToday = criticos > 0
  const needsAttention = atencao > 0
  const noPivots = summary.activePivots === 0

  const mainColor = noPivots ? '#778899'
    : needsIrrigationToday ? '#ef4444'
    : needsAttention ? '#f59e0b'
    : '#22c55e'

  const Icon = (needsIrrigationToday || needsAttention) ? AlertCircle : CheckCircle2

  const glowShadow = needsIrrigationToday
    ? '0 0 24px rgba(239,68,68,0.08), 0 12px 40px rgba(0,0,0,0.5)'
    : noPivots ? '0 8px 32px rgba(0,0,0,0.4)'
    : needsAttention ? '0 0 24px rgba(245,158,11,0.08), 0 12px 40px rgba(0,0,0,0.5)'
    : '0 0 24px rgba(34,197,94,0.06), 0 12px 40px rgba(0,0,0,0.5)'

  const textShadowGlow = needsIrrigationToday
    ? '0 0 16px rgba(220, 38, 38, 0.3)'
    : needsAttention ? '0 0 16px rgba(245,158,11,0.3)'
    : noPivots ? 'none' : '0 0 16px rgba(34, 197, 94, 0.25)'

  const bgGradient = needsIrrigationToday
    ? 'linear-gradient(145deg, rgba(30, 16, 18, 0.97), rgba(15, 19, 24, 0.98))'
    : needsAttention
      ? 'linear-gradient(145deg, rgba(28, 22, 14, 0.97), rgba(15, 19, 24, 0.98))'
      : noPivots
        ? 'linear-gradient(145deg, rgba(18, 22, 28, 0.97), rgba(12, 16, 21, 0.98))'
        : 'linear-gradient(145deg, rgba(14, 22, 18, 0.97), rgba(12, 17, 22, 0.98))'

  const borderVal = needsIrrigationToday ? 'rgba(239,68,68,0.18)'
    : needsAttention ? 'rgba(245,158,11,0.18)'
    : noPivots ? 'rgba(255,255,255,0.05)'
    : 'rgba(34,197,94,0.15)'

  const headlineText = noPivots ? 'SEM SAFRA ATIVA'
    : needsIrrigationToday ? 'IRRIGAR HOJE: SIM'
    : needsAttention ? 'ATENÇÃO: SOLO SECO'
    : 'IRRIGAR HOJE: NÃO'

  const hasAction = needsIrrigationToday || needsAttention

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between" style={{
      background: bgGradient,
      border: `1px solid ${borderVal}`,
      borderTop: `2px solid ${mainColor}60`,
      borderRadius: 20,
      padding: '24px 20px',
      gap: 16,
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
        {/* Icon Container */}
        <div className="hidden sm:flex" style={{
          width: 64, height: 64,
          borderRadius: 18, flexShrink: 0,
          background: `${mainColor}15`,
          border: `1px solid ${mainColor}35`,
          boxShadow: `inset 0 0 20px ${mainColor}15, 0 0 24px ${mainColor}20`,
          alignItems: 'center', justifyContent: 'center',
          display: 'flex',
        }}>
          <Icon size={30} style={{ color: mainColor, filter: `drop-shadow(0 0 6px ${mainColor}80)` }} />
        </div>

        {/* Typography */}
        <div style={{ minWidth: 0 }}>
          <span className="text-2xl sm:text-3xl" style={{
            display: 'block', fontWeight: 900, color: mainColor,
            letterSpacing: '-0.03em', lineHeight: 1.1,
            textShadow: textShadowGlow,
          }}>
            {headlineText}
          </span>

          {/* Badges */}
          {(criticos > 0 || atencao > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {criticos > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: 'rgba(220,38,38,0.12)', color: '#ef4444',
                  border: '1px solid rgba(220,38,38,0.25)',
                  borderRadius: 99, padding: '3px 10px',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {criticos} irrigar hoje
                </span>
              )}
              {atencao > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: 'rgba(217,119,6,0.12)', color: '#d97706',
                  border: '1px solid rgba(217,119,6,0.25)',
                  borderRadius: 99, padding: '3px 10px',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {atencao} atenção
                </span>
              )}
            </div>
          )}

          {/* Pivot names or subtitle */}
          {hasAction && !noPivots ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              {criticoNames.map(name => (
                <span key={name} style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', letterSpacing: '0.01em' }}>
                  {name}
                </span>
              ))}
              {atencaoNames.map(name => (
                <span key={name} style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.01em' }}>
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

      {/* CTA — só exibe quando needs_irrigation=true (cron confirmou) */}
      {needsIrrigationToday && !noPivots && (
        <Link href="/manejo" className="w-full sm:w-auto" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          padding: '14px 24px', borderRadius: 14, fontSize: 13, fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.05em',
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
          color: '#FFFFFF',
          textDecoration: 'none', flexShrink: 0,
          boxShadow: '0 4px 16px rgba(220,38,38,0.35)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
        }}>
          <Droplets size={16} strokeWidth={2.5} />
          Irrigar Agora
          <ArrowRight size={16} strokeWidth={2.5} />
        </Link>
      )}
      {/* CTA suave para atenção */}
      {needsAttention && !needsIrrigationToday && !noPivots && (
        <Link href="/manejo" className="w-full sm:w-auto" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          padding: '14px 24px', borderRadius: 14, fontSize: 13, fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.05em',
          background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.1))',
          border: '1px solid rgba(245,158,11,0.3)',
          color: '#f59e0b',
          textDecoration: 'none', flexShrink: 0,
          boxShadow: '0 4px 16px rgba(245,158,11,0.15)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          <Droplets size={16} strokeWidth={2.5} />
          Ver Manejo
          <ArrowRight size={16} strokeWidth={2.5} />
        </Link>
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { Droplets, AlertCircle, CheckCircle2, ArrowRight, AlertTriangle, Info } from 'lucide-react'

interface PivotRec {
  pivotId: string
  pivotName: string
  pct: number | null
  needsIrrigationToday: boolean
  laminaToday: number | null
  speedToday: number | null
  daysAway: number | null
  laminaProjected: number | null
  speedProjected: number | null
}

interface DecisionCardProps {
  pivotRecs: PivotRec[]
  activePivots: number
  handledToday: number
}

export function DecisionCard({ pivotRecs, activePivots, handledToday }: DecisionCardProps) {
  const noPivots = activePivots === 0

  // Classifica por daysAway (fonte única — mesma que Recomendações de Irrigação)
  const urgentes   = pivotRecs.filter(r => r.needsIrrigationToday)
  const amanha     = pivotRecs.filter(r => !r.needsIrrigationToday && r.daysAway === 1)
  const em2dias    = pivotRecs.filter(r => !r.needsIrrigationToday && r.daysAway === 2)
  const okRecs     = pivotRecs.filter(r => !r.needsIrrigationToday && (r.daysAway == null || r.daysAway > 2))

  const needsIrrigationToday = urgentes.length > 0
  const needsIrrigationSoon  = !needsIrrigationToday && (amanha.length > 0 || em2dias.length > 0)

  // Texto principal — acionável e sem ambiguidade
  const headlineText = noPivots
    ? 'SEM SAFRA ATIVA'
    : needsIrrigationToday
      ? 'IRRIGAR HOJE: SIM'
      : amanha.length > 0 && em2dias.length === 0
        ? 'IRRIGAR AMANHÃ'
        : amanha.length > 0 || em2dias.length > 0
          ? `IRRIGAR EM ${Math.min(...[...amanha, ...em2dias].map(r => r.daysAway ?? 99))} DIA${Math.min(...[...amanha, ...em2dias].map(r => r.daysAway ?? 99)) > 1 ? 'S' : ''}`
          : 'IRRIGAR HOJE: NÃO'

  const mainColor = noPivots ? '#778899'
    : needsIrrigationToday ? '#ef4444'
    : needsIrrigationSoon ? '#f59e0b'
    : '#22c55e'

  const Icon = needsIrrigationToday ? AlertCircle
    : needsIrrigationSoon ? AlertTriangle
    : noPivots ? Info
    : CheckCircle2

  const glowShadow = needsIrrigationToday
    ? '0 0 24px rgba(239,68,68,0.08), 0 12px 40px rgba(0,0,0,0.5)'
    : noPivots ? '0 8px 32px rgba(0,0,0,0.4)'
    : needsIrrigationSoon ? '0 0 24px rgba(245,158,11,0.08), 0 12px 40px rgba(0,0,0,0.5)'
    : '0 0 24px rgba(34,197,94,0.06), 0 12px 40px rgba(0,0,0,0.5)'

  const textShadowGlow = needsIrrigationToday
    ? '0 0 16px rgba(220, 38, 38, 0.3)'
    : needsIrrigationSoon ? '0 0 16px rgba(245,158,11,0.3)'
    : noPivots ? 'none' : '0 0 16px rgba(34, 197, 94, 0.25)'

  const bgGradient = needsIrrigationToday
    ? 'linear-gradient(145deg, rgba(30, 16, 18, 0.97), rgba(15, 19, 24, 0.98))'
    : needsIrrigationSoon
      ? 'linear-gradient(145deg, rgba(28, 22, 14, 0.97), rgba(15, 19, 24, 0.98))'
      : noPivots
        ? 'linear-gradient(145deg, rgba(18, 22, 28, 0.97), rgba(12, 16, 21, 0.98))'
        : 'linear-gradient(145deg, rgba(14, 22, 18, 0.97), rgba(12, 17, 22, 0.98))'

  const borderVal = needsIrrigationToday ? 'rgba(239,68,68,0.18)'
    : needsIrrigationSoon ? 'rgba(245,158,11,0.18)'
    : noPivots ? 'rgba(255,255,255,0.05)'
    : 'rgba(34,197,94,0.15)'

  const pulseAnimation = needsIrrigationToday
    ? 'alert-glow-red 2.8s ease-in-out infinite'
    : needsIrrigationSoon
      ? 'alert-glow-amber 3.2s ease-in-out infinite'
      : noPivots ? undefined
      : 'alert-glow-green 4s ease-in-out infinite'

  const hasAction = needsIrrigationToday || needsIrrigationSoon

  // Nomes por categoria para exibição
  const urgentNames = urgentes.map(r => r.pivotName)
  const soonNames   = [...amanha, ...em2dias].map(r => r.pivotName)

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
      animation: pulseAnimation,
    }}>
      {/* Glow ambient */}
      <div style={{
        position: 'absolute', top: -60, left: -40, width: 200, height: 200,
        borderRadius: '50%', pointerEvents: 'none',
        background: `radial-gradient(circle, ${mainColor}12 0%, transparent 70%)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0, position: 'relative' }}>
        {/* Ícone */}
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

        {/* Texto */}
        <div style={{ minWidth: 0 }}>
          <span className="text-2xl sm:text-3xl" style={{
            display: 'block', fontWeight: 900, color: mainColor,
            letterSpacing: '-0.03em', lineHeight: 1.1,
            textShadow: textShadowGlow,
          }}>
            {headlineText}
          </span>

          {/* Badges */}
          {(urgentes.length > 0 || amanha.length > 0 || em2dias.length > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {urgentes.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: 'rgba(220,38,38,0.12)', color: '#ef4444',
                  border: '1px solid rgba(220,38,38,0.25)',
                  borderRadius: 99, padding: '3px 10px',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {urgentes.length} irrigar hoje
                </span>
              )}
              {amanha.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: 'rgba(217,119,6,0.12)', color: '#d97706',
                  border: '1px solid rgba(217,119,6,0.25)',
                  borderRadius: 99, padding: '3px 10px',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {amanha.length} amanhã
                </span>
              )}
              {em2dias.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: 'rgba(217,119,6,0.08)', color: '#b45309',
                  border: '1px solid rgba(217,119,6,0.2)',
                  borderRadius: 99, padding: '3px 10px',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {em2dias.length} em 2 dias
                </span>
              )}
            </div>
          )}

          {/* Nomes dos pivôs ou subtítulo */}
          {hasAction && !noPivots ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              {urgentNames.map(name => (
                <span key={name} style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', letterSpacing: '0.01em' }}>
                  {name}
                </span>
              ))}
              {soonNames.map(name => (
                <span key={name} style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.01em' }}>
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, fontWeight: 500, color: '#687b8d', marginTop: 6, lineHeight: 1.5 }}>
              {noPivots
                ? 'Configure uma safra para iniciar o monitoramento.'
                : `${okRecs.length} pivô${okRecs.length !== 1 ? 's' : ''} com umidade adequada · ${handledToday} manejo(s) hoje`}
            </p>
          )}
        </div>
      </div>

      {/* CTA irrigar hoje */}
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

      {/* CTA irrigar amanhã / em breve */}
      {needsIrrigationSoon && !noPivots && (
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

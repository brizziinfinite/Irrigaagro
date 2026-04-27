'use client'

import Link from 'next/link'
import type { DailyManagement, Pivot } from '@/types/database'
import type { PivotDiagnostic } from '@/services/pivot-diagnostics'
import { findRecommendedSpeed } from '@/lib/water-balance'

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

// Cor da água baseada no nível de umidade — paleta unificada
function tankColor(pct: number | null): string {
  if (pct === null) return '#334155'
  if (pct >= 75) return '#22c55e'
  if (pct >= 60) return '#f59e0b'
  return '#ef4444'
}

/**
 * Projeção simples: quantos dias até atingir o threshold.
 * Usa ETc atual como estimativa de demanda diária (sem forecast).
 * Retorna { daysAway, projectedDepthMm, projectedSpeedPercent } ou null se >14 dias.
 */
function projectIrrigation(
  mgmt: DailyManagement,
  pivot: Pivot,
): { daysAway: number; projectedDepthMm: number; projectedSpeedPercent: number | null } | null {
  const cta = mgmt.cta ?? 0
  const adcMm = mgmt.ctda ?? 0
  const etcMm = mgmt.etc_mm ?? 0
  const threshold = pivot.alert_threshold_percent ?? 70
  const irrigationTarget = pivot.irrigation_target_percent ?? 100

  if (cta <= 0 || etcMm <= 0) return null

  const thresholdMm = (threshold / 100) * cta
  const targetMm = (irrigationTarget / 100) * cta
  let adc = adcMm

  for (let i = 1; i <= 14; i++) {
    adc = Math.max(0, adc - etcMm)
    if (adc <= thresholdMm) {
      // Déficit = quanto falta para atingir o target (ex: 80% da CTA)
      // Mesmo que adc esteja abaixo do target, repõe até lá
      const deficit = Math.max(targetMm - adc, thresholdMm * 0.1) // mínimo simbólico para calcular velocidade
      const speed = findRecommendedSpeed(pivot, deficit)
      return { daysAway: i, projectedDepthMm: Math.max(0, targetMm - adc), projectedSpeedPercent: speed }
    }
  }
  return null
}

export function CriticalPivots({ pivots, lastManagementByPivot, activePivotIds, diagnosticsByPivot }: CriticalPivotsProps) {
  const items: Array<{
    pivot: Pivot & { farms: { id: string; name: string } | null }
    pct: number | null
    status: PivotStatus
    diag: PivotDiagnostic | null
    mgmt: DailyManagement | null
  }> = []

  for (const pivot of pivots) {
    if (!activePivotIds.has(pivot.id)) continue
    const m = lastManagementByPivot[pivot.id]
    const pct = m?.field_capacity_percent ?? null
    let status: PivotStatus = 'ok'
    // Paleta unificada: <60% = crítico, 60–75% = atenção, ≥75% = ok
    if (pct !== null && pct < 60) status = 'critico'
    else if (pct !== null && pct < 75) status = 'atencao'
    items.push({ pivot, pct, status, diag: diagnosticsByPivot[pivot.id] ?? null, mgmt: m ?? null })
  }

  const order: Record<PivotStatus, number> = { critico: 0, atencao: 1, ok: 2 }
  items.sort((a, b) => order[a.status] - order[b.status])

  const urgentCount = items.filter(i => i.status === 'critico').length

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(14,20,28,0.97), rgba(10,15,22,0.98))',
      backdropFilter: 'blur(16px)',
      border: urgentCount > 0 ? '1px solid rgba(239,68,68,0.18)' : '1px solid rgba(255,255,255,0.06)',
      boxShadow: urgentCount > 0
        ? '0 0 16px rgba(239,68,68,0.06), 0 8px 32px rgba(0,0,0,0.45)'
        : '0 8px 32px rgba(0,0,0,0.35)',
      borderRadius: 18,
      padding: '22px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      height: '100%',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: urgentCount > 0 ? '#ef4444' : '#22c55e',
            boxShadow: urgentCount > 0 ? '0 0 5px rgba(239,68,68,0.6)' : '0 0 5px rgba(34,197,94,0.5)',
            animation: urgentCount > 0 ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{
            fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.16em', color: '#cbd5e1',
          }}>
            Situação por Pivô
          </span>
        </div>
        {urgentCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
            background: 'rgba(239,68,68,0.15)', color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '4px 8px',
          }}>
            {urgentCount} crítico{urgentCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes tankWave { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}} />

      {/* List */}
      {items.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flex: 1, minHeight: 120, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12
        }}>
          <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.625 }}>Nenhum pivô online.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
          {items.map(({ pivot, pct, status, mgmt }) => {
            const s = STATUS_STYLE[status]
            const needsIrrigation = mgmt?.needs_irrigation === true
            const lamina = mgmt?.recommended_depth_mm
            const speed = mgmt?.recommended_speed_percent

            // Projeção: quando vai precisar irrigar (só para pivôs OK/Atenção)
            const proj = (!needsIrrigation && mgmt)
              ? projectIrrigation(mgmt, pivot)
              : null

            return (
              <div key={pivot.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '13px 16px', borderRadius: 13,
                background: status === 'critico'
                  ? 'rgba(239,68,68,0.07)'
                  : status === 'atencao'
                    ? 'rgba(245,158,11,0.06)'
                    : 'rgba(255,255,255,0.02)',
                border: `1px solid ${s.border}`,
                boxShadow: status === 'critico'
                  ? 'inset 0 0 20px rgba(239,68,68,0.06)'
                  : 'none',
                transition: 'transform 0.2s',
                cursor: 'pointer',
                gap: 10,
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
              >
                {/* Info — esquerda */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{pivot.name}</span>
                    {needsIrrigation ? (
                      <span style={{
                        fontSize: 9, fontWeight: 800, color: '#ef4444',
                        background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
                        borderRadius: 6, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        Irrigar Hoje
                      </span>
                    ) : s.label ? (
                      <span style={{
                        fontSize: 9, fontWeight: 800, color: s.color,
                        background: `${s.color}20`, border: `1px solid ${s.color}40`,
                        borderRadius: 6, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {s.label}
                      </span>
                    ) : null}
                  </div>

                  <p style={{ fontSize: 12, color: '#94a3b8' }}>{pivot.farms?.name ?? ''}</p>

                  {/* Irrigar hoje: lâmina + velocidade */}
                  {needsIrrigation && (lamina != null || speed != null) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                      {lamina != null && lamina > 0 && (
                        <span style={{ fontSize: 14, color: '#e2e8f0', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {lamina.toFixed(1)} mm
                        </span>
                      )}
                      {speed != null && (
                        <span style={{
                          fontSize: 11, color: '#0093D0', fontFamily: 'var(--font-mono)', fontWeight: 700,
                          background: 'rgba(0,147,208,0.1)', border: '1px solid rgba(0,147,208,0.2)',
                          borderRadius: 4, padding: '1px 5px',
                        }}>
                          vel. {speed}%
                        </span>
                      )}
                    </div>
                  )}

                  {/* Projeção: irrigar em X dias */}
                  {proj && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        Irrigar em{' '}
                        <span style={{ color: proj.daysAway <= 2 ? '#f59e0b' : '#8899aa', fontWeight: 700 }}>
                          {proj.daysAway === 1 ? 'amanhã' : `${proj.daysAway} dias`}
                        </span>
                      </span>
                      {proj.projectedDepthMm > 0 && (
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          · {proj.projectedDepthMm.toFixed(1)} mm
                        </span>
                      )}
                      {proj.projectedSpeedPercent != null && (
                        <span style={{
                          fontSize: 10, color: '#0093D0', fontFamily: 'var(--font-mono)', fontWeight: 700,
                          background: 'rgba(0,147,208,0.08)', border: '1px solid rgba(0,147,208,0.15)',
                          borderRadius: 4, padding: '1px 4px',
                        }}>
                          {proj.projectedSpeedPercent}%
                        </span>
                      )}
                    </div>
                  )}

                  {/* Nenhum dado disponível */}
                  {!mgmt && (
                    <span style={{ fontSize: 12, color: '#64748b' }}>Sem balanço hoje</span>
                  )}
                </div>

                {/* Direita: Mini Tank + link */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {(() => {
                    const tc = tankColor(pct)
                    return (
                      <div style={{
                        width: 54, height: 58,
                        borderRadius: 10,
                        border: `1px solid ${tc}35`,
                        background: 'rgba(5,10,18,0.85)',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: `0 0 14px ${tc}25, 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`,
                      }}>
                        {[75, 50, 25].map(mark => (
                          <div key={mark} style={{
                            position: 'absolute', left: 0, right: 0,
                            bottom: `${mark}%`, height: 1,
                            background: 'rgba(255,255,255,0.05)', zIndex: 1,
                          }} />
                        ))}
                        {pct !== null && (
                          <div style={{
                            position: 'absolute', left: 0, right: 0, bottom: 0,
                            height: `${Math.min(100, Math.max(0, pct))}%`,
                            transition: 'height 1s cubic-bezier(0.4,0,0.2,1)',
                            overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 2,
                          }}>
                            <div style={{ width: '200%', display: 'flex', animation: 'tankWave 2.5s linear infinite', flexShrink: 0, height: 10 }}>
                              <svg viewBox="0 0 200 20" preserveAspectRatio="none" style={{ width: '50%', height: 10, display: 'block' }}>
                                <path d="M0,20 L0,10 C40,18 60,2 100,10 C140,18 160,2 200,10 L200,20 Z" fill={tc} opacity="0.95"/>
                              </svg>
                              <svg viewBox="0 0 200 20" preserveAspectRatio="none" style={{ width: '50%', height: 10, display: 'block' }}>
                                <path d="M0,20 L0,10 C40,18 60,2 100,10 C140,18 160,2 200,10 L200,20 Z" fill={tc} opacity="0.95"/>
                              </svg>
                            </div>
                            <div style={{ flex: 1, background: `linear-gradient(to bottom, ${tc}50, ${tc}25)` }} />
                          </div>
                        )}
                        <div style={{
                          position: 'absolute', inset: 0, zIndex: 3,
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', gap: 1,
                        }}>
                          <span style={{
                            fontSize: 14, fontWeight: 900,
                            color: pct !== null && pct > 30 ? '#fff' : tc,
                            fontFamily: 'var(--font-mono)',
                            textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                            lineHeight: 1, letterSpacing: '-0.02em',
                          }}>
                            {pct !== null ? `${Math.round(pct)}%` : '—'}
                          </span>
                          <span style={{ fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                            campo
                          </span>
                        </div>
                      </div>
                    )
                  })()}

                  <Link href="/manejo" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 30, height: 30, borderRadius: 8,
                    background: 'transparent',
                    border: status === 'critico'
                      ? '1px solid rgba(239,68,68,0.4)'
                      : status === 'atencao'
                        ? '1px solid rgba(245,158,11,0.4)'
                        : '1px solid rgba(255,255,255,0.08)',
                    color: status === 'critico' ? '#ef4444' : status === 'atencao' ? '#f59e0b' : '#778899',
                    textDecoration: 'none', transition: 'all 0.2s',
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

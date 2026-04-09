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

// Cor da água baseada no nível de umidade — independente do status operacional
function tankColor(pct: number | null): string {
  if (pct === null) return '#334155'
  if (pct >= 90)  return '#0093D0' // azul
  if (pct >= 80)  return '#22c55e' // verde
  if (pct >= 70)  return '#f59e0b' // laranja
  if (pct > 65)   return '#ef4444' // vermelho
  return '#a855f7'                  // roxo <=65
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
    const warningPct = threshold * 1.15  // ×1,15 alinhado ao getIrrigationStatus
    const pct = m?.field_capacity_percent ?? null
    let status: PivotStatus = 'ok'
    if (pct !== null && pct < threshold) status = 'critico'
    else if (pct !== null && pct < warningPct) status = 'atencao'
    items.push({ pivot, pct, status, diag: diagnosticsByPivot[pivot.id] ?? null })
  }

  // Sort: critico first, then atencao, then ok
  const order: Record<PivotStatus, number> = { critico: 0, atencao: 1, ok: 2 }
  items.sort((a, b) => order[a.status] - order[b.status])

  const urgentCount = items.filter(i => i.status === 'critico').length

  return (
    <div style={{
      background: 'rgba(15, 25, 35, 0.65)',
      backdropFilter: 'blur(16px)',
      border: urgentCount > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255,255,255,0.06)',
      boxShadow: urgentCount > 0 ? '0 0 20px rgba(239,68,68,0.1)' : '0 4px 20px rgba(0,0,0,0.2)',
      borderRadius: 16,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      height: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: urgentCount > 0 ? '#ef4444' : '#22c55e',
            boxShadow: urgentCount > 0 ? '0 0 10px #ef4444' : '0 0 10px #22c55e',
            animation: urgentCount > 0 ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{
            fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#e2e8f0',
          }}>
            Status Atual
          </span>
        </div>
        {urgentCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
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
          <p style={{ fontSize: 13, color: '#556677' }}>
            Nenhum pivô online.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
          {items.map(({ pivot, pct, status }) => {
            const s = STATUS_STYLE[status]
            return (
              <div key={pivot.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderRadius: 12,
                background: status === 'ok' ? 'rgba(255,255,255,0.02)' : s.bg, 
                border: `1px solid ${s.border}`,
                transition: 'transform 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
              >
                {/* Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{pivot.name}</span>
                    {s.label && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, color: s.color,
                        background: `${s.color}20`, border: `1px solid ${s.color}40`,
                        borderRadius: 6, padding: '2px 6px', textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {s.label}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: '#8899aa' }}>
                    {pivot.farms?.name ?? ''}
                  </p>
                </div>

                {/* Right Side Action / Field Cap */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Mini Tank — cor por nível de umidade */}
                  {(() => {
                    const tc = tankColor(pct)
                    return (
                      <div style={{
                        width: 58, height: 62,
                        borderRadius: 10,
                        border: `1px solid ${tc}35`,
                        background: 'rgba(5,10,18,0.85)',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: `0 0 14px ${tc}25, 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`,
                        flexShrink: 0,
                      }}>
                        {/* Linhas de escala internas */}
                        {[75, 50, 25].map(mark => (
                          <div key={mark} style={{
                            position: 'absolute', left: 0, right: 0,
                            bottom: `${mark}%`, height: 1,
                            background: 'rgba(255,255,255,0.05)', zIndex: 1,
                          }} />
                        ))}

                        {/* Água */}
                        {pct !== null && (
                          <div style={{
                            position: 'absolute', left: 0, right: 0, bottom: 0,
                            height: `${Math.min(100, Math.max(0, pct))}%`,
                            transition: 'height 1s cubic-bezier(0.4,0,0.2,1)',
                            overflow: 'hidden',
                            display: 'flex', flexDirection: 'column',
                            zIndex: 2,
                          }}>
                            {/* Onda */}
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

                        {/* % + label centralizados */}
                        <div style={{
                          position: 'absolute', inset: 0, zIndex: 3,
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', gap: 1,
                        }}>
                          <span style={{
                            fontSize: 15, fontWeight: 900,
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
                    width: 32, height: 32, borderRadius: 8,
                    background: status === 'critico' ? '#ef4444' : status === 'atencao' ? '#f59e0b' : 'rgba(255,255,255,0.05)',
                    color: status === 'ok' ? '#8899aa' : '#fff',
                    textDecoration: 'none', transition: 'all 0.2s',
                    boxShadow: status !== 'ok' ? `0 4px 12px ${s.color}60` : 'none',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

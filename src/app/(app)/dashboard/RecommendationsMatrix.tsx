'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import type { ManagementSeasonContext } from '@/services/management'
import {
  buildPivotRecommendations,
  type ForecastDay,
  type PivotRecommendation,
  type WeatherIcon,
} from '@/services/recommendations'
import type { DailyManagement } from '@/types/database'
import type { IrrigationStatus } from '@/types/database'

// ─── Props ────────────────────────────────────────────────────
interface Props {
  contexts: ManagementSeasonContext[]
  lastMgmtBySeasonId: Record<string, DailyManagement | null>
  currentAdcBySeasonId?: Record<string, number>
  today: string
}

// ─── Status colors ────────────────────────────────────────────
const STATUS_COLORS: Record<IrrigationStatus, { bg: string; text: string; border: string }> = {
  verde:    { bg: 'rgba(34,197,94,0.10)',  text: '#22c55e', border: 'rgba(34,197,94,0.25)'  },
  amarelo:  { bg: 'rgba(245,158,11,0.10)', text: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  vermelho: { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444', border: 'rgba(239,68,68,0.25)'  },
  azul:     { bg: 'rgba(0,147,208,0.10)',  text: '#0093D0', border: 'rgba(0,147,208,0.25)'  },
}

// ─── Weather icon renderer ────────────────────────────────────
function WeatherIconSvg({ icon, size = 18 }: { icon: WeatherIcon; size?: number }) {
  if (icon === 'storm') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/>
      <polyline points="13 11 9 17 15 17 11 23"/>
    </svg>
  )
  if (icon === 'rain') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
      <line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="13" x2="8" y2="15"/>
      <line x1="16" y1="19" x2="16" y2="21"/><line x1="16" y1="13" x2="16" y2="15"/>
      <line x1="12" y1="21" x2="12" y2="23"/><line x1="12" y1="15" x2="12" y2="17"/>
      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
    </svg>
  )
  if (icon === 'cloud') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
    </svg>
  )
  // sun
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

// ─── Share text builder ───────────────────────────────────────
function buildShareText(recs: PivotRecommendation[], days: string[]): string {
  const header = `IrrigaAgro — Recomendações 7 dias (${new Date().toLocaleDateString('pt-BR')})\n`
  const dateRow = 'Pivô'.padEnd(20) + days.map(d => d.slice(5).replace('-', '/')).join('  ') + '\n'
  const separator = '─'.repeat(70) + '\n'

  const rows = recs.map(rec => {
    const name = rec.pivotName.slice(0, 18).padEnd(20)
    const cells = rec.projection.map(day => {
      if (day.status === 'verde') return ' OK  '
      if (day.status === 'azul')  return ' IRR '
      if (day.status === 'amarelo') return ' ATN '
      return ' URG '
    }).join(' ')
    return name + cells
  })

  return header + dateRow + separator + rows.join('\n')
}

// ─── Main Component ───────────────────────────────────────────
export function RecommendationsMatrix({ contexts, lastMgmtBySeasonId, currentAdcBySeasonId, today }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<PivotRecommendation[]>([])
  const [selectedPivotId, setSelectedPivotId] = useState<'all' | string>('all')
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Chaves estáveis para deps do useEffect — evita loop infinito com objetos recriados a cada render
  const contextsKey = useMemo(() => contexts.map(c => c.season?.id).join(','), [contexts])
  const mgmtKey = useMemo(() => Object.entries(lastMgmtBySeasonId).map(([k,v]) => `${k}:${v?.date}`).join(','), [lastMgmtBySeasonId])
  const adcKey = useMemo(() => JSON.stringify(currentAdcBySeasonId ?? {}), [currentAdcBySeasonId])

  // Build 7-day header dates
  const forecastDays: string[] = []
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today + 'T12:00:00')
    d.setDate(d.getDate() + i)
    forecastDays.push(d.toISOString().slice(0, 10))
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        // Build a map with just what buildPivotRecommendations needs
        const mgmtMap: Record<string, { ctda: number | null; eto_mm: number | null; date: string } | null> = {}
        for (const [id, mgmt] of Object.entries(lastMgmtBySeasonId)) {
          if (!mgmt) { mgmtMap[id] = null; continue }
          mgmtMap[id] = { ctda: mgmt.ctda ?? null, eto_mm: mgmt.eto_mm ?? null, date: mgmt.date }
        }

        const recs = await buildPivotRecommendations(contexts, mgmtMap, today, currentAdcBySeasonId)
        if (!cancelled) {
          setRecommendations(recs)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar recomendações')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  // contextsKey/mgmtKey/adcKey são strings derivadas dos objetos — stable deps sem loop infinito
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, contextsKey, mgmtKey, adcKey])

  const filtered = selectedPivotId === 'all'
    ? recommendations
    : recommendations.filter(r => r.pivotId === selectedPivotId)

  // Aggregate forecast header (first rec with forecast, or empty)
  const headerForecast: (ForecastDay | null)[] = forecastDays.map(date => {
    for (const rec of recommendations) {
      const f = rec.forecast.find(fd => fd.date === date)
      if (f) return f
    }
    return null
  })

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  async function handleShare() {
    const text = buildShareText(filtered, forecastDays)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'IrrigaAgro — Recomendações', text })
        return
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copiado para a área de transferência!')
    } catch {
      showToast('Não foi possível copiar.')
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(145deg, rgba(22, 27, 33, 0.9), rgba(15, 19, 24, 0.95))',
    border: '1px solid rgba(255,255,255,0.03)',
    borderRadius: 20,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(12px)',
    padding: 0,
    overflow: 'hidden',
    minWidth: 0,
  }

  return (
    <div style={cardStyle}>
      {/* ─── Header ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
        gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.03)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#e2e8f0' }}>
          Recomendações 7 dias
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Pivot filter */}
          <select
            value={selectedPivotId}
            onChange={e => setSelectedPivotId(e.target.value)}
            style={{
              background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              color: '#8899aa', fontSize: 11, padding: '5px 10px', cursor: 'pointer',
              appearance: 'none', paddingRight: 24,
            }}
          >
            <option value="all">Todos os pivôs</option>
            {recommendations.map(r => (
              <option key={r.pivotId} value={r.pivotId}>{r.pivotName}</option>
            ))}
          </select>

          {/* Share button */}
          <button
            onClick={handleShare}
            title="Compartilhar"
            style={{
              background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              color: '#8899aa', fontSize: 11, padding: '5px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Compartilhar
          </button>
        </div>
      </div>

      {/* ─── Toast ─── */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1f3022', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10,
          padding: '10px 20px', color: '#22c55e', fontSize: 12, fontWeight: 600, zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {toastMsg}
        </div>
      )}

      {/* ─── Loading / Error ─── */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: '#556677', fontSize: 13 }}>
          Carregando previsão do tempo…
        </div>
      )}
      {!loading && error && (
        <div style={{ padding: 20, color: '#ef4444', fontSize: 12, textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* ─── Matrix ─── */}
      {!loading && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
            {/* Col header: dates */}
            <thead>
              <tr>
                {/* Sticky pivot column header */}
                <th style={{
                  position: 'sticky', left: 0, zIndex: 2,
                  background: 'rgba(15, 19, 24, 0.95)', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  borderRight: '1px solid rgba(255,255,255,0.03)',
                  padding: '12px 16px', textAlign: 'left', minWidth: 150,
                  backdropFilter: 'blur(12px)'
                }}>
                  <span style={{ fontSize: 11, color: '#687b8d', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Pivô
                  </span>
                </th>

                {forecastDays.map((date, i) => {
                  const forecast = headerForecast[i]
                  const d = new Date(date + 'T12:00:00')
                  const dayLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3)

                  return (
                    <th key={date} style={{
                      padding: '10px 6px',
                      textAlign: 'center',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      borderRight: '1px solid rgba(255,255,255,0.03)',
                      background: 'rgba(22, 27, 33, 0.4)',
                      minWidth: 72,
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 9, color: '#445566', textTransform: 'capitalize' }}>{weekday}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#8899aa', fontFamily: 'var(--font-mono)' }}>{dayLabel}</span>
                        {forecast ? (
                          <>
                            <WeatherIconSvg icon={forecast.icon} size={16} />
                            {forecast.rainfall > 0 && (
                              <span style={{ fontSize: 9, color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>
                                {forecast.rainfall.toFixed(0)}mm
                              </span>
                            )}
                            {forecast.rainfall === 0 && (
                              <span style={{ fontSize: 9, color: '#445566' }}>0mm</span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: 9, color: '#445566' }}>—</span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#445566', fontSize: 13 }}>
                    Nenhuma safra ativa com dados suficientes.
                  </td>
                </tr>
              )}
              {filtered.map((rec, ri) => (
                <tr key={rec.seasonId} style={{
                  borderBottom: ri < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  {/* Pivot name — sticky */}
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 1,
                    background: 'rgba(15, 19, 24, 0.95)',
                    borderRight: '1px solid rgba(255,255,255,0.03)',
                    padding: '10px 16px',
                    backdropFilter: 'blur(12px)',
                  }}>
                    <Link href={`/pivos/${rec.pivotId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', margin: 0, whiteSpace: 'nowrap' }}>
                        {rec.pivotName}
                      </p>
                    </Link>
                    <p style={{ fontSize: 10, color: '#445566', margin: 0, marginTop: 2, whiteSpace: 'nowrap' }}>
                      {rec.farmName}
                    </p>
                    {rec.lastUpdated && (
                      <p style={{ fontSize: 9, color: '#334455', margin: 0, marginTop: 2 }}>
                        {new Date(rec.lastUpdated + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                    )}
                  </td>

                  {/* Projection cells */}
                  {forecastDays.map((date, di) => {
                    const day = rec.projection.find(p => p.date === date)
                    if (!day) {
                      return (
                        <td key={date} style={{ padding: '8px 4px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                          <span style={{ fontSize: 10, color: '#334455' }}>—</span>
                        </td>
                      )
                    }

                    const colors = STATUS_COLORS[day.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.verde
                    const needsIrr = day.recommendedDepthMm > 0

                    return (
                      <td key={date} style={{
                        padding: '6px 4px',
                        textAlign: 'center',
                        borderRight: di < 6 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                      }}>
                        <div style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                          padding: '6px 4px', borderRadius: 8,
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          margin: '0 2px',
                        }}>
                          {/* % campo */}
                          <span style={{
                            fontSize: 12, fontWeight: 800, color: colors.text,
                            fontFamily: 'var(--font-mono)', lineHeight: 1,
                            textShadow: `0 0 8px ${colors.text}60`
                          }}>
                            {Math.round(day.fieldCapacityPercent)}%
                          </span>

                          {/* Lâmina */}
                          {needsIrr ? (
                            <>
                              <span style={{ fontSize: 9, color: '#e2e8f0', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                                {day.recommendedDepthMm.toFixed(1)}mm
                              </span>
                              {day.recommendedSpeedPercent != null && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#0093D0', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                                  {day.recommendedSpeedPercent}%
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: 8, color: colors.text, opacity: 0.6 }}>—</span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Legend ─── */}
      {!loading && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, padding: '10px 18px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          {[
            { status: 'verde',    label: 'OK'          },
            { status: 'amarelo',  label: 'Atenção'     },
            { status: 'vermelho', label: 'Irrigar'     },
            { status: 'azul',     label: 'Irrigando'   },
          ].map(({ status, label }) => {
            const c = STATUS_COLORS[status as keyof typeof STATUS_COLORS]
            return (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.text, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#556677' }}>{label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

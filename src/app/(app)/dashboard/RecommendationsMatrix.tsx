'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
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
  // Multi-select: empty Set = "todos"
  const [selectedPivotIds, setSelectedPivotIds] = useState<Set<string>>(new Set())
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

  const filtered = selectedPivotIds.size === 0
    ? recommendations
    : recommendations.filter(r => selectedPivotIds.has(r.pivotId))

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
    background: 'linear-gradient(145deg, rgba(18,24,32,0.97), rgba(13,18,26,0.98))',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 20,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(12px)',
    padding: 0,
    overflow: 'clip',
    minWidth: 0,
  }

  return (
    <div style={cardStyle}>
      {/* ─── Header ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
        gap: 10, padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#cbd5e1' }}>
          Recomendações 7 dias
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Pivot filter — dropdown customizado */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: dropdownOpen ? 'rgba(0,147,208,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${dropdownOpen ? 'rgba(0,147,208,0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8, color: selectedPivotIds.size > 0 ? '#0093D0' : '#7788aa',
                fontSize: 12, padding: '6px 10px', cursor: 'pointer',
                transition: 'all 0.15s',
                fontWeight: selectedPivotIds.size > 0 ? 600 : 400,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                <path d="M4.93 4.93a10 10 0 0 0 0 14.14"/>
              </svg>
              {selectedPivotIds.size === 0
                ? 'Todos os pivôs'
                : selectedPivotIds.size === 1
                  ? recommendations.find(r => selectedPivotIds.has(r.pivotId))?.pivotName ?? '1 pivô'
                  : `${selectedPivotIds.size} pivôs`}
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ opacity: 0.6, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
                minWidth: 220, background: 'var(--color-surface-sidebar)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, overflow: 'hidden',
                boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,147,208,0.08)',
              }}>
                {/* Header do dropdown */}
                <div style={{
                  padding: '10px 14px 8px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)' }}>
                    Selecionar pivôs
                  </span>
                  {selectedPivotIds.size > 0 && (
                    <button
                      onClick={() => setSelectedPivotIds(new Set())}
                      style={{ fontSize: 10, color: '#0093D0', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                    >
                      Limpar
                    </button>
                  )}
                </div>

                {/* Opção "Todos" */}
                <button
                  onClick={() => { setSelectedPivotIds(new Set()); setDropdownOpen(false) }}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px', fontSize: 12, cursor: 'pointer', border: 'none',
                    background: selectedPivotIds.size === 0 ? 'rgba(0,147,208,0.08)' : 'transparent',
                    color: selectedPivotIds.size === 0 ? '#0093D0' : 'var(--color-text-secondary)',
                    fontWeight: selectedPivotIds.size === 0 ? 600 : 400,
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (selectedPivotIds.size > 0) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (selectedPivotIds.size > 0) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {/* "All" checkbox visual */}
                  <span style={{
                    width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${selectedPivotIds.size === 0 ? '#0093D0' : 'rgba(255,255,255,0.15)'}`,
                    background: selectedPivotIds.size === 0 ? '#0093D0' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selectedPivotIds.size === 0 && (
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2">
                        <polyline points="2 5 4 7 8 3"/>
                      </svg>
                    )}
                  </span>
                  Todos os pivôs
                </button>

                {/* Pivôs individuais */}
                {recommendations.map((r) => {
                  const checked = selectedPivotIds.has(r.pivotId)
                  return (
                    <button
                      key={r.pivotId}
                      onClick={() => {
                        const next = new Set(selectedPivotIds)
                        if (checked) next.delete(r.pivotId)
                        else next.add(r.pivotId)
                        setSelectedPivotIds(next)
                      }}
                      style={{
                        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 14px', fontSize: 12, cursor: 'pointer', border: 'none',
                        background: checked ? 'rgba(0,147,208,0.06)' : 'transparent',
                        color: checked ? '#0093D0' : 'var(--color-text-secondary)',
                        fontWeight: checked ? 600 : 400,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                      onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <span style={{
                        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                        border: `1.5px solid ${checked ? '#0093D0' : 'rgba(255,255,255,0.15)'}`,
                        background: checked ? '#0093D0' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.1s',
                      }}>
                        {checked && (
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2">
                            <polyline points="2 5 4 7 8 3"/>
                          </svg>
                        )}
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.pivotName}
                      </span>
                      {r.farmName && (
                        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>{r.farmName}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Share button */}
          <button
            onClick={handleShare}
            title="Compartilhar"
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              color: '#7788aa', fontSize: 11, padding: '5px 10px', cursor: 'pointer',
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
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          Carregando previsão do tempo…
        </div>
      )}
      {!loading && error && (
        <div style={{ padding: 20, color: '#ef4444', fontSize: 14, textAlign: 'center' }}>
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
                  background: 'var(--color-surface-card)', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  borderRight: '1px solid rgba(255,255,255,0.03)',
                  padding: '12px 16px', textAlign: 'left', minWidth: 150,
                  backdropFilter: 'blur(12px)'
                }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                    Pivô
                  </span>
                </th>

                {forecastDays.map((date, i) => {
                  const forecast = headerForecast[i]
                  const d = new Date(date + 'T12:00:00')
                  const dayLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3)
                  const hasRain = (forecast?.rainfall ?? 0) > 0
                  const rainMm = forecast?.rainfall ?? 0
                  // Intensidade do destaque: leve <5mm, médio 5-15mm, forte >15mm
                  const rainIntensity = rainMm >= 15 ? 'heavy' : rainMm >= 5 ? 'moderate' : 'light'
                  const rainBg = hasRain
                    ? rainIntensity === 'heavy'   ? 'rgba(37,99,235,0.22)'
                    : rainIntensity === 'moderate' ? 'rgba(59,130,246,0.16)'
                    : 'rgba(96,165,250,0.10)'
                    : 'rgba(16,22,30,0.5)'
                  const rainBorderTop = hasRain
                    ? rainIntensity === 'heavy'   ? '3px solid rgba(59,130,246,0.85)'
                    : rainIntensity === 'moderate' ? '3px solid rgba(96,165,250,0.7)'
                    : '3px solid rgba(147,197,253,0.5)'
                    : '3px solid transparent'

                  return (
                    <th key={date} style={{
                      padding: '10px 6px 12px',
                      textAlign: 'center',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      borderRight: '1px solid rgba(255,255,255,0.04)',
                      background: rainBg,
                      borderTop: rainBorderTop,
                      minWidth: 72,
                      transition: 'background 0.2s',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <span style={{
                          fontSize: 11, textTransform: 'capitalize', fontWeight: 600, letterSpacing: '0.05em',
                          color: hasRain ? '#93c5fd' : '#64748b',
                        }}>{weekday}</span>
                        <span style={{
                          fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          color: hasRain ? '#bfdbfe' : '#94a3b8',
                        }}>{dayLabel}</span>
                        {forecast ? (
                          <>
                            <WeatherIconSvg icon={forecast.icon} size={hasRain ? 18 : 16} />
                            {hasRain ? (
                              <span style={{
                                fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 800,
                                color: rainIntensity === 'heavy' ? '#93c5fd' : rainIntensity === 'moderate' ? '#bfdbfe' : '#dbeafe',
                                background: rainIntensity === 'heavy' ? 'rgba(37,99,235,0.3)' : 'rgba(96,165,250,0.18)',
                                border: `1px solid ${rainIntensity === 'heavy' ? 'rgba(59,130,246,0.55)' : 'rgba(147,197,253,0.35)'}`,
                                borderRadius: 99, padding: '2px 7px', lineHeight: 1.5,
                                boxShadow: rainIntensity === 'heavy' ? '0 0 8px rgba(59,130,246,0.25)' : 'none',
                              }}>
                                {rainMm.toFixed(0)}mm
                              </span>
                            ) : (
                              <span style={{ fontSize: 9, color: '#334455' }}>0mm</span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: 9, color: '#778899' }}>—</span>
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
                  <td colSpan={8} style={{ padding: 36, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
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
                    background: 'var(--color-surface-bg)',
                    borderRight: '1px solid rgba(255,255,255,0.04)',
                    padding: '13px 18px',
                    backdropFilter: 'blur(12px)',
                  }}>
                    <Link href={`/pivos/${rec.pivotId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#c8d4e0', margin: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {rec.pivotName}
                        {rec.conjugatedOrder !== null && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, lineHeight: 1,
                            padding: '2px 5px', borderRadius: 4,
                            background: rec.conjugatedOrder === 1 ? 'rgba(239,68,68,0.18)' : 'rgba(100,116,139,0.18)',
                            color: rec.conjugatedOrder === 1 ? '#ef4444' : '#94a3b8',
                            border: `1px solid ${rec.conjugatedOrder === 1 ? 'rgba(239,68,68,0.35)' : 'rgba(100,116,139,0.25)'}`,
                            flexShrink: 0,
                          }}>
                            {rec.conjugatedOrder}º
                          </span>
                        )}
                      </p>
                    </Link>
                    <p style={{ fontSize: 12, color: '#64748b', margin: 0, marginTop: 3, whiteSpace: 'nowrap' }}>
                      {rec.farmName}
                      {rec.conjugatedPartnerName && (
                        <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                          ⇌ {rec.conjugatedPartnerName}
                        </span>
                      )}
                    </p>
                    {rec.lastUpdated && (
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0, marginTop: 2 }}>
                        {new Date(rec.lastUpdated + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                    )}
                  </td>

                  {/* Projection cells */}
                  {forecastDays.map((date, di) => {
                    const forecast = headerForecast[di]
                    const hasRain = (forecast?.rainfall ?? 0) > 0
                    const day = rec.projection.find(p => p.date === date)
                    if (!day) {
                      return (
                        <td key={date} style={{
                          padding: '8px 4px', textAlign: 'center',
                          borderRight: '1px solid rgba(255,255,255,0.04)',
                          background: hasRain ? 'rgba(37,99,235,0.09)' : 'transparent',
                        }}>
                          <span style={{ fontSize: 10, color: '#2a3444' }}>—</span>
                        </td>
                      )
                    }

                    const colors = STATUS_COLORS[day.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.verde
                    // Vermelho: usa recommendedDepthMm (threshold atingido — urgente)
                    // Amarelo: usa estimatedDepthMm (lâmina projetada sem guard — previsão)
                    const isRed    = day.status === 'vermelho'
                    const isAmber  = day.status === 'amarelo'
                    const showDepth = isRed
                      ? day.recommendedDepthMm > 0
                      : isAmber
                        ? (day.estimatedDepthMm ?? 0) > 0
                        : false
                    const displayDepth = isRed ? day.recommendedDepthMm : (day.estimatedDepthMm ?? 0)
                    const displaySpeed = isRed ? day.recommendedSpeedPercent : (day.estimatedSpeedPercent ?? null)
                    const showSpeed = showDepth && displaySpeed != null

                    return (
                      <td key={date} style={{
                        padding: '7px 4px',
                        textAlign: 'center',
                        borderRight: di < 6 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        background: hasRain ? 'rgba(37,99,235,0.09)' : 'transparent',
                      }}>
                        <div style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                          padding: '7px 5px', borderRadius: 9,
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          margin: '0 3px',
                        }}>
                          {/* % campo */}
                          <span style={{
                            fontSize: 12, fontWeight: 800, color: colors.text,
                            fontFamily: 'var(--font-mono)', lineHeight: 1,
                            textShadow: 'none'
                          }}>
                            {Math.round(day.fieldCapacityPercent)}%
                          </span>

                          {/* Lâmina + velocidade — vermelho (urgente) e amarelo (estimativa) */}
                          {showDepth ? (
                            <>
                              <span style={{
                                fontSize: 9, fontFamily: 'var(--font-mono)', lineHeight: 1, fontWeight: 600,
                                color: isAmber ? '#f59e0b' : '#c8d4e0',
                              }}>
                                ~{displayDepth.toFixed(1)}mm
                              </span>
                              {showSpeed && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#0093D0', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                                  {displaySpeed}%
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: 8, color: colors.text, opacity: 0.5 }}>—</span>
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
          display: 'flex', flexWrap: 'wrap', gap: 14, padding: '12px 22px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          {[
            { status: 'verde',    label: 'OK'          },
            { status: 'amarelo',  label: 'Atenção'     },
            { status: 'vermelho', label: 'Irrigar'     },
            { status: 'azul',     label: 'Irrigando'   },
          ].map(({ status, label }) => {
            const c = STATUS_COLORS[status as keyof typeof STATUS_COLORS]
            return (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.text, display: 'inline-block', flexShrink: 0, boxShadow: `0 0 6px ${c.text}60` }} />
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

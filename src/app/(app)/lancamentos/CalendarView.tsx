'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { IrrigationSchedule } from '@/types/database'
import type { PivotMeta } from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtMonthYear(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function buildMonthGrid(year: number, month: number): string[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = firstDay.getDay() // domingo = 0
  const days: string[] = []

  for (let i = startOffset; i > 0; i--) {
    days.push(toYMD(new Date(year, month, 1 - i)))
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(toYMD(new Date(year, month, d)))
  }
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(toYMD(new Date(year, month + 1, i)))
    }
  }
  return days
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface DayEntry {
  schedule: IrrigationSchedule
  pivotName: string
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  metas: PivotMeta[]
  schedulesByPivot: Record<string, IrrigationSchedule[]>
  today: string
  onDayClick: (ymd: string) => void
  onMonthChange?: (year: number, month: number) => void
}

const WEEKDAYS_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const WEEKDAYS_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export function CalendarView({ metas, schedulesByPivot, today, onDayClick, onMonthChange }: Props) {
  const nowDate = new Date(today + 'T12:00:00')
  const [year, setYear] = useState(nowDate.getFullYear())
  const [month, setMonth] = useState(nowDate.getMonth())

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])
  const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`

  // Mapa: date → lista de entries
  const schedulesByDate = useMemo(() => {
    const map: Record<string, DayEntry[]> = {}
    for (const meta of metas) {
      const pivotId = meta.context.pivot?.id ?? ''
      const pivotName = meta.context.pivot?.name ?? meta.context.season.name
      for (const s of (schedulesByPivot[pivotId] ?? [])) {
        if (!map[s.date]) map[s.date] = []
        map[s.date].push({ schedule: s, pivotName })
      }
    }
    return map
  }, [metas, schedulesByPivot])

  function prevMonth() {
    const newMonth = month === 0 ? 11 : month - 1
    const newYear = month === 0 ? year - 1 : year
    setMonth(newMonth); setYear(newYear)
    onMonthChange?.(newYear, newMonth)
  }
  function nextMonth() {
    const newMonth = month === 11 ? 0 : month + 1
    const newYear = month === 11 ? year + 1 : year
    setMonth(newMonth); setYear(newYear)
    onMonthChange?.(newYear, newMonth)
  }

  const isCurrentPeriod = year === nowDate.getFullYear() && month === nowDate.getMonth()
  const weeks: string[][] = []
  for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7))

  return (
    <>
      <style>{`
        .cal-chip { display: flex; align-items: center; gap: 3px; padding: 2px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .cal-cell { min-height: 72px; }
        .cal-chips { display: flex; flex-direction: column; gap: 2px; }
        @media (max-width: 500px) {
          .cal-cell { min-height: 52px; }
          .cal-chips { display: none !important; }
          .cal-dots { display: flex !important; }
          .cal-weekday-full { display: none !important; }
          .cal-weekday-short { display: inline !important; }
          .cal-dots-top { display: none !important; }
        }
        @media (min-width: 501px) {
          .cal-dots { display: none !important; }
          .cal-weekday-short { display: none !important; }
          .cal-dots-top { display: none !important; }
        }
        .cal-cell:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── Navegação mês ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={prevMonth}
            aria-label="Mês anterior"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'var(--color-surface-border2)', color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}>
            <ChevronLeft size={16} />
          </button>

          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 9,
            background: 'rgba(0,147,208,0.06)', border: '1px solid rgba(0,147,208,0.18)',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0093D0', textTransform: 'capitalize', textAlign: 'center' }}>
              {fmtMonthYear(year, month)}
            </span>
          </div>

          <button
            onClick={nextMonth}
            aria-label="Próximo mês"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'var(--color-surface-border2)', color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}>
            <ChevronRight size={16} />
          </button>

          {!isCurrentPeriod && (
            <button
              onClick={() => {
            setYear(nowDate.getFullYear()); setMonth(nowDate.getMonth())
            onMonthChange?.(nowDate.getFullYear(), nowDate.getMonth())
          }}
              style={{
                padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, flexShrink: 0,
                border: '1px solid rgba(0,147,208,0.3)',
                background: 'rgba(0,147,208,0.08)', color: '#0093D0', cursor: 'pointer',
              }}>
              Hoje
            </button>
          )}
        </div>

        {/* ── Grade ── */}
        <div style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-surface-border2)',
          borderRadius: 14, overflow: 'hidden',
        }}>
          {/* Header dias da semana */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            {WEEKDAYS_FULL.map((d, i) => (
              <div key={d} style={{
                padding: '8px 4px', textAlign: 'center',
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                color: i === 0 ? 'rgba(239,68,68,0.6)' : 'var(--color-text-muted)',
                textTransform: 'uppercase',
              }}>
                <span className="cal-weekday-full">{d}</span>
                <span className="cal-weekday-short">{WEEKDAYS_SHORT[i]}</span>
              </div>
            ))}
          </div>

          {/* Semanas */}
          {weeks.map((week, wi) => (
            <div key={wi} style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              borderBottom: wi < weeks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
            }}>
              {week.map((date) => {
                const isCurrentMonth = date.startsWith(currentMonthPrefix)
                const isToday = date === today
                const isPast = date < today
                const entries = schedulesByDate[date] ?? []
                const hasPlanned = entries.some(e => e.schedule.status === 'planned')
                const hasDone = entries.some(e => e.schedule.status === 'done')
                const hasCancelled = entries.some(e => e.schedule.status === 'cancelled')
                const dayNum = parseInt(date.split('-')[2])

                return (
                  <div
                    key={date}
                    className="cal-cell"
                    onClick={() => onDayClick(date)}
                    style={{
                      padding: '5px 4px 6px',
                      cursor: 'pointer',
                      background: isToday
                        ? 'rgba(0,147,208,0.08)'
                        : !isCurrentMonth
                          ? 'rgba(0,0,0,0.12)'
                          : undefined,
                      borderLeft: '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.12s',
                    }}
                  >
                    {/* Número + dots row */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 3,
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        background: isToday ? '#0093D0' : 'transparent',
                        fontSize: 12,
                        fontWeight: isToday ? 800 : isPast && isCurrentMonth ? 500 : 600,
                        color: isToday
                          ? '#fff'
                          : !isCurrentMonth
                            ? 'var(--color-text-muted)'
                            : isPast
                              ? 'var(--color-text-secondary)'
                              : 'var(--color-text)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {dayNum}
                      </div>

                      {/* Indicadores desktop (topo-direita) — um dot por status */}
                      <div className="cal-dots-top" style={{ gap: 2 }}>
                        {hasDone && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />}
                        {hasPlanned && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#0093D0' }} />}
                        {hasCancelled && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />}
                      </div>
                    </div>

                    {/* Chips — visíveis só no desktop */}
                    <div className="cal-chips">
                      {entries.slice(0, 2).map(({ schedule, pivotName }) => {
                        const isDone = schedule.status === 'done'
                        const isCancelled = schedule.status === 'cancelled'
                        const color = isDone ? '#22c55e' : isCancelled ? '#ef4444' : '#0093D0'
                        const bg = isDone ? 'rgba(34,197,94,0.12)' : isCancelled ? 'rgba(239,68,68,0.10)' : 'rgba(0,147,208,0.12)'
                        const border = isDone ? 'rgba(34,197,94,0.25)' : isCancelled ? 'rgba(239,68,68,0.25)' : 'rgba(0,147,208,0.25)'
                        return (
                          <div key={schedule.id} className="cal-chip" style={{ background: bg, border: `1px solid ${border}`, color }}>
                            <span style={{ opacity: 0.7, flexShrink: 0, fontSize: 9 }}>
                              {isCancelled ? '✕' : isDone ? '✓' : '○'}
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 9 }}>
                              {pivotName}{schedule.lamina_mm != null ? ` ${schedule.lamina_mm.toFixed(1)}` : ''}
                            </span>
                          </div>
                        )
                      })}
                      {entries.length > 2 && (
                        <div style={{ fontSize: 9, color: 'var(--color-text-muted)', paddingLeft: 3, fontWeight: 700 }}>
                          +{entries.length - 2}
                        </div>
                      )}
                    </div>

                    {/* Dots mobile — abaixo do número */}
                    {entries.length > 0 && (
                      <div className="cal-dots" style={{ gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                        {entries.slice(0, 4).map(({ schedule }) => {
                          const isDone = schedule.status === 'done'
                          const isCancelled = schedule.status === 'cancelled'
                          const color = isDone ? '#22c55e' : isCancelled ? '#ef4444' : '#0093D0'
                          return <div key={schedule.id} style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        })}
                        {entries.length > 4 && <span style={{ fontSize: 8, color: 'var(--color-text-muted)', fontWeight: 700 }}>+{entries.length - 4}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Legenda */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {[
            { color: '#0093D0', label: 'Planejado' },
            { color: '#22c55e', label: 'Realizado' },
            { color: '#ef4444', label: 'Cancelado' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: 0.85 }} />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</span>
            </div>
          ))}
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
            Toque num dia → visão semanal
          </span>
        </div>
      </div>
    </>
  )
}

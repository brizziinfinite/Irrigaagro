'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  listActiveManagementSeasonContexts,
  listDailyManagementBySeason,
} from '@/services/management'
import type { ManagementSeasonContext } from '@/services/management'
import {
  listSchedulesByCompany,
  upsertSchedule,
  cancelSchedule,
} from '@/services/irrigation-schedule'
import type { IrrigationSchedule, IrrigationCancelledReason, PivotSpeedEntry } from '@/types/database'
import { calcDAS } from '@/lib/calculations/management-balance'
import {
  getStageInfoForDas, calcCTA, calcCAD, calcEtc, calcADc,
} from '@/lib/water-balance'
import type { DailyManagement } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, ChevronDown, ChevronUp, X } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(ymd: string, n: number) {
  const d = new Date(ymd + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toYMD(d)
}

function fmtShort(ymd: string) {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtWeekday(ymd: string) {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
}

function parseNum(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'))
  return isFinite(n) ? n : null
}

function entryFromTable(table: PivotSpeedEntry[], laminaMm: number): PivotSpeedEntry | null {
  if (!table.length || laminaMm <= 0) return null
  const sorted = [...table].sort((a, b) => a.water_depth_mm - b.water_depth_mm)
  const candidates = sorted.filter(e => e.water_depth_mm >= laminaMm)
  return candidates.length > 0 ? candidates[0] : sorted[0]
}

function calcEndTime(startTime: string, durationHours: number): string {
  if (!startTime || !durationHours) return ''
  const [hStr, mStr] = startTime.split(':')
  const totalMin = parseInt(hStr) * 60 + parseInt(mStr) + Math.round(durationHours * 60)
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── Tipos ────────────────────────────────────────────────────

interface DayEntry {
  rainfall: string
  lamina: string
  speed: string
  speedAuto: boolean
  startTime: string
  endTime: string
}

type PivotGrid = Record<string, DayEntry> // date → entry

interface PivotMeta {
  context: ManagementSeasonContext
  speedTable: PivotSpeedEntry[]
  history: DailyManagement[]
  currentPct: number | null   // % hoje (do último registro real)
  ctaMm: number
  cadMm: number
}

// ─── Cálculo de % para um dia (acumulando grid dos dias anteriores) ──────────

function adcForDate(meta: PivotMeta, date: string, pivotGrid: PivotGrid): number {
  const { context, history, ctaMm } = meta
  const { season, crop } = context
  if (ctaMm === 0) return 0

  const lastHistoric = history.find(h => h.date < date)
  let adc = lastHistoric?.ctda ?? (ctaMm * ((season.initial_adc_percent ?? 100) / 100))
  const lastEto = history.find(h => h.eto_mm != null)?.eto_mm ?? 5

  let cursor = lastHistoric ? addDays(lastHistoric.date, 1) : (season.planting_date ?? date)
  while (cursor < date) {
    const das = season.planting_date ? calcDAS(season.planting_date, cursor) : 1
    const stageInfo = crop ? getStageInfoForDas(crop, das) : null
    const etc = calcEtc(lastEto, stageInfo?.kc ?? 1)
    const cell = pivotGrid[cursor]
    adc = calcADc(adc, cell ? (parseNum(cell.rainfall) ?? 0) : 0, cell ? (parseNum(cell.lamina) ?? 0) : 0, etc, ctaMm)
    cursor = addDays(cursor, 1)
  }
  return adc
}

function pctForDate(meta: PivotMeta, date: string, pivotGrid: PivotGrid): number | null {
  if (meta.ctaMm === 0) return null
  return (adcForDate(meta, date, pivotGrid) / meta.ctaMm) * 100
}

function projectedPct(meta: PivotMeta, date: string, pivotGrid: PivotGrid): number | null {
  const { context, ctaMm } = meta
  const { season, crop } = context
  if (!crop || ctaMm === 0) return null
  const adc = adcForDate(meta, date, pivotGrid)
  const das = season.planting_date ? calcDAS(season.planting_date, date) : 1
  const stageInfo = getStageInfoForDas(crop, das)
  const lastEto = meta.history.find(h => h.eto_mm != null)?.eto_mm ?? 5
  const cell = pivotGrid[date]
  const adcNew = calcADc(adc, cell ? (parseNum(cell.rainfall) ?? 0) : 0, cell ? (parseNum(cell.lamina) ?? 0) : 0, calcEtc(lastEto, stageInfo.kc), ctaMm)
  return (adcNew / ctaMm) * 100
}

function pctColor(pct: number | null, threshold: number): string {
  if (pct == null) return '#445566'
  if (pct < threshold - 10) return '#ef4444'
  if (pct < threshold) return '#f59e0b'
  return '#22c55e'
}

// ─── Chip de info agronômica ──────────────────────────────────

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: `${color}10`, border: `1px solid ${color}28`,
      borderRadius: 7, padding: '3px 9px', flexShrink: 0,
    }}>
      <span style={{ fontSize: 8, color: '#445566', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, lineHeight: 1.2 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color, lineHeight: 1.3, fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}

// ─── Barra d'água (coluna vertical de umidade) ────────────────
// pct = % atual (0-100), projPct = % após irrigação, threshold = alerta

function WaterBar({
  pct, projPct = null, threshold, height = 52, width = 16,
}: {
  pct: number | null; projPct?: number | null
  threshold: number; height?: number; width?: number
}) {
  const fillColor = pctColor(pct, threshold)
  const projColor2 = projPct != null ? pctColor(projPct, threshold) : fillColor
  const fillH   = pct     != null ? Math.max(2, (pct     / 100) * height) : 0
  const projH   = projPct != null ? Math.max(2, (projPct / 100) * height) : fillH
  const threshH = (threshold / 100) * height

  return (
    <div style={{
      width, height, position: 'relative', flexShrink: 0,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 4, overflow: 'hidden',
    }}>
      {/* Barra projeção (fundo, mais clara) */}
      {projPct != null && projH > fillH && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: projH,
          background: `${projColor2}30`,
          borderRadius: 3,
        }} />
      )}
      {/* Barra atual */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: fillH,
        background: fillColor,
        borderRadius: 3,
        opacity: 0.85,
      }} />
      {/* Linha de threshold */}
      <div style={{
        position: 'absolute', bottom: threshH, left: 0, right: 0,
        height: 1,
        background: 'rgba(245,158,11,0.7)',
      }} />
    </div>
  )
}

// ─── Mini campo ───────────────────────────────────────────────

function MiniField({
  label, value, onChange, type = 'number', placeholder = '—',
  color = '#8899aa', bg = 'rgba(255,255,255,0.05)',
  border = 'rgba(255,255,255,0.09)', readOnly = false, bold = false,
}: {
  label: string; value: string; onChange?: (v: string) => void
  type?: string; placeholder?: string; color?: string
  bg?: string; border?: string; readOnly?: boolean; bold?: boolean
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 9, color: '#6a8090', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {label}
      </p>
      <input
        type={type} placeholder={placeholder} value={value} readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)}
        style={{
          width: '100%', padding: '5px 6px', borderRadius: 5,
          background: readOnly ? 'rgba(255,255,255,0.02)' : bg,
          border: `1px solid ${readOnly ? 'rgba(255,255,255,0.05)' : border}`,
          color: readOnly ? '#556677' : color,
          fontSize: 12, textAlign: 'center',
          fontFamily: 'var(--font-mono)', fontWeight: bold ? 700 : 400,
          boxSizing: 'border-box', cursor: readOnly ? 'default' : 'text',
          outline: 'none',
        }}
      />
    </div>
  )
}

// ─── Modal de cancelamento ────────────────────────────────────

function CancelModal({
  date, pivotName, onConfirm, onClose,
}: {
  date: string; pivotName: string
  onConfirm: (reason: IrrigationCancelledReason, notes: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState<IrrigationCancelledReason>('chuva')
  const [notes, setNotes] = useState('')

  const REASONS: { value: IrrigationCancelledReason; label: string; color: string }[] = [
    { value: 'chuva',  label: '🌧 Chuva',   color: '#22d3ee' },
    { value: 'quebra', label: '🔧 Quebra',   color: '#f59e0b' },
    { value: 'outro',  label: '❓ Outro',    color: '#8899aa' },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#0f1923', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 16, padding: 28, width: 360, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Cancelar irrigação</p>
            <p style={{ fontSize: 12, color: '#445566', margin: '2px 0 0' }}>{pivotName} · {fmtShort(date)}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#445566', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 11, color: '#6a8090', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Motivo</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {REASONS.map(r => (
            <button key={r.value} onClick={() => setReason(r.value)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, border: `1px solid ${reason === r.value ? r.color : 'rgba(255,255,255,0.08)'}`,
              background: reason === r.value ? `${r.color}18` : 'rgba(255,255,255,0.03)',
              color: reason === r.value ? r.color : '#667788', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              {r.label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 11, color: '#6a8090', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Observação (opcional)</p>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Ex: chuva de 25mm, pivô quebrou o redutor..."
          rows={2}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, resize: 'none',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
            background: 'transparent', color: '#667788', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Voltar
          </button>
          <button onClick={() => onConfirm(reason, notes)} style={{
            flex: 2, padding: '10px', borderRadius: 8, border: 'none',
            background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            Confirmar cancelamento
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card de um pivô ─────────────────────────────────────────

function PivotCard({
  meta, today, schedules, onSave, onCancel,
}: {
  meta: PivotMeta
  today: string
  schedules: IrrigationSchedule[]
  onSave: (entries: { date: string; entry: DayEntry }[]) => Promise<void>
  onCancel: (schedule: IrrigationSchedule) => void
}) {
  const { context, ctaMm } = meta
  const { pivot, farm, season, crop } = context
  const threshold = pivot?.alert_threshold_percent ?? 70
  const name = pivot?.name ?? season.name

  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)

  // Grid: 7 dias a partir de hoje
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const emptyEntry = (): DayEntry => ({ rainfall: '', lamina: '', speed: '', speedAuto: false, startTime: '', endTime: '' })
  const [grid, setGrid] = useState<PivotGrid>(() => Object.fromEntries(days.map(d => [d, emptyEntry()])))

  // Pré-preencher grid com schedules existentes
  useEffect(() => {
    setGrid(prev => {
      const next = { ...prev }
      for (const s of schedules) {
        if (next[s.date] !== undefined && s.status !== 'cancelled') {
          next[s.date] = {
            rainfall:  s.rainfall_mm  != null ? String(s.rainfall_mm)  : '',
            lamina:    s.lamina_mm    != null ? String(s.lamina_mm)    : '',
            speed:     s.speed_percent != null ? String(s.speed_percent) : '',
            speedAuto: false,
            startTime: s.start_time ?? '',
            endTime:   s.end_time   ?? '',
          }
        }
      }
      return next
    })
  }, [schedules])

  function updateDay(date: string, field: keyof DayEntry, value: string | boolean) {
    setGrid(prev => ({ ...prev, [date]: { ...prev[date], [field]: value } }))
  }

  function handleLamina(date: string, v: string) {
    updateDay(date, 'lamina', v)
    const mm = parseNum(v)
    if (mm != null && mm > 0 && meta.speedTable.length > 0) {
      const te = entryFromTable(meta.speedTable, mm)
      if (te) {
        updateDay(date, 'speed', String(te.speed_percent))
        updateDay(date, 'speedAuto', true)
        const startTime = grid[date]?.startTime
        if (startTime) updateDay(date, 'endTime', calcEndTime(startTime, te.duration_hours))
      }
    } else if (v === '') {
      updateDay(date, 'speed', '')
      updateDay(date, 'speedAuto', true)
      updateDay(date, 'endTime', '')
    }
  }

  function handleStartTime(date: string, v: string) {
    updateDay(date, 'startTime', v)
    const mm = parseNum(grid[date]?.lamina ?? '')
    if (mm != null && mm > 0 && meta.speedTable.length > 0) {
      const te = entryFromTable(meta.speedTable, mm)
      if (te && v) updateDay(date, 'endTime', calcEndTime(v, te.duration_hours))
    }
  }

  async function handleSave() {
    const filled = days
      .map(d => ({ date: d, entry: grid[d] }))
      .filter(({ entry }) => entry.lamina !== '' || entry.rainfall !== '')
    if (filled.length === 0) return
    setSaving(true)
    try { await onSave(filled) } finally { setSaving(false) }
  }

  // Dados da fase atual
  const das = season.planting_date ? calcDAS(season.planting_date, today) : 1
  const stageInfo = crop ? getStageInfoForDas(crop, das) : null
  const todayPct   = pctForDate(meta, today, grid)
  const todayColor = pctColor(todayPct, threshold)
  const scheduledCount = days.filter(d =>
    schedules.some(sc => sc.date === d && sc.status === 'planned')
  ).length

  return (
    <div style={{
      background: '#0f1923',
      border: `1px solid ${expanded ? 'rgba(0,147,208,0.25)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 14,
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* ── Cabeçalho (sempre visível) ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', userSelect: 'none' }}
      >
        {/* Nome + fazenda */}
        <div style={{ flex: '0 0 180px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{name}</span>
            {scheduledCount > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: '#0093D0',
                background: 'rgba(0,147,208,0.12)', border: '1px solid rgba(0,147,208,0.25)',
                borderRadius: 99, padding: '1px 7px',
              }}>
                {scheduledCount} prog.
              </span>
            )}
          </div>
          <span style={{ fontSize: 10, color: '#445566' }}>{farm.name}</span>
        </div>

        {/* Chips de info agronômica */}
        <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {crop && (
            <Chip label="Cultura" value={crop.name} color="#22c55e" />
          )}
          {stageInfo && (
            <Chip label="Fase" value={`${stageInfo.stage}ª`} color="#0093D0" />
          )}
          <Chip label="DAS" value={`${das}d`} color="#8899aa" />
          {stageInfo && (
            <Chip label="Kc" value={stageInfo.kc.toFixed(2)} color="#f59e0b" />
          )}
          {season.planting_date && (
            <Chip label="Plantio" value={fmtShort(season.planting_date)} color="#556677" />
          )}
        </div>

        {/* % campo + mini barra */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <WaterBar pct={todayPct} threshold={threshold} height={36} width={10} />
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 9, color: '#445566', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hoje</p>
            <span style={{ fontSize: 22, fontWeight: 800, color: todayColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {todayPct != null ? `${Math.round(todayPct)}%` : '—'}
            </span>
          </div>
        </div>

        <div style={{ color: '#334455', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      {/* ── Conteúdo expandido: 7 dias ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '14px 16px 16px' }}>
          {/* Grid de dias */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 14 }}>
            {days.map(date => {
              const isToday = date === today
              const isPast  = date < today
              const entry   = grid[date]
              const schedule = schedules.find(s => s.date === date)
              const isCancelled = schedule?.status === 'cancelled'
              const isPlanned   = schedule?.status === 'planned'
              const dayPct  = pctForDate(meta, date, grid)
              const projPct = projectedPct(meta, date, grid)
              const hasEntry = entry.lamina !== '' || entry.rainfall !== ''
              const projColor = pctColor(projPct, threshold)

              return (
                <div key={date} style={{
                  background: isCancelled
                    ? 'rgba(239,68,68,0.05)'
                    : isToday
                      ? 'rgba(0,147,208,0.08)'
                      : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isCancelled
                    ? 'rgba(239,68,68,0.2)'
                    : isToday
                      ? 'rgba(0,147,208,0.2)'
                      : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 10,
                  padding: '10px 8px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  opacity: isPast && !isToday ? 0.65 : 1,
                }}>
                  {/* Dia header */}
                  <div style={{ textAlign: 'center', marginBottom: 2 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: isToday ? '#0093D0' : '#445566', margin: 0, textTransform: 'uppercase' }}>
                      {isToday ? 'Hoje' : fmtWeekday(date)}
                    </p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: isToday ? '#e2e8f0' : '#667788', margin: 0, fontFamily: 'var(--font-mono)' }}>
                      {fmtShort(date)}
                    </p>
                  </div>

                  {/* Barra d'água + % */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                    <WaterBar
                      pct={dayPct}
                      projPct={hasEntry ? projPct : null}
                      threshold={threshold}
                      height={52}
                      width={16}
                    />
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ fontSize: 9, color: '#445566', margin: '0 0 1px', textTransform: 'uppercase', lineHeight: 1 }}>CC</p>
                      <span style={{ fontSize: 13, fontWeight: 800, color: pctColor(dayPct, threshold), fontFamily: 'var(--font-mono)', lineHeight: 1, display: 'block' }}>
                        {dayPct != null ? `${Math.round(dayPct)}%` : '—'}
                      </span>
                      {hasEntry && projPct != null && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: projColor, fontFamily: 'var(--font-mono)', display: 'block', marginTop: 1 }}>
                          →{Math.round(projPct)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Campos */}
                  {isCancelled ? (
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                      <p style={{ fontSize: 10, color: '#ef4444', margin: 0, fontWeight: 700 }}>Cancelado</p>
                      <p style={{ fontSize: 9, color: '#556677', margin: '2px 0 0' }}>
                        {schedule?.cancelled_reason ?? ''}
                      </p>
                    </div>
                  ) : (
                    <>
                      <MiniField label="Chuva mm" value={entry.rainfall}
                        onChange={v => updateDay(date, 'rainfall', v)}
                        color="rgba(255,255,255,0.7)" />
                      <MiniField label="Lâmina mm" value={entry.lamina}
                        onChange={v => handleLamina(date, v)}
                        color="#0093D0" bg="rgba(0,147,208,0.10)" border="rgba(0,147,208,0.25)" bold />
                      <MiniField
                        label={entry.speedAuto && entry.speed ? 'Vel % ↺' : 'Vel %'}
                        value={entry.speed}
                        onChange={v => { updateDay(date, 'speed', v); updateDay(date, 'speedAuto', false) }}
                        color={entry.speedAuto && entry.speed ? '#f59e0b' : '#8899aa'}
                        bg={entry.speedAuto && entry.speed ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.04)'}
                        border={entry.speedAuto && entry.speed ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}
                      />
                      <MiniField label="Início" type="time" value={entry.startTime}
                        onChange={v => handleStartTime(date, v)}
                        color="#e2e8f0" bg="rgba(255,255,255,0.06)" border="rgba(255,255,255,0.12)" />
                      <MiniField label="Fim" type="time" value={entry.endTime}
                        readOnly color="#f59e0b" />

                      {/* Botão cancelar — só dias com schedule planned */}
                      {isPlanned && !isPast && (
                        <button
                          onClick={() => onCancel(schedule!)}
                          style={{
                            marginTop: 2, width: '100%', padding: '4px 0',
                            borderRadius: 5, border: '1px solid rgba(239,68,68,0.25)',
                            background: 'rgba(239,68,68,0.07)', color: '#ef4444',
                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          }}>
                          Cancelar
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Botão Salvar */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
              background: saving ? 'rgba(0,147,208,0.4)' : 'linear-gradient(135deg, #0093D0 0%, #0070a8 100%)',
              color: '#fff', fontSize: 14, fontWeight: 800, cursor: saving ? 'wait' : 'pointer',
              boxShadow: '0 2px 16px rgba(0,147,208,0.3)',
              letterSpacing: '0.02em',
            }}>
            {saving ? 'Salvando programação…' : 'Salvar programação'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────

export default function LancamentosPage() {
  const { company } = useAuth()

  const [today, setToday] = useState('')
  const [metas, setMetas] = useState<PivotMeta[]>([])
  // schedules indexados por pivotId
  const [schedulesByPivot, setSchedulesByPivot] = useState<Record<string, IrrigationSchedule[]>>({})
  const [loading, setLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  // Modal de cancelamento
  const [cancelTarget, setCancelTarget] = useState<{ schedule: IrrigationSchedule; pivotName: string } | null>(null)

  useEffect(() => { setToday(toYMD(new Date())) }, [])

  const load = useCallback(async () => {
    if (!company || !today) return
    setLoading(true)
    setPageError(null)
    try {
      const supabase = createClient()
      const contexts = await listActiveManagementSeasonContexts(undefined, company.id)

      const metaList: PivotMeta[] = await Promise.all(contexts.map(async ctx => {
        const history = await listDailyManagementBySeason(ctx.season.id)
        const { data: speedRows } = await (supabase as any)
          .from('pivot_speed_table').select('*').eq('pivot_id', ctx.pivot?.id ?? '')
        const speedTable: PivotSpeedEntry[] = speedRows ?? []

        const { season, crop } = ctx
        const das = season.planting_date ? calcDAS(season.planting_date, today) : 1
        const stageInfo = crop ? getStageInfoForDas(crop, das) : null
        const CC = season.field_capacity ?? 32
        const PM = season.wilting_point  ?? 14
        const Ds = season.bulk_density   ?? 1.4
        const ctaMm = stageInfo ? calcCTA(CC, PM, Ds, stageInfo.rootDepthCm) : 0
        const cadMm = stageInfo ? calcCAD(ctaMm, stageInfo.fFactor) : 0
        const lastRecord = history.find(h => h.ctda != null)
        const adcMm = lastRecord?.ctda ?? (ctaMm * ((season.initial_adc_percent ?? 100) / 100))
        const currentPct = ctaMm > 0 ? (adcMm / ctaMm) * 100 : null

        return { context: ctx, speedTable, history, currentPct, ctaMm, cadMm }
      }))

      setMetas(metaList)

      // Buscar schedules (silencia erro se tabela ainda não existir)
      try {
        const from = today
        const to   = addDays(today, 6)
        const allSchedules = await listSchedulesByCompany(company.id, from, to)
        const byPivot: Record<string, IrrigationSchedule[]> = {}
        for (const s of allSchedules) {
          if (!byPivot[s.pivot_id]) byPivot[s.pivot_id] = []
          byPivot[s.pivot_id].push(s)
        }
        setSchedulesByPivot(byPivot)
      } catch { /* tabela ainda não criada — ignorar */ }

    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [company, today])

  useEffect(() => { load() }, [load])

  // ── Salvar programação de um pivô ──
  async function handleSave(meta: PivotMeta, entries: { date: string; entry: DayEntry }[]) {
    const pivotId  = meta.context.pivot?.id
    const seasonId = meta.context.season.id
    if (!pivotId || !company) return

    const saved: IrrigationSchedule[] = []
    for (const { date, entry } of entries) {
      const s = await upsertSchedule({
        company_id:    company.id,
        pivot_id:      pivotId,
        season_id:     seasonId,
        date,
        lamina_mm:     parseNum(entry.lamina),
        speed_percent: parseNum(entry.speed),
        start_time:    entry.startTime || null,
        end_time:      entry.endTime   || null,
        rainfall_mm:   parseNum(entry.rainfall),
        status:        'planned',
      })
      saved.push(s)
    }

    setSchedulesByPivot(prev => {
      const existing = (prev[pivotId] ?? []).filter(s => !saved.some(ns => ns.date === s.date))
      return { ...prev, [pivotId]: [...existing, ...saved] }
    })
  }

  // ── Cancelar programação ──
  async function handleCancelConfirm(reason: IrrigationCancelledReason, notes: string) {
    if (!cancelTarget) return
    const { schedule } = cancelTarget
    const updated = await cancelSchedule(schedule.id, reason, notes)
    setSchedulesByPivot(prev => ({
      ...prev,
      [schedule.pivot_id]: (prev[schedule.pivot_id] ?? []).map(s => s.id === updated.id ? updated : s),
    }))
    setCancelTarget(null)
  }

  if (!company || !today) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#445566', fontSize: 13 }}>Carregando…</div>
  )

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Modal cancelamento */}
      {cancelTarget && (
        <CancelModal
          date={cancelTarget.schedule.date}
          pivotName={cancelTarget.pivotName}
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <ClipboardList size={20} style={{ color: '#0093D0' }} />
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0', margin: 0, letterSpacing: '-0.02em' }}>
            Lançamentos
          </h1>
        </div>
        <p style={{ fontSize: 13, color: '#445566', margin: 0 }}>
          Clique em um pivô para programar irrigação nos próximos 7 dias
        </p>
      </div>

      {/* Error */}
      {pageError && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
          {pageError}
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#445566', fontSize: 13 }}>Carregando pivôs…</div>
      ) : metas.length === 0 ? (
        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#445566', fontSize: 14 }}>Nenhuma safra ativa encontrada.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {metas.map(meta => (
            <PivotCard
              key={meta.context.season.id}
              meta={meta}
              today={today}
              schedules={schedulesByPivot[meta.context.pivot?.id ?? ''] ?? []}
              onSave={entries => handleSave(meta, entries)}
              onCancel={schedule => setCancelTarget({
                schedule,
                pivotName: meta.context.pivot?.name ?? meta.context.season.name,
              })}
            />
          ))}
        </div>
      )}

      {/* Print view — tabela resumida */}
      <div className="print-only" style={{ display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, borderBottom: '2px solid #0093D0', paddingBottom: 10 }}>
          <svg width="36" height="36" viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="pb" x1="8" y1="6" x2="36" y2="46" gradientUnits="userSpaceOnUse"><stop stopColor="#38BDF8"/><stop offset="1" stopColor="#0284C7"/></linearGradient>
              <linearGradient id="pg" x1="28" y1="22" x2="54" y2="54" gradientUnits="userSpaceOnUse"><stop stopColor="#84CC16"/><stop offset="1" stopColor="#16A34A"/></linearGradient>
            </defs>
            <path d="M31.5 4C31.5 4 13 22.6 13 35.5C13 47.4 21.8 56 33 56C44.2 56 53 47.4 53 35.5C53 22.6 31.5 4 31.5 4Z" fill="url(#pb)"/>
            <path d="M30 24C41.6 24 51 33.4 51 45C51 48.2 50.3 51.1 48.9 53.7H30V24Z" fill="url(#pg)" opacity="0.95"/>
            <rect x="23" y="37" width="6" height="13" rx="1.5" fill="#0B1220" opacity="0.9"/>
            <rect x="31" y="30" width="6" height="20" rx="1.5" fill="#0B1220" opacity="0.9"/>
            <rect x="39" y="23" width="6" height="27" rx="1.5" fill="#0B1220" opacity="0.9"/>
          </svg>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              <span style={{ color: '#0284C7' }}>Irriga</span><span style={{ color: '#16A34A', fontWeight: 300 }}>Agro</span>
            </div>
            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Programação de Irrigação</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: '#888', textAlign: 'right' }}>
            Emitido: {new Date().toLocaleString('pt-BR')}
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f0f4f8' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #0093D0' }}>Pivô / Fazenda</th>
              <th style={{ padding: '6px', borderBottom: '2px solid #0093D0' }}>Data</th>
              <th style={{ padding: '6px', borderBottom: '2px solid #0093D0' }}>Lâmina</th>
              <th style={{ padding: '6px', borderBottom: '2px solid #0093D0' }}>Vel %</th>
              <th style={{ padding: '6px', borderBottom: '2px solid #0093D0' }}>Início</th>
              <th style={{ padding: '6px', borderBottom: '2px solid #0093D0' }}>Fim</th>
              <th style={{ padding: '6px', borderBottom: '2px solid #0093D0' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {metas.flatMap((meta, mi) => {
              const pivotId = meta.context.pivot?.id ?? ''
              const ss = schedulesByPivot[pivotId] ?? []
              return ss.map((s, si) => (
                <tr key={s.id} style={{ background: mi % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {si === 0 && (
                    <td rowSpan={ss.length} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                      <strong>{meta.context.pivot?.name ?? '—'}</strong><br />
                      <span style={{ color: '#666', fontSize: 10 }}>{meta.context.farm.name}</span>
                    </td>
                  )}
                  <td style={{ textAlign: 'center', padding: '4px 6px' }}>{fmtShort(s.date)}</td>
                  <td style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 700 }}>{s.lamina_mm ?? '—'} mm</td>
                  <td style={{ textAlign: 'center', padding: '4px 6px' }}>{s.speed_percent ?? '—'}%</td>
                  <td style={{ textAlign: 'center', padding: '4px 6px' }}>{s.start_time ?? '—'}</td>
                  <td style={{ textAlign: 'center', padding: '4px 6px' }}>{s.end_time ?? '—'}</td>
                  <td style={{ textAlign: 'center', padding: '4px 6px', color: s.status === 'cancelled' ? '#ef4444' : s.status === 'done' ? '#22c55e' : '#0093D0' }}>
                    {s.status === 'cancelled' ? 'Cancelado' : s.status === 'done' ? 'Realizado' : 'Programado'}
                  </td>
                </tr>
              ))
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; color: black !important; }
        }
        @media screen { .print-only { display: none !important; } }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.4); }
        input:focus { outline: 1px solid rgba(0,147,208,0.5) !important; }
      `}</style>
    </div>
  )
}

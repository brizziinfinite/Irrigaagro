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
import { listSectorsByPivotId } from '@/services/pivot-sectors'
import type { IrrigationSchedule, IrrigationCancelledReason, PivotSpeedEntry, PivotSector } from '@/types/database'
import { calcDAS, projectAdcToDate } from '@/lib/calculations/management-balance'
import {
  getStageInfoForDas, calcCTA, calcCAD, calcEtc, calcADc,
} from '@/lib/water-balance'
import type { DailyManagement } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, ChevronDown, ChevronUp, X, Copy } from 'lucide-react'
import { ScheduleHistory } from './ScheduleHistory'

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

/** Dado um speed%, encontra a entrada mais próxima na tabela de velocidade */
function entryFromSpeed(table: PivotSpeedEntry[], speedPct: number): PivotSpeedEntry | null {
  if (!table.length || speedPct <= 0) return null
  return table.reduce((best, cur) =>
    Math.abs(cur.speed_percent - speedPct) < Math.abs(best.speed_percent - speedPct) ? cur : best
  )
}

function calcEndTime(startTime: string, durationHours: number): string {
  if (!startTime || !durationHours) return ''
  const [hStr, mStr] = startTime.split(':')
  const totalMin = parseInt(hStr) * 60 + parseInt(mStr) + Math.round(durationHours * 60)
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Fração do setor em relação a 360° (ex: 0→180 = 0.5). Sem ângulos = 1 (volta completa) */
function sectorFraction(sector: PivotSector | null): number {
  if (!sector || sector.angle_start == null || sector.angle_end == null) return 1
  let deg = sector.angle_end - sector.angle_start
  if (deg <= 0) deg += 360
  return deg / 360
}

/** Adiciona horas a um horário HH:MM — pode passar da meia-noite */
function addHoursToTime(startTime: string, hours: number): string {
  if (!startTime || !hours) return ''
  const [hStr, mStr] = startTime.split(':')
  const totalMin = parseInt(hStr) * 60 + parseInt(mStr) + Math.round(hours * 60)
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

// Para pivôs com setores: sectorId → date → DayEntry
// sectorId '' (string vazia) representa o pivô completo (sem setores)
type SectorGrid = Record<string, PivotGrid> // sectorId → PivotGrid

interface PivotMeta {
  context: ManagementSeasonContext
  speedTable: PivotSpeedEntry[]
  sectors: PivotSector[]       // setores do pivô (vazio = pivô sem setores)
  history: DailyManagement[]
  currentPct: number | null    // % hoje (projetado com dados climáticos reais)
  currentAdcMm: number         // ADc mm hoje (projetado, usado como ponto de partida do grid)
  ctaMm: number
  cadMm: number
}

// ─── Cálculo de % para um dia (acumulando grid dos dias anteriores) ──────────

function adcForDate(meta: PivotMeta, date: string, pivotGrid: PivotGrid, today: string): number {
  const { context, history, ctaMm, currentAdcMm } = meta
  const { season, crop } = context
  if (ctaMm === 0) return 0

  // Para "hoje" ou datas futuras, parte do ADc projetado (já calculado com dados climáticos reais).
  // Para datas passadas no histórico (não deve acontecer no grid normal), usa o histórico.
  const useProjected = date >= today
  if (useProjected) {
    const lastEto = history.find(h => h.eto_mm != null)?.eto_mm ?? 5
    const CC = context.pivot?.field_capacity ?? season.field_capacity ?? 32
    const PM = context.pivot?.wilting_point  ?? season.wilting_point  ?? 14
    const Ds = context.pivot?.bulk_density   ?? season.bulk_density   ?? 1.4
    let adc = currentAdcMm
    let cursor = today
    while (cursor < date) {
      const das = season.planting_date ? calcDAS(season.planting_date, cursor) : 1
      const stageInfo = crop ? getStageInfoForDas(crop, das) : null
      const dasPrev = das - 1
      const stageInfoPrev = crop && dasPrev > 0 ? getStageInfoForDas(crop, dasPrev) : stageInfo
      const ctaCursor = stageInfo ? calcCTA(CC, PM, Ds, stageInfo.rootDepthCm) : ctaMm
      const ctaPrev   = stageInfoPrev ? calcCTA(CC, PM, Ds, stageInfoPrev.rootDepthCm) : ctaCursor
      const etc = calcEtc(lastEto, stageInfo?.kc ?? 1)
      const cell = pivotGrid[cursor]
      adc = calcADc(adc, cell ? (parseNum(cell.rainfall) ?? 0) : 0, cell ? (parseNum(cell.lamina) ?? 0) : 0, etc, ctaCursor, ctaPrev)
      cursor = addDays(cursor, 1)
    }
    return adc
  }

  // Datas passadas: usa histórico real (fallback com lastEto fixo)
  const lastHistoric = history.find(h => h.date < date)
  let adc = lastHistoric?.ctda ?? (ctaMm * ((season.initial_adc_percent ?? 100) / 100))
  const lastEto = history.find(h => h.eto_mm != null)?.eto_mm ?? 5
  let cursor = lastHistoric ? addDays(lastHistoric.date, 1) : (season.planting_date ?? date)
  while (cursor < date) {
    const das = season.planting_date ? calcDAS(season.planting_date, cursor) : 1
    const stageInfo = crop ? getStageInfoForDas(crop, das) : null
    const dasPrevCursor = das - 1
    const stageInfoPrevCursor = crop && dasPrevCursor > 0 ? getStageInfoForDas(crop, dasPrevCursor) : stageInfo
    const CC = context.pivot?.field_capacity ?? season.field_capacity ?? 32
    const PM = context.pivot?.wilting_point  ?? season.wilting_point  ?? 14
    const Ds = context.pivot?.bulk_density   ?? season.bulk_density   ?? 1.4
    const ctaCursor = stageInfo ? calcCTA(CC, PM, Ds, stageInfo.rootDepthCm) : ctaMm
    const ctaPrevCursor = stageInfoPrevCursor ? calcCTA(CC, PM, Ds, stageInfoPrevCursor.rootDepthCm) : ctaCursor
    const etc = calcEtc(lastEto, stageInfo?.kc ?? 1)
    const cell = pivotGrid[cursor]
    adc = calcADc(adc, cell ? (parseNum(cell.rainfall) ?? 0) : 0, cell ? (parseNum(cell.lamina) ?? 0) : 0, etc, ctaCursor, ctaPrevCursor)
    cursor = addDays(cursor, 1)
  }
  return adc
}

function pctForDate(meta: PivotMeta, date: string, pivotGrid: PivotGrid, today: string): number | null {
  const { context } = meta
  const { season, crop } = context
  if (!crop || !season.planting_date) return meta.ctaMm > 0
    ? (adcForDate(meta, date, pivotGrid, today) / meta.ctaMm) * 100
    : null
  const das = calcDAS(season.planting_date, date)
  const stageInfo = getStageInfoForDas(crop, das)
  const CC = context.pivot?.field_capacity ?? season.field_capacity ?? 32
  const PM = context.pivot?.wilting_point  ?? season.wilting_point  ?? 14
  const Ds = context.pivot?.bulk_density   ?? season.bulk_density   ?? 1.4
  const ctaForDate = calcCTA(CC, PM, Ds, stageInfo.rootDepthCm)
  if (ctaForDate === 0) return null
  return (adcForDate(meta, date, pivotGrid, today) / ctaForDate) * 100
}

function projectedPct(meta: PivotMeta, date: string, pivotGrid: PivotGrid, today: string): number | null {
  const { context, ctaMm } = meta
  const { season, crop } = context
  if (!crop || ctaMm === 0) return null
  const adc = adcForDate(meta, date, pivotGrid, today)
  const das = season.planting_date ? calcDAS(season.planting_date, date) : 1
  const stageInfo = getStageInfoForDas(crop, das)
  const dasPrevProj = das - 1
  const stageInfoPrevProj = dasPrevProj > 0 ? getStageInfoForDas(crop, dasPrevProj) : stageInfo
  const fieldCapacity = context.pivot?.field_capacity ?? context.season.field_capacity ?? 32
  const wiltingPoint = context.pivot?.wilting_point ?? context.season.wilting_point ?? 14
  const bulkDensity = context.pivot?.bulk_density ?? context.season.bulk_density ?? 1.4
  const ctaProj = calcCTA(fieldCapacity, wiltingPoint, bulkDensity, stageInfo.rootDepthCm)
  const ctaPrevProj = calcCTA(fieldCapacity, wiltingPoint, bulkDensity, stageInfoPrevProj.rootDepthCm)
  const lastEto = meta.history.find(h => h.eto_mm != null)?.eto_mm ?? 5
  const cell = pivotGrid[date]
  const adcNew = calcADc(adc, cell ? (parseNum(cell.rainfall) ?? 0) : 0, cell ? (parseNum(cell.lamina) ?? 0) : 0, calcEtc(lastEto, stageInfo.kc), ctaProj, ctaPrevProj)
  return (adcNew / ctaProj) * 100
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

// ─── Célula de dia para um setor ─────────────────────────────

function DayCell({
  date, today, entry, schedule, speedTable, threshold, meta, sectorGrid, sectorId, sector,
  onUpdate, onCancel,
}: {
  date: string
  today: string
  entry: DayEntry
  schedule: IrrigationSchedule | undefined
  speedTable: PivotSpeedEntry[]
  threshold: number
  meta: PivotMeta
  sectorGrid: PivotGrid
  sectorId: string
  sector: PivotSector | null
  onUpdate: (date: string, field: keyof DayEntry, value: string | boolean) => void
  onCancel: (schedule: IrrigationSchedule) => void
}) {
  const isToday    = date === today
  const isPast     = date < today
  const isCancelled = schedule?.status === 'cancelled'
  const isPlanned   = schedule?.status === 'planned'
  const dayPct  = pctForDate(meta, date, sectorGrid, today)
  const projPct = projectedPct(meta, date, sectorGrid, today)
  const hasEntry = entry.lamina !== '' || entry.rainfall !== ''
  const projColor = pctColor(projPct, threshold)

  // Fração do ângulo do setor: 180°/360° = 0.5, volta completa = 1
  const fraction = sectorFraction(sector)

  function sectorDuration(fullDurationHours: number): number {
    return fullDurationHours * fraction
  }

  function handleLamina(v: string) {
    onUpdate(date, 'lamina', v)
    const mm = parseNum(v)
    if (mm != null && mm > 0 && speedTable.length > 0) {
      const te = entryFromTable(speedTable, mm)
      if (te) {
        onUpdate(date, 'speed', String(te.speed_percent))
        onUpdate(date, 'speedAuto', true)
        const startTime = entry.startTime
        if (startTime) onUpdate(date, 'endTime', addHoursToTime(startTime, sectorDuration(te.duration_hours)))
      }
    } else if (v === '') {
      onUpdate(date, 'speed', '')
      onUpdate(date, 'speedAuto', true)
      onUpdate(date, 'endTime', '')
    }
  }

  function handleSpeed(v: string) {
    onUpdate(date, 'speed', v)
    const pct = parseNum(v)
    if (pct != null && pct > 0 && speedTable.length > 0) {
      const te = entryFromSpeed(speedTable, pct)
      if (te) {
        onUpdate(date, 'lamina', String(te.water_depth_mm))
        onUpdate(date, 'speedAuto', true)
        const startTime = entry.startTime
        if (startTime) onUpdate(date, 'endTime', addHoursToTime(startTime, sectorDuration(te.duration_hours)))
      }
    } else {
      onUpdate(date, 'speedAuto', false)
    }
  }

  function handleStartTime(v: string) {
    onUpdate(date, 'startTime', v)
    if (!v) return
    let fullDuration: number | null = null
    const mm = parseNum(entry.lamina)
    if (mm != null && mm > 0 && speedTable.length > 0) {
      const te = entryFromTable(speedTable, mm)
      fullDuration = te?.duration_hours ?? null
    }
    if (fullDuration == null) {
      const pct = parseNum(entry.speed)
      if (pct != null && pct > 0 && speedTable.length > 0) {
        const te = entryFromSpeed(speedTable, pct)
        fullDuration = te?.duration_hours ?? null
      }
    }
    if (fullDuration != null) onUpdate(date, 'endTime', addHoursToTime(v, sectorDuration(fullDuration)))
  }

  return (
    <div style={{
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
      {/* Dia header — só na primeira linha de setor (controlado externamente via prop) */}
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
            onChange={v => onUpdate(date, 'rainfall', v)}
            color="rgba(255,255,255,0.7)" />
          <MiniField label="Lâmina mm" value={entry.lamina}
            onChange={handleLamina}
            color="#0093D0" bg="rgba(0,147,208,0.10)" border="rgba(0,147,208,0.25)" bold />
          <MiniField
            label={entry.speedAuto && entry.speed ? 'Vel % ↺' : 'Vel %'}
            value={entry.speed}
            onChange={handleSpeed}
            color={entry.speedAuto && entry.speed ? '#f59e0b' : '#8899aa'}
            bg={entry.speedAuto && entry.speed ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.04)'}
            border={entry.speedAuto && entry.speed ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}
          />
          {/* Aviso quando não há tabela de velocidade cadastrada */}
          {speedTable.length === 0 && (
            <p style={{ fontSize: 8, color: '#556677', margin: '-2px 0 0', textAlign: 'center', lineHeight: 1.3 }}>
              Cadastre tabela de vel. nos Pivôs
            </p>
          )}
          <MiniField label="Início" type="time" value={entry.startTime}
            onChange={handleStartTime}
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
}

// ─── Card de um pivô ─────────────────────────────────────────

function PivotCard({
  meta, today, schedules, onSave, onCancel,
}: {
  meta: PivotMeta
  today: string
  schedules: IrrigationSchedule[]
  onSave: (entries: { date: string; sectorId: string | null; entry: DayEntry }[]) => Promise<void>
  onCancel: (schedule: IrrigationSchedule) => void
}) {
  const { context, ctaMm, sectors, speedTable } = meta
  const { pivot, farm, season, crop } = context
  const threshold = pivot?.alert_threshold_percent ?? 70
  const name = pivot?.name ?? season.name

  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)

  // IDs dos setores: se sem setores, usa [''] (string vazia = pivô completo)
  const sectorIds: string[] = sectors.length > 0
    ? sectors.map(s => s.id)
    : ['']

  // Grid por setor: sectorId → date → DayEntry
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const emptyEntry = (): DayEntry => ({ rainfall: '', lamina: '', speed: '', speedAuto: false, startTime: '', endTime: '' })

  const [sectorGrids, setSectorGrids] = useState<SectorGrid>(() =>
    Object.fromEntries(sectorIds.map(sid => [
      sid,
      Object.fromEntries(days.map(d => [d, emptyEntry()])),
    ]))
  )

  // Pré-preencher grids com schedules existentes
  useEffect(() => {
    setSectorGrids(prev => {
      const next: SectorGrid = {}
      for (const sid of sectorIds) {
        next[sid] = { ...(prev[sid] ?? Object.fromEntries(days.map(d => [d, emptyEntry()]))) }
      }
      for (const s of schedules) {
        const sid = s.sector_id ?? ''
        if (!next[sid]) continue
        if (next[sid][s.date] !== undefined && s.status !== 'cancelled') {
          next[sid][s.date] = {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules])

  function updateDayInSector(sectorId: string, date: string, field: keyof DayEntry, value: string | boolean) {
    setSectorGrids(prev => ({
      ...prev,
      [sectorId]: {
        ...prev[sectorId],
        [date]: { ...prev[sectorId]?.[date], [field]: value },
      },
    }))
  }

  /** Replica programação do primeiro setor para os seguintes,
   *  encadeando horários: início do setor N+1 = fim do setor N */
  function replicateFirstSector() {
    if (sectorIds.length < 2) return
    const source = sectorGrids[sectorIds[0]] ?? {}
    setSectorGrids(prev => {
      const next = { ...prev }
      for (let i = 1; i < sectorIds.length; i++) {
        const prevSectorGrid = next[sectorIds[i - 1]] ?? source
        const thisSector = sectors.find(s => s.id === sectorIds[i]) ?? null
        const newGrid: PivotGrid = {}
        for (const date of days) {
          const srcEntry = source[date] ?? emptyEntry()
          const prevEntry = prevSectorGrid[date]
          // Início deste setor = fim do setor anterior
          const newStart = prevEntry?.endTime ?? srcEntry.startTime
          // Recalcular fim com ângulo deste setor
          let newEnd = ''
          if (newStart) {
            const mm = parseNum(srcEntry.lamina)
            let fullDuration: number | null = null
            if (mm != null && mm > 0 && speedTable.length > 0) {
              const te = entryFromTable(speedTable, mm)
              fullDuration = te?.duration_hours ?? null
            }
            if (fullDuration == null) {
              const pct = parseNum(srcEntry.speed)
              if (pct != null && pct > 0 && speedTable.length > 0) {
                const te = entryFromSpeed(speedTable, pct)
                fullDuration = te?.duration_hours ?? null
              }
            }
            if (fullDuration != null) {
              newEnd = addHoursToTime(newStart, fullDuration * sectorFraction(thisSector))
            }
          }
          newGrid[date] = { ...srcEntry, startTime: newStart, endTime: newEnd }
        }
        next[sectorIds[i]] = newGrid
      }
      return next
    })
  }

  async function handleSave() {
    const entries: { date: string; sectorId: string | null; entry: DayEntry }[] = []
    for (const sid of sectorIds) {
      const grid = sectorGrids[sid] ?? {}
      for (const d of days) {
        const entry = grid[d]
        if (entry && (entry.lamina !== '' || entry.rainfall !== '')) {
          entries.push({ date: d, sectorId: sid === '' ? null : sid, entry })
        }
      }
    }
    if (entries.length === 0) return
    setSaving(true)
    try { await onSave(entries) } finally { setSaving(false) }
  }

  // Dados da fase atual
  const das = season.planting_date ? calcDAS(season.planting_date, today) : 1
  const stageInfo = crop ? getStageInfoForDas(crop, das) : null
  // % campo: usa grid do primeiro setor para o card header
  const firstGrid = sectorGrids[sectorIds[0]] ?? {}
  const todayPct   = pctForDate(meta, today, firstGrid, today)
  const todayColor = pctColor(todayPct, threshold)
  const scheduledCount = days.filter(d =>
    schedules.some(sc => sc.date === d && sc.status === 'planned')
  ).length

  const hasSectors = sectors.length > 0

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
            {hasSectors && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: '#22c55e',
                background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)',
                borderRadius: 99, padding: '1px 7px',
              }}>
                {sectors.length} setores
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

      {/* ── Conteúdo expandido ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '14px 16px 16px' }}>
          {/* Botão replicar — só exibido quando há >1 setor */}
          {hasSectors && sectors.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button
                onClick={replicateFirstSector}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid rgba(34,197,94,0.25)',
                  background: 'rgba(34,197,94,0.08)',
                  color: '#22c55e', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                <Copy size={12} />
                Replicar {sectors[0].name} para todos
              </button>
            </div>
          )}

          {/* Grade por setor */}
          {sectorIds.map((sid, sIdx) => {
            const sector = sectors.find(s => s.id === sid) ?? null
            const grid = sectorGrids[sid] ?? {}
            const schedulesForSector = schedules.filter(s => (s.sector_id ?? '') === sid)

            return (
              <div key={sid} style={{ marginBottom: sIdx < sectorIds.length - 1 ? 16 : 0 }}>
                {/* Cabeçalho do setor */}
                {hasSectors && sector && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                    padding: '4px 0',
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Setor {sector.name}
                    </span>
                    {sector.area_ha != null && (
                      <span style={{ fontSize: 10, color: '#445566' }}>{sector.area_ha.toFixed(1)} ha</span>
                    )}
                  </div>
                )}

                {/* Grid de 7 dias */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                  {days.map(date => {
                    const entry = grid[date] ?? emptyEntry()
                    const schedule = schedulesForSector.find(s => s.date === date)
                    return (
                      <DayCell
                        key={date}
                        date={date}
                        today={today}
                        entry={entry}
                        schedule={schedule}
                        speedTable={speedTable}
                        threshold={threshold}
                        meta={meta}
                        sectorGrid={grid}
                        sectorId={sid}
                        sector={sector}
                        onUpdate={(d, field, value) => updateDayInSector(sid, d, field, value)}
                        onCancel={onCancel}
                      />
                    )
                  })}
                </div>

                {/* Separador entre setores */}
                {hasSectors && sIdx < sectorIds.length - 1 && (
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginTop: 12 }} />
                )}
              </div>
            )
          })}

          {/* Botão Salvar */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', marginTop: 14, padding: '12px 0', borderRadius: 10, border: 'none',
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
        const [history, speedRows, sectors] = await Promise.all([
          listDailyManagementBySeason(ctx.season.id),
          (supabase as any).from('pivot_speed_table').select('*').eq('pivot_id', ctx.pivot?.id ?? ''),
          ctx.pivot ? listSectorsByPivotId(ctx.pivot.id) : Promise.resolve([]),
        ])
        const speedTable: PivotSpeedEntry[] = speedRows.data ?? []

        const { season, crop } = ctx
        const das = season.planting_date ? calcDAS(season.planting_date, today) : 1
        const stageInfo = crop ? getStageInfoForDas(crop, das) : null
        const CC = ctx.pivot?.field_capacity ?? season.field_capacity ?? 32
        const PM = ctx.pivot?.wilting_point  ?? season.wilting_point  ?? 14
        const Ds = ctx.pivot?.bulk_density   ?? season.bulk_density   ?? 1.4
        const ctaMm = stageInfo ? calcCTA(CC, PM, Ds, stageInfo.rootDepthCm) : 0
        const cadMm = stageInfo ? calcCAD(ctaMm, stageInfo.fFactor) : 0

        // Projeta ADc até hoje usando a mesma lógica do dashboard (dados climáticos reais)
        let currentPct: number | null = null
        let currentAdcMm = ctaMm * ((season.initial_adc_percent ?? 100) / 100)
        if (crop && season.planting_date && ctx.farm) {
          const lastRecord = history.find(h => h.ctda != null) ?? null
          const projected = await projectAdcToDate({
            lastManagement: lastRecord,
            targetDate: today,
            crop,
            season,
            farm: ctx.farm,
            pivot: ctx.pivot ?? null,
            history,
          })
          currentPct = projected.pct
          currentAdcMm = projected.adcMm
        }

        return { context: ctx, speedTable, sectors, history, currentPct, currentAdcMm, ctaMm, cadMm }
      }))

      setMetas(metaList)

      // Buscar schedules dos próximos 7 dias
      const from = today
      const to   = addDays(today, 6)
      const allSchedules = await listSchedulesByCompany(company.id, from, to)
      const byPivot: Record<string, IrrigationSchedule[]> = {}
      for (const s of allSchedules) {
        if (!byPivot[s.pivot_id]) byPivot[s.pivot_id] = []
        byPivot[s.pivot_id].push(s)
      }
      setSchedulesByPivot(byPivot)

    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [company, today])

  useEffect(() => { load() }, [load])

  // ── Salvar programação de um pivô ──
  async function handleSave(meta: PivotMeta, entries: { date: string; sectorId: string | null; entry: DayEntry }[]) {
    const pivotId  = meta.context.pivot?.id
    const seasonId = meta.context.season.id
    if (!pivotId || !company) return

    const saved: IrrigationSchedule[] = []
    for (const { date, sectorId, entry } of entries) {
      const s = await upsertSchedule({
        company_id:    company.id,
        pivot_id:      pivotId,
        season_id:     seasonId,
        sector_id:     sectorId,
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
      const existing = (prev[pivotId] ?? []).filter(s =>
        !saved.some(ns => ns.date === s.date && (ns.sector_id ?? null) === (s.sector_id ?? null))
      )
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

      {/* Histórico de programações + impressão + WhatsApp */}
      {metas.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <ScheduleHistory
            companyId={company.id}
            today={today}
            metas={metas.map(m => m.context)}
            onSchedulesChanged={load}
          />
        </div>
      )}

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

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineGuard } from '@/hooks/useOnlineGuard'
import {
  listActiveManagementSeasonContexts,
  listDailyManagementBySeason,
} from '@/services/management'
import type { ManagementSeasonContext } from '@/services/management'
import {
  listSchedulesByCompany,
  listSchedulesForConfirmation,
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
import { ClipboardList, ChevronDown, ChevronUp, X, Copy, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { ScheduleHistory } from './ScheduleHistory'
import type { BatchEditPayload, ReschedulePayload } from './ScheduleHistory'

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

/** Retorna o YMD do início da semana (domingo) a partir de hoje + offsetSemanas */
function getWeekStart(todayYmd: string, offsetWeeks: number): string {
  const d = new Date(todayYmd + 'T12:00:00')
  d.setDate(d.getDate() + offsetWeeks * 7)
  return toYMD(d)
}

function fmtWeekRange(startYmd: string): string {
  const from = new Date(startYmd + 'T12:00:00')
  const to   = new Date(startYmd + 'T12:00:00')
  to.setDate(to.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }
  return `${from.toLocaleDateString('pt-BR', opts)} – ${to.toLocaleDateString('pt-BR', opts)}`
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

/** Retorna true se endTime é no dia seguinte em relação a startTime (cruza meia-noite) */
function crossesMidnight(startTime: string, endTime: string): boolean {
  if (!startTime || !endTime) return false
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  return toMin(endTime) < toMin(startTime)
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
  if (pct == null) return '#667788'
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
      <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, lineHeight: 1.2 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color, lineHeight: 1.3, fontFamily: 'var(--font-mono)' }}>{value}</span>
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
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {label}
      </p>
      <input
        type={type} placeholder={placeholder} value={value} readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)}
        style={{
          width: '100%', padding: '5px 6px', borderRadius: 5,
          background: readOnly ? 'rgba(255,255,255,0.02)' : bg,
          border: `1px solid ${readOnly ? 'rgba(255,255,255,0.05)' : border}`,
          color: readOnly ? '#778899' : color,
          fontSize: 12, textAlign: 'center',
          fontFamily: 'var(--font-mono)', fontWeight: bold ? 700 : 400,
          boxSizing: 'border-box', cursor: readOnly ? 'default' : 'text',
          outline: 'none',
        }}
      />
    </div>
  )
}

// ─── Confirmação diária batch ─────────────────────────────────

interface ConfirmRow {
  schedule: IrrigationSchedule
  pivotName: string
  plannedMm: number | null
  editedMm: string
  saving: boolean
  confirmed: boolean
}

function ConfirmacaoDiaria({
  companyId,
  metas,
  today,
  onConfirmed,
}: {
  companyId: string
  metas: PivotMeta[]
  today: string
  onConfirmed: () => void
}) {
  const [rows, setRows] = useState<ConfirmRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // D-1 e hoje
  function yesterday(ymd: string) {
    const d = new Date(ymd + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  useEffect(() => {
    if (!today) return
    setLoading(true)
    const from = yesterday(today)
    listSchedulesForConfirmation(companyId, from, today).then(schedules => {
      const built: ConfirmRow[] = schedules.map(s => {
        const meta = metas.find(m => m.context.pivot?.id === s.pivot_id)
        return {
          schedule: s,
          pivotName: meta?.context.pivot?.name ?? s.pivot_id,
          plannedMm: s.lamina_mm,
          editedMm: s.lamina_mm != null ? String(s.lamina_mm) : '',
          saving: false,
          confirmed: s.status === 'done',
        }
      })
      setRows(built)
    }).finally(() => setLoading(false))
  }, [companyId, today, metas])

  if (loading || rows.length === 0) return null

  const pending = rows.filter(r => !r.confirmed)
  const done    = rows.filter(r => r.confirmed)

  async function confirmRow(idx: number) {
    const row = rows[idx]
    const mm = parseFloat(row.editedMm.replace(',', '.'))
    const actualMm = isFinite(mm) && mm >= 0 ? mm : row.plannedMm

    setRows(prev => prev.map((r, i) => i === idx ? { ...r, saving: true } : r))

    try {
      const supabase = createClient()

      // 1. Atualiza status no irrigation_schedule
      await (supabase as any)
        .from('irrigation_schedule')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', row.schedule.id)

      // 2. Atualiza actual_depth_mm no daily_management (safra + data)
      const meta = metas.find(m => m.context.pivot?.id === row.schedule.pivot_id)
      if (meta && actualMm != null) {
        await (supabase as any)
          .from('daily_management')
          .update({ actual_depth_mm: actualMm, updated_at: new Date().toISOString() })
          .eq('season_id', meta.context.season.id)
          .eq('date', row.schedule.date)
      }

      setRows(prev => prev.map((r, i) =>
        i === idx ? { ...r, saving: false, confirmed: true, editedMm: String(actualMm ?? '') } : r
      ))
    } catch {
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, saving: false } : r))
    }
  }

  async function confirmAll() {
    setSaving(true)
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].confirmed) await confirmRow(i)
    }
    setSaving(false)
    onConfirmed()
  }

  function statusBadge(row: ConfirmRow) {
    if (row.confirmed) return { label: 'Confirmado', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.25)' }
    const d = new Date(row.schedule.date + 'T12:00:00')
    const t = new Date(today + 'T12:00:00')
    if (d < t) return { label: 'Pendente', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)' }
    return { label: 'Hoje', color: '#0093D0', bg: 'rgba(0,147,208,0.10)', border: 'rgba(0,147,208,0.25)' }
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a1628 0%, #0d1e2e 100%)',
      border: pending.length > 0 ? '2px solid rgba(245,158,11,0.45)' : '2px solid rgba(34,197,94,0.35)',
      borderRadius: 16, padding: '24px 28px', marginBottom: 28,
      boxShadow: pending.length > 0 ? '0 4px 32px rgba(245,158,11,0.08)' : '0 4px 32px rgba(34,197,94,0.06)',
    }}>
      {/* Mini-hero: stat strip + header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        {/* Lado esquerdo: título + número âncora + subtítulo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: pending.length > 0 ? 'rgba(245,158,11,0.18)' : 'rgba(34,197,94,0.18)',
            border: `1px solid ${pending.length > 0 ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.4)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 11l3 3L22 4" stroke={pending.length > 0 ? '#f59e0b' : '#22c55e'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke={pending.length > 0 ? '#f59e0b' : '#22c55e'} strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Execução de hoje
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {(() => {
                const totalMm = rows.reduce((sum, r) => sum + (r.plannedMm ?? 0), 0)
                return totalMm > 0 ? (
                  <>
                    <span style={{ fontSize: 44, fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace', lineHeight: 1, letterSpacing: '-0.02em' }}>
                      {totalMm % 1 === 0 ? totalMm : totalMm.toFixed(1)}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8' }}>mm</span>
                  </>
                ) : null
              })()}
            </div>
            <div style={{ fontSize: 12, color: pending.length > 0 ? '#f59e0b' : '#22c55e', marginTop: 4, fontWeight: 600 }}>
              {pending.length > 0
                ? `${pending.length} irrigação${pending.length > 1 ? 'ões' : ''} pendente${pending.length > 1 ? 's' : ''}`
                : `${done.length} irrigação${done.length !== 1 ? 'ões' : ''} confirmada${done.length !== 1 ? 's' : ''}`}
            </div>
          </div>
        </div>
        {/* Lado direito: botão Confirmar todas */}
        {pending.length > 0 && (
          <button
            onClick={confirmAll}
            disabled={saving}
            style={{
              padding: '13px 28px', borderRadius: 10, fontSize: 14, fontWeight: 800,
              background: saving ? 'rgba(245,158,11,0.2)' : '#f59e0b',
              border: 'none',
              color: saving ? '#f59e0b' : '#0a0f14',
              cursor: saving ? 'not-allowed' : 'pointer',
              letterSpacing: '0.01em',
              boxShadow: saving ? 'none' : '0 4px 20px rgba(245,158,11,0.35)',
              transition: 'transform 0.15s, box-shadow 0.15s',
              alignSelf: 'center',
            }}
            onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)' }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)' }}
          >
            {saving ? 'Confirmando…' : pending.length > 1 ? `✓ Confirmar todas (${pending.length})` : '✓ Confirmar irrigação'}
          </button>
        )}
      </div>

      {/* Linhas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, idx) => {
          const badge = statusBadge(row)
          const d = new Date(row.schedule.date + 'T12:00:00')
          const fmtDate = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
          return (
            <div key={row.schedule.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              padding: '10px 14px', borderRadius: 10,
              background: row.confirmed ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${row.confirmed ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)'}`,
              opacity: row.confirmed ? 0.7 : 1,
              transition: 'all 0.2s',
            }}>
              {/* Status badge */}
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
                whiteSpace: 'nowrap',
              }}>{badge.label}</span>

              {/* Data + Pivô */}
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{row.pivotName}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{fmtDate}</div>
              </div>

              {/* Lâmina planejada */}
              <div style={{ textAlign: 'right', minWidth: 70 }}>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Planejado</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                  {row.plannedMm != null ? `${row.plannedMm} mm` : '—'}
                </div>
              </div>

              {/* Input lâmina real */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 3 }}>Real (mm)</div>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={row.editedMm}
                    disabled={row.confirmed}
                    onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, editedMm: e.target.value } : r))}
                    style={{
                      width: 70, height: 30, borderRadius: 7, textAlign: 'center',
                      fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      background: row.confirmed ? 'rgba(34,197,94,0.08)' : 'rgba(0,147,208,0.08)',
                      border: `1px solid ${row.confirmed ? 'rgba(34,197,94,0.2)' : 'rgba(0,147,208,0.25)'}`,
                      color: row.confirmed ? '#22c55e' : '#e2e8f0',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Botão confirmar */}
                {!row.confirmed && (
                  <button
                    onClick={() => confirmRow(idx)}
                    disabled={row.saving}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                      color: '#22c55e', cursor: row.saving ? 'not-allowed' : 'pointer',
                      marginTop: 18, whiteSpace: 'nowrap',
                    }}>
                    {row.saving ? '…' : '✓'}
                  </button>
                )}
                {row.confirmed && (
                  <div style={{ marginTop: 18 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.15)" stroke="rgba(34,197,94,0.4)" strokeWidth="1.5"/>
                      <path d="M7 12l3.5 3.5L17 8" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
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
        borderRadius: 16, padding: 'clamp(16px, 4vw, 28px)', width: 360, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 24, fontWeight: 600, color: '#e2e8f0', margin: 0, letterSpacing: '-0.025em' }}>Cancelar irrigação</p>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '2px 0 0' }}>{pivotName} · {fmtShort(date)}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#667788', cursor: 'pointer', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Motivo</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {REASONS.map(r => (
            <button key={r.value} onClick={() => setReason(r.value)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, border: `1px solid ${reason === r.value ? r.color : 'rgba(255,255,255,0.08)'}`,
              background: reason === r.value ? `${r.color}18` : 'rgba(255,255,255,0.03)',
              color: reason === r.value ? r.color : '#667788', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 44,
            }}>
              {r.label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Observação (opcional)</p>
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
            background: 'transparent', color: '#667788', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44,
          }}>
            Voltar
          </button>
          <button onClick={() => onConfirm(reason, notes)} style={{
            flex: 2, padding: '10px', borderRadius: 8, border: 'none',
            background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44,
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
        <p style={{ fontSize: 9, fontWeight: 700, color: isToday ? '#0093D0' : '#667788', margin: 0, textTransform: 'uppercase' }}>
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
          <p style={{ fontSize: 9, color: '#667788', margin: '0 0 1px', textTransform: 'uppercase', lineHeight: 1 }}>CC</p>
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
          <p style={{ fontSize: 9, color: '#778899', margin: '2px 0 0' }}>
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
            <p style={{ fontSize: 8, color: '#778899', margin: '-2px 0 0', textAlign: 'center', lineHeight: 1.3 }}>
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
  meta, today, weekStart, readOnly, schedules, onSave, onCancel, editBatch, onEditBatchDone,
  forceExpand, onForceExpandDone,
}: {
  meta: PivotMeta
  today: string
  weekStart: string
  readOnly?: boolean
  schedules: IrrigationSchedule[]
  onSave: (entries: { date: string; sectorId: string | null; entry: DayEntry }[], existingBatchId?: string) => Promise<void>
  onCancel: (schedule: IrrigationSchedule) => void
  editBatch?: BatchEditPayload | null
  onEditBatchDone?: () => void
  forceExpand?: boolean
  onForceExpandDone?: () => void
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

  // Quando em modo edição de lote, usa as datas do lote; caso contrário, os 7 dias da semana exibida
  const days = editBatch
    ? Array.from(new Set(editBatch.schedules.map(s => s.date))).sort()
    : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const emptyEntry = (): DayEntry => ({ rainfall: '', lamina: '', speed: '', speedAuto: false, startTime: '', endTime: '' })

  const [sectorGrids, setSectorGrids] = useState<SectorGrid>(() =>
    Object.fromEntries(sectorIds.map(sid => [
      sid,
      Object.fromEntries(days.map(d => [d, emptyEntry()])),
    ]))
  )

  // Dia extra: se qualquer setor tem o último dia cruzando meia-noite, adiciona D+1 para todos
  const lastDay = days[days.length - 1]
  const pivotExtraDay = sectorIds.some(sid => {
    const e = sectorGrids[sid]?.[lastDay] ?? emptyEntry()
    return e.startTime && e.endTime && crossesMidnight(e.startTime, e.endTime)
  }) ? addDays(lastDay, 1) : null
  const displayDays = pivotExtraDay ? [...days, pivotExtraDay] : days

  // Quando forceExpand é ativado: abre o card (após reprogramar)
  useEffect(() => {
    if (!forceExpand) return
    setExpanded(true)
    onForceExpandDone?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpand])

  // Quando editBatch muda: expande o card e pré-preenche com dados do lote
  useEffect(() => {
    if (!editBatch) return
    setExpanded(true)
    setSectorGrids(() => {
      const next: SectorGrid = {}
      const batchDays = Array.from(new Set(editBatch.schedules.map(s => s.date))).sort()
      for (const sid of sectorIds) {
        next[sid] = Object.fromEntries(batchDays.map(d => [d, emptyEntry()]))
      }
      for (const s of editBatch.schedules) {
        const sid = s.sector_id ?? ''
        if (!next[sid]) continue
        next[sid][s.date] = {
          rainfall:  s.rainfall_mm   != null ? String(s.rainfall_mm)   : '',
          lamina:    s.lamina_mm     != null ? String(s.lamina_mm)     : '',
          speed:     s.speed_percent != null ? String(s.speed_percent) : '',
          speedAuto: false,
          startTime: s.start_time ?? '',
          endTime:   s.end_time   ?? '',
        }
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editBatch])

  // Pré-preencher grids com schedules existentes (modo normal, não edição)
  useEffect(() => {
    if (editBatch) return  // não sobrescreve quando em modo edição
    setSectorGrids(() => {
      const next: SectorGrid = {}
      for (const sid of sectorIds) {
        next[sid] = Object.fromEntries(days.map(d => [d, emptyEntry()]))
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
  }, [schedules, weekStart])

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
   *  encadeando horários: início do setor N+1 = fim do setor N.
   *  Se o setor anterior cruza meia-noite, o próximo setor é lançado no DIA SEGUINTE. */
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

          if (!prevEntry?.startTime && !srcEntry.lamina) {
            // Sem dado no setor anterior neste dia — pula
            continue
          }

          // Se o setor anterior cruza meia-noite, este setor entra no dia seguinte
          const prevCrosses = prevEntry?.startTime && prevEntry?.endTime
            ? crossesMidnight(prevEntry.startTime, prevEntry.endTime)
            : false
          const targetDate = prevCrosses ? addDays(date, 1) : date

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

          newGrid[targetDate] = { ...srcEntry, startTime: newStart, endTime: newEnd }
        }
        next[sectorIds[i]] = newGrid
      }
      return next
    })
  }

  function handleClearAll() {
    setSectorGrids(
      Object.fromEntries(sectorIds.map(sid => [
        sid,
        Object.fromEntries(days.map(d => [d, emptyEntry()])),
      ]))
    )
  }

  async function handleSave() {
    const entries: { date: string; sectorId: string | null; entry: DayEntry }[] = []
    for (const sid of sectorIds) {
      const grid = sectorGrids[sid] ?? {}
      const activeDays = editBatch
        ? Array.from(new Set(editBatch.schedules.map(s => s.date))).sort()
        : days
      for (const d of activeDays) {
        const entry = grid[d]
        if (entry && (entry.lamina !== '' || entry.rainfall !== '')) {
          entries.push({ date: d, sectorId: sid === '' ? null : sid, entry })
        }
      }
    }
    if (entries.length === 0) return
    setSaving(true)
    try {
      await onSave(entries, editBatch?.batchId)
      onEditBatchDone?.()
    } finally {
      setSaving(false)
    }
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
      border: `1px solid ${expanded ? 'rgba(0,147,208,0.3)' : 'rgba(255,255,255,0.07)'}`,
      borderLeft: `3px solid ${expanded ? '#0093D0' : 'rgba(0,147,208,0.35)'}`,
      borderRadius: 14,
      overflow: 'hidden',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      boxShadow: expanded ? '0 4px 24px rgba(0,147,208,0.07)' : 'none',
    }}>
      {/* ── Cabeçalho (sempre visível) ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', userSelect: 'none' }}
      >
        {/* Nome + fazenda */}
        <div style={{ flex: '1 1 140px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.01em' }}>{name}</span>
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
          <span style={{ fontSize: 12, color: '#64748b' }}>{farm.name}</span>
        </div>

        {/* Chips de info agronômica — ocultos em mobile, visíveis a partir de sm */}
        <div className="hidden sm:flex" style={{ gap: 8, flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {crop && (
            <Chip label="Cultura" value={crop.name} color="#22c55e" />
          )}
          {stageInfo && (
            <Chip label="Fase" value={`${stageInfo.stage}ª`} color="#0093D0" />
          )}
          <Chip label="DAS" value={`${das}d`} color="#8899aa" />
          {season.planting_date && (
            <Chip label="Plantio" value={fmtShort(season.planting_date)} color="#778899" />
          )}
        </div>

        {/* % campo + mini barra */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <WaterBar pct={todayPct} threshold={threshold} height={36} width={10} />
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hoje</p>
            <span style={{ fontSize: 28, fontWeight: 800, color: todayColor, fontFamily: 'var(--font-mono)', lineHeight: 1, letterSpacing: '-0.025em' }}>
              {todayPct != null ? `${Math.round(todayPct)}%` : '—'}
            </span>
          </div>
        </div>

        <div style={{ color: '#778899', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      {/* ── Conteúdo expandido ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '12px 16px 16px' }}>

          {/* Tabela por setor */}
          {sectorIds.map((sid, sIdx) => {
            const sector = sectors.find(s => s.id === sid) ?? null
            const grid = sectorGrids[sid] ?? {}
            const schedulesForSector = schedules.filter(s => (s.sector_id ?? '') === sid)
            const fraction = sectorFraction(sector)


            function handleLaminaInline(date: string, v: string) {
              updateDayInSector(sid, date, 'lamina', v)
              const mm = parseNum(v)
              const entry = grid[date] ?? emptyEntry()
              if (mm != null && mm > 0 && speedTable.length > 0) {
                const te = entryFromTable(speedTable, mm)
                if (te) {
                  updateDayInSector(sid, date, 'speed', String(te.speed_percent))
                  updateDayInSector(sid, date, 'speedAuto', true)
                  if (entry.startTime) updateDayInSector(sid, date, 'endTime', addHoursToTime(entry.startTime, te.duration_hours * fraction))
                }
              } else if (v === '') {
                updateDayInSector(sid, date, 'speed', '')
                updateDayInSector(sid, date, 'speedAuto', true)
                updateDayInSector(sid, date, 'endTime', '')
              }
            }

            function handleSpeedInline(date: string, v: string) {
              updateDayInSector(sid, date, 'speed', v)
              const pct = parseNum(v)
              const entry = grid[date] ?? emptyEntry()
              if (pct != null && pct > 0 && speedTable.length > 0) {
                const te = entryFromSpeed(speedTable, pct)
                if (te) {
                  updateDayInSector(sid, date, 'lamina', String(te.water_depth_mm))
                  updateDayInSector(sid, date, 'speedAuto', true)
                  if (entry.startTime) updateDayInSector(sid, date, 'endTime', addHoursToTime(entry.startTime, te.duration_hours * fraction))
                }
              }
            }

            function handleStartInline(date: string, v: string) {
              updateDayInSector(sid, date, 'startTime', v)
              if (!v) return
              const entry = grid[date] ?? emptyEntry()
              let dur: number | null = null
              const mm = parseNum(entry.lamina)
              if (mm != null && mm > 0 && speedTable.length > 0) dur = entryFromTable(speedTable, mm)?.duration_hours ?? null
              if (dur == null) {
                const pct = parseNum(entry.speed)
                if (pct != null && pct > 0 && speedTable.length > 0) dur = entryFromSpeed(speedTable, pct)?.duration_hours ?? null
              }
              if (dur != null) updateDayInSector(sid, date, 'endTime', addHoursToTime(v, dur * fraction))
            }

            const cellInput = (
              value: string,
              onChange: (v: string) => void,
              opts: { type?: string; readOnly?: boolean; color?: string; bg?: string; placeholder?: string } = {}
            ) => {
              // Em modo readOnly de semana passada, todos os inputs ficam read-only
              if (readOnly) opts = { ...opts, readOnly: true }
              const isTime = opts.type === 'time'
              const input = (
                <input
                  type={opts.type ?? 'number'}
                  value={value}
                  readOnly={opts.readOnly}
                  placeholder={opts.placeholder ?? '—'}
                  onChange={e => onChange(e.target.value)}
                  style={{
                    width: isTime ? 'auto' : '100%',
                    padding: isTime ? '5px 2px' : '5px 4px',
                    background: opts.readOnly ? 'transparent' : (opts.bg ?? 'rgba(255,255,255,0.05)'),
                    border: 'none',
                    borderRadius: 5, color: opts.color ?? '#8899aa',
                    fontSize: 12, textAlign: 'center', fontFamily: 'var(--font-mono)',
                    fontWeight: 600, boxSizing: 'border-box', outline: 'none',
                    cursor: opts.readOnly ? 'default' : 'text',
                  }}
                />
              )
              if (isTime) {
                return (
                  <div style={{
                    width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center',
                    background: opts.readOnly ? 'transparent' : (opts.bg ?? 'rgba(255,255,255,0.05)'),
                    border: opts.readOnly ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 5, boxSizing: 'border-box',
                  }}>
                    {input}
                  </div>
                )
              }
              return (
                <input
                  type={opts.type ?? 'number'}
                  value={value}
                  readOnly={opts.readOnly}
                  placeholder={opts.placeholder ?? '—'}
                  onChange={e => onChange(e.target.value)}
                  style={{
                    width: '100%', padding: '5px 4px',
                    background: opts.readOnly ? 'transparent' : (opts.bg ?? 'rgba(255,255,255,0.05)'),
                    border: opts.readOnly ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 5, color: opts.color ?? '#8899aa',
                    fontSize: 12, textAlign: 'center', fontFamily: 'var(--font-mono)',
                    fontWeight: 600, boxSizing: 'border-box', outline: 'none',
                    cursor: opts.readOnly ? 'default' : 'text',
                  }}
                />
              )
            }

            return (
              <div key={sid} style={{ marginBottom: sIdx < sectorIds.length - 1 ? 16 : 0 }}>
                {/* Header do setor */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hasSectors && sector && (
                      <>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: '#22c55e' }} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Setor {sector.name}
                        </span>
                        {sector.area_ha != null && (
                          <span style={{ fontSize: 12, color: '#64748b' }}>{sector.area_ha.toFixed(1)} ha</span>
                        )}
                      </>
                    )}
                    {!hasSectors && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>Programação dos dias</span>
                    )}
                  </div>
                  {/* Replicar — só no primeiro setor quando há mais de um, e não em readOnly */}
                  {!readOnly && hasSectors && sIdx === 0 && sectors.length > 1 && (
                    <button onClick={replicateFirstSector} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px', borderRadius: 7,
                      border: '1px solid rgba(34,197,94,0.25)',
                      background: 'rgba(34,197,94,0.08)',
                      color: '#22c55e', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>
                      <Copy size={11} /> Replicar {sector?.name} → todos
                    </button>
                  )}
                </div>

                {/* ── TABELA COMPACTA ── */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
                    <thead>
                      <tr>
                        {/* Coluna de label */}
                        <th style={{ width: 100, padding: '6px 10px', textAlign: 'left' }} />
                        {displayDays.map(date => {
                          const isExtraDay = pivotExtraDay !== null && date === pivotExtraDay
                          const isToday = date === today
                          const isPast = date < today
                          const sched = schedulesForSector.find(s => s.date === date)
                          const isCancelled = sched?.status === 'cancelled'
                          if (isExtraDay) {
                            return (
                              <th key={date} style={{
                                padding: '5px 6px', textAlign: 'center', minWidth: 72,
                                background: 'rgba(245,158,11,0.06)',
                                borderRadius: '6px 6px 0 0',
                                borderBottom: '2px solid rgba(245,158,11,0.3)',
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    {fmtWeekday(date)}
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                                    {fmtShort(date)}
                                  </div>
                                </div>
                              </th>
                            )
                          }
                          return (
                            <th key={date} style={{
                              padding: '10px 6px', textAlign: 'center', minWidth: 88,
                              background: isToday
                                ? 'rgba(0,147,208,0.12)'
                                : isCancelled
                                  ? 'rgba(239,68,68,0.04)'
                                  : isPast ? 'transparent' : 'rgba(255,255,255,0.015)',
                              borderRadius: '8px 8px 0 0',
                              borderBottom: `3px solid ${isToday ? '#0093D0' : isCancelled ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                              borderLeft: isToday ? '1px solid rgba(0,147,208,0.2)' : undefined,
                              borderRight: isToday ? '1px solid rgba(0,147,208,0.2)' : undefined,
                            }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <div style={{
                                  fontSize: isToday ? 10 : 9,
                                  fontWeight: 800,
                                  color: isToday ? '#0093D0' : isPast ? '#778899' : '#667788',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.07em',
                                }}>
                                  {isToday ? '● Hoje' : fmtWeekday(date)}
                                </div>
                                <div style={{
                                  fontSize: isToday ? 15 : 13,
                                  fontWeight: isToday ? 800 : 600,
                                  color: isToday ? '#e2e8f0' : isPast ? '#778899' : '#667788',
                                  fontFamily: 'var(--font-mono)', lineHeight: 1,
                                }}>
                                  {fmtShort(date)}
                                </div>
                                {isCancelled && (
                                  <div style={{ fontSize: 8, color: 'rgba(239,68,68,0.7)', fontWeight: 700, marginTop: 1 }}>✕ cancel.</div>
                                )}
                              </div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Linha: % Campo (read-only, visual) */}
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 10px 4px' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>% Campo</span>
                        </td>
                        {displayDays.map(date => {
                          const isExtraDay = pivotExtraDay !== null && date === pivotExtraDay
                          if (isExtraDay) return (
                            <td key={date} style={{ padding: '6px 8px', textAlign: 'center', background: 'rgba(245,158,11,0.03)' }}>
                              <div style={{ fontSize: 11, color: '#778899' }}>—</div>
                            </td>
                          )
                          const entry = grid[date] ?? emptyEntry()
                          const dayPct = pctForDate(meta, date, grid, today)
                          const projPct = (entry.lamina !== '' || entry.rainfall !== '') ? projectedPct(meta, date, grid, today) : null
                          const c = pctColor(dayPct, threshold)
                          const pc = pctColor(projPct, threshold)
                          const isTodayCell = date === today
                          const isPastCell = date < today
                          return (
                            <td key={date} style={{
                              padding: '8px 8px',
                              textAlign: 'center',
                              background: isTodayCell ? 'rgba(0,147,208,0.06)' : undefined,
                              borderLeft: isTodayCell ? '1px solid rgba(0,147,208,0.12)' : undefined,
                              borderRight: isTodayCell ? '1px solid rgba(0,147,208,0.12)' : undefined,
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <WaterBar pct={dayPct} projPct={projPct} threshold={threshold} height={30} width={8} />
                                <div>
                                  <div style={{ fontSize: isTodayCell ? 13 : 11, fontWeight: 800, color: isPastCell ? '#667788' : c, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                                    {dayPct != null ? `${Math.round(dayPct)}%` : '—'}
                                  </div>
                                  {projPct != null && (
                                    <div style={{ fontSize: 9, fontWeight: 700, color: pc, fontFamily: 'var(--font-mono)', lineHeight: 1, marginTop: 1 }}>
                                      →{Math.round(projPct)}%
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          )
                        })}
                      </tr>

                      {/* Linha: Chuva */}
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ fontSize: 11, color: 'rgba(34,211,238,0.7)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🌧 Chuva</span>
                        </td>
                        {displayDays.map(date => {
                          const isExtraDay = pivotExtraDay !== null && date === pivotExtraDay
                          if (isExtraDay) return (
                            <td key={date} style={{ padding: '5px 8px', background: 'rgba(245,158,11,0.03)' }}>
                              <div style={{ textAlign: 'center', color: '#778899', fontSize: 11 }}>—</div>
                            </td>
                          )
                          const entry = grid[date] ?? emptyEntry()
                          const isCancelled = schedulesForSector.find(s => s.date === date)?.status === 'cancelled'
                          const isTodayChuva = date === today
                          return (
                            <td key={date} style={{
                              padding: '5px 8px',
                              background: isTodayChuva ? 'rgba(0,147,208,0.06)' : undefined,
                              borderLeft: isTodayChuva ? '1px solid rgba(0,147,208,0.12)' : undefined,
                              borderRight: isTodayChuva ? '1px solid rgba(0,147,208,0.12)' : undefined,
                            }}>
                              {isCancelled ? <div style={{ textAlign: 'center', color: '#667788', fontSize: 11 }}>—</div> :
                                cellInput(entry.rainfall, v => updateDayInSector(sid, date, 'rainfall', v), { color: entry.rainfall ? '#22d3ee' : '#667788', bg: entry.rainfall ? 'rgba(34,211,238,0.07)' : 'transparent', placeholder: '—' })}
                            </td>
                          )
                        })}
                      </tr>

                      {/* Linha: Lâmina */}
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>💧 Lâmina</span>
                        </td>
                        {displayDays.map(date => {
                          const isExtraDay = pivotExtraDay !== null && date === pivotExtraDay
                          if (isExtraDay) return (
                            <td key={date} style={{ padding: '5px 8px', background: 'rgba(245,158,11,0.03)' }}>
                              <div style={{ textAlign: 'center', color: '#778899', fontSize: 11 }}>—</div>
                            </td>
                          )
                          const entry = grid[date] ?? emptyEntry()
                          const isCancelled = schedulesForSector.find(s => s.date === date)?.status === 'cancelled'
                          const isTodayLamina = date === today
                          return (
                            <td key={date} style={{
                              padding: '5px 8px',
                              background: isTodayLamina ? 'rgba(0,147,208,0.06)' : undefined,
                              borderLeft: isTodayLamina ? '1px solid rgba(0,147,208,0.12)' : undefined,
                              borderRight: isTodayLamina ? '1px solid rgba(0,147,208,0.12)' : undefined,
                            }}>
                              {isCancelled ? <div style={{ textAlign: 'center', color: '#667788', fontSize: 11 }}>—</div> :
                                cellInput(entry.lamina, v => handleLaminaInline(date, v), {
                                  color: entry.lamina ? '#22c55e' : '#667788',
                                  bg: entry.lamina ? 'rgba(34,197,94,0.10)' : 'transparent',
                                  placeholder: '—',
                                })}
                            </td>
                          )
                        })}
                      </tr>

                      {/* Linha: Velocidade */}
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ fontSize: 11, color: 'rgba(245,158,11,0.65)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚙ Vel %</span>
                        </td>
                        {displayDays.map(date => {
                          const isExtraDay = pivotExtraDay !== null && date === pivotExtraDay
                          if (isExtraDay) return (
                            <td key={date} style={{ padding: '5px 8px', background: 'rgba(245,158,11,0.03)' }}>
                              <div style={{ textAlign: 'center', color: '#778899', fontSize: 11 }}>—</div>
                            </td>
                          )
                          const entry = grid[date] ?? emptyEntry()
                          const isCancelled = schedulesForSector.find(s => s.date === date)?.status === 'cancelled'
                          const isTodaySpeed = date === today
                          return (
                            <td key={date} style={{
                              padding: '5px 8px',
                              background: isTodaySpeed ? 'rgba(0,147,208,0.06)' : undefined,
                              borderLeft: isTodaySpeed ? '1px solid rgba(0,147,208,0.12)' : undefined,
                              borderRight: isTodaySpeed ? '1px solid rgba(0,147,208,0.12)' : undefined,
                            }}>
                              {isCancelled ? <div style={{ textAlign: 'center', color: '#667788', fontSize: 11 }}>—</div> :
                                cellInput(entry.speed, v => handleSpeedInline(date, v), {
                                  color: entry.speed ? (entry.speedAuto ? '#f59e0b' : '#8899aa') : '#667788',
                                  bg: entry.speed ? (entry.speedAuto ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.04)') : 'transparent',
                                  placeholder: '—',
                                })}
                            </td>
                          )
                        })}
                      </tr>

                      {/* Linha: Início */}
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>▶ Início</span>
                        </td>
                        {displayDays.map(date => {
                          const isExtraDay = pivotExtraDay !== null && date === pivotExtraDay
                          const entry = grid[date] ?? emptyEntry()
                          const isCancelled = schedulesForSector.find(s => s.date === date)?.status === 'cancelled'
                          const isTodayStart = date === today && !isExtraDay
                          return (
                            <td key={date} style={{
                              padding: '5px 6px',
                              background: isExtraDay ? 'rgba(245,158,11,0.03)' : isTodayStart ? 'rgba(0,147,208,0.06)' : undefined,
                              borderLeft: isTodayStart ? '1px solid rgba(0,147,208,0.12)' : undefined,
                              borderRight: isTodayStart ? '1px solid rgba(0,147,208,0.12)' : undefined,
                            }}>
                              {isCancelled ? <div style={{ textAlign: 'center', color: '#667788', fontSize: 11 }}>—</div> :
                                cellInput(entry.startTime, v => handleStartInline(date, v), { type: 'time', color: isExtraDay ? '#f59e0b' : '#e2e8f0', bg: isExtraDay ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.07)' })}
                            </td>
                          )
                        })}
                      </tr>

                      {/* Linha: Fim (read-only, calculado) */}
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                        <td style={{ padding: '7px 10px 12px' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>■ Fim</span>
                        </td>
                        {displayDays.map(date => {
                          const isExtraDay = pivotExtraDay !== null && date === pivotExtraDay
                          const entry = grid[date] ?? emptyEntry()
                          const isCancelled = !isExtraDay && schedulesForSector.find(s => s.date === date)?.status === 'cancelled'
                          const nextDay = !isExtraDay && entry.startTime && entry.endTime
                            ? (parseInt(entry.endTime.split(':')[0]) * 60 + parseInt(entry.endTime.split(':')[1])) <
                              (parseInt(entry.startTime.split(':')[0]) * 60 + parseInt(entry.startTime.split(':')[1]))
                            : false
                          const sched = !isExtraDay ? schedulesForSector.find(s => s.date === date) : undefined
                          const isPlanned = sched?.status === 'planned'
                          const isPastDate = date < today
                          const isTodayEnd = date === today && !isExtraDay
                          return (
                            <td key={date} style={{
                              padding: '5px 6px 8px',
                              background: isExtraDay ? 'rgba(245,158,11,0.03)' : isTodayEnd ? 'rgba(0,147,208,0.06)' : undefined,
                              borderLeft: isTodayEnd ? '1px solid rgba(0,147,208,0.12)' : undefined,
                              borderRight: isTodayEnd ? '1px solid rgba(0,147,208,0.12)' : undefined,
                            }}>
                              {isCancelled ? (
                                <div style={{ textAlign: 'center', padding: '4px' }}>
                                  <span style={{ fontSize: 9, color: 'rgba(239,68,68,0.6)', fontWeight: 700 }}>✕</span>
                                  {sched?.cancelled_reason && <div style={{ fontSize: 8, color: '#778899' }}>{sched.cancelled_reason}</div>}
                                </div>
                              ) : (
                                <div>
                                  <div style={{
                                    padding: '5px 4px', textAlign: 'center',
                                    color: entry.endTime ? '#f59e0b' : '#667788',
                                    fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600,
                                  }}>
                                    {entry.endTime || '—'}
                                    {nextDay && <span style={{ fontSize: 8, color: '#f59e0b', marginLeft: 2 }}>+1d</span>}
                                  </div>
                                  {/* Botão cancelar inline — tom mais suave */}
                                  {!readOnly && isPlanned && !isPastDate && (
                                    <button onClick={() => onCancel(sched!)} style={{
                                      width: '100%', padding: '2px 0', marginTop: 2,
                                      borderRadius: 4, border: '1px solid rgba(239,68,68,0.15)',
                                      background: 'transparent', color: 'rgba(239,68,68,0.5)',
                                      fontSize: 9, fontWeight: 600, cursor: 'pointer',
                                    }}>cancelar</button>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Separador entre setores */}
                {hasSectors && sIdx < sectorIds.length - 1 && (
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 0' }} />
                )}
              </div>
            )
          })}

          {/* Nota de edição */}
          {editBatch && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8 }}>
              <p style={{ fontSize: 11, color: '#22c55e', margin: 0, fontWeight: 600 }}>
                ✏️ Editando programação feita em {new Date(editBatch.schedules[0]?.created_at ?? '').toLocaleDateString('pt-BR')}
              </p>
            </div>
          )}

          {/* Botão Salvar + Limpar */}
          {readOnly ? (
            <div style={{
              marginTop: 14, padding: '10px 14px', borderRadius: 10,
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <CalendarDays size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                Semana passada — somente visualização. Para editar, use o Histórico abaixo.
              </span>
            </div>
          ) : (
            <div style={{
              display: 'flex', gap: 8, marginTop: 16,
              position: 'sticky', bottom: 0,
              background: 'linear-gradient(to top, #0f1923 80%, transparent)',
              padding: '16px 0 4px',
              zIndex: 10,
            }}>
              {editBatch ? (
                <button onClick={onEditBatchDone} style={{
                  flex: 1, padding: '14px 0', borderRadius: 11,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'transparent', color: '#778899',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  Cancelar edição
                </button>
              ) : (
                <button onClick={handleClearAll} style={{
                  flex: 1, padding: '14px 0', borderRadius: 11,
                  border: '1px solid rgba(239,68,68,0.15)',
                  background: 'transparent', color: 'rgba(239,68,68,0.5)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  Limpar
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 3, padding: '16px 0', borderRadius: 11, border: 'none',
                  background: saving
                    ? 'rgba(0,147,208,0.3)'
                    : 'linear-gradient(135deg, #0093D0 0%, #0077aa 100%)',
                  color: '#fff', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer',
                  boxShadow: saving ? 'none' : '0 4px 24px rgba(0,147,208,0.35)',
                  letterSpacing: '0.02em',
                  transition: 'box-shadow 0.15s',
                }}>
                {saving ? 'Salvando…' : editBatch ? '✓ Salvar alterações' : '✓ Salvar programação'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────

export default function LancamentosPage() {
  const { company } = useAuth()
  const { isOnline, guardAction } = useOnlineGuard()

  const [today, setToday] = useState('')
  const [weekOffset, setWeekOffset] = useState(0) // 0 = semana atual, -1 = anterior, etc.
  const [historyKey, setHistoryKey] = useState(0)  // forçar rerender do ScheduleHistory
  const [expandPivotId, setExpandPivotId] = useState<string | null>(null) // abre grid do pivô ao reprogramar
  const [metas, setMetas] = useState<PivotMeta[]>([])
  // schedules indexados por pivotId
  const [schedulesByPivot, setSchedulesByPivot] = useState<Record<string, IrrigationSchedule[]>>({})
  const [loading, setLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  // Modal de cancelamento
  const [cancelTarget, setCancelTarget] = useState<{ schedule: IrrigationSchedule; pivotName: string } | null>(null)

  // Estado de edição de lote: qual pivô + dados do lote estão sendo editados
  const [editBatch, setEditBatch] = useState<BatchEditPayload | null>(null)

  // Histórico colapsável — inicia fechado
  const [historyOpen, setHistoryOpen] = useState(false)

  // Toast de sucesso
  const [successToast, setSuccessToast] = useState<string | null>(null)
  function showSuccess(msg: string) {
    setSuccessToast(msg)
    setTimeout(() => setSuccessToast(null), 3500)
  }

  useEffect(() => { setToday(toYMD(new Date())) }, [])

  // weekStart = primeiro dia da semana exibida
  const weekStart = today ? getWeekStart(today, weekOffset) : ''
  const isPastWeek = weekOffset < 0

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
          (supabase as any).from('pivot_speed_table').select('*').eq('pivot_id', ctx.pivot?.id ?? '').limit(100),
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

      // Buscar schedules da semana exibida
      const weekFrom = getWeekStart(today, weekOffset)
      const weekTo   = addDays(weekFrom, 6)
      const allSchedules = await listSchedulesByCompany(company.id, weekFrom, weekTo)
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
  }, [company, today, weekOffset])

  useEffect(() => { load() }, [load])

  // ── Salvar programação de um pivô ──
  async function handleSave(meta: PivotMeta, entries: { date: string; sectorId: string | null; entry: DayEntry }[], existingBatchId?: string) {
    const pivotId  = meta.context.pivot?.id
    const seasonId = meta.context.season.id
    if (!pivotId || !company) return

    // Gera um UUID único para este lote de programação (ou reutiliza o existente ao editar)
    const batchId = existingBatchId ?? crypto.randomUUID()

    const saved: IrrigationSchedule[] = []
    for (const { date, sectorId, entry } of entries) {
      const s = await upsertSchedule({
        company_id:        company.id,
        pivot_id:          pivotId,
        season_id:         seasonId,
        sector_id:         sectorId,
        date,
        lamina_mm:         parseNum(entry.lamina),
        speed_percent:     parseNum(entry.speed),
        start_time:        entry.startTime || null,
        end_time:          entry.endTime   || null,
        rainfall_mm:       parseNum(entry.rainfall),
        status:            'planned',
        schedule_batch_id: batchId,
      })
      saved.push(s)
    }

    setSchedulesByPivot(prev => {
      const existing = (prev[pivotId] ?? []).filter(s =>
        !saved.some(ns => ns.date === s.date && (ns.sector_id ?? null) === (s.sector_id ?? null))
      )
      return { ...prev, [pivotId]: [...existing, ...saved] }
    })

    showSuccess(`Programação salva com sucesso! ${saved.length} dia(s) registrado(s).`)
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

  // ── Cancelar + Reprogramar ──
  async function handleReschedule(payload: ReschedulePayload) {
    const { originalRows, newDate, reason, notes } = payload
    const pivotId = originalRows[0]?.pivot_id ?? ''
    const supabase = createClient()

    // 1. Cancela apenas os dias ainda planejados do lote original (done fica no histórico como está)
    const plannedRows = originalRows.filter(r => r.status === 'planned')
    await Promise.all(plannedRows.map(r => cancelSchedule(r.id, reason, notes)))

    // 2. Zera actual_depth_mm no daily_management para dias marcados como 'done' que não foram irrigados
    //    O cron vai recalcular na próxima madrugada sem a lâmina falsa
    const doneRows = originalRows.filter(r => r.status === 'done')
    if (doneRows.length > 0) {
      const seasonId = metas.find(m => m.context.pivot?.id === pivotId)?.context.season.id
      if (seasonId) {
        const doneDates = doneRows.map(r => r.date)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('daily_management')
          .update({ actual_depth_mm: null, updated_at: new Date().toISOString() })
          .eq('season_id', seasonId)
          .in('date', doneDates)
      }
    }

    // 3. Deleta qualquer programação já existente para este pivô na nova semana
    const weekFrom = newDate
    const weekTo   = addDays(newDate, 6)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('irrigation_schedule')
      .delete()
      .eq('pivot_id', pivotId)
      .gte('date', weekFrom)
      .lte('date', weekTo)

    // 4. Calcula o weekOffset para navegar até a semana da nova data
    const newDateObj  = new Date(newDate + 'T12:00:00')
    const todayObj    = new Date(today   + 'T12:00:00')
    const diffDays    = Math.round((newDateObj.getTime() - todayObj.getTime()) / (1000 * 60 * 60 * 24))
    const targetOffset = Math.floor(diffDays / 7)
    setWeekOffset(targetOffset)

    // 5. Recarrega os dados e abre o grid do pivô automaticamente
    await load()
    setHistoryKey(k => k + 1)
    setExpandPivotId(pivotId) // abre o grid do pivô reprogramado
    window.scrollTo({ top: 0, behavior: 'smooth' })

    const hadDone = doneRows.length > 0
    const fmtNewDate = new Date(newDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    showSuccess(
      hadDone
        ? `Lote cancelado. ${doneRows.length} registro(s) de irrigação removidos do balanço hídrico. Semana de ${fmtNewDate} liberada.`
        : `Lote cancelado. Semana de ${fmtNewDate} liberada — faça a nova programação.`
    )
  }

  if (!company || !today) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#667788', fontSize: 13 }}>Carregando…</div>
  )

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Toast de sucesso */}
      {successToast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 22px', borderRadius: 10,
          background: '#0a1f0e', border: '1px solid rgba(34,197,94,0.35)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          fontSize: 14, fontWeight: 600, color: '#22c55e',
          animation: 'fadeInUp 0.2s ease',
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7.5" stroke="#22c55e" strokeWidth="1"/>
            <path d="M4.5 8.5L7 11L11.5 5.5" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {successToast}
        </div>
      )}

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CalendarDays size={20} style={{ color: '#0093D0' }} />
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: '#e2e8f0', margin: 0, letterSpacing: '-0.025em' }}>
                Programação
              </h1>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, marginTop: 2, lineHeight: 1.625 }}>
                Planeje, ajuste e acompanhe a programação de irrigação.
              </p>
            </div>
            {isPastWeek && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#f59e0b',
                background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 99, padding: '2px 9px',
              }}>somente leitura</span>
            )}
          </div>

          {/* Navegação de semana */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setWeekOffset(o => o - 1)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)', color: '#8899aa',
                cursor: 'pointer',
              }}>
              <ChevronLeft size={16} />
            </button>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 14px', borderRadius: 9,
              background: weekOffset === 0 ? 'rgba(0,147,208,0.08)' : 'rgba(245,158,11,0.06)',
              border: `1px solid ${weekOffset === 0 ? 'rgba(0,147,208,0.25)' : 'rgba(245,158,11,0.2)'}`,
            }}>
              <CalendarDays size={13} style={{ color: weekOffset === 0 ? '#0093D0' : '#f59e0b' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: weekOffset === 0 ? '#0093D0' : '#f59e0b', whiteSpace: 'nowrap' }}>
                {weekOffset === 0 ? 'Esta semana' : weekOffset === -1 ? 'Semana passada' : `${Math.abs(weekOffset)} sem. atrás`}
              </span>
              {weekStart && (
                <span style={{ fontSize: 11, color: '#667788' }}>
                  {fmtWeekRange(weekStart)}
                </span>
              )}
            </div>

            <button
              onClick={() => setWeekOffset(o => Math.min(o + 1, 0))}
              disabled={weekOffset >= 0}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: weekOffset >= 0 ? '#223344' : '#8899aa',
                cursor: weekOffset >= 0 ? 'not-allowed' : 'pointer',
              }}>
              <ChevronRight size={16} />
            </button>

            {weekOffset < 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                  border: '1px solid rgba(0,147,208,0.3)',
                  background: 'rgba(0,147,208,0.08)', color: '#0093D0',
                  cursor: 'pointer',
                }}>
                Hoje
              </button>
            )}
          </div>
        </div>
        <p style={{ fontSize: 14, color: '#94a3b8', margin: '6px 0 0', lineHeight: 1.625 }}>
          {isPastWeek
            ? 'Visualizando semana anterior — inputs desabilitados'
            : 'Clique em um pivô para programar irrigação'}
        </p>
      </div>

      {/* Confirmação diária */}
      {!loading && metas.length > 0 && today && (
        <ConfirmacaoDiaria
          companyId={company.id}
          metas={metas}
          today={today}
          onConfirmed={load}
        />
      )}

      {/* Error */}
      {pageError && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
          {pageError}
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#667788', fontSize: 13 }}>Carregando pivôs…</div>
      ) : metas.length === 0 ? (
        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#667788', fontSize: 14 }}>Nenhuma safra ativa encontrada.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {metas.map(meta => {
            const pivotId = meta.context.pivot?.id ?? ''
            const isEditTarget = editBatch?.pivotId === pivotId
            return (
              <PivotCard
                key={meta.context.season.id}
                meta={meta}
                today={today}
                weekStart={weekStart}
                readOnly={isPastWeek}
                schedules={schedulesByPivot[pivotId] ?? []}
                onSave={async (entries, existingBatchId) => { if (!guardAction()) return; await handleSave(meta, entries, existingBatchId) }}
                onCancel={schedule => setCancelTarget({
                  schedule,
                  pivotName: meta.context.pivot?.name ?? meta.context.season.name,
                })}
                editBatch={isEditTarget ? editBatch : null}
                onEditBatchDone={() => setEditBatch(null)}
                forceExpand={expandPivotId === pivotId}
                onForceExpandDone={() => setExpandPivotId(null)}
              />
            )
          })}
        </div>
      )}

      {/* Histórico de programações + impressão + WhatsApp */}
      {metas.length > 0 && (
        <div style={{ marginTop: 24 }}>
          {/* Toggle colapsável */}
          <button
            onClick={() => setHistoryOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderRadius: historyOpen ? '12px 12px 0 0' : 12,
              background: '#0f1923',
              border: historyOpen ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.06)',
              borderBottom: historyOpen ? '1px solid rgba(255,255,255,0.04)' : undefined,
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8v4l3 3" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="12" cy="12" r="9" stroke="#8b5cf6" strokeWidth="2"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Histórico de Programações</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>Lotes anteriores, impressão e envio WhatsApp</div>
              </div>
            </div>
            <div style={{ color: '#778899', flexShrink: 0 }}>
              {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>

          {historyOpen && (
            <div style={{
              borderRadius: '0 0 12px 12px',
              border: '1px solid rgba(255,255,255,0.06)',
              borderTop: 'none',
              overflow: 'hidden',
            }}>
              <ScheduleHistory
                key={historyKey}
                companyId={company.id}
                today={today}
                metas={metas.map(m => m.context)}
                sectorsMap={Object.fromEntries(metas.map(m => [m.context.pivot?.id ?? '', m.sectors]))}
                onSchedulesChanged={load}
                onEditBatch={payload => {
                  setEditBatch(payload)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                onReschedule={handleReschedule}
              />
            </div>
          )}
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
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}

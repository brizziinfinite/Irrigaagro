'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  listActiveManagementSeasonContexts,
  upsertDailyManagementRecord,
  listDailyManagementBySeason,
} from '@/services/management'
import type { ManagementSeasonContext } from '@/services/management'
import { calcDAS } from '@/lib/calculations/management-balance'
import {
  getStageInfoForDas, calcCTA, calcCAD, calcEtc, calcADc, calcKs,
  getIrrigationStatus,
} from '@/lib/water-balance'
import type { DailyManagement, PivotSpeedEntry } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react'

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

// Encontra a entrada da tabela para uma lâmina:
// menor water_depth_mm que ainda >= laminaMm (velocidade mais alta que entrega o suficiente)
function entryFromTable(table: PivotSpeedEntry[], laminaMm: number): PivotSpeedEntry | null {
  if (!table.length || laminaMm <= 0) return null
  // Ordenar crescente por water_depth_mm
  const sorted = [...table].sort((a, b) => a.water_depth_mm - b.water_depth_mm)
  // Candidatos: todos que entregam ao menos a lâmina solicitada
  const candidates = sorted.filter(e => e.water_depth_mm >= laminaMm)
  if (candidates.length === 0) {
    // Lâmina maior que máximo da tabela — usar a de menor velocidade (mais água)
    return sorted[0]
  }
  // O primeiro candidato tem o menor water_depth_mm suficiente = maior velocidade possível
  return candidates[0]
}

function speedFromTable(table: PivotSpeedEntry[], laminaMm: number): number | null {
  return entryFromTable(table, laminaMm)?.speed_percent ?? null
}

function durationFromTable(table: PivotSpeedEntry[], laminaMm: number): number | null {
  return entryFromTable(table, laminaMm)?.duration_hours ?? null
}

// Calcula hora final dado hora inicial (HH:MM) + duração em horas
function calcEndTime(startTime: string, durationHours: number): string {
  if (!startTime || !durationHours) return ''
  const [hStr, mStr] = startTime.split(':')
  const totalMin = parseInt(hStr) * 60 + parseInt(mStr) + Math.round(durationHours * 60)
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── Tipos ────────────────────────────────────────────────────

// Entrada por pivô × dia
interface CellEntry {
  rainfall: string
  lamina: string
  speed: string       // auto-preenchido ou manual
  speedAuto: boolean  // se foi preenchido automaticamente
  startTime: string   // HH:MM — manual
  endTime: string     // HH:MM — calculado automaticamente
}

type ScheduleGrid = Record<string, Record<string, CellEntry>> // [seasonId][date]

interface PivotMeta {
  context: ManagementSeasonContext
  speedTable: PivotSpeedEntry[]
  history: DailyManagement[]
  currentPct: number | null
  ctaMm: number
  cadMm: number
  adcMm: number
}

// ─── Projeção de % campo após lançamento ──────────────────────

function projectPct(meta: PivotMeta, date: string, laminaStr: string, rainfallStr: string): number | null {
  const { context, history, ctaMm, cadMm } = meta
  const { season, crop } = context
  if (!crop || ctaMm === 0) return null

  const das = season.planting_date ? calcDAS(season.planting_date, date) : 1
  const stageInfo = getStageInfoForDas(crop, das)
  const prevRecord = history.find(h => h.date < date)
  const adcPrev = prevRecord?.ctda ?? ((season.initial_adc_percent ?? 100) / 100) * ctaMm
  const lastEto = history.find(h => h.eto_mm != null)?.eto_mm ?? 5
  const etc = calcEtc(lastEto, stageInfo.kc)
  const irrigMm = parseNum(laminaStr) ?? 0
  const rainMm  = parseNum(rainfallStr) ?? 0
  const adcNew  = calcADc(adcPrev, rainMm, irrigMm, etc, ctaMm)
  return ctaMm > 0 ? (adcNew / ctaMm) * 100 : 0
}

function pctColor(pct: number | null, threshold: number): string {
  if (pct == null) return '#445566'
  if (pct < threshold - 10) return '#ef4444'
  if (pct < threshold) return '#f59e0b'
  return '#22c55e'
}

// ─── Mini campo de entrada ────────────────────────────────────

function MiniField({
  label, value, onChange, type = 'number', placeholder = '—',
  color = '#8899aa', bg = 'rgba(255,255,255,0.05)',
  border = 'rgba(255,255,255,0.09)', readOnly = false, bold = false, width = 72,
}: {
  label: string; value: string; onChange?: (v: string) => void
  type?: string; placeholder?: string; color?: string
  bg?: string; border?: string; readOnly?: boolean; bold?: boolean; width?: number
}) {
  return (
    <div style={{ width, flexShrink: 0 }}>
      <p style={{ fontSize: 8, color: '#3a4f60', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
        {label}
      </p>
      <input
        type={type} placeholder={placeholder}
        value={value}
        readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)}
        style={{
          width: '100%', padding: '5px 4px', borderRadius: 5,
          background: readOnly ? 'rgba(255,255,255,0.02)' : bg,
          border: `1px solid ${readOnly ? 'rgba(255,255,255,0.05)' : border}`,
          color: readOnly ? '#334455' : color,
          fontSize: 12, textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontWeight: bold ? 700 : 400,
          boxSizing: 'border-box',
          cursor: readOnly ? 'default' : 'text',
        }}
      />
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────

export default function LancamentosPage() {
  const { company } = useAuth()

  const [today, setToday] = useState('')
  const [selectedDay, setSelectedDay] = useState(0) // índice 0-6
  const [days, setDays] = useState<string[]>([])

  useEffect(() => {
    const t = toYMD(new Date())
    setToday(t)
    setDays(Array.from({ length: 7 }, (_, i) => addDays(t, i)))
  }, [])

  const [metas, setMetas]       = useState<PivotMeta[]>([])
  const [grid, setGrid]         = useState<ScheduleGrid>({})
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [savedDays, setSavedDays] = useState<Set<string>>(new Set())
  const [pageError, setPageError] = useState<string | null>(null)

  // ── Load ──
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
          .from('pivot_speed_table')
          .select('*')
          .eq('pivot_id', ctx.pivot?.id ?? '')
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

        return { context: ctx, speedTable, history, currentPct, ctaMm, cadMm, adcMm }
      }))

      setMetas(metaList)

      // Init empty grid
      const g: ScheduleGrid = {}
      for (const m of metaList) {
        g[m.context.season.id] = {}
        for (let i = 0; i < 7; i++) {
          const d = addDays(today, i)
          g[m.context.season.id][d] = { rainfall: '', lamina: '', speed: '', speedAuto: false, startTime: '', endTime: '' }
        }
      }
      setGrid(g)
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [company, today])

  useEffect(() => { load() }, [load])

  // ── Update cell ──
  function updateCell(seasonId: string, date: string, field: keyof CellEntry, value: string | boolean, auto = false) {
    setGrid(prev => ({
      ...prev,
      [seasonId]: {
        ...prev[seasonId],
        [date]: {
          ...prev[seasonId]?.[date],
          [field]: value,
          ...(field === 'speed' ? { speedAuto: auto } : {}),
        },
      },
    }))
  }

  // ── Save day ──
  const currentDate = days[selectedDay] ?? ''

  async function handleSaveDay() {
    if (!currentDate) return
    setSaving(true)
    try {
      await Promise.all(metas.map(async meta => {
        const entry = grid[meta.context.season.id]?.[currentDate]
        if (!entry || (entry.rainfall === '' && entry.lamina === '' && entry.speed === '')) return

        const { season, crop, pivot } = meta.context
        const das = season.planting_date ? calcDAS(season.planting_date, currentDate) : 1
        const stageInfo = crop ? getStageInfoForDas(crop, das) : null
        const prevRecord = meta.history.find(h => h.date < currentDate)
        const adcPrev = prevRecord?.ctda ?? ((season.initial_adc_percent ?? 100) / 100) * meta.ctaMm
        const lastEto = meta.history.find(h => h.eto_mm != null)?.eto_mm ?? 5
        const kc = stageInfo?.kc ?? 1
        const etc = calcEtc(lastEto, kc)
        const irrigMm  = parseNum(entry.lamina)   ?? 0
        const rainMm   = parseNum(entry.rainfall) ?? 0
        const speedPct = parseNum(entry.speed)    ?? null
        const adcNew   = calcADc(adcPrev, rainMm, irrigMm, etc, meta.ctaMm)
        const ks       = calcKs(adcNew, meta.cadMm)
        const fcPct    = meta.ctaMm > 0 ? (adcNew / meta.ctaMm) * 100 : 0
        const recDepth = Math.max(0, meta.cadMm - adcNew)

        await upsertDailyManagementRecord({
          season_id: season.id,
          date: currentDate,
          das,
          crop_stage:              stageInfo?.stage ?? null,
          kc,
          ks,
          cta:                     meta.ctaMm,
          ctda:                    adcNew,
          rainfall_mm:             rainMm,
          actual_depth_mm:         irrigMm > 0 ? irrigMm : null,
          actual_speed_percent:    speedPct,
          irrigation_start:        entry.startTime || null,
          irrigation_end:          entry.endTime || null,
          recommended_depth_mm:    recDepth,
          field_capacity_percent:  fcPct,
          needs_irrigation:        adcNew < meta.cadMm,
          etc_mm:                  etc,
          eto_mm:                  lastEto,
        })

        if (rainMm > 0 && pivot?.id) {
          const sb = createClient()
          await (sb as any).from('rainfall_records').upsert({
            pivot_id: pivot.id, date: currentDate, rainfall_mm: rainMm, source: 'manual',
          }, { onConflict: 'pivot_id,date' })
        }
      }))

      setSavedDays(prev => new Set(prev).add(currentDate))
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // ── WhatsApp ──
  function handleWhatsApp() {
    const lines: string[] = [
      '💧 *IrrigaAgro — Programação de Irrigação*',
      `📅 Período: *${fmtShort(days[0])} a ${fmtShort(days[6])}*`,
      '',
    ]
    for (const meta of metas) {
      const pivotName = meta.context.pivot?.name ?? meta.context.season.name
      const farmName  = meta.context.farm.name
      const daysWithData = days.filter(d => {
        const e = grid[meta.context.season.id]?.[d]
        return e && (e.rainfall !== '' || e.lamina !== '')
      })
      if (daysWithData.length === 0) return
      lines.push(`🌾 *${farmName} — ${pivotName}*`)
      for (const d of daysWithData) {
        const e = grid[meta.context.season.id][d]
        const parts: string[] = []
        if (e.rainfall)  parts.push(`🌧 Chuva: *${e.rainfall} mm*`)
        if (e.lamina)    parts.push(`💦 Lâmina: *${e.lamina} mm*`)
        if (e.speed)     parts.push(`⚙️ Vel: *${e.speed}%*`)
        if (e.startTime) parts.push(`🕐 *${e.startTime}${e.endTime ? ` → ${e.endTime}` : ''}*`)
        lines.push(`  • ${fmtWeekday(d)} ${fmtShort(d)}: ${parts.join(' | ')}`)
      }
      lines.push('')
    }
    lines.push('_irrigaagro.com.br_')
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
  }

  // ── Print ──
  function handlePrint() { window.print() }

  if (!company || !today || days.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#445566', fontSize: 13 }}>Carregando…</div>
  )

  const isSaved = savedDays.has(currentDate)

  return (
    <div style={{ paddingBottom: 60 }}>

      {/* ── Print header ── */}
      <div className="print-only" style={{ display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, borderBottom: '2px solid #0093D0', paddingBottom: 10 }}>
          <svg width="40" height="40" viewBox="0 0 64 64" fill="none">
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
            <div style={{ fontSize: 20, fontWeight: 900 }}>
              <span style={{ color: '#0284C7' }}>Irriga</span><span style={{ color: '#16A34A', fontWeight: 300 }}>Agro</span>
            </div>
            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Irrigação de Precisão</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Programação de Irrigação</div>
            <div style={{ fontSize: 12, color: '#444' }}>
              {fmtShort(days[0])} a {fmtShort(days[6])}
            </div>
            <div style={{ fontSize: 10, color: '#888' }}>Emitido: {new Date().toLocaleString('pt-BR')}</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f0f4f8' }}>
              <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #0093D0' }}>Fazenda / Pivô</th>
              {days.map(d => (
                <th key={d} style={{ textAlign: 'center', padding: '6px 4px', borderBottom: '2px solid #0093D0', fontSize: 11 }}>
                  {fmtWeekday(d)}<br />{fmtShort(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metas.map((meta, i) => (
              <tr key={meta.context.season.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px', verticalAlign: 'top' }}>
                  <strong>{meta.context.pivot?.name ?? '—'}</strong>
                  <br /><span style={{ color: '#666', fontSize: 11 }}>{meta.context.farm.name}</span>
                  <br /><span style={{ color: '#888', fontSize: 10 }}>{meta.context.season.name}</span>
                </td>
                {days.map(d => {
                  const e = grid[meta.context.season.id]?.[d]
                  const hasD = e && (e.rainfall !== '' || e.lamina !== '')
                  return (
                    <td key={d} style={{ textAlign: 'center', padding: '6px 4px', verticalAlign: 'top' }}>
                      {hasD ? (
                        <>
                          {e.lamina && <div style={{ fontWeight: 700, color: '#16A34A' }}>{e.lamina} mm</div>}
                          {e.rainfall && <div style={{ color: '#0284C7', fontSize: 11 }}>🌧 {e.rainfall} mm</div>}
                          {e.speed && <div style={{ color: '#888', fontSize: 10 }}>{e.speed}%</div>}
                          {e.startTime && <div style={{ color: '#555', fontSize: 10 }}>{e.startTime}{e.endTime ? ` → ${e.endTime}` : ''}</div>}
                        </>
                      ) : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 10, color: '#aaa', marginTop: 10, borderTop: '1px solid #eee', paddingTop: 6 }}>
          IrrigaAgro · irrigaagro.com.br · {new Date().toLocaleString('pt-BR')}
        </p>
      </div>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <ClipboardList size={20} style={{ color: '#0093D0' }} />
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0', margin: 0, letterSpacing: '-0.02em' }}>
            Lançamentos
          </h1>
        </div>
        <p style={{ fontSize: 13, color: '#445566', margin: 0 }}>
          Programe chuva e irrigação — hoje + 7 dias — para todos os pivôs
        </p>
      </div>

      {/* ── Day tabs ── */}
      <div style={{
        background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14, padding: 12, marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 6,
      }} className="no-print">
        <button onClick={() => setSelectedDay(d => Math.max(0, d - 1))} disabled={selectedDay === 0}
          style={{ background: 'none', border: 'none', color: selectedDay === 0 ? '#334455' : '#8899aa', cursor: selectedDay === 0 ? 'default' : 'pointer', padding: '4px 6px' }}>
          <ChevronLeft size={18} />
        </button>

        <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto' }}>
          {days.map((d, i) => {
            const isToday = d === today
            const active  = i === selectedDay
            const saved   = savedDays.has(d)
            const hasData = metas.some(m => {
              const e = grid[m.context.season.id]?.[d]
              return e && (e.rainfall !== '' || e.lamina !== '')
            })
            return (
              <button key={d} onClick={() => setSelectedDay(i)} style={{
                flex: '0 0 auto', minWidth: 64,
                padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: active ? '#0093D0' : 'rgba(255,255,255,0.04)',
                color: active ? '#fff' : '#8899aa',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                position: 'relative',
              }}>
                <span style={{ fontSize: 9, textTransform: 'capitalize', opacity: 0.8 }}>
                  {isToday ? 'Hoje' : fmtWeekday(d)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {fmtShort(d)}
                </span>
                {saved && (
                  <span style={{ fontSize: 8, color: active ? '#fff' : '#22c55e', fontWeight: 700 }}>✓ Salvo</span>
                )}
                {!saved && hasData && (
                  <span style={{ fontSize: 8, color: active ? '#fff' : '#f59e0b' }}>● editado</span>
                )}
              </button>
            )
          })}
        </div>

        <button onClick={() => setSelectedDay(d => Math.min(6, d + 1))} disabled={selectedDay === 6}
          style={{ background: 'none', border: 'none', color: selectedDay === 6 ? '#334455' : '#8899aa', cursor: selectedDay === 6 ? 'default' : 'pointer', padding: '4px 6px' }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* ── Error ── */}
      {pageError && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
          {pageError}
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#445566', fontSize: 13 }}>Carregando pivôs…</div>
      ) : metas.length === 0 ? (
        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#445566', fontSize: 14 }}>Nenhuma safra ativa encontrada.</p>
        </div>
      ) : (
        <>
          {/* ── Pivot rows — um card compacto por pivô ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {metas.map(meta => {
              const { season, pivot, farm } = meta.context
              const threshold = pivot?.alert_threshold_percent ?? 70
              const currentColor = pctColor(meta.currentPct, threshold)
              const entry = grid[season.id]?.[currentDate] ?? { rainfall: '', lamina: '', speed: '', speedAuto: false, startTime: '', endTime: '' }
              const projected = projectPct(meta, currentDate, entry.lamina, entry.rainfall)
              const projColor = pctColor(projected, threshold)
              const isSavedPivot = savedDays.has(currentDate) // simplificado — salva todos juntos
              const hasEntry = entry.rainfall !== '' || entry.lamina !== ''

              function handleLamina(v: string) {
                updateCell(season.id, currentDate, 'lamina', v)
                const mm = parseNum(v)
                if (mm != null && mm > 0 && meta.speedTable.length > 0) {
                  const te = entryFromTable(meta.speedTable, mm)
                  if (te) {
                    updateCell(season.id, currentDate, 'speed', String(te.speed_percent), true)
                    if (entry.startTime) updateCell(season.id, currentDate, 'endTime', calcEndTime(entry.startTime, te.duration_hours))
                  }
                } else if (v === '') {
                  updateCell(season.id, currentDate, 'speed', '', true)
                  updateCell(season.id, currentDate, 'endTime', '')
                }
              }

              function handleStart(v: string) {
                updateCell(season.id, currentDate, 'startTime', v)
                const mm = parseNum(entry.lamina)
                if (mm != null && mm > 0 && meta.speedTable.length > 0) {
                  const te = entryFromTable(meta.speedTable, mm)
                  if (te && v) updateCell(season.id, currentDate, 'endTime', calcEndTime(v, te.duration_hours))
                }
              }

              return (
                <div key={season.id} style={{
                  background: '#0f1923',
                  border: `1px solid ${hasEntry ? 'rgba(0,147,208,0.18)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 12,
                  padding: '10px 16px',
                  display: 'flex', alignItems: 'center', gap: 16,
                }}>

                  {/* ── Info do pivô ── */}
                  <div style={{ flex: '0 0 180px' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', margin: 0, lineHeight: 1.2 }}>
                      {pivot?.name ?? season.name}
                    </p>
                    <p style={{ fontSize: 10, color: '#445566', margin: '1px 0 4px', lineHeight: 1.3 }}>
                      {farm.name}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: currentColor, fontFamily: 'var(--font-mono)' }}>
                        {meta.currentPct != null ? `${Math.round(meta.currentPct)}%` : '—'}
                      </span>
                      {projected != null && hasEntry && (
                        <>
                          <span style={{ fontSize: 12, color: '#334455' }}>→</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: projColor, fontFamily: 'var(--font-mono)' }}>
                            {Math.round(projected)}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ── Campos — crescem para preencher largura ── */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flex: 1 }}>
                    <MiniField
                      label="Chuva mm"
                      value={entry.rainfall}
                      onChange={v => updateCell(season.id, currentDate, 'rainfall', v)}
                      color="rgba(255,255,255,0.75)"
                      width={90}
                    />
                    <MiniField
                      label="Lâmina mm"
                      value={entry.lamina}
                      onChange={handleLamina}
                      color="#0093D0"
                      bg="rgba(0,147,208,0.10)"
                      border="rgba(0,147,208,0.25)"
                      bold
                      width={100}
                    />
                    <MiniField
                      label={entry.speedAuto && entry.speed ? 'Vel % ↺' : 'Vel %'}
                      value={entry.speed}
                      onChange={v => updateCell(season.id, currentDate, 'speed', v, false)}
                      color={entry.speedAuto && entry.speed ? '#f59e0b' : '#8899aa'}
                      bg={entry.speedAuto && entry.speed ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.04)'}
                      border={entry.speedAuto && entry.speed ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}
                      width={80}
                    />
                    <MiniField
                      label="Início"
                      type="time"
                      value={entry.startTime}
                      onChange={handleStart}
                      color="#e2e8f0"
                      width={80}
                    />
                    <MiniField
                      label="Fim (auto)"
                      type="time"
                      value={entry.endTime}
                      readOnly
                      color="#22c55e"
                      width={90}
                    />
                  </div>

                  {/* ── Botão Salvar individual ── */}
                  <button
                    onClick={handleSaveDay}
                    disabled={saving}
                    className="no-print"
                    style={{
                      flexShrink: 0,
                      padding: '0 22px',
                      height: 52,
                      borderRadius: 10,
                      border: 'none',
                      cursor: saving ? 'wait' : 'pointer',
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: '0.02em',
                      background: isSavedPivot
                        ? 'rgba(34,197,94,0.12)'
                        : 'linear-gradient(135deg, #0093D0 0%, #0070a8 100%)',
                      color: isSavedPivot ? '#22c55e' : '#fff',
                      boxShadow: isSavedPivot ? 'none' : '0 2px 12px rgba(0,147,208,0.35)',
                      whiteSpace: 'nowrap',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                    }}>
                    {saving ? (
                      <span>Salvando…</span>
                    ) : isSavedPivot ? (
                      <>
                        <span style={{ fontSize: 14 }}>✓</span>
                        <span style={{ fontSize: 10, fontWeight: 600 }}>Salvo</span>
                      </>
                    ) : (
                      <>
                        <span>Salvar</span>
                        <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.75 }}>{fmtShort(currentDate)}</span>
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>

          {/* ── Footer — só Imprimir e WhatsApp ── */}
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }} className="no-print">
            {/* Imprimir */}
            {savedDays.size > 0 && (
              <button onClick={handlePrint}
                style={{
                  padding: '14px 18px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
                  border: '1px solid rgba(255,255,255,0.10)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Imprimir semana
              </button>
            )}

            {/* WhatsApp */}
            {savedDays.size > 0 && (
              <button onClick={handleWhatsApp}
                style={{
                  padding: '14px 18px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: 'rgba(37,211,102,0.10)', color: '#25d366',
                  border: '1px solid rgba(37,211,102,0.25)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                </svg>
                Enviar semana
              </button>
            )}
          </div>
        </>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; color: black !important; }
        }
        @media screen { .print-only { display: none !important; } }
      `}</style>
    </div>
  )
}

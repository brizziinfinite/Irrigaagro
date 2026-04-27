'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { listFarmsByCompany } from '@/services/farms'
import { listPivotsByFarmIds } from '@/services/pivots'
import { listSectorsByPivotId } from '@/services/pivot-sectors'
import { deleteRainfallRecord, listRainfallByPivotIds, upsertRainfallRecord, upsertRainfallRecords } from '@/services/rainfall'
import type { PivotSector, RainfallRecord } from '@/types/database'
import {
  ChevronLeft, ChevronRight, CloudRain, Upload, X,
  Calendar,
} from 'lucide-react'
import Link from 'next/link'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Constrói mapa date→mm somando todos os registros.
 *  O banco garante unicidade por (pivot_id, date, sector_id), então não há duplicatas. */
function buildRainfallMap(records: RainfallRecord[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of records) map[r.date] = (map[r.date] ?? 0) + r.rainfall_mm
  return map
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  A: '#f59e0b',
  B: '#3b82f6',
  C: '#a855f7',
  D: '#ef4444',
}

const SECTOR_COLOR_LIST = ['#f59e0b', '#3b82f6', '#a855f7', '#ef4444', '#10b981', '#ec4899']

function getSectorColor(sector: PivotSector, index: number): string {
  // Single letter name → use color map
  if (SECTOR_COLORS[sector.name.toUpperCase()]) return SECTOR_COLORS[sector.name.toUpperCase()]
  return SECTOR_COLOR_LIST[index % SECTOR_COLOR_LIST.length]
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PivotOption {
  id: string
  name: string
  farm_name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseFlexDate(raw: string): string | null {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

function rainfallColor(mm: number): { text: string; bg: string } {
  if (mm <= 0)    return { text: '#8899aa', bg: 'transparent' }
  if (mm < 10)   return { text: '#06b6d4', bg: 'rgb(6 182 212 / 0.08)' }
  if (mm < 30)   return { text: '#3b82f6', bg: 'rgb(59 130 246 / 0.12)' }
  return { text: '#1d4ed8', bg: 'rgb(29 78 216 / 0.18)' }
}

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAY_LABELS  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

// ─── Pivot visual map (sector donut) ─────────────────────────────────────────

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  // Handle full circle
  if (Math.abs(endDeg - startDeg) >= 360) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
  }
  const start = polarToXY(cx, cy, r, startDeg)
  const end = polarToXY(cx, cy, r, endDeg)
  const largeArc = (endDeg - startDeg + 360) % 360 > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

interface PivotMapProps {
  sectors: PivotSector[]
  activeSectorId: string | null
  onSelectSector: (id: string | null) => void
}

function PivotCircleMap({ sectors, activeSectorId, onSelectSector }: PivotMapProps) {
  const cx = 80, cy = 80, r = 64
  const hasSectors = sectors.length > 0

  return (
    <svg width={160} height={160} viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
      {/* Background circle */}
      <circle cx={cx} cy={cy} r={r} fill="#0d1520" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

      {hasSectors ? sectors.map((s, i) => {
        const color = getSectorColor(s, i)
        const isActive = activeSectorId === s.id
        const start = s.angle_start ?? 0
        const end = s.angle_end ?? 360
        const path = arcPath(cx, cy, r, start, end)
        // Label position at mid-angle
        const midAngle = start + ((end - start + 360) % 360) / 2
        const lp = polarToXY(cx, cy, r * 0.6, midAngle)
        return (
          <g key={s.id} style={{ cursor: 'pointer' }} onClick={() => onSelectSector(isActive ? null : s.id)}>
            <path
              d={path}
              fill={isActive ? color : `${color}55`}
              stroke={isActive ? color : `${color}99`}
              strokeWidth={isActive ? 1.5 : 0.8}
              style={{ transition: 'fill 0.15s' }}
            />
            <text
              x={lp.x} y={lp.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={10} fontWeight={700} fill={isActive ? '#fff' : color}
              style={{ pointerEvents: 'none' }}
            >
              {s.name}
            </text>
          </g>
        )
      }) : (
        // No sectors — full circle
        <circle
          cx={cx} cy={cy} r={r}
          fill={activeSectorId === null ? 'rgb(0 147 208 / 0.2)' : 'rgb(0 147 208 / 0.06)'}
          stroke="#0093D0"
          strokeWidth={1}
          style={{ cursor: 'pointer' }}
          onClick={() => onSelectSector(null)}
        />
      )}

      {/* North indicator */}
      <circle cx={cx} cy={cy - r + 6} r={3} fill="#f59e0b" />
      <text x={cx} y={cy - r + 17} textAnchor="middle" fontSize={8} fill="#f59e0b" fontWeight={700}>N</text>

      {/* Center hole */}
      <circle cx={cx} cy={cy} r={18} fill="#080e14" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={3} fill="#0093D0" />
    </svg>
  )
}

// ─── Sector tabs ──────────────────────────────────────────────────────────────

interface SectorTabsProps {
  sectors: PivotSector[]
  activeSectorId: string | null
  onSelect: (id: string | null) => void
}

function SectorTabs({ sectors, activeSectorId, onSelect }: SectorTabsProps) {
  if (sectors.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button
        onClick={() => onSelect(null)}
        style={{
          padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          background: activeSectorId === null ? '#0093D0' : '#0d1520',
          color: activeSectorId === null ? '#fff' : '#8899aa',
          transition: 'background 0.15s',
        }}
      >
        Geral
      </button>
      {sectors.map((s, i) => {
        const color = getSectorColor(s, i)
        const isActive = activeSectorId === s.id
        return (
          <button
            key={s.id}
            onClick={() => onSelect(isActive ? null : s.id)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: `1px solid ${isActive ? color : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: isActive ? `${color}22` : '#0d1520',
              color: isActive ? color : '#8899aa',
              transition: 'all 0.15s',
            }}
          >
            {s.name}
          </button>
        )
      })}
    </div>
  )
}

// ─── Chips ────────────────────────────────────────────────────────────────────

function RainfallChips({
  records,
  pivotId,
  selectedDate,
  calYear,
  calMonth,
  sectorLabel,
}: {
  records: RainfallRecord[]
  pivotId: string
  selectedDate: string
  calYear: number
  calMonth: number
  sectorLabel?: string
}) {
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo,   setRangeTo]   = useState('')
  const [rangeTotal, setRangeTotal] = useState<number | null>(null)
  const [rangeLoading, setRangeLoading] = useState(false)

  // Calcula total do período quando ambas as datas estão preenchidas
  useEffect(() => {
    if (!rangeFrom || !rangeTo || !pivotId || rangeFrom > rangeTo) {
      setRangeTotal(null)
      return
    }
    let cancelled = false
    setRangeLoading(true)
    listRainfallByPivotIds([pivotId], undefined, rangeFrom, rangeTo)
      .then(data => {
        if (cancelled) return
        const map = buildRainfallMap(data.filter(r => r.sector_id === null))
        setRangeTotal(Object.values(map).reduce((s, v) => s + v, 0))
      })
      .catch(() => setRangeTotal(null))
      .finally(() => { if (!cancelled) setRangeLoading(false) })
    return () => { cancelled = true }
  }, [rangeFrom, rangeTo, pivotId])

  const chips = useMemo(() => {
    const map = buildRainfallMap(records)
    const selD = new Date(selectedDate + 'T00:00:00')
    const day = map[selectedDate] ?? 0
    const dow = selD.getDay()
    const weekDates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(selD)
      d.setDate(selD.getDate() - dow + i)
      weekDates.push(toYMD(d))
    }
    const week = weekDates.reduce((s, k) => s + (map[k] ?? 0), 0)
    const prefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`
    const month = Object.entries(map).reduce((s, [k, v]) => k.startsWith(prefix) ? s + v : s, 0)
    const yearPrefix = String(calYear)
    const year = Object.entries(map).reduce((s, [k, v]) => k.startsWith(yearPrefix) ? s + v : s, 0)
    return [
      { label: 'Dia',    value: day },
      { label: 'Semana', value: week },
      { label: 'Mês',    value: month },
      { label: 'Ano',    value: year },
    ]
  }, [records, selectedDate, calYear, calMonth])

  const inputStyle: React.CSSProperties = {
    background: '#0d1520', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#e2e8f0', fontSize: 12, padding: '5px 8px',
    outline: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Chips padrão */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {sectorLabel && (
          <span style={{ fontSize: 11, color: '#778899', marginRight: 4 }}>{sectorLabel}</span>
        )}
        {chips.map(c => (
          <div key={c.label} style={{
            padding: '6px 14px', borderRadius: 20,
            background: c.value > 0 ? 'rgb(6 182 212 / 0.1)' : '#0d1520',
            border: `1px solid ${c.value > 0 ? 'rgb(6 182 212 / 0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: c.value > 0 ? '#06b6d4' : '#778899',
            fontSize: 12, fontWeight: 600,
          }}>
            {c.label}: {c.value.toFixed(1)} mm
          </div>
        ))}
      </div>

      {/* Filtro de período personalizado */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#778899', fontWeight: 600 }}>Período:</span>
        <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} style={inputStyle} />
        <span style={{ fontSize: 11, color: '#778899' }}>até</span>
        <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} style={inputStyle} />
        {rangeLoading && (
          <span style={{ fontSize: 12, color: '#778899' }}>calculando…</span>
        )}
        {!rangeLoading && rangeTotal !== null && (
          <div style={{
            padding: '6px 14px', borderRadius: 20,
            background: rangeTotal > 0 ? 'rgb(34 197 94 / 0.1)' : '#0d1520',
            border: `1px solid ${rangeTotal > 0 ? 'rgb(34 197 94 / 0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: rangeTotal > 0 ? '#22c55e' : '#778899',
            fontSize: 12, fontWeight: 700,
          }}>
            Total: {rangeTotal.toFixed(1)} mm
          </div>
        )}
        {rangeFrom && rangeTo && rangeFrom > rangeTo && (
          <span style={{ fontSize: 11, color: '#ef4444' }}>Data inicial maior que final</span>
        )}
      </div>
    </div>
  )
}

// ─── Sector comparison bar chart ──────────────────────────────────────────────

interface SectorCompareProps {
  allRecords: RainfallRecord[]
  sectors: PivotSector[]
  year: number
  month: number
}

function SectorCompareChart({ allRecords, sectors, year, month }: SectorCompareProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const data = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`

    // Group: null = general (no sector)
    const groups: { id: string | null; label: string; color: string }[] = [
      { id: null, label: 'Geral', color: '#0093D0' },
      ...sectors.map((s, i) => ({ id: s.id, label: s.name, color: getSectorColor(s, i) })),
    ]

    return groups.map(g => {
      const sectorRecords = allRecords.filter(r => r.date.startsWith(prefix) && r.sector_id === g.id)
      const sectorMap = buildRainfallMap(sectorRecords)
      const total = Object.values(sectorMap).reduce((s, v) => s + v, 0)
      return { ...g, total }
    }).filter(g => g.total > 0 || g.id === null)
  }, [allRecords, sectors, year, month])

  const maxVal = Math.max(...data.map(d => d.total), 1)

  if (sectors.length === 0) return null

  return (
    <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#8899aa', marginBottom: 12 }}>
        Comparativo por setor — {MONTH_NAMES[month]}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map(d => (
          <div
            key={String(d.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
            onMouseEnter={() => setHovered(String(d.id))}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ width: 36, fontSize: 11, fontWeight: 700, color: d.color, textAlign: 'right', flexShrink: 0 }}>
              {d.label}
            </div>
            <div style={{ flex: 1, height: 14, background: '#0a1016', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 7, display: 'flex', alignItems: 'center' }}>
              <div style={{
                height: '100%', width: `${(d.total / maxVal) * 100}%`,
                background: d.color,
                borderRadius: 7,
                boxShadow: hovered === String(d.id) ? `0 0 12px ${d.color}90` : 'none',
                opacity: hovered === String(d.id) ? 1 : 0.85,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }} />
            </div>
            <div style={{ width: 52, fontSize: 11, fontWeight: 600, color: '#e2e8f0', textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
              {d.total.toFixed(1)} mm
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function RainfallBarChart({ records, year, month }: { records: RainfallRecord[]; year: number; month: number }) {
  const data = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const byDate = buildRainfallMap(records)
    const map: Record<number, number> = {}
    for (const [date, mm] of Object.entries(byDate)) {
      const d = new Date(date + 'T00:00:00')
      if (d.getFullYear() === year && d.getMonth() === month) {
        map[d.getDate()] = mm
      }
    }
    return Array.from({ length: daysInMonth }, (_, i) => ({
      day: String(i + 1),
      mm: map[i + 1] ?? 0
    }))
  }, [records, year, month])

  const avgMm = useMemo(() => data.reduce((s, d) => s + d.mm, 0) / data.length, [data])

  return (
    <div style={{ position: 'relative', width: '100%', height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="barGradRain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.03)" vertical={false} />
          <XAxis 
            dataKey="day" 
            tick={{ fill: '#778899', fontSize: 10 }} 
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} 
            tickLine={false} 
            interval={0}
            tickFormatter={(v, i) => i === 0 || i === data.length - 1 || (i + 1) % 5 === 0 ? v : ''}
          />
          <YAxis 
            tick={{ fill: '#778899', fontSize: 10 }} 
            axisLine={false} 
            tickLine={false} 
            tickFormatter={v => v > 0 ? v : ''}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            contentStyle={{ backgroundColor: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#e2e8f0', fontSize: 12, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
            formatter={(value: any) => [`${Number(value).toFixed(1)} mm`, 'Precipitação']}
            labelFormatter={(label) => `Dia ${label}`}
            labelStyle={{ color: '#8899aa', marginBottom: 4 }}
          />
          {avgMm > 0 && <ReferenceLine y={avgMm} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />}
          <Bar dataKey="mm" fill="url(#barGradRain)" radius={[4, 4, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  date: string
  pivotId: string
  sectorId: string | null
  sectorName: string | null
  existing: RainfallRecord | null
  allPivots: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => Promise<void>
  onDeleted: () => Promise<void>
}

// Recalcula o daily_management completo da safra a partir da data alterada.
// Retorna true se recalculou com sucesso, false caso contrário.
async function syncManagementForPivotDate(pivotId: string, date: string): Promise<boolean> {
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: season } = await (supabase as any)
      .from('seasons')
      .select('id')
      .eq('pivot_id', pivotId)
      .eq('is_active', true)
      .gte('planting_date', '2000-01-01')
      .lte('planting_date', date)
      .order('planting_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!season?.id) return false
    // Recalcula a partir da data corrigida (propaga para todos os dias seguintes)
    const res = await fetch('/api/seasons/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season_id: season.id, date }),
    })
    return res.ok
  } catch {
    return false
  }
}

function EditModal({ date, pivotId, sectorId, sectorName, existing, allPivots, onClose, onSaved, onDeleted }: EditModalProps) {
  const [value, setValue] = useState(existing ? String(existing.rainfall_mm) : '0')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  // Pivôs extras onde aplicar o mesmo valor (excluindo o pivô atual que já é salvo)
  const otherPivots = allPivots.filter(p => p.id !== pivotId)
  const [extraPivotIds, setExtraPivotIds] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const displayDate = (() => {
    const [y, m, d] = date.split('-').map(Number)
    return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`
  })()

  async function handleSave() {
    try {
      setSaving(true)
      setError('')
      const mm = Number.parseFloat(value)

      if (!Number.isFinite(mm) || mm < 0) {
        setError('Informe uma precipitacao valida em mm.')
        setSaving(false)
        return
      }

      // O índice único usa COALESCE(sector_id, uuid_nil) — upsert via PostgREST não consegue
      // resolver conflito quando sector_id = null. Usamos delete + insert para todos os pivôs.
      const { createClient } = await import('@/lib/supabase/client')
      const sb = createClient() as any

      const allTargets = [
        { pid: pivotId, sid: sectorId },
        ...extraPivotIds.map(pid => ({ pid, sid: null as string | null })),
      ]

      await Promise.all(allTargets.map(async ({ pid, sid }) => {
        let q = sb.from('rainfall_records').delete().eq('pivot_id', pid).eq('date', date)
        q = sid ? q.eq('sector_id', sid) : q.is('sector_id', null)
        await q
        await sb.from('rainfall_records').insert({
          pivot_id: pid, date, rainfall_mm: mm, source: 'manual',
          sector_id: sid ?? null, updated_at: new Date().toISOString(),
        })
      }))
      await onSaved()

      // Recalcula manejo de forma síncrona para todos os pivôs afetados
      setSyncing(true)
      await Promise.all(allTargets.map(({ pid }) => syncManagementForPivotDate(pid, date)))
      setSyncing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar precipitação')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!existing) { onClose(); return }
    try {
      setSaving(true)
      setError('')
      await deleteRainfallRecord(existing.id)
      await onDeleted()
      setSyncing(true)
      setSaving(false)
      await syncManagementForPivotDate(pivotId, date)
      setSyncing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir precipitação')
      setSaving(false)
      setSyncing(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgb(0 0 0 / 0.6)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 360, background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16, padding: 'clamp(16px, 4vw, 24px)', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700 }}>
              Precipitação — {displayDate}
            </h3>
            {sectorName && (
              <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Setor {sectorName}</p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#778899', padding: 8, minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
            <X size={16} />
          </button>
        </div>

        {existing && (() => {
          const sourceCfg: Record<string, { label: string; color: string; border: string }> = {
            manual:   { label: 'Manual',    color: '#22c55e', border: 'rgb(34 197 94 / 0.25)' },
            import:   { label: 'Importado', color: '#f59e0b', border: 'rgb(245 158 11 / 0.25)' },
            station:  { label: 'Estação',   color: '#8899aa', border: 'rgba(255,255,255,0.12)' },
            plugfield:{ label: 'Plugfield', color: '#22d3ee', border: 'rgb(34 211 238 / 0.25)' },
          }
          const cfg = sourceCfg[existing.source] ?? sourceCfg.station
          return (
            <div style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 20,
              background: '#0d1520', border: `1px solid ${cfg.border}`, color: cfg.color,
              alignSelf: 'flex-start',
            }}>
              {cfg.label}
              {existing.source === 'plugfield' && (
                <span style={{ color: '#778899', marginLeft: 4 }}>— editar muda para Manual</span>
              )}
            </div>
          )
        })()}

        {error && (
          <div style={{
            fontSize: 12, padding: '8px 10px', borderRadius: 8,
            background: 'rgb(239 68 68 / 0.08)', border: '1px solid rgb(239 68 68 / 0.2)', color: '#fca5a5',
          }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ fontSize: 12, color: '#8899aa', display: 'block', marginBottom: 6 }}>
            Chuva (mm)
          </label>
          <input
            ref={inputRef}
            type="number"
            step="0.1"
            min="0"
            max="999"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)',
              color: '#e2e8f0', fontSize: 24, fontWeight: 700,
              outline: 'none', boxSizing: 'border-box',
              textAlign: 'center',
            }}
          />
        </div>

        {otherPivots.length > 0 && (
          <div>
            <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 8 }}>Aplicar também em:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {otherPivots.map(p => {
                const checked = extraPivotIds.includes(p.id)
                return (
                  <button key={p.id} type="button"
                    onClick={() => setExtraPivotIds(prev => checked ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      border: `1px solid ${checked ? 'rgba(0,147,208,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      background: checked ? 'rgba(0,147,208,0.08)' : '#0d1520',
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${checked ? '#0093D0' : 'rgba(255,255,255,0.2)'}`,
                      background: checked ? '#0093D0' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3 5.5L8 1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span style={{ fontSize: 13, color: checked ? '#e2e8f0' : '#8899aa' }}>{p.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving || syncing}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#0093D0', color: '#fff', fontWeight: 600, fontSize: 13, minHeight: 44,
              opacity: (saving || syncing) ? 0.7 : 1,
            }}
          >
            {saving ? 'Salvando…' : syncing ? 'Atualizando manejo…' : 'Salvar'}
          </button>
          {existing && (
            <button
              onClick={handleClear}
              disabled={saving}
              title={existing.source === 'plugfield' ? 'O cron vai recriar este registro automaticamente no proximo dia' : undefined}
              style={{
                padding: '10px 14px', borderRadius: 8,
                background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)',
                color: existing.source === 'plugfield' ? '#f59e0b' : '#8899aa', cursor: 'pointer', fontSize: 13,
              }}
            >
              Limpar
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
              color: '#778899', cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

interface ImportModalProps {
  pivotId: string
  allPivots: PivotOption[]
  onClose: () => void
  onImported: () => Promise<void>
}

interface SheetTab {
  name: string
  gid: string
}

function parseCsvLinePrecip(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  cols.push(cur.trim())
  return cols
}

function detectCol(headers: string[], keywords: string[]): string {
  for (const kw of keywords) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(kw.toLowerCase()))
    if (idx >= 0) return String(idx)
  }
  return '0'
}

function ImportModal({ pivotId, allPivots, onClose, onImported }: ImportModalProps) {
  const [url, setUrl]           = useState('')
  const [gid, setGid]           = useState('0')
  const [tabs, setTabs]         = useState<SheetTab[]>([])
  const [loadingTabs, setLoadingTabs] = useState(false)
  const [dateCol, setDateCol]   = useState('0')
  const [mmCol, setMmCol]       = useState('1')
  const [preview, setPreview]   = useState<string[][] | null>(null)
  const [headers, setHeaders]   = useState<string[]>([])
  const [loading, setLoading]   = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError]       = useState('')
  const [selectedPivotIds, setSelectedPivotIds] = useState<string[]>([pivotId])

  // Retorna { sid, pub } — pub=true quando é URL de "Publicar na web" (/d/e/...)
  function extractSpreadsheetId(raw: string): { sid: string; pub: boolean } | null {
    // URL publicada na web: /spreadsheets/d/e/2PACX-1v.../pub...
    const pubM = raw.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/)
    if (pubM) return { sid: pubM[1], pub: true }
    // URL normal: /spreadsheets/d/{ID}/...
    const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    if (m) return { sid: m[1], pub: false }
    return null
  }

  function extractGidFromUrl(raw: string): string | null {
    const m = raw.match(/[#&?]gid=(\d+)/)
    return m ? m[1] : null
  }

  async function fetchTabs(sid: string) {
    // fetchTabs só funciona para planilhas não-publicadas (requer login Google)
    // Para planilhas publicadas na web, o auto-detect de abas não é possível
    setLoadingTabs(true)
    setTabs([])
    setLoadingTabs(false)
  }

  function handleUrlChange(raw: string) {
    setUrl(raw)
    setPreview(null)
    setHeaders([])
    setTabs([])
    const parsed = extractSpreadsheetId(raw)
    if (!parsed) return
    const gidFromUrl = extractGidFromUrl(raw)
    setGid(gidFromUrl ?? '0')
    if (!parsed.pub) fetchTabs(parsed.sid)
  }

  async function handleFetch() {
    setError('')
    const parsed = extractSpreadsheetId(url)
    if (!parsed) { setError('URL inválida. Cole a URL completa do Google Sheets.'); return }
    const { sid, pub } = parsed
    setLoading(true)
    try {
      const csvUrl = `/api/sheets-proxy?sid=${sid}&gid=${gid}${pub ? '&pub=1' : ''}`
      const res = await fetch(csvUrl)
      if (!res.ok) throw new Error(`Planilha não acessível (erro ${res.status}). Certifique-se de que está pública.`)
      const text = await res.text()
      const rows = text.trim().split('\n').map(r => parseCsvLinePrecip(r))
      if (rows.length < 2) throw new Error('Planilha vazia ou sem dados.')
      const hdrs = rows[0]
      setHeaders(hdrs)
      setPreview(rows.slice(1, 6))
      setDateCol(detectCol(hdrs, ['data', 'date']))
      setMmCol(detectCol(hdrs, ['precipita', 'chuva', 'mm', 'rain']))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar planilha.')
    }
    setLoading(false)
  }

  const abortRef = useRef<AbortController | null>(null)

  async function handleImport() {
    const parsed = extractSpreadsheetId(url)
    if (!parsed) return
    const { sid, pub } = parsed
    setImporting(true)
    setProgress(0)
    setError('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const csvUrl = `/api/sheets-proxy?sid=${sid}&gid=${gid}${pub ? '&pub=1' : ''}`
      const res = await fetch(csvUrl, { signal: controller.signal })
      if (!res.ok) throw new Error(`Planilha não acessível (erro ${res.status}).`)
      const text = await res.text()
      const rows = text.trim().split('\n').map(r => parseCsvLinePrecip(r))
      const dataRows = rows.slice(1).filter(r => r.length > Math.max(Number(dateCol), Number(mmCol)))

      if (selectedPivotIds.length === 0) throw new Error('Selecione ao menos um pivô para importar.')

      const validRows: { date: string; rainfall_mm: number }[] = []
      let skippedRows = 0
      for (const row of dataRows) {
        const dateStr = parseFlexDate(row[Number(dateCol)])
        const mmRaw = row[Number(mmCol)].replace(',', '.')
        const mm = parseFloat(mmRaw)
        if (!dateStr || isNaN(mm) || mm < 0) { skippedRows++; continue }
        validRows.push({ date: dateStr, rainfall_mm: mm })
      }

      if (validRows.length === 0) {
        throw new Error(`Nenhum registro válido encontrado. ${skippedRows} linha(s) com data ou valor inválido.`)
      }

      // Desduplicar por pivot_id+date — mantém o último valor caso a planilha tenha datas repetidas
      const deduped = new Map<string, { pivot_id: string; date: string; rainfall_mm: number; source: 'import' }>()
      for (const r of validRows) {
        for (const pid of selectedPivotIds) {
          deduped.set(`${pid}__${r.date}`, { pivot_id: pid, date: r.date, rainfall_mm: r.rainfall_mm, source: 'import' })
        }
      }
      const parsed = Array.from(deduped.values())

      const chunkSize = 50
      const total = parsed.length
      for (let i = 0; i < total; i += chunkSize) {
        if (controller.signal.aborted) throw new Error('Importação cancelada.')
        try {
          await upsertRainfallRecords(parsed.slice(i, i + chunkSize))
        } catch (chunkErr) {
          throw new Error(`Erro ao salvar lote ${Math.floor(i/chunkSize)+1}: ${chunkErr instanceof Error ? chunkErr.message : String(chunkErr)}`)
        }
        setProgress(Math.min(100, Math.round(((i + chunkSize) / total) * 100)))
      }

      setProgress(100)
      const msg = `✓ ${validRows.length} registros importados para ${selectedPivotIds.length} pivô(s).` +
        (skippedRows > 0 ? ` ${skippedRows} linha(s) ignorada(s).` : '')
      setError(msg)

      try { await onImported() } catch { /* não bloqueia o modal */ }
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Erro durante importação.')
    } finally {
      abortRef.current = null
      setImporting(false)
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
    setImporting(false)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgb(0 0 0 / 0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700 }}>Importar Google Sheets</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#778899', padding: 8, minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: '#8899aa' }}>
          A planilha deve ser pública (Arquivo → Compartilhar → Qualquer pessoa com o link).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#8899aa' }}>URL da Planilha</label>
          <input
            type="text"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={url}
            onChange={e => handleUrlChange(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#8899aa' }}>Aba</label>
            {loadingTabs && <span style={{ fontSize: 11, color: '#778899' }}>detectando abas…</span>}
            {tabs.length > 0 && <span style={{ fontSize: 11, color: '#0093D0' }}>{tabs.length} aba{tabs.length > 1 ? 's' : ''}</span>}
          </div>
          {tabs.length > 0 ? (
            <select value={gid} onChange={e => { setGid(e.target.value); setPreview(null); setHeaders([]) }}
              style={{ padding: '9px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
              {tabs.map(t => <option key={t.gid} value={t.gid}>{t.name}</option>)}
            </select>
          ) : (
            <input type="number" placeholder="0" value={gid} onChange={e => setGid(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none' }} />
          )}
          <p style={{ fontSize: 11, color: '#778899', margin: '2px 0 0' }}>
            Número GID da aba — visível na URL da planilha após <code style={{ color: '#8899aa' }}>#gid=</code>. Para a 1ª aba use 0.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#8899aa' }}>Importar para os pivôs</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allPivots.map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#e2e8f0' }}>
                <input type="checkbox" checked={selectedPivotIds.includes(p.id)}
                  onChange={e => setSelectedPivotIds(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                  style={{ accentColor: '#0093D0', width: 14, height: 14 }} />
                {p.farm_name} · {p.name}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#8899aa' }}>Coluna da Data</label>
            <select value={dateCol} onChange={e => setDateCol(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none' }}>
              {headers.length > 0
                ? headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i}`}</option>)
                : [0,1,2,3,4].map(i => <option key={i} value={i}>Coluna {i}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#8899aa' }}>Coluna de mm</label>
            <select value={mmCol} onChange={e => setMmCol(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none' }}>
              {headers.length > 0
                ? headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i}`}</option>)
                : [0,1,2,3,4].map(i => <option key={i} value={i}>Coluna {i}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: 'rgb(239 68 68 / 0.08)', borderRadius: 8 }}>
            {error}
          </p>
        )}

        <button onClick={handleFetch} disabled={loading || !url}
          style={{ padding: '10px', borderRadius: 8, cursor: 'pointer', background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontWeight: 600, fontSize: 13, opacity: loading || !url ? 0.5 : 1, minHeight: 44 }}>
          {loading ? 'Buscando…' : 'Pré-visualizar'}
        </button>

        {preview && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} style={{ padding: '6px 10px', background: '#0d1520', color: '#8899aa', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {h || `Col ${i}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: '5px 10px', color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importing && (
              <div>
                <div style={{ height: 6, borderRadius: 3, background: '#0d1520', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#003d5c,#3b82f6)', borderRadius: 3, transition: 'width 0.2s' }} />
                </div>
                <p style={{ fontSize: 11, color: '#778899', marginTop: 4 }}>{progress}%</p>
              </div>
            )}

            <button onClick={handleImport} disabled={importing}
              style={{ padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0093D0', color: '#fff', fontWeight: 600, fontSize: 13, opacity: importing ? 0.7 : 1, minHeight: 44 }}>
              {importing ? `Importando… ${progress}%` : `Importar registros`}
            </button>
            {importing && (
              <button type="button" onClick={handleCancel}
                style={{ padding: '10px 0', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgb(239 68 68 / 0.3)', color: '#ef4444', fontWeight: 600, fontSize: 13 }}>
                Cancelar
              </button>
            )}
          </>
        )}

        <p style={{ fontSize: 11, color: '#778899' }}>
          Formatos de data aceitos: YYYY-MM-DD · DD/MM/YYYY · DD/MM/YY
        </p>
      </div>
    </div>
  )
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

interface CalendarProps {
  year: number
  month: number
  records: RainfallRecord[]
  selectedDate: string
  onSelectDate: (date: string) => void
}

function MonthCalendar({ year, month, records, selectedDate, onSelectDate }: CalendarProps) {
  const today = toYMD(new Date())

  const recordMap = useMemo(() => buildRainfallMap(records), [records])

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevDays = new Date(year, month, 0).getDate()
    const result: { date: string; day: number; inMonth: boolean }[] = []
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevDays - i
      const mo = month === 0 ? 12 : month
      const y2 = month === 0 ? year - 1 : year
      result.push({ date: `${y2}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, day: d, inMonth: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ date: `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, day: d, inMonth: true })
    }
    const rem = 7 - (result.length % 7)
    if (rem < 7) {
      const nextMo = month === 11 ? 1 : month + 2
      const nextY  = month === 11 ? year + 1 : year
      for (let d = 1; d <= rem; d++) {
        result.push({ date: `${nextY}-${String(nextMo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, day: d, inMonth: false })
      }
    }
    return result
  }, [year, month])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#778899', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map(cell => {
          const mm = recordMap[cell.date] ?? 0
          const col = rainfallColor(mm)
          const isToday = cell.date === today
          const isSelected = cell.date === selectedDate

          return (
            <div
              key={cell.date}
              onClick={() => cell.inMonth && onSelectDate(cell.date)}
              style={{
                minHeight: 64, borderRadius: 8, padding: '6px 8px',
                background: isSelected ? 'rgb(0 147 208 / 0.10)' : col.bg,
                border: `1px solid ${isToday ? '#0093D0' : isSelected ? 'rgb(0 147 208 / 0.35)' : 'rgba(255,255,255,0.06)'}`,
                cursor: cell.inMonth ? 'pointer' : 'default',
                opacity: cell.inMonth ? 1 : 0.25,
                display: 'flex', flexDirection: 'column', gap: 2,
                transition: 'background 0.1s', position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: isToday ? 700 : 500, color: isToday ? '#0093D0' : '#8899aa' }}>
                  {cell.day}
                </span>
                {mm > 0 && <CloudRain size={10} color={col.text} />}
              </div>

              {mm > 0 && (
                <div style={{ textAlign: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: col.text, lineHeight: 1 }}>
                    {mm % 1 === 0 ? mm : mm.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 9, color: col.text, marginLeft: 2 }}>mm</span>
                </div>
              )}

              {mm >= 30 && (
                <div style={{ fontSize: 9, padding: '1px 5px', borderRadius: 10, background: 'rgb(29 78 216 / 0.2)', color: '#3b82f6', alignSelf: 'center', fontWeight: 600 }}>
                  forte
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Annual History Matrix ─────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

interface HistoryMatrixProps {
  records: RainfallRecord[]
  loading: boolean
  pivotName: string
}

function RainfallHistoryMatrix({ records, loading, pivotName }: HistoryMatrixProps) {
  // Build year×month matrix from records (sector_id = null only → general)
  const { years, matrix, avgByMonth, maxAvg, yearTotals } = useMemo(() => {
    const general = records.filter(r => r.sector_id === null)
    // Group by year then month
    const byYearMonth: Record<number, Record<number, number>> = {}
    for (const r of general) {
      const [y, m] = r.date.split('-').map(Number)
      if (!byYearMonth[y]) byYearMonth[y] = {}
      byYearMonth[y][m - 1] = (byYearMonth[y][m - 1] ?? 0) + r.rainfall_mm
    }
    const years = Object.keys(byYearMonth).map(Number).sort((a, b) => a - b)
    const matrix = years.map(y => ({
      year: y,
      months: Array.from({ length: 12 }, (_, m) => byYearMonth[y][m] ?? null) as (number | null)[],
    }))
    // Average per month across years that have data for that month
    const avgByMonth = Array.from({ length: 12 }, (_, m) => {
      const vals = years.map(y => byYearMonth[y][m]).filter((v): v is number => v != null)
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    })
    const maxAvg = Math.max(...avgByMonth, 1)
    const yearTotals = matrix.map(row => row.months.reduce<number>((s, v) => s + (v ?? 0), 0))
    return { years, matrix, avgByMonth, maxAvg, yearTotals }
  }, [records])

  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)

  if (loading) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #0a1628 0%, #0d1e2e 100%)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200,
      }}>
        <span style={{ color: '#778899', fontSize: 13 }}>Carregando histórico…</span>
      </div>
    )
  }

  if (years.length === 0) return null

  // Color for a cell value
  function cellColor(v: number | null): { bg: string; text: string; border: string } {
    if (v === null) return { bg: 'transparent', text: '#667788', border: 'transparent' }
    if (v === 0) return { bg: 'rgba(255,255,255,0.02)', text: '#334155', border: 'rgba(255,255,255,0.04)' }
    if (v < 50) return { bg: 'rgba(6,182,212,0.08)', text: '#22d3ee', border: 'rgba(6,182,212,0.15)' }
    if (v < 100) return { bg: 'rgba(6,182,212,0.14)', text: '#06b6d4', border: 'rgba(6,182,212,0.25)' }
    if (v < 150) return { bg: 'rgba(59,130,246,0.14)', text: '#60a5fa', border: 'rgba(59,130,246,0.25)' }
    if (v < 200) return { bg: 'rgba(99,102,241,0.18)', text: '#a5b4fc', border: 'rgba(99,102,241,0.3)' }
    return { bg: 'rgba(168,85,247,0.18)', text: '#c084fc', border: 'rgba(168,85,247,0.3)' }
  }

  // Intensity 0-1 for bar
  function barIntensity(v: number) { return Math.min(1, v / maxAvg) }

  return (
    <div style={{
      background: 'linear-gradient(160deg, #070e1a 0%, #0b1622 60%, #060d18 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 20, padding: 28, display: 'flex', flexDirection: 'column', gap: 28,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Subtle glow top-right */}
      <div style={{
        position: 'absolute', top: -80, right: -80, width: 280, height: 280,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,147,208,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -60, left: -60, width: 200, height: 200,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(0,147,208,0.3), rgba(99,102,241,0.3))',
              border: '1px solid rgba(0,147,208,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M3 3v18h18" stroke="#0093D0" strokeWidth="2" strokeLinecap="round"/>
                <path d="M7 16l4-4 4 4 4-6" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', lineHeight: 1 }}>
                Histórico Anual
              </h2>
              <p style={{ fontSize: 11, color: '#778899', marginTop: 3 }}>{pivotName} · {years[0]}–{years[years.length - 1]}</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: '< 50 mm', color: '#22d3ee' },
            { label: '50–100', color: '#06b6d4' },
            { label: '100–150', color: '#60a5fa' },
            { label: '150–200', color: '#a5b4fc' },
            { label: '> 200', color: '#c084fc' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color, opacity: 0.85 }} />
              <span style={{ fontSize: 10, color: '#778899' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table + Chart — stacked vertically */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Table */}
        <div style={{ width: '100%', overflowX: 'auto', overflowY: 'visible' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: '3px', minWidth: 420, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ano</th>
                {MONTH_SHORT.map((m, mi) => (
                  <th key={m} style={{
                    padding: '4px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: hoveredMonth === mi ? '#f472b6' : '#778899',
                    transition: 'color 0.15s', textAlign: 'center', cursor: 'default',
                  }}>
                    {m}
                  </th>
                ))}
                <th style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#334155', textAlign: 'right', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, ri) => (
                <tr key={row.year}>
                  <td style={{ padding: '2px 8px', fontSize: 12, fontWeight: 700, color: '#8899aa', whiteSpace: 'nowrap' }}>
                    {row.year}
                  </td>
                  {row.months.map((v, mi) => {
                    const c = cellColor(v)
                    return (
                      <td
                        key={mi}
                        onMouseEnter={() => setHoveredMonth(mi)}
                        onMouseLeave={() => setHoveredMonth(null)}
                        style={{ padding: '2px 3px', cursor: 'default' }}
                      >
                        <div style={{
                          borderRadius: 6, padding: '4px 3px',
                          background: hoveredMonth === mi && v !== null && v > 0
                            ? 'rgba(236,72,153,0.15)'
                            : hoveredMonth === mi && v !== null
                            ? 'rgba(255,255,255,0.04)'
                            : c.bg,
                          border: `1px solid ${hoveredMonth === mi && v !== null && v > 0 ? 'rgba(236,72,153,0.35)' : c.border}`,
                          textAlign: 'center', transition: 'all 0.15s', minWidth: 30,
                        }}>
                          <span style={{
                            fontSize: 10, fontWeight: hoveredMonth === mi && v !== null && v > 0 ? 700 : 600,
                            color: hoveredMonth === mi && v !== null && v > 0 ? '#f472b6' : v === null ? '#1a2535' : c.text,
                            fontVariantNumeric: 'tabular-nums',
                            transition: 'color 0.15s',
                          }}>
                            {v === null ? '—' : v === 0 ? '·' : v < 10 ? v.toFixed(1) : Math.round(v)}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ padding: '2px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: yearTotals[ri] > 0 ? '#e2e8f0' : '#334155', fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(yearTotals[ri])}
                    </span>
                    <span style={{ fontSize: 9, color: '#778899', marginLeft: 2 }}>mm</span>
                  </td>
                </tr>
              ))}

              {/* Average row */}
              <tr>
                <td style={{ padding: '5px 8px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    Média
                  </div>
                </td>
                {avgByMonth.map((avg, mi) => {
                  const c = cellColor(avg)
                  return (
                    <td
                      key={mi}
                      onMouseEnter={() => setHoveredMonth(mi)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      style={{ padding: '2px 3px' }}
                    >
                      <div style={{
                        borderRadius: 6, padding: '4px 3px',
                        background: hoveredMonth === mi && avg > 0 ? 'rgba(236,72,153,0.15)' : avg > 0 ? c.bg : 'transparent',
                        border: hoveredMonth === mi && avg > 0 ? '1px solid rgba(236,72,153,0.35)' : avg > 0 ? `1px solid rgba(245,158,11,0.2)` : '1px solid transparent',
                        textAlign: 'center', transition: 'all 0.15s',
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: hoveredMonth === mi && avg > 0 ? '#f472b6' : avg > 0 ? '#f59e0b' : '#334155', fontVariantNumeric: 'tabular-nums', transition: 'color 0.15s' }}>
                          {avg > 0 ? Math.round(avg) : '—'}
                        </span>
                      </div>
                    </td>
                  )
                })}
                <td style={{ padding: '2px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(avgByMonth.reduce((a, b) => a + b, 0))}
                  </span>
                  <span style={{ fontSize: 9, color: '#778899', marginLeft: 2 }}>mm/ano</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bar chart */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Média mensal</p>
            <p style={{ fontSize: 10, color: '#778899', marginTop: 2 }}>
              {years.length} ano{years.length !== 1 ? 's' : ''} de dados
            </p>
          </div>

          {/* Chart */}
          <div style={{ position: 'relative', width: '100%' }}>
            {/* Y-axis grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(frac => {
              const val = Math.round(maxAvg * frac)
              return (
                <div key={frac} style={{
                  position: 'absolute', left: 32, right: 0,
                  top: `${(1 - frac) * 100}%`, height: 1,
                  background: frac === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                }}>
                  <span style={{
                    position: 'absolute', left: -30, fontSize: 9, color: '#778899',
                    fontVariantNumeric: 'tabular-nums', fontWeight: 600, minWidth: 26, textAlign: 'right',
                  }}>
                    {val}
                  </span>
                </div>
              )
            })}

            {/* Bars */}
            <div style={{
              height: 180, display: 'flex', alignItems: 'flex-end', gap: 6,
              paddingLeft: 32, paddingRight: 8, position: 'relative',
            }}>
              {avgByMonth.map((avg, mi) => {
                const intensity = barIntensity(avg)
                const isHov = hoveredMonth === mi
                const barH = Math.max(intensity * 160, avg > 0 ? 4 : 0)

                return (
                  <div
                    key={mi}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default', position: 'relative' }}
                    onMouseEnter={() => setHoveredMonth(mi)}
                    onMouseLeave={() => setHoveredMonth(null)}
                  >
                    {/* Tooltip */}
                    {isHov && avg > 0 && (
                      <div style={{
                        position: 'absolute', bottom: barH + 10, left: '50%', transform: 'translateX(-50%)',
                        background: '#0a1628', border: '1px solid rgba(0,147,208,0.3)', borderRadius: 8,
                        padding: '5px 8px', zIndex: 10, whiteSpace: 'nowrap',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#f472b6', fontVariantNumeric: 'tabular-nums' }}>
                          {avg.toFixed(1)} mm
                        </span>
                      </div>
                    )}

                    {/* Value label */}
                    {avg > 0 && (
                      <div style={{
                        position: 'absolute', bottom: barH + 3,
                        fontSize: 8, fontWeight: 700,
                        color: isHov ? '#f472b6' : '#8899aa',
                        fontVariantNumeric: 'tabular-nums',
                        transition: 'color 0.15s', pointerEvents: 'none',
                      }}>
                        {Math.round(avg)}
                      </div>
                    )}

                    {/* Bar */}
                    <div style={{
                      width: '100%', height: barH,
                      borderRadius: '4px 4px 2px 2px',
                      background: isHov
                        ? 'linear-gradient(180deg, #f472b6 0%, #ec4899 50%, #db2777 100%)'
                        : `linear-gradient(180deg, rgba(6,182,212,${0.4 + intensity * 0.5}) 0%, rgba(0,147,208,${0.3 + intensity * 0.5}) 50%, rgba(99,102,241,${0.3 + intensity * 0.4}) 100%)`,
                      boxShadow: isHov ? '0 0 14px rgba(236,72,153,0.5), 0 0 28px rgba(236,72,153,0.2)' : `0 0 ${intensity * 6}px rgba(6,182,212,${intensity * 0.2})`,
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      position: 'relative', overflow: 'hidden',
                    }}>
                      {isHov && (
                        <div style={{
                          position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%',
                          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                          transform: 'skewX(-20deg)',
                        }} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* X-axis labels */}
            <div style={{ display: 'flex', gap: 6, paddingLeft: 32, paddingRight: 8, paddingTop: 5 }}>
              {MONTH_SHORT.map((m, mi) => (
                <div key={m} style={{ flex: 1, textAlign: 'center' }}>
                  <span style={{
                    fontSize: 8, fontWeight: 600,
                    color: hoveredMonth === mi ? '#f472b6' : '#8899aa',
                    transition: 'color 0.15s',
                  }}>
                    {m}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PrecipitacoesPage() {
  const { company, loading: authLoading } = useAuth()
  const today = useMemo(() => new Date(), [])

  const [pivots, setPivots] = useState<PivotOption[]>([])
  const [pivotId, setPivotId] = useState<string>('')
  const [sectors, setSectors] = useState<PivotSector[]>([])
  const [activeSectorId, setActiveSectorId] = useState<string | null>(null)
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [allRecords, setAllRecords] = useState<RainfallRecord[]>([])
  
  // -- Compare Mode --
  const [isCompare, setIsCompare] = useState(false)
  const [comparePivotId, setComparePivotId] = useState<string>('')
  const [compareSectors, setCompareSectors] = useState<PivotSector[]>([])
  const [compareActiveSectorId, setCompareActiveSectorId] = useState<string | null>(null)
  const [compareYear, setCompareYear]   = useState(today.getFullYear())
  const [compareMonth, setCompareMonth] = useState(today.getMonth())
  const [compareAllRecords, setCompareAllRecords] = useState<RainfallRecord[]>([])
  
  const [allTimeRecords, setAllTimeRecords] = useState<RainfallRecord[]>([])
  const [loadingAllTime, setLoadingAllTime] = useState(false)

  const [selectedDate, setSelectedDate] = useState(() => toYMD(today))
  const [editModal, setEditModal] = useState<{ date: string } | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [loadingPivots, setLoadingPivots] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')

  // Load pivots
  useEffect(() => {
    if (authLoading) return

    if (!company?.id) {
      setPivots([])
      setPivotId('')
      setAllRecords([])
      setEditModal(null)
      setShowImport(false)
      setLoadingPivots(false)
      setLoadError('Nenhuma empresa ativa encontrada.')
      return
    }

    let cancelled = false

    const loadPivots = async () => {
      try {
        setLoadingPivots(true)
        setLoadError('')
        const farms = await listFarmsByCompany(company.id)
        const pivotRows = await listPivotsByFarmIds(farms.map(f => f.id))
        const farmMap = new Map(farms.map(f => [f.id, f.name]))
        const options: PivotOption[] = pivotRows.map(p => ({
          id: p.id, name: p.name,
          farm_name: p.farms?.name ?? farmMap.get(p.farm_id) ?? '',
        }))

        if (cancelled) return
        setPivots(options)
        setPivotId(current => {
          if (current && options.some(p => p.id === current)) return current
          return options[0]?.id ?? ''
        })
        setComparePivotId(current => {
          if (current && options.some(p => p.id === current)) return current
          return options[0]?.id ?? ''
        })
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Falha ao carregar pivôs')
          setPivots([])
          setPivotId('')
        }
      } finally {
        if (!cancelled) setLoadingPivots(false)
      }
    }

    loadPivots()
    return () => { cancelled = true }
  }, [authLoading, company?.id])

  // Load sectors when pivot changes
  useEffect(() => {
    if (!pivotId) { setSectors([]); setActiveSectorId(null); return }
    let cancelled = false
    listSectorsByPivotId(pivotId).then(data => { if (!cancelled) setSectors(data) }).catch(() => { if (!cancelled) setSectors([]) })
    return () => { cancelled = true }
  }, [pivotId])

  useEffect(() => { setActiveSectorId(null) }, [pivotId])

  // Compare sectors
  useEffect(() => {
    if (!comparePivotId) { setCompareSectors([]); setCompareActiveSectorId(null); return }
    let cancelled = false
    listSectorsByPivotId(comparePivotId).then(data => { if (!cancelled) setCompareSectors(data) }).catch(() => { if (!cancelled) setCompareSectors([]) })
    return () => { cancelled = true }
  }, [comparePivotId])

  useEffect(() => { setCompareActiveSectorId(null) }, [comparePivotId])

  // Load all records for pivot+year (all sectors at once for comparison chart)
  const loadRecords = useCallback(async (pid: string, y: number) => {
    if (!pid) { setAllRecords([]); return }
    try {
      setLoadingRecords(true)
      setLoadError('')
      setActionError('')
      // Busca apenas o ano visível — ~50-100 registros por ano, escala para qualquer volume
      const data = await listRainfallByPivotIds([pid], undefined, `${y}-01-01`, `${y}-12-31`)
      setAllRecords(data)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao carregar precipitações')
      setAllRecords([])
    } finally {
      setLoadingRecords(false)
    }
  }, [])

  useEffect(() => {
    if (pivotId) {
      loadRecords(pivotId, year)
    } else {
      setAllRecords([])
      setEditModal(null)
      setShowImport(false)
    }
  }, [pivotId, year, loadRecords])

  // Load ALL historical records for history matrix (once per pivot, no year filter)
  useEffect(() => {
    if (!pivotId) { setAllTimeRecords([]); return }
    let cancelled = false
    setLoadingAllTime(true)
    listRainfallByPivotIds([pivotId])
      .then(data => { if (!cancelled) setAllTimeRecords(data) })
      .catch(() => { if (!cancelled) setAllTimeRecords([]) })
      .finally(() => { if (!cancelled) setLoadingAllTime(false) })
    return () => { cancelled = true }
  }, [pivotId])

  // Load Compare Records
  useEffect(() => {
    if (isCompare && comparePivotId) {
      listRainfallByPivotIds([comparePivotId], undefined, `${compareYear}-01-01`, `${compareYear}-12-31`)
        .then(data => setCompareAllRecords(data))
        .catch(() => setCompareAllRecords([]))
    } else {
      setCompareAllRecords([])
    }
  }, [isCompare, comparePivotId, compareYear])

  // Records filtered by active sector (for calendar + chips)
  const records = useMemo(() => {
    if (activeSectorId === null) return allRecords.filter(r => r.sector_id === null)
    return allRecords.filter(r => r.sector_id === activeSectorId)
  }, [allRecords, activeSectorId])

  const monthRecords = useMemo(
    () => records.filter(r => r.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)),
    [records, year, month]
  )

  const compareRecords = useMemo(() => {
    if (compareActiveSectorId === null) return compareAllRecords.filter(r => r.sector_id === null)
    return compareAllRecords.filter(r => r.sector_id === compareActiveSectorId)
  }, [compareAllRecords, compareActiveSectorId])

  const compareMonthRecords = useMemo(
    () => compareRecords.filter(r => r.date.startsWith(`${compareYear}-${String(compareMonth + 1).padStart(2, '0')}`)),
    [compareRecords, compareYear, compareMonth]
  )

  const editingRecord = useMemo(() => {
    if (!editModal) return null
    return records.find(r => r.date === editModal.date) ?? null
  }, [editModal, records])

  const activeSector = useMemo(() => sectors.find(s => s.id === activeSectorId) ?? null, [sectors, activeSectorId])

  async function reloadAllTime(pid: string) {
    try {
      const data = await listRainfallByPivotIds([pid])
      setAllTimeRecords(data)
    } catch { /* silently ignore */ }
  }

  async function handleSaved() {
    if (!pivotId) return
    try {
      await Promise.all([loadRecords(pivotId, year), reloadAllTime(pivotId)])
      setEditModal(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao recarregar precipitações')
    }
  }

  async function handleDeleted() {
    if (!pivotId) return
    try {
      await Promise.all([loadRecords(pivotId, year), reloadAllTime(pivotId)])
      setEditModal(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao recarregar precipitações')
    }
  }

  async function handleImported() {
    if (!pivotId) return
    try {
      await Promise.all([loadRecords(pivotId, year), reloadAllTime(pivotId)])
      setShowImport(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao recarregar precipitações')
    }
  }

  function prevMonth() {
    const newMonth = month === 0 ? 11 : month - 1
    const newYear  = month === 0 ? year - 1 : year
    setMonth(newMonth)
    setYear(newYear)
    // Mantém o dia do mês se existir, senão vai para dia 1
    const selDay = new Date(selectedDate + 'T00:00:00').getDate()
    const daysInNew = new Date(newYear, newMonth + 1, 0).getDate()
    const clampedDay = Math.min(selDay, daysInNew)
    setSelectedDate(`${newYear}-${String(newMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`)
  }
  function nextMonth() {
    const newMonth = month === 11 ? 0 : month + 1
    const newYear  = month === 11 ? year + 1 : year
    setMonth(newMonth)
    setYear(newYear)
    const selDay = new Date(selectedDate + 'T00:00:00').getDate()
    const daysInNew = new Date(newYear, newMonth + 1, 0).getDate()
    const clampedDay = Math.min(selDay, daysInNew)
    setSelectedDate(`${newYear}-${String(newMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`)
  }
  function goToday() {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
    setSelectedDate(toYMD(t))
  }

  const selectedPivot = pivots.find(p => p.id === pivotId)

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0c4a6e, #0284c7)',
            boxShadow: '0 2px 8px rgb(2 132 199 / 0.3)',
          }}>
            <CloudRain size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>Precipitações</h1>
            {selectedPivot && (
              <p style={{ fontSize: 12, color: '#778899' }}>{selectedPivot.farm_name} · {selectedPivot.name}</p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/manejo" style={{ textDecoration: 'none' }}>
            <button
              disabled={loadingPivots}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 8, border: '1px solid rgb(245 158 11 / 0.25)', cursor: 'pointer',
                background: 'rgb(245 158 11 / 0.10)', color: '#f59e0b', fontSize: 12, fontWeight: 700,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgb(245 158 11 / 0.20)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgb(245 158 11 / 0.10)'}
            >
              MANEJO DIÁRIO
            </button>
          </Link>

          <select
            value={pivotId}
            onChange={e => setPivotId(e.target.value)}
            disabled={loadingPivots || pivots.length === 0}
            style={{
              padding: '8px 12px', borderRadius: 8,
              background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)',
              color: '#e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer',
            }}
          >
            {pivots.map(p => <option key={p.id} value={p.id}>{p.farm_name} · {p.name}</option>)}
          </select>

          <button
            onClick={() => setIsCompare(!isCompare)}
            disabled={!pivotId}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: isCompare ? 'rgba(0,147,208,0.1)' : '#0d1520', border: isCompare ? '1px solid rgba(0,147,208,0.3)' : '1px solid rgba(255,255,255,0.06)',
              color: isCompare ? '#0093D0' : '#8899aa', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            }}
          >
            Comparar
          </button>
          <button
            onClick={() => setShowImport(true)}
            disabled={!pivotId}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)',
              color: '#8899aa', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            }}
          >
            <Upload size={14} />
            Importar
          </button>
        </div>
      </div>

      {loadError && (
        <div style={{ padding: '14px 16px', background: 'rgb(239 68 68 / 0.08)', border: '1px solid rgb(239 68 68 / 0.2)', borderRadius: 12, color: '#fca5a5', fontSize: 13 }}>
          {loadError}
        </div>
      )}

      {actionError && (
        <div style={{ padding: '14px 16px', background: 'rgb(245 158 11 / 0.08)', border: '1px solid rgb(245 158 11 / 0.2)', borderRadius: 12, color: '#fcd34d', fontSize: 13 }}>
          {actionError}
        </div>
      )}

      {!loadingPivots && pivots.length === 0 && (
        <div style={{ padding: '40px 24px', textAlign: 'center', background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, color: '#778899', fontSize: 14 }}>
          <Calendar size={32} color="rgba(255,255,255,0.06)" style={{ margin: '0 auto 12px' }} />
          Nenhum pivô cadastrado. Cadastre um pivô para registrar precipitações.
        </div>
      )}

      {pivotId && (
        <div style={{ display: 'grid', gridTemplateColumns: isCompare ? 'repeat(auto-fit, minmax(420px, 1fr))' : '1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Sector panel: map + tabs */}
          {sectors.length > 0 && (
            <div style={{
              background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16,
              display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap',
            }}>
              <PivotCircleMap
                sectors={sectors}
                activeSectorId={activeSectorId}
                onSelectSector={setActiveSectorId}
              />
              <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#778899' }}>
                  Setor de Precipitação
                </p>
                <SectorTabs
                  sectors={sectors}
                  activeSectorId={activeSectorId}
                  onSelect={setActiveSectorId}
                />
                <p style={{ fontSize: 11, color: '#778899', marginTop: 4, lineHeight: 1.5 }}>
                  {activeSectorId === null
                    ? 'Mostrando precipitações gerais (sem setor específico). Clique num setor para filtrar.'
                    : `Setor ${activeSector?.name ?? ''} selecionado. Dados exclusivos deste setor.`}
                </p>
              </div>
            </div>
          )}

          {/* Chips */}
          <RainfallChips
            records={records}
            pivotId={pivotId}
            selectedDate={selectedDate}
            calYear={year}
            calMonth={month}
            sectorLabel={activeSector ? `Setor ${activeSector.name}` : undefined}
          />

          {/* Month navigation + calendar */}
          <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <button onClick={prevMonth}
                style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#8899aa' }}>
                <ChevronLeft size={16} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                  {MONTH_NAMES[month]} {year}
                </h2>
                {loadingRecords && <span style={{ fontSize: 11, color: '#778899' }}>carregando…</span>}
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={goToday}
                  style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#8899aa', fontSize: 12 }}>
                  Hoje
                </button>
                <button onClick={nextMonth}
                  style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#8899aa' }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <MonthCalendar
              year={year}
              month={month}
              records={monthRecords}
              selectedDate={selectedDate}
              onSelectDate={date => {
                setSelectedDate(date)
                setEditModal({ date })
              }}
            />
          </div>

          {/* Bar chart */}
          <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#8899aa' }}>
                Distribuição diária — {MONTH_NAMES[month]}
                {activeSector && <span style={{ color: '#778899' }}> · Setor {activeSector.name}</span>}
              </span>
              <div style={{ width: 10, height: 2, background: '#f59e0b', borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: '#778899' }}>média mensal</span>
            </div>
            <RainfallBarChart records={monthRecords} year={year} month={month} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#778899' }}>1</span>
              <span style={{ fontSize: 10, color: '#778899' }}>{new Date(year, month + 1, 0).getDate()}</span>
            </div>
          </div>

          {/* Sector comparison chart */}
          <SectorCompareChart
            allRecords={allRecords}
            sectors={sectors}
            year={year}
            month={month}
          />
        </div>

        {isCompare && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingLeft: isCompare ? 24 : 0, borderLeft: isCompare ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
             <div style={{ background: '#0d1520', border: '1px dashed rgba(0,147,208,0.3)', borderRadius: 12, padding: 16 }}>
               <span style={{ fontSize: 12, fontWeight: 600, color: '#0093D0', display: 'block', marginBottom: 12 }}>PARÂMETROS DE COMPARAÇÃO</span>
               <select
                 value={comparePivotId}
                 onChange={e => setComparePivotId(e.target.value)}
                 style={{
                   padding: '8px 12px', borderRadius: 8, width: '100%',
                   background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
                   color: '#e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer',
                 }}
               >
                 {pivots.map(p => <option key={p.id} value={p.id}>{p.farm_name} · {p.name}</option>)}
               </select>
             </div>

             {compareSectors.length > 0 && (
               <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                 <PivotCircleMap sectors={compareSectors} activeSectorId={compareActiveSectorId} onSelectSector={setCompareActiveSectorId} />
                 <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 10 }}>
                   <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#778899' }}>Setor de Precipitação</p>
                   <SectorTabs sectors={compareSectors} activeSectorId={compareActiveSectorId} onSelect={setCompareActiveSectorId} />
                 </div>
               </div>
             )}

             <RainfallChips
               records={compareRecords}
               pivotId={comparePivotId}
               selectedDate={selectedDate}
               calYear={compareYear}
               calMonth={compareMonth}
               sectorLabel={compareActiveSectorId ? `Setor ${compareSectors.find(s=>s.id === compareActiveSectorId)?.name}` : undefined}
             />

             <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 16px' }}>
               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                 <button onClick={() => { if(compareMonth===0){setCompareMonth(11);setCompareYear(y=>y-1)}else setCompareMonth(m=>m-1) }} style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#8899aa' }}><ChevronLeft size={16} /></button>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                   <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{MONTH_NAMES[compareMonth]} {compareYear}</h2>
                 </div>
                 <div style={{ display: 'flex', gap: 6 }}>
                   <button onClick={() => { const d=new Date(); setCompareYear(d.getFullYear()); setCompareMonth(d.getMonth()) }} style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#8899aa', fontSize: 12 }}>Hoje</button>
                   <button onClick={() => { if(compareMonth===11){setCompareMonth(0);setCompareYear(y=>y+1)}else setCompareMonth(m=>m+1) }} style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#8899aa' }}><ChevronRight size={16} /></button>
                 </div>
               </div>
               <MonthCalendar year={compareYear} month={compareMonth} records={compareMonthRecords} selectedDate={selectedDate} onSelectDate={(d) => { /* readonly */ }} />
             </div>

             <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                 <span style={{ fontSize: 12, fontWeight: 600, color: '#8899aa' }}>Distribuição diária</span>
               </div>
               <RainfallBarChart records={compareMonthRecords} year={compareYear} month={compareMonth} />
             </div>
             
             <SectorCompareChart allRecords={compareAllRecords} sectors={compareSectors} year={compareYear} month={compareMonth} />
             
          </div>
        )}
        </div>
      )}

      {editModal && pivotId && pivots.some(p => p.id === pivotId) && (
        <EditModal
          date={editModal.date}
          pivotId={pivotId}
          sectorId={activeSectorId}
          sectorName={activeSector?.name ?? null}
          existing={editingRecord}
          allPivots={pivots}
          onClose={() => setEditModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {showImport && pivotId && pivots.some(p => p.id === pivotId) && (
        <ImportModal
          pivotId={pivotId}
          allPivots={pivots}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}

      {/* Annual history matrix — always visible when pivot is selected */}
      {pivotId && (
        <RainfallHistoryMatrix
          records={allTimeRecords}
          loading={loadingAllTime}
          pivotName={selectedPivot?.name ?? ''}
        />
      )}
    </div>
  )
}

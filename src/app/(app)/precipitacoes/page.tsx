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
  selectedDate,
  sectorLabel,
}: {
  records: RainfallRecord[]
  selectedDate: string
  sectorLabel?: string
}) {
  const chips = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of records) map[r.date] = (map[r.date] ?? 0) + r.rainfall_mm

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
    const prefix = selectedDate.slice(0, 7)
    const month = Object.entries(map).reduce((s, [k, v]) => k.startsWith(prefix) ? s + v : s, 0)
    const yearPrefix = selectedDate.slice(0, 4)
    const year = Object.entries(map).reduce((s, [k, v]) => k.startsWith(yearPrefix) ? s + v : s, 0)

    return [
      { label: 'Dia',  value: day },
      { label: 'Semana', value: week },
      { label: 'Mês',  value: month },
      { label: 'Ano',  value: year },
    ]
  }, [records, selectedDate])

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {sectorLabel && (
        <span style={{ fontSize: 11, color: '#556677', marginRight: 4 }}>{sectorLabel}</span>
      )}
      {chips.map(c => (
        <div
          key={c.label}
          style={{
            padding: '6px 14px', borderRadius: 20,
            background: c.value > 0 ? 'rgb(6 182 212 / 0.1)' : '#0d1520',
            border: `1px solid ${c.value > 0 ? 'rgb(6 182 212 / 0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: c.value > 0 ? '#06b6d4' : '#556677',
            fontSize: 12, fontWeight: 600,
          }}
        >
          {c.label}: {c.value.toFixed(1)} mm
        </div>
      ))}
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
      const total = allRecords
        .filter(r => r.date.startsWith(prefix) && r.sector_id === g.id)
        .reduce((s, r) => s + r.rainfall_mm, 0)
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
    const map: Record<string, number> = {}
    for (const r of records) {
      const d = new Date(r.date + 'T00:00:00')
      if (d.getFullYear() === year && d.getMonth() === month) {
        map[d.getDate()] = (map[d.getDate()] ?? 0) + r.rainfall_mm
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
            tick={{ fill: '#556677', fontSize: 10 }} 
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} 
            tickLine={false} 
            interval={0}
            tickFormatter={(v, i) => i === 0 || i === data.length - 1 || (i + 1) % 5 === 0 ? v : ''}
          />
          <YAxis 
            tick={{ fill: '#556677', fontSize: 10 }} 
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
  onClose: () => void
  onSaved: () => Promise<void>
  onDeleted: () => Promise<void>
}

// Dispara recalculate do daily_management para o pivô+data alterados (silencioso)
async function syncManagementForPivotDate(pivotId: string, date: string) {
  try {
    // Busca a safra ativa vinculada ao pivô
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
    if (!season?.id) return
    // Dispara recalculate só para aquele dia (não aguarda — fire and forget)
    fetch('/api/seasons/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season_id: season.id, date }),
    }).catch(() => {})
  } catch { /* silencioso — não bloqueia o usuário */ }
}

function EditModal({ date, pivotId, sectorId, sectorName, existing, onClose, onSaved, onDeleted }: EditModalProps) {
  const [value, setValue] = useState(existing ? String(existing.rainfall_mm) : '0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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

      await upsertRainfallRecord({
        pivot_id: pivotId,
        date,
        rainfall_mm: mm,
        source: 'manual',
        sector_id: sectorId,
        updated_at: new Date().toISOString(),
      })
      syncManagementForPivotDate(pivotId, date)
      await onSaved()
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
      syncManagementForPivotDate(pivotId, date)
      await onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir precipitação')
    } finally {
      setSaving(false)
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
        width: 320, background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#556677', padding: 4 }}>
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
                <span style={{ color: '#556677', marginLeft: 4 }}>— editar muda para Manual</span>
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

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#0093D0', color: '#fff', fontWeight: 600, fontSize: 13,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Salvando…' : 'Salvar'}
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
              color: '#556677', cursor: 'pointer', fontSize: 13,
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

  function extractSpreadsheetId(raw: string): string | null {
    const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return m ? m[1] : null
  }

  function extractGidFromUrl(raw: string): string | null {
    const m = raw.match(/[#&?]gid=(\d+)/)
    return m ? m[1] : null
  }

  async function fetchTabs(sid: string) {
    setLoadingTabs(true)
    setTabs([])
    try {
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${sid}/edit`)
      if (!res.ok) { setLoadingTabs(false); return }
      const html = await res.text()
      const matches = [...html.matchAll(/"name":"([^"]+)","index":\d+,"sheetId":(\d+)/g)]
      if (matches.length > 0) {
        const found: SheetTab[] = matches.map(m => ({ name: m[1], gid: m[2] }))
        setTabs(found)
        setGid(found[0].gid)
      }
    } catch {
      // silently ignore
    }
    setLoadingTabs(false)
  }

  function handleUrlChange(raw: string) {
    setUrl(raw)
    setPreview(null)
    setHeaders([])
    setTabs([])
    const sid = extractSpreadsheetId(raw)
    if (!sid) return
    const gidFromUrl = extractGidFromUrl(raw)
    if (gidFromUrl) setGid(gidFromUrl)
    fetchTabs(sid)
  }

  async function handleFetch() {
    setError('')
    const sid = extractSpreadsheetId(url)
    if (!sid) { setError('URL inválida. Cole a URL completa do Google Sheets.'); return }
    setLoading(true)
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sid}/export?format=csv&gid=${gid}`
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
    const sid = extractSpreadsheetId(url)
    if (!sid) return
    setImporting(true)
    setProgress(0)
    setError('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sid}/export?format=csv&gid=${gid}`
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

      const parsed = validRows.flatMap(r =>
        selectedPivotIds.map(pid => ({ pivot_id: pid, date: r.date, rainfall_mm: r.rainfall_mm, source: 'import' as const }))
      )

      const chunkSize = 50
      for (let i = 0; i < parsed.length; i += chunkSize) {
        if (controller.signal.aborted) throw new Error('Importação cancelada.')
        await upsertRainfallRecords(parsed.slice(i, i + chunkSize))
        setProgress(Math.round(((i + chunkSize) / parsed.length) * 100))
      }

      const msg = `${validRows.length} registros importados para ${selectedPivotIds.length} pivô(s).` +
        (skippedRows > 0 ? ` ${skippedRows} linha(s) ignorada(s).` : '')
      setError(msg)

      await onImported()
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#556677', padding: 4 }}>
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
            {loadingTabs && <span style={{ fontSize: 11, color: '#556677' }}>detectando abas…</span>}
            {tabs.length > 0 && <span style={{ fontSize: 11, color: '#0093D0' }}>{tabs.length} aba{tabs.length > 1 ? 's' : ''}</span>}
          </div>
          {tabs.length > 0 ? (
            <select value={gid} onChange={e => { setGid(e.target.value); setPreview(null); setHeaders([]) }}
              style={{ padding: '9px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
              {tabs.map(t => <option key={t.gid} value={t.gid}>{t.name}</option>)}
            </select>
          ) : (
            <input type="text" placeholder="GID da aba (padrão: 0)" value={gid} onChange={e => setGid(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none' }} />
          )}
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

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#8899aa' }}>Coluna da Data</label>
            <select value={dateCol} onChange={e => setDateCol(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none' }}>
              {headers.length > 0
                ? headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i}`}</option>)
                : [0,1,2,3,4].map(i => <option key={i} value={i}>Coluna {i}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          style={{ padding: '10px', borderRadius: 8, cursor: 'pointer', background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontWeight: 600, fontSize: 13, opacity: loading || !url ? 0.5 : 1 }}>
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
                <p style={{ fontSize: 11, color: '#556677', marginTop: 4 }}>{progress}%</p>
              </div>
            )}

            <button onClick={handleImport} disabled={importing}
              style={{ padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0093D0', color: '#fff', fontWeight: 600, fontSize: 13, opacity: importing ? 0.7 : 1 }}>
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

        <p style={{ fontSize: 11, color: '#556677' }}>
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

  const recordMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of records) m[r.date] = (m[r.date] ?? 0) + r.rainfall_mm
    return m
  }, [records])

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
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#556677', padding: '4px 0' }}>{d}</div>
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
      const data = await listRainfallByPivotIds([pid])
      setAllRecords(
        data
          .filter(r => r.date >= `${y}-01-01` && r.date <= `${y}-12-31`)
          .sort((a, b) => a.date.localeCompare(b.date))
      )
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

  // Load Compare Records
  useEffect(() => {
    if (isCompare && comparePivotId) {
      listRainfallByPivotIds([comparePivotId])
        .then(data => {
          setCompareAllRecords(data
            .filter(r => r.date >= `${compareYear}-01-01` && r.date <= `${compareYear}-12-31`)
            .sort((a, b) => a.date.localeCompare(b.date)))
        }).catch(() => setCompareAllRecords([]))
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

  async function handleSaved() {
    if (!pivotId) return
    try {
      await loadRecords(pivotId, year)
      setEditModal(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao recarregar precipitações')
    }
  }

  async function handleDeleted() {
    if (!pivotId) return
    try {
      await loadRecords(pivotId, year)
      setEditModal(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao recarregar precipitações')
    }
  }

  async function handleImported() {
    if (!pivotId) return
    try {
      await loadRecords(pivotId, year)
      setShowImport(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao recarregar precipitações')
    }
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  function goToday() {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
    setSelectedDate(toYMD(t))
  }

  const selectedPivot = pivots.find(p => p.id === pivotId)

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

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
              <p style={{ fontSize: 12, color: '#556677' }}>{selectedPivot.farm_name} · {selectedPivot.name}</p>
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
        <div style={{ padding: '40px 24px', textAlign: 'center', background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, color: '#556677', fontSize: 14 }}>
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
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#556677' }}>
                  Setor de Precipitação
                </p>
                <SectorTabs
                  sectors={sectors}
                  activeSectorId={activeSectorId}
                  onSelect={setActiveSectorId}
                />
                <p style={{ fontSize: 11, color: '#556677', marginTop: 4, lineHeight: 1.5 }}>
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
            selectedDate={selectedDate}
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
                {loadingRecords && <span style={{ fontSize: 11, color: '#556677' }}>carregando…</span>}
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
                {activeSector && <span style={{ color: '#556677' }}> · Setor {activeSector.name}</span>}
              </span>
              <div style={{ width: 10, height: 2, background: '#f59e0b', borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: '#556677' }}>média mensal</span>
            </div>
            <RainfallBarChart records={monthRecords} year={year} month={month} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#556677' }}>1</span>
              <span style={{ fontSize: 10, color: '#556677' }}>{new Date(year, month + 1, 0).getDate()}</span>
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
                   <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#556677' }}>Setor de Precipitação</p>
                   <SectorTabs sectors={compareSectors} activeSectorId={compareActiveSectorId} onSelect={setCompareActiveSectorId} />
                 </div>
               </div>
             )}

             <RainfallChips
               records={compareRecords}
               selectedDate={selectedDate}
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
    </div>
  )
}

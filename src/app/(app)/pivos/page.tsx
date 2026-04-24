'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { Farm, OperationMode, Pivot, SpeedTableRow, WeatherSource } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'
import { listFarmsByCompany } from '@/services/farms'
import {
  createPivot,
  deletePivot,
  listPivotsByFarmIds,
  updatePivot,
  type PivotWithFarmName,
} from '@/services/pivots'
import { CircleDot, Plus, Pencil, Trash2, X, Loader2, ChevronDown, Table2, ChevronRight, MapPin, Satellite, Sheet, Hand, Radio, Link2, Layers } from 'lucide-react'
import { listSectorsByPivotId, createSector, updateSector, deleteSector } from '@/services/pivot-sectors'

const PivotMiniMapDynamic = dynamic(
  () => import('./PivotMiniMap').then(m => ({ default: m.PivotMiniMap })),
  {
    ssr: false,
    loading: () => (
      <div style={{
        height: 240, borderRadius: 10, background: '#0d1520',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: '#778899',
      }}>
        Carregando mapa…
      </div>
    ),
  }
)

// ─── Cálculos ────────────────────────────────────────────────
function calcArea(lengthM: number): number {
  return Math.PI * lengthM * lengthM / 10000 // ha
}

function calcDepth100(flowM3h: number, time360h: number, lengthM: number): number {
  // Lâmina bruta a 100% = (Vazão × Tempo360) / Área_m²  × 1000 para mm
  const areaM2 = Math.PI * lengthM * lengthM
  return (flowM3h * time360h * 1000) / areaM2
}

function buildSpeedTable(flowM3h: number, time360h: number, lengthM: number): SpeedTableRow[] {
  const depth100 = calcDepth100(flowM3h, time360h, lengthM)
  const rows: SpeedTableRow[] = []
  for (let speed = 100; speed >= 5; speed -= 5) {
    const duration_hours = time360h * (100 / speed)
    const water_depth_mm = depth100 * (100 / speed)
    rows.push({ speed_percent: speed, water_depth_mm: Math.round(water_depth_mm * 10) / 10, duration_hours: Math.round(duration_hours * 10) / 10 })
  }
  return rows
}

// ─── Componente tabela de velocidade ─────────────────────────
function SpeedTable({ rows }: { rows: SpeedTableRow[] }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Table2 size={13} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#778899' }}>
          Tabela de Velocidade
        </span>
      </div>
      <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#0d1520', padding: '8px 14px' }}>
          {['Velocidade', 'Lâmina (mm)', 'Duração (h)'].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#778899', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
        {rows.map((row, i) => (
          <div
            key={row.speed_percent}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              padding: '9px 14px',
              borderTop: '1px solid rgba(255,255,255,0.04)',
              background: i % 2 === 0 ? 'transparent' : '#080e14',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: row.speed_percent === 100 ? 700 : 400, color: row.speed_percent === 100 ? '#0093D0' : '#8899aa' }}>
              {row.speed_percent}%
            </span>
            <span style={{ fontSize: 13, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{row.water_depth_mm}</span>
            <span style={{ fontSize: 13, color: '#8899aa', fontFamily: 'var(--font-mono)' }}>{row.duration_hours}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Parser de coordenadas ────────────────────────────────────

/**
 * Aceita qualquer formato comum de coordenadas e retorna [lat, lng] decimais ou null.
 * Formatos suportados:
 *   22°53'03.2"S 50°21'38.5"W
 *   -22.879060, -50.362105
 *   -22.879060 -50.362105
 *   22.879060S, 50.362105W
 */
function parseCoords(raw: string): { lat: number; lng: number } | null {
  const s = raw.trim()

  // Formato DMS: graus°minutos'segundos"[NSEW] graus°minutos'segundos"[NSEW]
  const dmsRe = /(\d+)[°º](\d+)['''](\d+(?:[.,]\d+)?)["""]\s*([NSns])[,\s]+(\d+)[°º](\d+)['''](\d+(?:[.,]\d+)?)["""]\s*([EWew])/
  const dms = s.match(dmsRe)
  if (dms) {
    const lat = (parseInt(dms[1]) + parseInt(dms[2]) / 60 + parseFloat(dms[3].replace(',', '.')) / 3600) *
      (/[Ss]/.test(dms[4]) ? -1 : 1)
    const lng = (parseInt(dms[5]) + parseInt(dms[6]) / 60 + parseFloat(dms[7].replace(',', '.')) / 3600) *
      (/[Ww]/.test(dms[8]) ? -1 : 1)
    if (isFinite(lat) && isFinite(lng)) return { lat, lng }
  }

  // Formato decimal com letra: 22.879S, 50.362W  ou  22.879S 50.362W
  const decLetterRe = /(\d+(?:[.,]\d+)?)\s*([NSns])[,\s]+(\d+(?:[.,]\d+)?)\s*([EWew])/
  const decLetter = s.match(decLetterRe)
  if (decLetter) {
    const lat = parseFloat(decLetter[1].replace(',', '.')) * (/[Ss]/.test(decLetter[2]) ? -1 : 1)
    const lng = parseFloat(decLetter[3].replace(',', '.')) * (/[Ww]/.test(decLetter[4]) ? -1 : 1)
    if (isFinite(lat) && isFinite(lng)) return { lat, lng }
  }

  // Formato decimal puro: -22.879060, -50.362105  ou  -22.879060 -50.362105
  const decRe = /(-?\d+(?:[.,]\d+)?)[,\s]+(-?\d+(?:[.,]\d+)?)/
  const dec = s.match(decRe)
  if (dec) {
    const lat = parseFloat(dec[1].replace(',', '.'))
    const lng = parseFloat(dec[2].replace(',', '.'))
    if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
      return { lat, lng }
  }

  return null
}

// ─── Input helper ─────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, unit, hint, min, max }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; unit?: string; hint?: string; min?: number; max?: number
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          step="any"
          min={min}
          max={max}
          style={{
            width: '100%', padding: unit ? '10px 44px 10px 14px' : '10px 14px',
            borderRadius: 10, fontSize: 14, transition: 'all 0.2s',
            background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = '#00E5FF'; e.target.style.boxShadow = '0 0 0 3px rgba(0, 229, 255, 0.15)' }}
          onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = 'none' }}
        />
        {unit && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#778899', pointerEvents: 'none' }}>
            {unit}
          </span>
        )}
      </div>
      {hint && <p style={{ fontSize: 11, color: '#778899', marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────
interface PivotModalProps {
  pivot: Pivot | null
  farms: Farm[]
  allPivots: PivotWithFarmName[]
  onClose: () => void
  onSaved: () => Promise<void>
}

function PivotModal({ pivot, farms, allPivots, onClose, onSaved }: PivotModalProps) {
  const isEdit = !!pivot
  const [farmId, setFarmId] = useState(pivot?.farm_id ?? farms[0]?.id ?? '')
  const [name, setName] = useState(pivot?.name ?? '')
  const [lengthM, setLengthM] = useState(pivot?.length_m?.toString() ?? '')
  const [flowRate, setFlowRate] = useState(pivot?.flow_rate_m3h?.toString() ?? '')
  const [time360, setTime360] = useState(pivot?.time_360_h?.toString() ?? '')
  const [cuc, setCuc] = useState(pivot?.cuc_percent?.toString() ?? '')
  // Campo único para coordenadas — parse automático
  const [coordsRaw, setCoordsRaw] = useState<string>(() => {
    if (pivot?.latitude != null && pivot?.longitude != null)
      return `${pivot.latitude}, ${pivot.longitude}`
    return ''
  })
  const parsedCoords = useMemo(() => parseCoords(coordsRaw), [coordsRaw])
  const [alertThreshold, setAlertThreshold] = useState(pivot?.alert_threshold_percent?.toString() ?? '70')
  const [irrigationTarget, setIrrigationTarget] = useState(pivot?.irrigation_target_percent?.toString() ?? '80')
  const [weatherSource, setWeatherSource] = useState<WeatherSource>(pivot?.weather_source ?? 'nasa')
  const [spreadsheetId, setSpreadsheetId] = useState(pivot?.weather_config?.spreadsheet_id ?? '')
  const [sheetGid, setSheetGid] = useState(pivot?.weather_config?.gid ?? '')
  const [plugfieldDeviceId, setPlugfieldDeviceId] = useState(pivot?.weather_config?.plugfield_device_id?.toString() ?? '')
  const [plugfieldToken, setPlugfieldToken] = useState(pivot?.weather_config?.plugfield_token ?? '')
  const [plugfieldApiKey, setPlugfieldApiKey] = useState(pivot?.weather_config?.plugfield_api_key ?? '')
  const [operationMode, setOperationMode] = useState<OperationMode>(pivot?.operation_mode ?? 'individual')

  // Setores — estado local para novos pivôs; carregado do banco na edição
  interface PendingSector { id?: string; name: string; start: string; end: string }
  const [sectors, setSectors] = useState<PendingSector[]>([])
  const [sectorsLoaded, setSectorsLoaded] = useState(false)
  const [newSectorName, setNewSectorName] = useState('')
  const [newSectorStart, setNewSectorStart] = useState('')
  const [newSectorEnd, setNewSectorEnd] = useState('')
  const [sectorError, setSectorError] = useState('')
  const [deletingSectorId, setDeletingSectorId] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [savingEditIndex, setSavingEditIndex] = useState<number | null>(null)

  // Carrega setores existentes na edição
  useEffect(() => {
    if (!pivot?.id || sectorsLoaded) return
    let cancelled = false
    listSectorsByPivotId(pivot.id).then(data => {
      if (!cancelled) {
        setSectors(data.map(s => ({ id: s.id, name: s.name, start: s.angle_start?.toString() ?? '', end: s.angle_end?.toString() ?? '' })))
        setSectorsLoaded(true)
      }
    }).catch(() => { if (!cancelled) setSectorsLoaded(true) })
    return () => { cancelled = true }
  }, [pivot?.id, sectorsLoaded])
  const [pairedPivotId, setPairedPivotId] = useState(pivot?.paired_pivot_id ?? '')
  const [returnIntervalDays, setReturnIntervalDays] = useState(pivot?.return_interval_days?.toString() ?? '1')
  const [preferredSpeed, setPreferredSpeed] = useState(pivot?.preferred_speed_percent?.toString() ?? '')
  const [minSpeedPct, setMinSpeedPct] = useState(pivot?.min_speed_percent?.toString() ?? '')
  // Parâmetros de solo
  const [fieldCapacity, setFieldCapacity] = useState(pivot?.field_capacity?.toString() ?? '')
  const [wiltingPoint, setWiltingPoint]   = useState(pivot?.wilting_point?.toString() ?? '')
  const [bulkDensity, setBulkDensity]     = useState(pivot?.bulk_density?.toString() ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Stable callback so PivotMiniMap's useEffect doesn't re-run on every render (REGRA #3)
  const handleLocationChange = useCallback((lat: number, lng: number) => {
    setCoordsRaw(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
  }, [])

  // Preview da tabela ao vivo
  const previewTable = useMemo<SpeedTableRow[] | null>(() => {
    const f = parseFloat(flowRate)
    const t = parseFloat(time360)
    const l = parseFloat(lengthM)
    if (f > 0 && t > 0 && l > 0) return buildSpeedTable(f, t, l)
    return null
  }, [flowRate, time360, lengthM])

  const area = lengthM ? calcArea(parseFloat(lengthM)) : null
  const depth100 = (flowRate && time360 && lengthM)
    ? calcDepth100(parseFloat(flowRate), parseFloat(time360), parseFloat(lengthM))
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !farmId) {
      setError('Preencha os campos obrigatórios: fazenda e nome do pivô.')
      return
    }

    if (coordsRaw.trim() && !parsedCoords) {
      setError('As coordenadas informadas estao em formato invalido.')
      return
    }

    if (cuc) {
      const cucNum = Number(cuc)
      if (isNaN(cucNum) || cucNum < 0 || cucNum > 100) {
        setError('CUC deve ser entre 0 e 100%.')
        return
      }
    }

    setError('')
    setLoading(true)

    const payload = {
      name: name.trim(),
      farm_id: farmId,
      length_m: lengthM ? Number(lengthM) : null,
      flow_rate_m3h: flowRate ? Number(flowRate) : null,
      time_360_h: time360 ? Number(time360) : null,
      cuc_percent: cuc ? Number(cuc) : null,
      latitude: parsedCoords?.lat ?? null,
      longitude: parsedCoords?.lng ?? null,
      alert_threshold_percent: alertThreshold ? Number(alertThreshold) : 70,
      irrigation_target_percent: irrigationTarget ? Number(irrigationTarget) : 80,
      weather_source: weatherSource,
      weather_config: weatherSource === 'google_sheets' && spreadsheetId
        ? { spreadsheet_id: spreadsheetId, gid: sheetGid || undefined }
        : weatherSource === 'plugfield' && plugfieldDeviceId
          ? {
              plugfield_device_id: Number(plugfieldDeviceId),
              plugfield_token: plugfieldToken || undefined,
              plugfield_api_key: plugfieldApiKey || undefined,
              ...(pivot?.weather_config?.station_id ? { station_id: pivot.weather_config.station_id } : {}),
            }
          : null,
      operation_mode: operationMode,
      paired_pivot_id: operationMode === 'conjugated' && pairedPivotId ? pairedPivotId : null,
      return_interval_days: returnIntervalDays ? Number(returnIntervalDays) : 1,
      preferred_speed_percent: preferredSpeed ? Number(preferredSpeed) : null,
      min_speed_percent: minSpeedPct ? Number(minSpeedPct) : null,
      field_capacity: fieldCapacity ? Number(fieldCapacity) : null,
      wilting_point:  wiltingPoint  ? Number(wiltingPoint)  : null,
      bulk_density:   bulkDensity   ? Number(bulkDensity)   : null,
    }

    try {
      let pivotId: string
      if (isEdit) {
        await updatePivot(pivot.id, payload)
        pivotId = pivot.id
      } else {
        const created = await createPivot(payload)
        pivotId = created.id
      }

      const newSectors = sectors.filter(s => !s.id)
      if (newSectors.length > 0) {
        const existingCount = sectors.filter(x => x.id).length
        await Promise.all(newSectors.map((s, i) =>
          createSector({
            pivot_id: pivotId,
            name: s.name,
            angle_start: s.start ? Number(s.start) : null,
            angle_end: s.end ? Number(s.end) : null,
            sort_order: existingCount + i,
          })
        ))
      }

      // Salva tabela de velocidade se os campos necessários estão preenchidos
      const speedRows = previewTable
      if (speedRows && speedRows.length > 0) {
        const { createClient } = await import('@/lib/supabase/client')
        const sb = createClient()
        // Remove rows antigas e insere as novas (recalculadas)
        await (sb as any).from('pivot_speed_table').delete().eq('pivot_id', pivotId)
        await (sb as any).from('pivot_speed_table').insert(
          speedRows.map(r => ({
            pivot_id: pivotId,
            speed_percent: r.speed_percent,
            water_depth_mm: r.water_depth_mm,
            duration_hours: r.duration_hours,
          }))
        )
      }

      await onSaved()
      onClose()
    } catch (err) {
      console.error('[PivotModal] Erro ao salvar:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function handleAddSector() {
    if (!newSectorName.trim()) { setSectorError('Informe o nome do setor.'); return }
    const hasStart = newSectorStart.trim() !== ''
    const hasEnd = newSectorEnd.trim() !== ''
    if (hasStart !== hasEnd) { setSectorError('Informe início e fim, ou deixe ambos vazios.'); return }
    setSectorError('')
    setSectors(prev => [...prev, { name: newSectorName.trim(), start: newSectorStart, end: newSectorEnd }])
    setNewSectorName('')
    setNewSectorStart('')
    setNewSectorEnd('')
  }

  async function handleRemoveSector(index: number) {
    const s = sectors[index]
    if (s.id) {
      setDeletingSectorId(s.id)
      try {
        await deleteSector(s.id)
        setSectors(prev => prev.filter((_, i) => i !== index))
        if (editingIndex === index) setEditingIndex(null)
      } catch (err) {
        setSectorError(err instanceof Error ? err.message : 'Falha ao excluir setor')
      } finally {
        setDeletingSectorId(null)
      }
    } else {
      setSectors(prev => prev.filter((_, i) => i !== index))
      if (editingIndex === index) setEditingIndex(null)
    }
  }

  function handleStartEdit(index: number) {
    const s = sectors[index]
    setEditingIndex(index)
    setEditName(s.name)
    setEditStart(s.start)
    setEditEnd(s.end)
  }

  async function handleSaveSectorEdit(index: number) {
    if (!editName.trim()) return
    const s = sectors[index]
    setSavingEditIndex(index)
    try {
      if (s.id) {
        await updateSector(s.id, {
          name: editName.trim(),
          angle_start: editStart ? Number(editStart) : null,
          angle_end: editEnd ? Number(editEnd) : null,
        })
      }
      setSectors(prev => prev.map((item, i) =>
        i === index ? { ...item, name: editName.trim(), start: editStart, end: editEnd } : item
      ))
      setEditingIndex(null)
    } catch {
      // silencioso
    } finally {
      setSavingEditIndex(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)' }}>
      <div style={{
        background: 'linear-gradient(145deg, rgba(15, 25, 35, 0.95), rgba(10, 15, 20, 0.98))', 
        border: '1px solid rgba(0, 229, 255, 0.15)', borderRadius: 24, padding: 32,
        width: '100%', maxWidth: 650, boxShadow: '0 30px 60px -10px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 229, 255, 0.05)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            {isEdit ? 'Editar Pivô' : 'Novo Pivô'}
          </h2>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: '#778899', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" onClick={e => e.stopPropagation()}>
          {/* Fazenda */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>Fazenda *</label>
            <div style={{ position: 'relative' }}>
              <select
                value={farmId}
                onChange={e => setFarmId(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px 36px 10px 14px', borderRadius: 10, fontSize: 14,
                  background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0',
                  outline: 'none', appearance: 'none', cursor: 'pointer',
                }}
              >
                {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#778899', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Nome */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>Nome do Pivô *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Ex: Pivô Central, P1, Setor A..."
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, transition: 'all 0.2s',
                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = '#00E5FF'; e.target.style.boxShadow = '0 0 0 3px rgba(0, 229, 255, 0.15)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          {/* Separador */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Dados Técnicos</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(0,229,255,0.3) 0%, rgba(255,255,255,0.02) 100%)' }} />
          </div>

          {/* Comprimento + Vazão */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field
              label="Comprimento do braço"
              value={lengthM}
              onChange={setLengthM}
              placeholder="Ex: 425"
              unit="m"
              hint={area ? `≈ ${area.toFixed(1)} ha` : undefined}
            />
            <Field
              label="Vazão total"
              value={flowRate}
              onChange={setFlowRate}
              placeholder="Ex: 150"
              unit="m³/h"
            />
          </div>

          {/* Tempo 360° + CUC */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field
              label="Tempo 360° a 100%"
              value={time360}
              onChange={setTime360}
              placeholder="Ex: 22"
              unit="h"
              hint={depth100 ? `Lâmina a 100%: ${depth100.toFixed(1)} mm` : undefined}
            />
            <Field
              label="CUC"
              value={cuc}
              onChange={setCuc}
              placeholder="Ex: 85"
              unit="%"
              min={0}
              max={100}
            />
          </div>

          {/* Resumo da tabela ao vivo */}
          {previewTable && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(0,147,208,0.06)', border: '1px solid rgba(0,147,208,0.12)', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {previewTable.filter(r => [50, 75, 100].includes(r.speed_percent)).map(r => (
                <span key={r.speed_percent} style={{ fontSize: 12, color: '#8899aa' }}>
                  <span style={{ color: '#0093D0', fontWeight: 600 }}>{r.speed_percent}%</span> → {r.water_depth_mm.toFixed(1)} mm · {r.duration_hours.toFixed(1)} h
                </span>
              ))}
            </div>
          )}

          {/* Toggle configurações avançadas */}
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
              background: showAdvanced ? 'rgba(0,147,208,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${showAdvanced ? 'rgba(0,147,208,0.18)' : 'rgba(255,255,255,0.06)'}`,
              color: showAdvanced ? '#0093D0' : '#8899aa', transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>Localização, setores, alertas e parâmetros avançados</span>
            <ChevronRight size={14} style={{ transform: showAdvanced ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {showAdvanced && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Separador localização */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <MapPin size={11} style={{ color: '#778899' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Localização do Pivô</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(0,229,255,0.3) 0%, rgba(255,255,255,0.02) 100%)' }} />
          </div>

          {/* Mini-map — click to position */}
          <PivotMiniMapDynamic
            latitude={parsedCoords?.lat ?? null}
            longitude={parsedCoords?.lng ?? null}
            lengthM={parseFloat(lengthM) || null}
            sectors={sectors}
            onLocationChange={handleLocationChange}
          />

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>
              Coordenadas (latitude e longitude)
            </label>
            <input
              type="text"
              value={coordsRaw}
              onChange={e => setCoordsRaw(e.target.value)}
              placeholder='Ex: 22°53′03.2″S 50°21′38.5″W  ou  -22.879060, -50.362105'
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
                background: '#0d1520', border: `1px solid ${coordsRaw && !parsedCoords ? 'rgb(239 68 68 / 0.5)' : coordsRaw && parsedCoords ? 'rgb(0 147 208 / 0.35)' : 'rgba(255,255,255,0.08)'}`,
                color: '#e2e8f0', outline: 'none', fontFamily: 'var(--font-mono)',
              }}
              onFocus={e => e.target.style.borderColor = '#0093D0'}
              onBlur={e => e.target.style.borderColor = coordsRaw && !parsedCoords ? 'rgb(239 68 68 / 0.5)' : coordsRaw && parsedCoords ? 'rgb(0 147 208 / 0.35)' : 'rgba(255,255,255,0.08)'}
            />
            {/* Feedback de parse */}
            {coordsRaw && parsedCoords && (
              <p style={{ fontSize: 11, color: '#0093D0', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={10} />
                Lat {parsedCoords.lat.toFixed(6)}° · Lng {parsedCoords.lng.toFixed(6)}°
              </p>
            )}
            {coordsRaw && !parsedCoords && (
              <p style={{ fontSize: 11, color: '#ef4444', marginTop: 5 }}>
                Formato não reconhecido. Tente: -22.879060, -50.362105
              </p>
            )}
            {!coordsRaw && (
              <p style={{ fontSize: 11, color: '#778899', marginTop: 5 }}>
                Cole do Google Maps, Google Earth ou GPS. Aceita graus/minutos/segundos ou decimal.
              </p>
            )}
          </div>

          {/* ── Setores ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <Layers size={11} style={{ color: '#778899' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Setores</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(0,229,255,0.3) 0%, rgba(255,255,255,0.02) 100%)' }} />
            <span style={{ fontSize: 10, color: '#778899' }}>opcional</span>
          </div>
          <p style={{ fontSize: 11, color: '#778899', margin: '-8px 0 0' }}>
            Divida o pivô em setores para irrigação e precipitação. Sem setores = círculo completo.
          </p>

          {/* Lista de setores */}
          {sectors.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sectors.map((s, i) => (
                editingIndex === i ? (
                  /* Modo edição inline */
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto', gap: 6, alignItems: 'center', padding: '8px 10px', background: '#0d1520', borderRadius: 8, border: '1px solid rgba(0,147,208,0.3)' }}>
                    <input
                      type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveSectorEdit(i) } if (e.key === 'Escape') setEditingIndex(null) }}
                      style={{ padding: '5px 8px', borderRadius: 6, fontSize: 13, background: '#111f2e', border: '1px solid rgba(0,147,208,0.4)', color: '#e2e8f0', outline: 'none' }}
                    />
                    <input
                      type="number" value={editStart} onChange={e => setEditStart(e.target.value)}
                      placeholder="Início°" min={0} max={360} step="any"
                      style={{ padding: '5px 8px', borderRadius: 6, fontSize: 13, background: '#111f2e', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
                    />
                    <input
                      type="number" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                      placeholder="Fim°" min={0} max={360} step="any"
                      style={{ padding: '5px 8px', borderRadius: 6, fontSize: 13, background: '#111f2e', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
                    />
                    <button type="button" onClick={() => handleSaveSectorEdit(i)} disabled={savingEditIndex === i}
                      style={{ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#0093D0', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                      {savingEditIndex === i ? <Loader2 size={11} className="animate-spin" /> : 'OK'}
                    </button>
                    <button type="button" onClick={() => setEditingIndex(null)}
                      style={{ padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: '#778899' }}>
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  /* Modo visualização */
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#0d1520', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{s.name}</span>
                    {(s.start || s.end) && (
                      <span style={{ fontSize: 11, color: '#778899', fontFamily: 'var(--font-mono)' }}>
                        {s.start || '—'}°–{s.end || '—'}°
                      </span>
                    )}
                    <button type="button" onClick={() => handleStartEdit(i)}
                      style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: '#778899' }}>
                      <Pencil size={12} />
                    </button>
                    <button type="button" onClick={() => handleRemoveSector(i)} disabled={deletingSectorId === s.id}
                      style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: '#778899' }}>
                      {deletingSectorId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Formulário adicionar setor */}
          {sectorError && <p style={{ fontSize: 11, color: '#ef4444', margin: '-4px 0' }}>{sectorError}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#8899aa', marginBottom: 5 }}>Nome *</label>
              <input
                type="text"
                value={newSectorName}
                onChange={e => setNewSectorName(e.target.value)}
                placeholder="Ex: A, B, Norte…"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSector() } }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#0093D0'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#8899aa', marginBottom: 5 }}>Início °</label>
              <input
                type="number" value={newSectorStart} onChange={e => setNewSectorStart(e.target.value)}
                placeholder="0" min={0} max={360} step="any"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#0093D0'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#8899aa', marginBottom: 5 }}>Fim °</label>
              <input
                type="number" value={newSectorEnd} onChange={e => setNewSectorEnd(e.target.value)}
                placeholder="270" min={0} max={360} step="any"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#0093D0'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </div>
            <button
              type="button"
              onClick={handleAddSector}
              style={{ padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0093D0', color: '#fff', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
            >
              <Plus size={12} /> Adicionar
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#778899', margin: '-4px 0 0' }}>0=Norte, 90=Leste, sentido horário</p>

          {/* Limiar de alerta */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>
              Limiar de Alerta de Irrigação
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range"
                min={40}
                max={95}
                step={5}
                value={alertThreshold || '70'}
                onChange={e => setAlertThreshold(e.target.value)}
                style={{ flex: 1, accentColor: '#0093D0', cursor: 'pointer' }}
              />
              <div style={{
                minWidth: 52, padding: '6px 10px', borderRadius: 8, textAlign: 'center',
                background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>
                  {alertThreshold || 70}
                </span>
                <span style={{ fontSize: 10, color: '#778899' }}>%</span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#778899', marginTop: 6 }}>
              Sistema avisa para irrigar quando a capacidade de campo cair abaixo deste valor.
              Padrão: 70%.
            </p>
          </div>

          {/* Alvo de reposição */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>
              Alvo de Reposição de Irrigação
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={irrigationTarget || '80'}
                onChange={e => setIrrigationTarget(e.target.value)}
                style={{ flex: 1, accentColor: '#22c55e', cursor: 'pointer' }}
              />
              <div style={{
                minWidth: 52, padding: '6px 10px', borderRadius: 8, textAlign: 'center',
                background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#22c55e', fontFamily: 'var(--font-mono)' }}>
                  {irrigationTarget || 80}
                </span>
                <span style={{ fontSize: 10, color: '#778899' }}>%</span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#778899', marginTop: 6 }}>
              Até onde repor após acionar a irrigação. Padrão: 80% (evita encharcamento).
            </p>
          </div>

          {/* Separador operação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <Link2 size={11} style={{ color: '#778899' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Modo de Operação</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(0,229,255,0.3) 0%, rgba(255,255,255,0.02) 100%)' }} />
          </div>

          {/* Toggle Individual / Conjugado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              { value: 'individual' as OperationMode, label: 'Individual', desc: 'Pivô opera sozinho' },
              { value: 'conjugated' as OperationMode, label: 'Conjugado', desc: 'Divide bomba com outro pivô' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setOperationMode(opt.value)}
                style={{
                  padding: '10px 12px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                  border: `1px solid ${operationMode === opt.value ? 'rgb(0 147 208 / 0.35)' : 'rgba(255,255,255,0.08)'}`,
                  background: operationMode === opt.value ? 'rgb(0 147 208 / 0.10)' : '#0d1520',
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 700, color: operationMode === opt.value ? '#0093D0' : '#8899aa' }}>{opt.label}</p>
                <p style={{ fontSize: 10, color: '#778899', marginTop: 2 }}>{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* Campos conjugado */}
          {operationMode === 'conjugated' && (
            <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 11, color: '#8899aa' }}>
                Configure como o pivô opera no dia a dia. O sistema projeta o déficit até a próxima volta.
              </p>

              <div style={{ marginBottom: 4 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 5 }}>Pivô Pareado (Divide a mesma bomba)</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={pairedPivotId}
                    onChange={e => setPairedPivotId(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 36px 8px 10px', borderRadius: 8, fontSize: 13,
                      background: '#0f1923', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0',
                      outline: 'none', appearance: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="">-- Nenhum selecionado --</option>
                    {allPivots.filter(p => p.farm_id === farmId && p.id !== pivot?.id).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#778899', pointerEvents: 'none' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 5 }}>Intervalo de Retorno</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number" step="0.5" min="1" value={returnIntervalDays}
                      onChange={e => setReturnIntervalDays(e.target.value)}
                      style={{ width: '100%', padding: '8px 40px 8px 10px', borderRadius: 8, fontSize: 13, background: '#0f1923', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
                      onFocus={e => e.target.style.borderColor = '#0093D0'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />
                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#778899', pointerEvents: 'none' }}>dias</span>
                  </div>
                  <p style={{ fontSize: 10, color: '#778899', marginTop: 3 }}>A cada quantos dias o pivô retorna</p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 5 }}>Velocidade Preferida</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number" step="1" min="5" max="100" value={preferredSpeed}
                      onChange={e => setPreferredSpeed(e.target.value)}
                      placeholder="ex: 50"
                      style={{ width: '100%', padding: '8px 28px 8px 10px', borderRadius: 8, fontSize: 13, background: '#0f1923', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
                      onFocus={e => e.target.style.borderColor = '#0093D0'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />
                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#778899', pointerEvents: 'none' }}>%</span>
                  </div>
                  <p style={{ fontSize: 10, color: '#778899', marginTop: 3 }}>
                    Velocidade do dia a dia
                    {preferredSpeed && lengthM && flowRate && time360 && (() => {
                      const d = calcDepth100(Number(flowRate), Number(time360), Number(lengthM)) * (100 / Number(preferredSpeed))
                      return d > 0 ? ` → ${d.toFixed(1)}mm` : ''
                    })()}
                  </p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 5 }}>Velocidade Mínima Operacional</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number" step="1" min="5" max="100" value={minSpeedPct}
                      onChange={e => setMinSpeedPct(e.target.value)}
                      placeholder="ex: 42"
                      style={{ width: '100%', padding: '8px 28px 8px 10px', borderRadius: 8, fontSize: 13, background: '#0f1923', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
                      onFocus={e => e.target.style.borderColor = '#0093D0'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />
                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#778899', pointerEvents: 'none' }}>%</span>
                  </div>
                  <p style={{ fontSize: 10, color: '#778899', marginTop: 3 }}>
                    Limite mínimo (solo não absorve abaixo disso)
                    {minSpeedPct && lengthM && flowRate && time360 && (() => {
                      const d = calcDepth100(Number(flowRate), Number(time360), Number(lengthM)) * (100 / Number(minSpeedPct))
                      return d > 0 ? ` → ${d.toFixed(1)}mm` : ''
                    })()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Separador fonte climática */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <Satellite size={11} style={{ color: '#778899' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Fonte de Dados Climáticos</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(0,229,255,0.3) 0%, rgba(255,255,255,0.02) 100%)' }} />
          </div>

          {/* Seletor de fonte */}
          <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 8 }}>
            {([
              { value: 'plugfield',     label: 'Plugfield',     icon: Radio,     desc: 'Estação física — API direta' },
              { value: 'nasa',          label: 'NASA POWER',    icon: Satellite, desc: 'Por coordenada — gratuito' },
              { value: 'google_sheets', label: 'Google Sheets', icon: Sheet,     desc: 'Planilha exportada' },
              { value: 'manual',        label: 'Manual',        icon: Hand,      desc: 'Digitar diariamente' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setWeatherSource(opt.value)}
                style={{
                  padding: '10px 8px', borderRadius: 10, border: `1px solid ${weatherSource === opt.value ? 'rgb(0 147 208 / 0.35)' : 'rgba(255,255,255,0.08)'}`,
                  background: weatherSource === opt.value ? 'rgb(0 147 208 / 0.10)' : '#0d1520',
                  cursor: 'pointer', textAlign: 'center',
                }}
              >
                <opt.icon size={14} style={{ color: weatherSource === opt.value ? '#0093D0' : '#778899', margin: '0 auto 4px' }} />
                <p style={{ fontSize: 11, fontWeight: 700, color: weatherSource === opt.value ? '#0093D0' : '#8899aa', marginBottom: 2 }}>{opt.label}</p>
                <p style={{ fontSize: 9, color: '#778899', lineHeight: 1.3 }}>{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* Config Plugfield */}
          {weatherSource === 'plugfield' && (
            <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 11, color: '#8899aa' }}>
                Credenciais da sua conta Plugfield. Encontre no painel em <strong style={{ color: '#e2e8f0' }}>Configurações → API</strong>.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 5 }}>Device ID</label>
                <input
                  type="number"
                  value={plugfieldDeviceId}
                  onChange={e => setPlugfieldDeviceId(e.target.value)}
                  placeholder="Ex: 3228"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, background: '#080e14', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#0093D0'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
                <p style={{ fontSize: 10, color: '#778899', marginTop: 3 }}>Número do equipamento — aparece na URL ao abrir a estação no painel Plugfield.</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 5 }}>Token (Authorization)</label>
                <input
                  type="password"
                  value={plugfieldToken}
                  onChange={e => setPlugfieldToken(e.target.value)}
                  placeholder="eyJhbGci..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, background: '#080e14', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none', fontFamily: 'var(--font-mono)' }}
                  onFocus={e => e.target.style.borderColor = '#0093D0'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 5 }}>API Key (x-api-key)</label>
                <input
                  type="password"
                  value={plugfieldApiKey}
                  onChange={e => setPlugfieldApiKey(e.target.value)}
                  placeholder="seX5bBCI..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, background: '#080e14', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none', fontFamily: 'var(--font-mono)' }}
                  onFocus={e => e.target.style.borderColor = '#0093D0'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
              </div>
            </div>
          )}

          {/* Config Google Sheets */}
          {weatherSource === 'google_sheets' && (
            <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 2 }}>
                Cole a URL da planilha. Ela precisa estar pública ("Qualquer pessoa com o link pode ver").
              </p>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 5 }}>URL da Planilha Google Sheets</label>
                <input
                  type="text"
                  value={spreadsheetId}
                  onChange={e => {
                    const val = e.target.value
                    const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
                    setSpreadsheetId(match ? match[1] : val)
                    const gidMatch = val.match(/[#&]gid=(\d+)/)
                    if (gidMatch) setSheetGid(gidMatch[1])
                  }}
                  placeholder="Cole a URL ou o ID da planilha"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#0093D0'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
                {spreadsheetId && (
                  <p style={{ fontSize: 10, color: '#0093D0', marginTop: 4 }}>
                    ID: {spreadsheetId}{sheetGid ? ` · Aba: gid=${sheetGid}` : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Info NASA */}
          {weatherSource === 'nasa' && (
            <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8 }}>
              <Satellite size={13} style={{ color: '#06b6d4', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: '#778899', lineHeight: 1.5 }}>
                NASA POWER fornece dados diários de temperatura, umidade, vento e radiação solar por coordenada geográfica. Gratuito e sem configuração adicional.
                {!parsedCoords && <strong style={{ color: '#f59e0b' }}> Informe as coordenadas acima.</strong>}
              </p>
            </div>
          )}


          {/* Separador solo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Parâmetros de Solo</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(0,229,255,0.3) 0%, rgba(255,255,255,0.02) 100%)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Cap. Campo (CC)" value={fieldCapacity} onChange={setFieldCapacity} placeholder="32" unit="%" hint="% volumétrico" />
            <Field label="Pto. Murcha (PM)" value={wiltingPoint}   onChange={setWiltingPoint}   placeholder="14" unit="%" hint="% volumétrico" />
            <Field label="Dens. Solo (Ds)"  value={bulkDensity}   onChange={setBulkDensity}   placeholder="1.4" unit="g/cm³" />
          </div>
          <p style={{ fontSize: 11, color: '#778899', margin: '-8px 0 0' }}>
            Esses valores ficam no pivô e são usados no balanço hídrico. Você ainda pode sobrescrevê-los por safra, se necessário.
          </p>

          </div>
          )} {/* fim showAdvanced */}

          {/* Botões */}
          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 500,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', cursor: 'pointer', transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#e2e8f0' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#8899aa' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={e => { e.preventDefault(); e.stopPropagation(); handleSubmit(e as unknown as React.FormEvent) }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer',
                opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: '0 2px 8px rgba(0,147,208,0.25)', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { if(!loading) { e.currentTarget.style.background = '#0082bb'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,147,208,0.35)' } }}
              onMouseLeave={e => { if(!loading) { e.currentTarget.style.background = '#0093D0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,147,208,0.25)' } }}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'SALVAR PIVÔ' : 'CRIAR PIVÔ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PivotCard({ pivot, onEdit, onDelete, deleting }: {
  pivot: PivotWithFarmName
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const area = pivot.length_m ? calcArea(pivot.length_m) : null
  const depth100 = (pivot.flow_rate_m3h && pivot.time_360_h && pivot.length_m)
    ? calcDepth100(pivot.flow_rate_m3h, pivot.time_360_h, pivot.length_m)
    : null
  const speedTable = (pivot.flow_rate_m3h && pivot.time_360_h && pivot.length_m)
    ? buildSpeedTable(pivot.flow_rate_m3h, pivot.time_360_h, pivot.length_m)
    : null
  const hasTechnicalData = !!(pivot.length_m || pivot.flow_rate_m3h)

  return (
    <div
      style={{
        background: '#0f1923',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(0,147,208,0.2)'
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ padding: '18px 20px' }}>
        {/* Linha 1 — nome + ações */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: 'rgba(0,147,208,0.1)', border: '1px solid rgba(0,147,208,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CircleDot size={16} style={{ color: '#0093D0' }} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>{pivot.name}</p>
              {pivot.farms?.name && (
                <p style={{ fontSize: 11, color: '#8899aa', margin: '2px 0 0' }}>{pivot.farms.name}</p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {speedTable && (
              <button
                onClick={() => setExpanded(v => !v)}
                title="Ver tabela de velocidade"
                style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(0,147,208,0.2)', cursor: 'pointer', background: 'rgba(0,147,208,0.06)', color: '#0093D0', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,147,208,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,147,208,0.06)'}
              >
                <Table2 size={12} />
                <span>Tabela</span>
                <ChevronRight size={11} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
            )}
            <button
              onClick={onEdit}
              title="Editar"
              style={{ padding: 7, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#8899aa', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8899aa' }}
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              title="Excluir"
              style={{ padding: 7, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#8899aa', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8899aa' }}
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        </div>

        {/* Linha 2 — stats dominantes */}
        {hasTechnicalData && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            {area != null && (
              <div style={{ background: 'rgba(0,147,208,0.06)', border: '1px solid rgba(0,147,208,0.12)', borderRadius: 10, padding: '10px 16px', minWidth: 90, textAlign: 'center' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: 0, lineHeight: 1 }}>{area.toFixed(0)}</p>
                <p style={{ fontSize: 10, color: '#8899aa', margin: '3px 0 0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ha</p>
              </div>
            )}
            {depth100 != null && (
              <div style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)', borderRadius: 10, padding: '10px 16px', minWidth: 90, textAlign: 'center' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#22c55e', margin: 0, lineHeight: 1 }}>{depth100.toFixed(1)}</p>
                <p style={{ fontSize: 10, color: '#8899aa', margin: '3px 0 0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>mm / 100%</p>
              </div>
            )}
          </div>
        )}

        {/* Linha 3 — dados secundários */}
        {hasTechnicalData && (pivot.flow_rate_m3h || pivot.time_360_h) && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {pivot.flow_rate_m3h && (
              <span style={{ fontSize: 12, color: '#8899aa' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{pivot.flow_rate_m3h}</span> m³/h
              </span>
            )}
            {pivot.time_360_h && (
              <span style={{ fontSize: 12, color: '#8899aa' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{pivot.time_360_h}</span> h / 360°
              </span>
            )}
            {pivot.length_m && (
              <span style={{ fontSize: 12, color: '#8899aa' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{pivot.length_m}</span> m braço
              </span>
            )}
          </div>
        )}

        {/* Linha 4 — badges e metadados */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {pivot.cuc_percent && (
            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa' }}>
              CUC {pivot.cuc_percent}%
            </span>
          )}
          {pivot.latitude && pivot.longitude && (
            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={9} />
              {pivot.latitude.toFixed(4)}, {pivot.longitude.toFixed(4)}
            </span>
          )}
          {pivot.weather_source && pivot.weather_source !== 'manual' && (
            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'rgba(0,147,208,0.06)', border: '1px solid rgba(0,147,208,0.15)', color: '#0093D0', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
              {pivot.weather_source === 'nasa' ? <Satellite size={9} /> : pivot.weather_source === 'plugfield' ? <Radio size={9} /> : <Sheet size={9} />}
              {pivot.weather_source === 'nasa' ? 'NASA POWER' : pivot.weather_source === 'plugfield' ? 'Plugfield' : 'Google Sheets'}
            </span>
          )}
          {pivot.sectorCount != null && pivot.sectorCount > 0 && (
            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'rgba(0,147,208,0.06)', border: '1px solid rgba(0,147,208,0.15)', color: '#0093D0', fontWeight: 500 }}>
              {pivot.sectorCount} {pivot.sectorCount === 1 ? 'setor' : 'setores'}
            </span>
          )}
          {pivot.operation_mode === 'conjugated' && (
            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Link2 size={9} />
              Conjugado · {pivot.return_interval_days}d
            </span>
          )}
          {!hasTechnicalData && (
            <span style={{ fontSize: 12, color: '#556677', fontStyle: 'italic' }}>Dados técnicos não informados</span>
          )}
        </div>
      </div>

      {/* Tabela expandível */}
      {expanded && speedTable && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <SpeedTable rows={speedTable} />
        </div>
      )}
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────
export default function PivosPage() {
  const { company, loading: authLoading } = useAuth()
  const [pivots, setPivots] = useState<PivotWithFarmName[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPivot, setEditingPivot] = useState<Pivot | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!company?.id) {
      setPivots([])
      setFarms([])
      setLoadError('Nenhuma empresa ativa encontrada.')
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      setLoadError('')
      const farmsData = await listFarmsByCompany(company.id)
      const pivotsData = await listPivotsByFarmIds(farmsData.map((farm) => farm.id))
      setFarms(farmsData)
      setPivots(pivotsData)
    } catch (error) {
      setFarms([])
      setPivots([])
      setLoadError(error instanceof Error ? error.message : 'Falha ao carregar pivôs')
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    if (authLoading) return
    loadData()
  }, [authLoading, loadData])

  async function handleDelete(id: string) {
    if (!confirm('Excluir este pivô? As safras vinculadas também serão removidas.')) return
    setDeletingId(id)
    try {
      setLoadError('')
      await deletePivot(id)
      await loadData()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao excluir pivô')
    } finally {
      setDeletingId(null)
    }
  }

  // Agrupar por fazenda
  const grouped: Record<string, PivotWithFarmName[]> = {}
  for (const p of pivots) {
    const fn = p.farms?.name ?? 'Sem fazenda'
    if (!grouped[fn]) grouped[fn] = []
    grouped[fn].push(p)
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>Pivôs</h1>
            <p className="text-sm mt-0.5" style={{ color: '#8899aa' }}>
              {pivots.length} {pivots.length === 1 ? 'pivô cadastrado' : 'pivôs cadastrados'}
            </p>
          </div>
          <button
            onClick={() => { setEditingPivot(null); setModalOpen(true) }}
            disabled={farms.length === 0}
            title={farms.length === 0 ? 'Cadastre uma fazenda primeiro' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: farms.length === 0 ? '#1a222c' : '#0093D0',
              border: 'none', color: farms.length === 0 ? '#778899' : '#fff',
              cursor: farms.length === 0 ? 'not-allowed' : 'pointer',
              boxShadow: farms.length === 0 ? 'none' : '0 2px 8px rgba(0,147,208,0.25)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { if(farms.length !== 0) { e.currentTarget.style.background = '#0082bb'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,147,208,0.35)' } }}
            onMouseLeave={e => { if(farms.length !== 0) { e.currentTarget.style.background = '#0093D0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,147,208,0.25)' } }}
          >
            <Plus size={16} />
            Novo Pivô
          </button>
        </div>

        {loadError && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              background: 'rgb(239 68 68 / 0.08)',
              border: '1px solid rgb(239 68 68 / 0.2)',
              color: '#fca5a5',
            }}
          >
            {loadError}
          </div>
        )}

        {authLoading || loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: '#0093D0' }} />
          </div>
        ) : farms.length === 0 ? (
          <div style={{ background: 'rgba(15, 25, 35, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <CircleDot size={28} style={{ color: '#00E5FF', margin: '0 auto 16px', filter: 'drop-shadow(0 0 8px rgba(0,229,255,0.4))' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Cadastre uma fazenda primeiro</h3>
            <p style={{ fontSize: 14, color: '#778899' }}>Os pivôs são vinculados a fazendas. Acesse <strong style={{ color: '#00E5FF' }}>Configuração → Fazendas</strong> para começar.</p>
          </div>
        ) : pivots.length === 0 ? (
          <div style={{ background: 'rgba(15, 25, 35, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <CircleDot size={28} style={{ color: '#00E5FF', margin: '0 auto 16px', filter: 'drop-shadow(0 0 8px rgba(0,229,255,0.4))' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Nenhum pivô cadastrado</h3>
            <p style={{ fontSize: 14, color: '#778899', marginBottom: 24 }}>Cadastre os pivôs de irrigação das suas fazendas.</p>
            <button
              onClick={() => { setEditingPivot(null); setModalOpen(true) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer',
              }}
            >
              <Plus size={16} />
              Cadastrar Pivô
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {Object.entries(grouped).map(([farmName, farmPivots]) => (
              <div key={farmName}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#778899' }}>{farmName}</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                </div>
                <div className="flex flex-col gap-3">
                  {farmPivots.map(pivot => (
                    <PivotCard
                      key={pivot.id}
                      pivot={pivot}
                      onEdit={() => { setEditingPivot(pivot); setModalOpen(true) }}
                      onDelete={() => handleDelete(pivot.id)}
                      deleting={deletingId === pivot.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <PivotModal
          pivot={editingPivot}
          farms={farms}
          allPivots={pivots}
          onClose={() => setModalOpen(false)}
          onSaved={loadData}
        />
      )}
    </>
  )
}

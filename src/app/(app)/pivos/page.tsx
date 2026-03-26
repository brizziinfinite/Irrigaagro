'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import type { Farm, Pivot, SpeedTableRow } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'
import { listFarmsByCompany } from '@/services/farms'
import {
  createPivot,
  deletePivot,
  listPivotsByFarmIds,
  updatePivot,
  type PivotWithFarmName,
} from '@/services/pivots'
import { CircleDot, Plus, Pencil, Trash2, X, Loader2, ChevronDown, Table2, ChevronRight, MapPin, Satellite, Sheet, Hand } from 'lucide-react'

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
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#556677' }}>
          Tabela de Velocidade
        </span>
      </div>
      <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#0d1520', padding: '8px 14px' }}>
          {['Velocidade', 'Lâmina (mm)', 'Duração (h)'].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
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
            borderRadius: 10, fontSize: 14,
            background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = '#0093D0'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
        {unit && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#556677', pointerEvents: 'none' }}>
            {unit}
          </span>
        )}
      </div>
      {hint && <p style={{ fontSize: 11, color: '#556677', marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────
interface PivotModalProps {
  pivot: Pivot | null
  farms: Farm[]
  onClose: () => void
  onSaved: () => Promise<void>
}

function PivotModal({ pivot, farms, onClose, onSaved }: PivotModalProps) {
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
  const [weatherSource, setWeatherSource] = useState<'nasa' | 'google_sheets' | 'manual'>(pivot?.weather_source ?? 'nasa')
  const [spreadsheetId, setSpreadsheetId] = useState(pivot?.weather_config?.spreadsheet_id ?? '')
  const [sheetGid, setSheetGid] = useState(pivot?.weather_config?.gid ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      weather_source: weatherSource,
      weather_config: weatherSource === 'google_sheets' && spreadsheetId
        ? { spreadsheet_id: spreadsheetId, gid: sheetGid || undefined }
        : null,
    }

    try {
      if (isEdit) {
        await updatePivot(pivot.id, payload)
      } else {
        await createPivot(payload)
      }

      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar pivô')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgb(0 0 0 / 0.75)' }}>
      <div style={{
        background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 28,
        width: '100%', maxWidth: 520, boxShadow: '0 20px 48px -8px rgb(0 0 0 / 0.6)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            {isEdit ? 'Editar Pivô' : 'Novo Pivô'}
          </h2>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: '#556677', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#556677', pointerEvents: 'none' }} />
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
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
                background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#0093D0'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          {/* Separador */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#556677' }}>Dados Técnicos</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
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

          {/* Preview tabela ao vivo */}
          {previewTable && <SpeedTable rows={previewTable} />}

          {/* Separador localização */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <MapPin size={11} style={{ color: '#556677' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#556677' }}>Localização do Pivô</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
          </div>

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
              <p style={{ fontSize: 11, color: '#556677', marginTop: 5 }}>
                Cole do Google Maps, Google Earth ou GPS. Aceita graus/minutos/segundos ou decimal.
              </p>
            )}
          </div>

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
                <span style={{ fontSize: 10, color: '#556677' }}>%</span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#556677', marginTop: 6 }}>
              Sistema avisa para irrigar quando a capacidade de campo cair abaixo deste valor.
              Padrão: 70%.
            </p>
          </div>

          {/* Separador fonte climática */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <Satellite size={11} style={{ color: '#556677' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#556677' }}>Fonte de Dados Climáticos</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
          </div>

          {/* Seletor de fonte */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {([
              { value: 'nasa',          label: 'NASA POWER',    icon: Satellite, desc: 'Por coordenada — sempre disponível', disabled: false },
              { value: 'google_sheets', label: 'Google Sheets', icon: Sheet,     desc: 'Em breve', disabled: true },
              { value: 'manual',        label: 'Manual',        icon: Hand,      desc: 'Digitar os dados diariamente', disabled: false },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => !opt.disabled && setWeatherSource(opt.value)}
                disabled={opt.disabled}
                style={{
                  padding: '10px 8px', borderRadius: 10, border: `1px solid ${weatherSource === opt.value ? 'rgb(0 147 208 / 0.35)' : 'rgba(255,255,255,0.08)'}`,
                  background: weatherSource === opt.value ? 'rgb(0 147 208 / 0.10)' : '#0d1520',
                  cursor: opt.disabled ? 'not-allowed' : 'pointer', textAlign: 'center',
                  opacity: opt.disabled ? 0.4 : 1,
                }}
              >
                <opt.icon size={14} style={{ color: weatherSource === opt.value ? '#0093D0' : '#556677', margin: '0 auto 4px' }} />
                <p style={{ fontSize: 11, fontWeight: 700, color: weatherSource === opt.value ? '#0093D0' : '#8899aa', marginBottom: 2 }}>{opt.label}</p>
                <p style={{ fontSize: 9, color: '#556677', lineHeight: 1.3 }}>{opt.desc}</p>
              </button>
            ))}
          </div>

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
                    // Aceita URL completa ou ID direto
                    const val = e.target.value
                    const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
                    setSpreadsheetId(match ? match[1] : val)
                    // Extrai gid se houver
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
              <p style={{ fontSize: 11, color: '#556677', lineHeight: 1.5 }}>
                NASA POWER fornece dados diários de temperatura, umidade, vento e radiação solar por coordenada geográfica. Gratuito e sem configuração adicional.
                {!parsedCoords && <strong style={{ color: '#f59e0b' }}> Informe as coordenadas acima.</strong>}
              </p>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 500,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer',
                opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar'}
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

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 }}>
      {/* Linha principal */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          background: 'rgb(0 147 208 / 0.10)', border: '1px solid rgb(0 147 208 / 0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CircleDot size={18} style={{ color: '#0093D0' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{pivot.name}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 3 }}>
            {pivot.length_m && <span style={{ fontSize: 12, color: '#556677' }}>{pivot.length_m} m</span>}
            {area && <span style={{ fontSize: 12, color: '#556677' }}>{area.toFixed(1)} ha</span>}
            {pivot.flow_rate_m3h && <span style={{ fontSize: 12, color: '#556677' }}>{pivot.flow_rate_m3h} m³/h</span>}
            {depth100 && <span style={{ fontSize: 12, color: '#0093D0', fontWeight: 600 }}>100% → {depth100.toFixed(1)} mm</span>}
            {pivot.cuc_percent && <span style={{ fontSize: 12, color: '#556677' }}>CUC {pivot.cuc_percent}%</span>}
            {pivot.latitude && pivot.longitude && (
              <span style={{ fontSize: 12, color: '#556677', display: 'flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={10} />
                {pivot.latitude.toFixed(4)}, {pivot.longitude.toFixed(4)}
              </span>
            )}
            {pivot.weather_source && pivot.weather_source !== 'manual' && (
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'rgb(6 182 212 / 0.08)', border: '1px solid rgb(6 182 212 / 0.2)', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: 3 }}>
                {pivot.weather_source === 'nasa' ? <Satellite size={9} /> : <Sheet size={9} />}
                {pivot.weather_source === 'nasa' ? 'NASA POWER' : 'Google Sheets'}
              </span>
            )}
            {!pivot.length_m && !pivot.flow_rate_m3h && (
              <span style={{ fontSize: 12, color: '#556677' }}>Dados técnicos não informados</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {speedTable && (
            <button
              onClick={() => setExpanded(v => !v)}
              title="Ver tabela de velocidade"
              style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0d1520', color: '#0093D0', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Table2 size={14} />
              <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
          )}
          <button
            onClick={onEdit}
            title="Editar"
            style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0d1520', color: '#8899aa' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#0d1520'; (e.currentTarget as HTMLElement).style.color = '#8899aa' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0d1520'; (e.currentTarget as HTMLElement).style.color = '#8899aa' }}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            title="Excluir"
            style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0d1520', color: '#8899aa' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgb(239 68 68 / 0.1)'; (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0d1520'; (e.currentTarget as HTMLElement).style.color = '#8899aa' }}
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
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
              padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: farms.length === 0 ? '#0d1520' : '#0093D0',
              border: 'none', color: farms.length === 0 ? '#556677' : '#fff',
              cursor: farms.length === 0 ? 'not-allowed' : 'pointer',
            }}
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
          <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <CircleDot size={28} style={{ color: '#0093D0', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Cadastre uma fazenda primeiro</h3>
            <p style={{ fontSize: 14, color: '#556677' }}>Os pivôs são vinculados a fazendas. Acesse <strong style={{ color: '#8899aa' }}>Configuração → Fazendas</strong> para começar.</p>
          </div>
        ) : pivots.length === 0 ? (
          <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <CircleDot size={28} style={{ color: '#0093D0', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Nenhum pivô cadastrado</h3>
            <p style={{ fontSize: 14, color: '#556677', marginBottom: 24 }}>Cadastre os pivôs de irrigação das suas fazendas.</p>
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
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#556677' }}>{farmName}</span>
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
          onClose={() => setModalOpen(false)}
          onSaved={loadData}
        />
      )}
    </>
  )
}

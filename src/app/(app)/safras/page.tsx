'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Farm, Pivot, Crop, Season } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'
import { listCropsByCompany } from '@/services/crops'
import { listFarmsByCompany } from '@/services/farms'
import { listPivotsByFarmIds } from '@/services/pivots'
import {
  createSeason,
  deleteSeason,
  listSeasonsByFarmIds,
  updateSeason,
} from '@/services/seasons'
import { getLastManagementBySeason } from '@/services/management'
import type { DailyManagement } from '@/types/database'
import {
  Sprout, Plus, Pencil, Trash2, X, Loader2, ChevronDown,
  CalendarDays, Droplets, FlaskConical, TrendingDown, AlertTriangle, RefreshCw,
  ArrowRight, CheckCircle2, TriangleAlert,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────
function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}
function fmtDate(d: Date) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function calcCTA(cc: number, pm: number, ds: number, rootCm: number): number {
  return ((cc - pm) / 10) * ds * rootCm
}

// ─── Linha do tempo das fases ─────────────────────────────────
function PhaseTimeline({ plantingDate, crop }: { plantingDate: string; crop: Crop }) {
  const stages = [
    { label: 'Ini', days: crop.stage1_days, color: '#22c55e' },
    { label: 'Dev', days: crop.stage2_days, color: '#0093D0' },
    { label: 'Mid', days: crop.stage3_days, color: '#f59e0b' },
    { label: 'Fin', days: crop.stage4_days, color: '#ef4444' },
  ]
  const totalDays = stages.reduce((s, f) => s + (f.days ?? 0), 0)
  if (totalDays === 0) return null
  const start = new Date(plantingDate + 'T12:00:00')
  let cursor = 0
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', height: 5, borderRadius: 99, overflow: 'hidden', gap: 1 }}>
        {stages.map((s, i) => (
          <div key={i} style={{ width: `${((s.days ?? 0) / totalDays) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
        {stages.map((s, i) => {
          const stageStart = addDays(start, cursor)
          cursor += (s.days ?? 0)
          return (
            <div key={i}>
              <div style={{ fontSize: 11, color: s.color, fontWeight: 700 }}>{s.label} {s.days}d</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{fmtDate(stageStart)}</div>
            </div>
          )
        })}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>Colheita</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{fmtDate(addDays(start, totalDays))}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Componentes auxiliares ───────────────────────────────────
function StyledSelect({ label, value, onChange, children, required }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; required?: boolean
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
        {label}{required && ' *'}
      </label>
      <div style={{ position: 'relative' }}>
        <select value={value} onChange={e => onChange(e.target.value)} required={required}
          style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: 10, fontSize: 14, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: value ? '#e2e8f0' : '#778899', outline: 'none', appearance: 'none', cursor: 'pointer' }}
          onFocus={e => e.target.style.borderColor = '#0093D0'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        >
          {children}
        </select>
        <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#778899', pointerEvents: 'none' }} />
      </div>
    </div>
  )
}

function NumField({ label, value, onChange, placeholder, unit, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; unit?: string; hint?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input type="number" step="any" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', padding: unit ? '10px 44px 10px 14px' : '10px 14px', borderRadius: 10, fontSize: 14, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
          onFocus={e => e.target.style.borderColor = '#0093D0'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
        {unit && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#778899', pointerEvents: 'none' }}>{unit}</span>}
      </div>
      {hint && <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.625 }}>{hint}</p>}
    </div>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#cbd5e1' }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────
interface SeasonFull extends Season {
  pivots: { name: string } | null
  crops: Crop | null
  farms: { name: string }
}

interface SeasonModalProps {
  season: SeasonFull | null
  farms: Farm[]; pivots: Pivot[]; crops: Crop[]
  onClose: () => void; onSaved: () => void
}

function SeasonModal({ season, farms, pivots, crops, onClose, onSaved }: SeasonModalProps) {
  const isEdit = !!season
  const [name, setName]               = useState(season?.name ?? '')
  const [farmId, setFarmId]           = useState(season?.farm_id ?? farms[0]?.id ?? '')
  // Edição: pivô único. Criação: múltiplos pivôs via checkboxes
  const [pivotId, setPivotId]         = useState(season?.pivot_id ?? '')
  const [selectedPivotIds, setSelectedPivotIds] = useState<string[]>([])
  const [cropId, setCropId]           = useState(season?.crop_id ?? '')
  const [plantingDate, setPlantingDate] = useState(season?.planting_date ?? '')
  const [fFactor, setFFactor]         = useState(season?.f_factor?.toString() ?? '')
  const [initialAdc, setInitialAdc]   = useState(season?.initial_adc_percent?.toString() ?? '100')
  const [notes, setNotes]             = useState(season?.notes ?? '')
  const [isActive, setIsActive]       = useState(season?.is_active ?? true)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [recalcMsg, setRecalcMsg]     = useState('')
  // Guarda data original para detectar mudança
  const originalPlantingDate = season?.planting_date ?? null

  const farmPivots   = pivots.filter(p => p.farm_id === farmId)
  const selectedCrop = crops.find(c => c.id === cropId) ?? null

  function handlePivotToggle(pid: string) {
    setSelectedPivotIds(prev =>
      prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]
    )
  }

  // Ao trocar fazenda, limpa seleção de pivôs
  function handleFarmChange(fid: string) {
    setFarmId(fid)
    setSelectedPivotIds([])
    setPivotId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !farmId) return
    if (initialAdc) {
      const adcNum = Number(initialAdc)
      if (isNaN(adcNum) || adcNum < 0 || adcNum > 100) {
        setError('ADc inicial deve ser entre 0 e 100%.')
        return
      }
    }
    setError(''); setLoading(true)

    const basePayload = {
      farm_id: farmId,
      crop_id: cropId || null,
      planting_date: plantingDate || null,
      f_factor: fFactor ? Number(fFactor) : null,
      initial_adc_percent: initialAdc ? Number(initialAdc) : null,
      notes: notes.trim() || null,
      is_active: isActive,
    }

    try {
      if (isEdit) {
        await updateSeason(season.id, { ...basePayload, name: name.trim(), pivot_id: pivotId || null })

        // Se a data de plantio mudou, recalcula os últimos 7 dias do balanço hídrico
        const plantingDateChanged = plantingDate && plantingDate !== originalPlantingDate
        if (plantingDateChanged) {
          setRecalcMsg('Recalculando balanço hídrico...')
          try {
            await fetch('/api/seasons/recalculate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ season_id: season.id, last_days: 7 }),
            })
            setRecalcMsg('✓ Balanço dos últimos 7 dias recalculado com novo DAS/Kc')
          } catch {
            setRecalcMsg('Aviso: recálculo automático falhou — rode manualmente em Diagnóstico')
          }
          // Aguarda um momento para o usuário ver a mensagem antes de fechar
          await new Promise(r => setTimeout(r, 1800))
        }
      } else {
        // Criação em lote: 1 safra por pivô selecionado
        const targets = selectedPivotIds.length > 0 ? selectedPivotIds : [null]
        await Promise.all(targets.map(pid => {
          const pivot = pivots.find(p => p.id === pid)
          const safraName = targets.length > 1 && pivot
            ? `${name.trim()} — ${pivot.name}`
            : name.trim()
          return createSeason({ ...basePayload, name: safraName, pivot_id: pid })
        }))
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar safra')
    } finally {
      setLoading(false)
    }
  }

  const submitLabel = isEdit ? 'Salvar' : selectedPivotIds.length > 1
    ? `Criar ${selectedPivotIds.length} Safras`
    : 'Criar Safra'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgb(0 0 0 / 0.75)' }}>
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 'clamp(16px, 4vw, 28px)', width: '100%', maxWidth: 540, boxShadow: '0 20px 48px -8px rgb(0 0 0 / 0.6)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ fontSize: 24, fontWeight: 600, color: '#e2e8f0', letterSpacing: '-0.025em' }}>{isEdit ? 'Editar Safra' : 'Nova Safra'}</h2>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: '#778899', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444' }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <SectionLabel text="Identificação" />

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
              Nome da Safra *
            </label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              placeholder="Ex: Safra 2025/26 Soja"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = '#0093D0'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
            {!isEdit && selectedPivotIds.length > 1 && (
              <p style={{ fontSize: 12, color: '#0093D0', marginTop: 4 }}>
                Será criado: "{name} — Pivô A", "{name} — Pivô B"…
              </p>
            )}
          </div>

          {/* Fazenda */}
          <StyledSelect label="Fazenda" value={farmId} onChange={handleFarmChange} required>
            {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </StyledSelect>

          {/* Pivôs — checkboxes na criação, select na edição */}
          {isEdit ? (
            <StyledSelect label="Pivô" value={pivotId} onChange={setPivotId}>
              <option value="">Sem pivô específico</option>
              {farmPivots.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </StyledSelect>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 8 }}>
                Pivôs <span style={{ color: '#94a3b8', fontWeight: 400 }}>(selecione um ou mais)</span>
              </label>
              {farmPivots.length === 0 ? (
                <p style={{ fontSize: 14, color: '#94a3b8', padding: '10px 14px', background: '#0d1520', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.625 }}>
                  Nenhum pivô cadastrado nesta fazenda.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {farmPivots.map(p => {
                    const checked = selectedPivotIds.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePivotToggle(p.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                          borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                          border: `1px solid ${checked ? 'rgba(0,147,208,0.4)' : 'rgba(255,255,255,0.06)'}`,
                          background: checked ? 'rgba(0,147,208,0.08)' : '#0d1520',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                          border: `2px solid ${checked ? '#0093D0' : 'rgba(255,255,255,0.2)'}`,
                          background: checked ? '#0093D0' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>{p.name}</p>
                          {p.field_capacity && (
                            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.625 }}>
                              CC {p.field_capacity}% · PM {p.wilting_point}% · Ds {p.bulk_density}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <SectionLabel text="Cultura e Plantio" />

          <StyledSelect label="Cultura" value={cropId} onChange={setCropId}>
            <option value="">Selecionar cultura...</option>
            {crops.map(c => <option key={c.id} value={c.id}>{c.name}{c.total_cycle_days ? ` — ${c.total_cycle_days} dias` : ''}</option>)}
          </StyledSelect>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Data de Plantio</label>
            <input type="date" value={plantingDate} onChange={e => setPlantingDate(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: plantingDate ? '#e2e8f0' : '#778899', outline: 'none', colorScheme: 'dark' }}
              onFocus={e => e.target.style.borderColor = '#0093D0'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
            {isEdit && plantingDate && plantingDate !== originalPlantingDate && (
              <p style={{ marginTop: 6, fontSize: 12, color: '#f59e0b' }}>
                ⚠ Data alterada — o balanço dos últimos 7 dias será recalculado ao salvar
              </p>
            )}
            {recalcMsg && (
              <p style={{ marginTop: 6, fontSize: 12, color: recalcMsg.startsWith('✓') ? '#22c55e' : '#f59e0b' }}>
                {recalcMsg}
              </p>
            )}
          </div>

          {selectedCrop && plantingDate && (
            <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#0093D0', marginBottom: 2 }}>📅 Cronograma — {selectedCrop.name}</p>
              <PhaseTimeline plantingDate={plantingDate} crop={selectedCrop} />
            </div>
          )}

          <NumField label="ADc Inicial no Plantio (Umidade %)" value={initialAdc} onChange={setInitialAdc}
            placeholder="100" unit="%" hint="% da CTA disponível no momento do plantio (normalmente 100%)" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <NumField label="Fator f base" value={fFactor} onChange={setFFactor}
              placeholder="0.50" hint="Fallback quando a cultura não define fator f por fase" />
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>Observações</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Anotações operacionais da safra"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none', resize: 'vertical' }}
              />
            </div>
          </div>

          <SectionLabel text="Status" />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={() => setIsActive(v => !v)}
              style={{ width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', background: isActive ? '#0093D0' : '#0d1520', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 3, left: isActive ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgb(0 0 0 / 0.4)' }} />
            </button>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{isActive ? 'Safra Ativa' : 'Safra Inativa'}</p>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.625 }}>{isActive ? 'Aparece no Dashboard e Manejo Diário' : 'Arquivada'}</p>
            </div>
          </div>

          <div className="flex gap-3 mt-2 flex-wrap">
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '12px 0', minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 500, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              style={{ flex: 1, padding: '12px 0', minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer', opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loading && <Loader2 size={14} className="animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Mini Wave de umidade ─────────────────────────────────────
function MiniWave({ pct, threshold = 70 }: { pct: number; threshold?: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const color = clamped >= threshold * 1.15 ? '#22c55e'
    : clamped >= threshold ? '#f59e0b'
    : '#ef4444'
  const waveY = 100 - clamped

  return (
    <div style={{ position: 'relative', width: 64, height: 64, borderRadius: 12, overflow: 'hidden', background: 'rgba(0,0,0,0.25)', border: `1px solid ${color}30`, flexShrink: 0 }}>
      <svg width="64" height="64" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <style>{`
            @keyframes wave1 { from { transform: translateX(0) } to { transform: translateX(-50%) } }
            @keyframes wave2 { from { transform: translateX(-50%) } to { transform: translateX(0) } }
          `}</style>
        </defs>
        {/* Onda 1 */}
        <g style={{ animation: 'wave1 3s linear infinite' }}>
          <path d={`M0,${waveY} Q16,${waveY - 6} 32,${waveY} Q48,${waveY + 6} 64,${waveY} Q80,${waveY - 6} 96,${waveY} Q112,${waveY + 6} 128,${waveY} L128,64 L0,64 Z`}
            fill={`${color}30`} />
        </g>
        {/* Onda 2 (offset) */}
        <g style={{ animation: 'wave2 2.2s linear infinite' }}>
          <path d={`M0,${waveY + 2} Q16,${waveY - 4} 32,${waveY + 2} Q48,${waveY + 8} 64,${waveY + 2} Q80,${waveY - 4} 96,${waveY + 2} Q112,${waveY + 8} 128,${waveY + 2} L128,64 L0,64 Z`}
            fill={`${color}20`} />
        </g>
        {/* Linha de superfície */}
        <g style={{ animation: 'wave1 3s linear infinite' }}>
          <path d={`M0,${waveY} Q16,${waveY - 6} 32,${waveY} Q48,${waveY + 6} 64,${waveY} Q80,${waveY - 6} 96,${waveY} Q112,${waveY + 6} 128,${waveY}`}
            fill="none" stroke={color} strokeWidth="1.5" opacity="0.7" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 900, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{Math.round(clamped)}</span>
        <span style={{ fontSize: 11, color: `${color}99`, fontWeight: 600 }}>%</span>
      </div>
    </div>
  )
}

// ─── Card da safra ────────────────────────────────────────────
function SeasonCard({ season, onEdit, onDelete, deleting, onRecalculate, recalculating }: {
  season: SeasonFull; onEdit: () => void; onDelete: () => void; deleting: boolean
  onRecalculate: () => void; recalculating: boolean
}) {
  const [lastRecord, setLastRecord] = useState<Pick<DailyManagement, 'date' | 'field_capacity_percent' | 'etc_mm' | 'eto_mm' | 'needs_irrigation'> | null>(null)
  const [loadingRecord, setLoadingRecord] = useState(season.is_active)

  useEffect(() => {
    if (!season.is_active) return
    let cancelled = false
    getLastManagementBySeason(season.id)
      .then(r => { if (!cancelled) { setLastRecord(r); setLoadingRecord(false) } })
      .catch(() => { if (!cancelled) setLoadingRecord(false) })
    return () => { cancelled = true }
  }, [season.id, season.is_active])

  const totalDays = season.crops
    ? (season.crops.stage1_days ?? 0) + (season.crops.stage2_days ?? 0) + (season.crops.stage3_days ?? 0) + (season.crops.stage4_days ?? 0)
    : 0
  const harvestDate = season.planting_date && totalDays > 0
    ? fmtDate(addDays(new Date(season.planting_date + 'T12:00:00'), totalDays))
    : null
  const peakRoot = season.crops?.root_depth_stage3_cm ?? season.crops?.root_depth_stage1_cm ?? null
  const cta = (season.field_capacity && season.wilting_point && season.bulk_density && peakRoot)
    ? calcCTA(season.field_capacity, season.wilting_point, season.bulk_density, peakRoot)
    : null

  const threshold = 70 // padrão — idealmente viria do pivô
  const pct = lastRecord?.field_capacity_percent ?? null
  const statusColor = pct === null ? '#778899'
    : pct >= threshold * 1.15 ? '#22c55e'
    : pct >= threshold ? '#f59e0b'
    : '#ef4444'

  // Classificação de saúde
  const healthLabel = pct === null ? null
    : pct >= threshold * 1.15 ? 'Ideal'
    : pct >= threshold ? 'Atenção'
    : 'Crítico'
  const healthBg = pct === null ? 'transparent'
    : pct >= threshold * 1.15 ? 'rgba(34,197,94,0.1)'
    : pct >= threshold ? 'rgba(245,158,11,0.1)'
    : 'rgba(239,68,68,0.1)'
  const healthBorder = pct === null ? 'transparent'
    : pct >= threshold * 1.15 ? 'rgba(34,197,94,0.25)'
    : pct >= threshold ? 'rgba(245,158,11,0.25)'
    : 'rgba(239,68,68,0.3)'

  // Texto de interpretação
  const interpretation = pct === null ? null
    : pct >= threshold * 1.15 ? 'Condição hídrica adequada'
    : pct >= threshold ? 'Umidade próxima do limiar'
    : 'Umidade abaixo do ideal'

  const cardBorder = season.is_active
    ? (pct !== null && pct < threshold ? 'rgba(239,68,68,0.3)' : 'rgba(0,147,208,0.2)')
    : 'rgba(255,255,255,0.05)'

  return (
    <div style={{
      background: season.is_active ? 'linear-gradient(145deg, #0f1923, #0c1520)' : '#0c1318',
      border: `1px solid ${cardBorder}`,
      borderRadius: 18,
      padding: '18px 20px',
      boxShadow: season.is_active ? '0 4px 20px rgba(0,0,0,0.3)' : 'none',
      transition: 'box-shadow 0.2s',
    }}>

      {/* ── Linha 1: nome + badges + ações ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Nome */}
          <p style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px', lineHeight: 1.3 }}>{season.name}</p>

          {/* Badge ativa/inativa + status saúde + alerta irrigação */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: season.is_active ? 'rgba(34,197,94,0.10)' : '#0d1520', color: season.is_active ? '#22c55e' : '#667788', border: `1px solid ${season.is_active ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
              {season.is_active ? '● Ativa' : 'Inativa'}
            </span>

            {/* Badge de saúde hídrica */}
            {season.is_active && healthLabel && !loadingRecord && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: healthBg, color: statusColor, border: `1px solid ${healthBorder}`, display: 'flex', alignItems: 'center', gap: 4 }}>
                {healthLabel === 'Ideal'
                  ? <CheckCircle2 size={9} />
                  : healthLabel === 'Crítico'
                  ? <TriangleAlert size={9} />
                  : <AlertTriangle size={9} />
                }
                {healthLabel}
              </span>
            )}

            {/* Badge irrigar */}
            {season.is_active && lastRecord?.needs_irrigation && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={9} /> Irrigar hoje
              </span>
            )}
          </div>
        </div>

        {/* Botões de ação */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {season.is_active && season.planting_date && (
            <button onClick={onRecalculate} disabled={recalculating} title="Recalcular histórico"
              style={{ padding: 8, minHeight: 36, minWidth: 36, borderRadius: 8, border: 'none', cursor: recalculating ? 'default' : 'pointer', background: 'rgba(255,255,255,0.04)', color: '#778899', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { if (!recalculating) { (e.currentTarget as HTMLElement).style.color = '#22c55e'; (e.currentTarget as HTMLElement).style.background = 'rgba(34,197,94,0.1)' } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#778899'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}>
              <RefreshCw size={13} className={recalculating ? 'animate-spin' : ''} />
            </button>
          )}
          <button onClick={onEdit} title="Editar safra"
            style={{ padding: 8, minHeight: 36, minWidth: 36, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: '#778899', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#0093D0'; (e.currentTarget as HTMLElement).style.background = 'rgba(0,147,208,0.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#778899'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}>
            <Pencil size={13} />
          </button>
          <button onClick={onDelete} disabled={deleting} title="Excluir safra"
            style={{ padding: 8, minHeight: 36, minWidth: 36, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: '#778899', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = '#778899' }}>
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>

      {/* ── Linha 2: Umidade destaque + interpretação + ETc ── */}
      {season.is_active && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          {/* Mini-wave */}
          {loadingRecord ? (
            <div style={{ width: 64, height: 64, borderRadius: 12, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Loader2 size={16} className="animate-spin" style={{ color: '#778899' }} />
            </div>
          ) : pct !== null ? (
            <MiniWave pct={pct} threshold={threshold} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 12, background: 'rgba(0,147,208,0.08)', border: '1px solid rgba(0,147,208,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: 2 }}>
              <Sprout size={20} style={{ color: '#0093D0' }} />
              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>SEM DADOS</span>
            </div>
          )}

          {/* Texto ao lado do wave */}
          {!loadingRecord && (
            <div style={{ flex: 1, minWidth: 0 }}>
              {pct !== null ? (
                <>
                  <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 2px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Umidade do solo
                  </p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: statusColor, margin: '0 0 2px', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                    {pct.toFixed(0)}<span style={{ fontSize: 13, fontWeight: 400 }}>%</span>
                  </p>
                  {interpretation && (
                    <p style={{ fontSize: 12, color: statusColor, opacity: 0.85, margin: 0, fontWeight: 500 }}>
                      {interpretation}
                    </p>
                  )}
                  {lastRecord?.etc_mm ? (
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <TrendingDown size={11} style={{ color: '#06b6d4', flexShrink: 0 }} />
                      ETc hoje: <strong style={{ color: '#06b6d4', fontFamily: 'var(--font-mono)', marginLeft: 3 }}>{lastRecord.etc_mm.toFixed(1)} mm</strong>
                    </p>
                  ) : null}
                </>
              ) : (
                <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.625 }}>
                  Nenhum lançamento registrado ainda.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Linha 3: localização + cultura + datas ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {season.farms.name}{season.pivots ? ` · ${season.pivots.name}` : ''}
        </span>
        {season.crops && <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>🌱 {season.crops.name}</span>}
        {season.planting_date && (
          <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
            <CalendarDays size={11} />
            {new Date(season.planting_date + 'T12:00:00').toLocaleDateString('pt-BR')}
            {harvestDate && ` → ${harvestDate}`}
          </span>
        )}
        {lastRecord?.date && (
          <span style={{ fontSize: 12, color: '#64748b' }}>
            · atualizado {new Date(lastRecord.date + 'T12:00:00').toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>

      {/* ── Linha 4: chips de solo ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: season.is_active ? 14 : 0 }}>
        {season.field_capacity && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#0d1520', color: '#64748b', display: 'flex', alignItems: 'center', gap: 2 }}><Droplets size={9} />CC {season.field_capacity}%</span>}
        {season.wilting_point && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#0d1520', color: '#64748b' }}>PM {season.wilting_point}%</span>}
        {season.bulk_density && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#0d1520', color: '#64748b' }}>Ds {season.bulk_density}</span>}
        {cta && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'rgba(0,147,208,0.08)', color: '#0093D0', border: '1px solid rgba(0,147,208,0.18)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}><FlaskConical size={9} />CTA {cta.toFixed(1)} mm</span>}
      </div>

      {/* ── CTA: Abrir manejo ── */}
      {season.is_active && (
        <a
          href={`/manejo?season=${season.id}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
            background: 'rgba(0,147,208,0.1)', color: '#0093D0',
            border: '1px solid rgba(0,147,208,0.22)',
            textDecoration: 'none', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,147,208,0.18)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,147,208,0.4)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,147,208,0.1)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,147,208,0.22)' }}
        >
          Abrir manejo <ArrowRight size={13} />
        </a>
      )}
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────
export default function SafrasPage() {
  const { company, loading: authLoading } = useAuth()
  const [seasons, setSeasons]     = useState<SeasonFull[]>([])
  const [farms, setFarms]         = useState<Farm[]>([])
  const [pivots, setPivots]       = useState<Pivot[]>([])
  const [crops, setCrops]         = useState<Crop[]>([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSeason, setEditingSeason] = useState<SeasonFull | null>(null)
  const [deletingId, setDeletingId]           = useState<string | null>(null)
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null)
  const [pageError, setPageError]             = useState('')

  const loadData = useCallback(async () => {
    if (!company?.id) {
      setSeasons([])
      setFarms([])
      setPivots([])
      setCrops([])
      setLoading(false)
      return
    }

    setLoading(true)
    setPageError('')
    try {
      const farmsData = await listFarmsByCompany(company.id)
      const farmIds = farmsData.map((farm) => farm.id)
      const [seasonsData, pivotsData, cropsData] = await Promise.all([
        listSeasonsByFarmIds(farmIds),
        listPivotsByFarmIds(farmIds),
        listCropsByCompany(company.id),
      ])

      setFarms(farmsData)
      setSeasons(seasonsData as SeasonFull[])
      setPivots(pivotsData)
      setCrops(cropsData)
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Falha ao carregar safras')
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    if (authLoading) return
    loadData()
  }, [authLoading, loadData])

  async function handleRecalculate(id: string) {
    setRecalculatingId(id)
    setPageError('')
    try {
      const res = await fetch('/api/seasons/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season_id: id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao recalcular')
      await loadData()
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Falha ao recalcular histórico')
    } finally {
      setRecalculatingId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta safra? O histórico de manejo será removido.')) return
    setDeletingId(id)
    setPageError('')
    try {
      await deleteSeason(id)
      await loadData()
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Falha ao excluir safra')
    } finally {
      setDeletingId(null)
    }
  }

  const activeSeasons   = seasons.filter(s => s.is_active)
  const inactiveSeasons = seasons.filter(s => !s.is_active)

  function GroupHeader({ label, count }: { label: string; count: number }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#cbd5e1' }}>{label}</span>
        <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: '#0d1520', color: '#64748b' }}>{count}</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {pageError && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444', fontSize: 13 }}>
            {pageError}
          </div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#e2e8f0', fontSize: 24, fontWeight: 600, letterSpacing: '-0.025em' }}>Safras</h1>
            <p className="text-sm mt-0.5" style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.625 }}>
              {activeSeasons.length} ativa{activeSeasons.length !== 1 ? 's' : ''} · {inactiveSeasons.length} arquivada{inactiveSeasons.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => { setEditingSeason(null); setModalOpen(true) }}
            disabled={farms.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, background: farms.length === 0 ? '#0d1520' : '#0093D0', border: 'none', color: farms.length === 0 ? '#778899' : '#fff', cursor: farms.length === 0 ? 'not-allowed' : 'pointer', boxShadow: farms.length === 0 ? 'none' : '0 2px 8px rgb(0 147 208 / 0.25)' }}
          >
            <Plus size={16} /> Nova Safra
          </button>
        </div>

        {authLoading || loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: '#0093D0' }} />
          </div>
        ) : farms.length === 0 ? (
          <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <Sprout size={28} style={{ color: '#0093D0', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Cadastre uma fazenda primeiro</h3>
            <p style={{ fontSize: 14, color: '#778899' }}>Acesse <strong style={{ color: '#8899aa' }}>Configuração → Fazendas</strong> para começar.</p>
          </div>
        ) : seasons.length === 0 ? (
          <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <Sprout size={28} style={{ color: '#0093D0', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Nenhuma safra cadastrada</h3>
            <p style={{ fontSize: 14, color: '#778899', marginBottom: 24 }}>Configure a primeira safra para iniciar o manejo hídrico.</p>
            <button onClick={() => { setEditingSeason(null); setModalOpen(true) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer' }}>
              <Plus size={16} /> Criar Safra
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {activeSeasons.length > 0 && (
              <div>
                <GroupHeader label="Safras Ativas" count={activeSeasons.length} />
                <div className="flex flex-col gap-3">
                  {activeSeasons.map(s => (
                    <SeasonCard key={s.id} season={s}
                      onEdit={() => { setEditingSeason(s); setModalOpen(true) }}
                      onDelete={() => handleDelete(s.id)}
                      deleting={deletingId === s.id}
                      onRecalculate={() => handleRecalculate(s.id)}
                      recalculating={recalculatingId === s.id}
                    />
                  ))}
                </div>
              </div>
            )}
            {inactiveSeasons.length > 0 && (
              <div>
                <GroupHeader label="Arquivadas" count={inactiveSeasons.length} />
                <div className="flex flex-col gap-3">
                  {inactiveSeasons.map(s => (
                    <SeasonCard key={s.id} season={s}
                      onEdit={() => { setEditingSeason(s); setModalOpen(true) }}
                      onDelete={() => handleDelete(s.id)}
                      deleting={deletingId === s.id}
                      onRecalculate={() => handleRecalculate(s.id)}
                      recalculating={recalculatingId === s.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <SeasonModal
          season={editingSeason}
          farms={farms} pivots={pivots} crops={crops}
          onClose={() => setModalOpen(false)}
          onSaved={loadData}
        />
      )}
    </>
  )
}

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import type { Crop } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'
import { createCrop, deleteCrop, listCropsByCompany, updateCrop } from '@/services/crops'
import { Wheat, Plus, Pencil, Trash2, X, Loader2, Lock, ChevronRight, Copy, BookOpen } from 'lucide-react'
import { CROP_PRESETS, type CropPreset } from '@/lib/crop-presets'

// ─── Fases FAO-56 ────────────────────────────────────────────
const STAGES = [
  { key: '1', label: 'Fase 1 — Inicial',       kcKey: 'kc_ini',   kcLabel: 'Kc ini',   hint: 'Kc constante (plano)' },
  { key: '2', label: 'Fase 2 — Desenvolvimento', kcKey: null,       kcLabel: null,       hint: 'Kc interpolado ini→mid' },
  { key: '3', label: 'Fase 3 — Médio',          kcKey: 'kc_mid',   kcLabel: 'Kc mid',   hint: 'Kc constante (plano)' },
  { key: '4', label: 'Fase 4 — Final',          kcKey: 'kc_final', kcLabel: 'Kc final', hint: 'Kc interpolado mid→final' },
] as const

// ─── Input numérico helper ────────────────────────────────────
function NumInput({ label, value, onChange, placeholder, unit, hint, small }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; unit?: string; hint?: string; small?: boolean
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 5 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type="number" step="any" value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: unit ? `${small ? 8 : 10}px ${unit.length > 2 ? 48 : 36}px ${small ? 8 : 10}px 10px` : `${small ? 8 : 10}px 10px`,
            borderRadius: 8, fontSize: small ? 13 : 14,
            background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = '#0093D0'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
        {unit && (
          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#556677', pointerEvents: 'none' }}>
            {unit}
          </span>
        )}
      </div>
      {hint && <p style={{ fontSize: 10, color: '#556677', marginTop: 3 }}>{hint}</p>}
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────
interface CropModalProps { crop: Crop | null; companyId: string; onClose: () => void; onSaved: () => void }

function CropModal({ crop, companyId, onClose, onSaved }: CropModalProps) {
  const isEdit = !!crop
  const [name, setName] = useState(crop?.name ?? '')
  const [kcIni, setKcIni]     = useState(crop?.kc_ini?.toString() ?? '')
  const [kcMid, setKcMid]     = useState(crop?.kc_mid?.toString() ?? '')
  const [kcFinal, setKcFinal] = useState(crop?.kc_final?.toString() ?? '')
  const [s1days, setS1days] = useState(crop?.stage1_days?.toString() ?? '')
  const [s2days, setS2days] = useState(crop?.stage2_days?.toString() ?? '')
  const [s3days, setS3days] = useState(crop?.stage3_days?.toString() ?? '')
  const [s4days, setS4days] = useState(crop?.stage4_days?.toString() ?? '')
  const [rootInitial, setRootInitial]   = useState(crop?.root_initial_depth_cm?.toString() ?? '')
  const [rootRate, setRootRate]         = useState(crop?.root_growth_rate_cm_day?.toString() ?? '')
  const [rootStartDas, setRootStartDas] = useState(crop?.root_start_das?.toString() ?? '')
  const [f1, setF1] = useState(crop?.f_factor_stage1?.toString() ?? '')
  const [f2, setF2] = useState(crop?.f_factor_stage2?.toString() ?? '')
  const [f3, setF3] = useState(crop?.f_factor_stage3?.toString() ?? '')
  const [f4, setF4] = useState(crop?.f_factor_stage4?.toString() ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPresets, setShowPresets] = useState(false)

  function applyPreset(preset: CropPreset) {
    setName(preset.name)
    setKcIni(preset.kc_ini.toString())
    setKcMid(preset.kc_mid.toString())
    setKcFinal(preset.kc_final.toString())
    setS1days(preset.stage1_days.toString())
    setS2days(preset.stage2_days.toString())
    setS3days(preset.stage3_days.toString())
    setS4days(preset.stage4_days.toString())
    setRootInitial(preset.root_initial_depth_cm.toString())
    setRootRate(preset.root_growth_rate_cm_day.toString())
    setRootStartDas(preset.root_start_das.toString())
    setF1(preset.f_factor_stage1.toString())
    setF2(preset.f_factor_stage2.toString())
    setF3(preset.f_factor_stage3.toString())
    setF4(preset.f_factor_stage4.toString())
    setShowPresets(false)
  }

  const totalDays = useMemo(() => {
    const vals = [s1days, s2days, s3days, s4days].map(v => parseInt(v) || 0)
    return vals.reduce((a, b) => a + b, 0)
  }, [s1days, s2days, s3days, s4days])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setLoading(true)

    const payload = {
      name: name.trim(),
      company_id: companyId,
      kc_ini:   kcIni   ? Number(kcIni)   : null,
      kc_mid:   kcMid   ? Number(kcMid)   : null,
      kc_final: kcFinal ? Number(kcFinal) : null,
      stage1_days: s1days ? Number(s1days) : null,
      stage2_days: s2days ? Number(s2days) : null,
      stage3_days: s3days ? Number(s3days) : null,
      stage4_days: s4days ? Number(s4days) : null,
      root_initial_depth_cm:   rootInitial   ? Number(rootInitial)   : null,
      root_growth_rate_cm_day: rootRate      ? Number(rootRate)      : null,
      root_start_das:          rootStartDas  ? Number(rootStartDas)  : null,
      f_factor_stage1: f1 ? Number(f1) : null,
      f_factor_stage2: f2 ? Number(f2) : null,
      f_factor_stage3: f3 ? Number(f3) : null,
      f_factor_stage4: f4 ? Number(f4) : null,
      total_cycle_days: totalDays > 0 ? totalDays : null,
    }

    try {
      if (isEdit) {
        await updateCrop(crop.id, payload)
      } else {
        await createCrop(payload)
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar cultura')
    } finally {
      setLoading(false)
    }
  }

  const stageData = [
    { label: 'Fase 1 — Inicial',         days: s1days, setDays: setS1days, f: f1, setF: setF1, kc: kcIni,   setKc: setKcIni,   kcLabel: 'Kc ini',   hint: 'constante' },
    { label: 'Fase 2 — Desenvolvimento', days: s2days, setDays: setS2days, f: f2, setF: setF2, kc: null,    setKc: null,       kcLabel: null,       hint: 'interpolado' },
    { label: 'Fase 3 — Médio',           days: s3days, setDays: setS3days, f: f3, setF: setF3, kc: kcMid,   setKc: setKcMid,   kcLabel: 'Kc mid',   hint: 'constante' },
    { label: 'Fase 4 — Final',           days: s4days, setDays: setS4days, f: f4, setF: setF4, kc: kcFinal, setKc: setKcFinal, kcLabel: 'Kc final', hint: 'interpolado' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgb(0 0 0 / 0.75)' }}>
      <div style={{
        background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 28,
        width: '100%', maxWidth: 560, boxShadow: '0 20px 48px -8px rgb(0 0 0 / 0.6)',
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{isEdit ? 'Editar Cultura' : 'Nova Cultura'}</h2>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: '#556677', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Nome */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>Nome da Cultura *</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} required
              placeholder="Ex: Soja, Milho Safrinha..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = '#0093D0'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          {/* Preset FAO-56 */}
          {!isEdit && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowPresets(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  borderRadius: 10, fontSize: 12, fontWeight: 600,
                  background: 'rgb(0 147 208 / 0.08)', border: '1px solid rgb(0 147 208 / 0.2)',
                  color: '#0093D0', cursor: 'pointer',
                }}
              >
                <BookOpen size={13} />
                Usar preset FAO-56
                <ChevronRight size={12} style={{ transform: showPresets ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
              {showPresets && (
                <div style={{
                  marginTop: 6, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, overflow: 'hidden', maxHeight: 240, overflowY: 'auto',
                }}>
                  {CROP_PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      style={{
                        width: '100%', padding: '8px 14px', textAlign: 'left', cursor: 'pointer',
                        background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>{preset.name}</span>
                      <span style={{ fontSize: 11, color: '#556677' }}>
                        Kc {preset.kc_ini}/{preset.kc_mid}/{preset.kc_final} · {preset.stage1_days + preset.stage2_days + preset.stage3_days + preset.stage4_days}d
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Crescimento de Raiz */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#556677' }}>
                Crescimento de Raiz
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
            </div>
            <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <NumInput
                  label="Prof. inicial" value={rootInitial} onChange={setRootInitial}
                  placeholder="5" unit="cm"
                  hint="Ao germinar"
                />
                <NumInput
                  label="Taxa crescimento" value={rootRate} onChange={setRootRate}
                  placeholder="1.0" unit="cm/d"
                  hint="Máx efetivo: 40 cm"
                />
                <NumInput
                  label="Início (DAS)" value={rootStartDas} onChange={setRootStartDas}
                  placeholder="4" unit="DAS"
                  hint="Após germinação"
                />
              </div>
            </div>
          </div>

          {/* 4 Fases */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#556677' }}>
                Fases de Desenvolvimento — FAO-56
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
              {totalDays > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#0093D0' }}>Ciclo: {totalDays} dias</span>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {stageData.map((stage, i) => (
                <div key={i} style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
                  {/* Título da fase */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: 'rgb(0 147 208 / 0.12)', border: '1px solid rgb(0 147 208 / 0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: '#0093D0',
                    }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#8899aa' }}>{stage.label}</span>
                    <span style={{ fontSize: 10, color: '#556677', marginLeft: 4 }}>Kc {stage.hint}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: stage.kcLabel ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
                    <NumInput
                      label="Duração" value={stage.days} onChange={stage.setDays}
                      placeholder="dias" unit="dias" small
                    />
                    <NumInput
                      label="Fator f" value={stage.f} onChange={stage.setF}
                      placeholder="0.00" small hint="0-1"
                    />
                    {stage.kcLabel && stage.setKc && (
                      <NumInput
                        label={stage.kcLabel} value={stage.kc ?? ''} onChange={stage.setKc}
                        placeholder="0.00" small
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 500, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer', opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loading && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Card cultura na lista ────────────────────────────────────
function CropCard({ crop, isCustom, onEdit, onDelete, onDuplicate, deleting }: {
  crop: Crop; isCustom: boolean
  onEdit: () => void; onDelete: () => void; onDuplicate: () => void; deleting: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const sumDays = (crop.stage1_days ?? 0) + (crop.stage2_days ?? 0) + (crop.stage3_days ?? 0) + (crop.stage4_days ?? 0)
  const totalDays = crop.total_cycle_days ?? (sumDays > 0 ? sumDays : null)

  const hasStages = crop.stage1_days || crop.stage2_days || crop.stage3_days || crop.stage4_days

  const stageRows = [
    { label: 'Fase 1', days: crop.stage1_days, f: crop.f_factor_stage1, kc: crop.kc_ini,   kcLabel: 'Kc ini',      hint: 'constante' },
    { label: 'Fase 2', days: crop.stage2_days, f: crop.f_factor_stage2, kc: null,          kcLabel: 'interpolado', hint: '' },
    { label: 'Fase 3', days: crop.stage3_days, f: crop.f_factor_stage3, kc: crop.kc_mid,   kcLabel: 'Kc mid',      hint: 'constante' },
    { label: 'Fase 4', days: crop.stage4_days, f: crop.f_factor_stage4, kc: crop.kc_final, kcLabel: 'Kc final',    hint: 'interpolado' },
  ]

  const hasRootGrowth = crop.root_growth_rate_cm_day != null

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 }}>
      {/* Linha principal */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'rgb(0 147 208 / 0.10)', border: '1px solid rgb(0 147 208 / 0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Wheat size={16} style={{ color: '#0093D0' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{crop.name}</p>
            {!isCustom && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 3, background: '#0d1520', color: '#556677', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Lock size={9} /> padrão FAO-56
              </span>
            )}
            {totalDays ? <span style={{ fontSize: 11, color: '#556677' }}>{totalDays} dias</span> : null}
          </div>
          {/* Kc resumo */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: 'Kc ini',   value: crop.kc_ini },
              { label: 'Kc mid',   value: crop.kc_mid },
              { label: 'Kc final', value: crop.kc_final },
            ].filter(k => k.value !== null).map(k => (
              <div key={k.label} style={{ background: '#0d1520', borderRadius: 7, padding: '5px 10px', textAlign: 'center' }}>
                <span style={{ fontSize: 9, color: '#556677', display: 'block' }}>{k.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>{k.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasStages && (
            <button onClick={() => setExpanded(v => !v)} title="Ver fases"
              style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0d1520', color: '#0093D0', display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={14} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
          )}
          {isCustom ? (
            <>
              <button onClick={onEdit} title="Editar"
                style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0d1520', color: '#8899aa' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#0d1520'; (e.currentTarget as HTMLElement).style.color = '#8899aa' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0d1520'; (e.currentTarget as HTMLElement).style.color = '#8899aa' }}>
                <Pencil size={14} />
              </button>
              <button onClick={onDelete} disabled={deleting} title="Excluir"
                style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0d1520', color: '#8899aa' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgb(239 68 68 / 0.1)'; (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0d1520'; (e.currentTarget as HTMLElement).style.color = '#8899aa' }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </>
          ) : (
            <button onClick={onDuplicate} title="Duplicar para minhas culturas"
              style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0d1520', color: '#8899aa' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgb(0 147 208 / 0.10)'; (e.currentTarget as HTMLElement).style.color = '#0093D0' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#0d1520'; (e.currentTarget as HTMLElement).style.color = '#8899aa' }}>
              <Copy size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Detalhes expandíveis das fases */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '14px 18px' }}>
          {/* Crescimento de raiz */}
          {hasRootGrowth && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Prof. inicial', value: crop.root_initial_depth_cm != null ? `${crop.root_initial_depth_cm} cm` : '—' },
                { label: 'Taxa', value: crop.root_growth_rate_cm_day != null ? `${crop.root_growth_rate_cm_day} cm/dia` : '—' },
                { label: 'Início', value: crop.root_start_das != null ? `DAS ${crop.root_start_das}` : '—' },
                { label: 'Máx. efetivo', value: '40 cm' },
              ].map(item => (
                <div key={item.label} style={{ background: '#0d1520', borderRadius: 8, padding: '6px 12px' }}>
                  <span style={{ fontSize: 9, color: '#556677', display: 'block', marginBottom: 2 }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', fontFamily: 'var(--font-mono)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 55px 55px 70px', minWidth: 320, background: '#0d1520', padding: '8px 14px', gap: 8 }}>
              {['Fase', 'Descrição', 'Dias', 'Fator f', 'Kc'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>
            {stageRows.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 55px 55px 70px', minWidth: 320, padding: '10px 14px', gap: 8, borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? '#080e14' : 'transparent' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#0093D0' }}>Fase {i + 1}</span>
                <span style={{ fontSize: 12, color: '#8899aa' }}>{['Inicial', 'Desenvolvimento', 'Médio', 'Final'][i]} <span style={{ color: '#556677', fontSize: 10 }}>{row.hint ? `(${row.hint})` : ''}</span></span>
                <span style={{ fontSize: 13, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{row.days ?? '—'}</span>
                <span style={{ fontSize: 13, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{row.f ?? '—'}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: row.kc ? '#0093D0' : '#556677', fontFamily: 'var(--font-mono)' }}>{row.kc ?? row.kcLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────
export default function CulturasPage() {
  const { company, loading: authLoading } = useAuth()
  const [crops, setCrops] = useState<Crop[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCrop, setEditingCrop] = useState<Crop | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadCrops = useCallback(async () => {
    if (!company?.id) {
      setCrops([])
      setLoading(false)
      return
    }

    setLoading(true)
    setPageError(null)
    try {
      const data = await listCropsByCompany(company.id)
      setCrops(data)
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Falha ao carregar culturas.')
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    if (authLoading) return
    loadCrops()
  }, [authLoading, loadCrops])

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta cultura?')) return
    setDeletingId(id)
    try {
      await deleteCrop(id)
      await loadCrops()
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Falha ao excluir cultura.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleDuplicate(crop: Crop) {
    if (!company?.id) return

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, company_id: _cid, ...rest } = crop
    const newCrop = await createCrop({
      ...rest,
      name: `${crop.name} (cópia)`,
      company_id: company.id,
    }).catch(() => null)
    if (newCrop) {
      await loadCrops()
      setEditingCrop(newCrop)
      setModalOpen(true)
    }
  }

  const defaultCrops = crops.filter(c => c.company_id === null)
  const customCrops  = crops.filter(c => c.company_id === company?.id)

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>Culturas</h1>
            <p className="text-sm mt-0.5" style={{ color: '#8899aa' }}>
              {defaultCrops.length} padrão · {customCrops.length} personalizada{customCrops.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => { setEditingCrop(null); setModalOpen(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgb(0 147 208 / 0.25)' }}
          >
            <Plus size={16} />
            Nova Cultura
          </button>
        </div>

        {pageError && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 13 }}>
            {pageError}
          </div>
        )}

        {authLoading || loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: '#0093D0' }} />
          </div>
        ) : (
          <>
            {customCrops.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#556677' }}>Minhas Culturas</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                </div>
                <div className="flex flex-col gap-3">
                  {customCrops.map(c => (
                    <CropCard key={c.id} crop={c} isCustom
                      onEdit={() => { setEditingCrop(c); setModalOpen(true) }}
                      onDelete={() => handleDelete(c.id)}
                      onDuplicate={() => handleDuplicate(c)}
                      deleting={deletingId === c.id}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#556677' }}>Culturas Padrão FAO-56</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
              </div>
              <div className="flex flex-col gap-3">
                {defaultCrops.map(c => (
                  <CropCard key={c.id} crop={c} isCustom={false}
                    onEdit={() => {}} onDelete={() => {}} onDuplicate={() => handleDuplicate(c)} deleting={false}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        company?.id && (
        <CropModal
          crop={editingCrop}
          companyId={company.id}
          onClose={() => setModalOpen(false)}
          onSaved={loadCrops}
        />
        )
      )}
    </>
  )
}

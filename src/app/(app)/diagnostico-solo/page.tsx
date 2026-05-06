'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import type { Pivot, Farm, Season } from '@/types/database'
import {
  calcDiagnosis,
  SCORE_DESCRIPTIONS,
  SCORE_LABELS,
  RESULT_META,
  ALL_TEXTURES,
  TEXTURE_LABELS,
  type SoilTexture,
  type DiagnosisResult,
  type DiagnosisOutput,
} from '@/lib/soil-diagnosis'
import {
  Loader2, ChevronDown, CheckCircle2, AlertTriangle, AlertCircle,
  Droplets, Layers, Camera, ClipboardList, ArrowLeft, ArrowRight,
  RotateCcw, Save, X, ChevronRight, History, Sprout, ExternalLink,
} from 'lucide-react'
import Link from 'next/link'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DiagnosisRecord {
  id: string
  pivot_id: string
  season_id: string | null
  diagnosed_at: string
  depth_0_20_score: number
  depth_20_40_score: number
  depth_40_60_score: number
  weighted_score: number
  result: DiagnosisResult
  estimated_fc_percent: number
  notes: string | null
  photo_url: string | null
  pivots?: { name: string }
}

interface DepthScoreValue {
  '0-20': number
  '20-40': number
  '40-60': number
}

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Seleção', icon: Sprout },
  { id: 2, label: '0-20 cm', icon: Layers },
  { id: 3, label: '20-40 cm', icon: Layers },
  { id: 4, label: '40-60 cm', icon: Layers },
  { id: 5, label: 'Resultado', icon: ClipboardList },
]

// ─── Score Card ───────────────────────────────────────────────────────────────

function ScoreOption({
  score,
  texture,
  selected,
  onSelect,
}: {
  score: 1 | 2 | 3 | 4 | 5
  texture: SoilTexture
  selected: boolean
  onSelect: () => void
}) {
  const colors: Record<number, { border: string; bg: string; dot: string }> = {
    1: { border: '#ef4444', bg: 'rgba(239,68,68,0.08)', dot: '#ef4444' },
    2: { border: '#f97316', bg: 'rgba(249,115,22,0.08)', dot: '#f97316' },
    3: { border: '#38bdf8', bg: 'rgba(56,189,248,0.08)', dot: '#38bdf8' },
    4: { border: '#22c55e', bg: 'rgba(34,197,94,0.08)', dot: '#22c55e' },
    5: { border: '#a78bfa', bg: 'rgba(167,139,250,0.08)', dot: '#a78bfa' },
  }
  const c = colors[score]

  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        padding: '14px 16px',
        borderRadius: 10,
        border: `1.5px solid ${selected ? c.border : 'rgba(255,255,255,0.07)'}`,
        background: selected ? c.bg : 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
    >
      {/* dot de cor */}
      <span style={{
        width: 10, height: 10, borderRadius: '50%',
        background: c.dot, flexShrink: 0, marginTop: 4,
      }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: selected ? c.dot : '#e2e8f0', marginBottom: 3 }}>
          {score} — {SCORE_LABELS[score]}
        </div>
        <div style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.5 }}>
          {SCORE_DESCRIPTIONS[texture][score]}
        </div>
      </div>
      {selected && (
        <CheckCircle2 size={16} style={{ color: c.dot, flexShrink: 0, marginLeft: 'auto', marginTop: 2 }} />
      )}
    </button>
  )
}

// ─── Result badge ─────────────────────────────────────────────────────────────

function ResultBadge({ result, size = 'md' }: { result: DiagnosisResult; size?: 'sm' | 'md' }) {
  const meta = RESULT_META[result]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: size === 'sm' ? '2px 8px' : '4px 12px',
      borderRadius: 99,
      background: `${meta.color}18`,
      border: `1px solid ${meta.color}40`,
      color: meta.color,
      fontWeight: 600,
      fontSize: size === 'sm' ? 11 : 13,
    }}>
      {meta.icon} {meta.label}
    </span>
  )
}

// ─── Dropdown customizado (mobile-safe) ───────────────────────────────────────

function DropdownSelect({
  label, value, placeholder, options, onChange, emptyMsg, style,
}: {
  label: string
  value: string
  placeholder: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
  emptyMsg?: string
  style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  // Fecha ao clicar fora
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <span style={{ fontSize: 12, color: '#8899aa', fontWeight: 500, display: 'block', marginBottom: 6 }}>
        {label}
      </span>
      {options.length === 0 && emptyMsg ? (
        <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#778899', fontSize: 13 }}>
          {emptyMsg}
        </div>
      ) : (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              width: '100%', padding: '10px 36px 10px 12px',
              borderRadius: 8, border: `1px solid ${open ? '#0093D0' : 'rgba(255,255,255,0.1)'}`,
              background: '#0d1520', color: selected ? '#e2e8f0' : '#778899',
              fontSize: 14, cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <span>{selected ? selected.label : placeholder}</span>
            <ChevronDown size={14} color="#778899" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
              background: '#0d1520', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              maxHeight: 240, overflowY: 'auto',
            }}>
              {!value && (
                <button
                  onClick={() => { onChange(''); setOpen(false) }}
                  style={{
                    width: '100%', padding: '10px 14px', border: 'none',
                    background: 'transparent', color: '#8899aa',
                    fontSize: 13, cursor: 'pointer', textAlign: 'left',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  {placeholder}
                </button>
              )}
              {options.map((o, i) => (
                <button
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  style={{
                    width: '100%', padding: '10px 14px', border: 'none',
                    background: value === o.value ? 'rgba(0,147,208,0.15)' : 'transparent',
                    color: value === o.value ? '#38bdf8' : '#e2e8f0',
                    fontSize: 14, fontWeight: value === o.value ? 600 : 400,
                    cursor: 'pointer', textAlign: 'left',
                    borderBottom: i < options.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span>{o.label}</span>
                  {value === o.value && <CheckCircle2 size={14} color="#0093D0" />}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DiagnosticoSoloPage() {
  const { company } = useAuth()
  const companyId = company?.id ?? null
  const supabase = createClient()

  // Estado do wizard
  const [step, setStep] = useState(1)
  const [pivots, setPivots] = useState<Pivot[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedPivotId, setSelectedPivotId] = useState('')
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [texture, setTexture] = useState<SoilTexture>('franco')
  const [scores, setScores] = useState<DepthScoreValue>({ '0-20': 0, '20-40': 0, '40-60': 0 })
  const [notes, setNotes] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingStep, setSavingStep] = useState<'upload' | 'gemini' | 'saving' | null>(null)
  const [diagnosis, setDiagnosis] = useState<DiagnosisOutput | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [aiValidation, setAiValidation] = useState<{
    agrees: boolean
    confidence: number
    estimated: number
    notes: string
  } | null>(null)

  // Histórico
  const [history, setHistory] = useState<DiagnosisRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  // ─── Load pivots & history ────────────────────────────────────────────────

  useEffect(() => {
    if (!companyId) return

    async function load() {
      const [{ data: farmsData }, { data: pivotsData }, { data: histData }] = await Promise.all([
        supabase.from('farms').select('*').eq('company_id', companyId!),
        supabase.from('pivots').select('*, farms!inner(company_id)').eq('farms.company_id', companyId!),
        supabase
          .from('soil_manual_diagnosis')
          .select('*, pivots(name)')
          .eq('company_id', companyId!)
          .order('diagnosed_at', { ascending: false })
          .limit(30),
      ])
      setFarms(farmsData ?? [])
      setPivots(pivotsData ?? [])
      setHistory(histData ?? [])
      setLoadingHistory(false)
    }

    load()
  }, [companyId])

  // Safras do pivô selecionado
  useEffect(() => {
    if (!selectedPivotId) { setSeasons([]); return }
    supabase
      .from('seasons')
      .select('*')
      .eq('pivot_id', selectedPivotId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSeasons(data ?? [])
        if (data && data.length === 1) setSelectedSeasonId(data[0].id)
      })
  }, [selectedPivotId])

  // Calcula diagnóstico sempre que os scores mudarem
  useEffect(() => {
    const { '0-20': s1, '20-40': s2, '40-60': s3 } = scores
    if (s1 && s2 && s3) {
      const result = calcDiagnosis({
        texture,
        depth_0_20_score: s1 as 1|2|3|4|5,
        depth_20_40_score: s2 as 1|2|3|4|5,
        depth_40_60_score: s3 as 1|2|3|4|5,
      })
      setDiagnosis(result)
    } else {
      setDiagnosis(null)
    }
  }, [scores, texture])

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const selectedPivot = pivots.find(p => p.id === selectedPivotId)
  const farmName = selectedPivot
    ? farms.find(f => f.id === (selectedPivot as unknown as { farm_id: string }).farm_id)?.name ?? ''
    : ''

  const depthLabels: Array<keyof DepthScoreValue> = ['0-20', '20-40', '40-60']
  const currentDepth = depthLabels[step - 2] // step 2→0-20, 3→20-40, 4→40-60

  const canProceed = (() => {
    if (step === 1) return !!selectedPivotId
    if (step === 2) return scores['0-20'] > 0
    if (step === 3) return scores['20-40'] > 0
    if (step === 4) return scores['0-20'] > 0 && scores['20-40'] > 0 && scores['40-60'] > 0
    return true
  })()

  // ─── Foto ───────────────────────────────────────────────────────────────────

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  // ─── Salvar (com upload + Gemini) ────────────────────────────────────────────

  async function handleSave() {
    if (!diagnosis || !selectedPivotId || !companyId) return
    setSaving(true)
    setAiValidation(null)

    try {
      // ── 1. Upload da foto ────────────────────────────────────────────────────
      let photo_url: string | null = null
      let photoBase64: string | null = null

      if (photoFile) {
        setSavingStep('upload')
        const ext = photoFile.name.split('.').pop() ?? 'jpg'
        const path = `${companyId}/${selectedPivotId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('soil-diagnosis-photos')
          .upload(path, photoFile, { upsert: false })
        if (!upErr) {
          const { data: urlData } = supabase.storage
            .from('soil-diagnosis-photos')
            .getPublicUrl(path)
          photo_url = urlData.publicUrl

          // Converte para base64 para enviar ao Gemini
          const buf = await photoFile.arrayBuffer()
          const bytes = new Uint8Array(buf)
          let binary = ''
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
          photoBase64 = btoa(binary)
        }
      }

      // ── 2. Análise Gemini (se tiver foto) ────────────────────────────────────
      let aiResult: typeof aiValidation = null

      if (photoBase64) {
        setSavingStep('gemini')
        try {
          // Chama a Edge Function como proxy (evita expor GEMINI_API_KEY no frontend)
          const { data: { session } } = await supabase.auth.getSession()
          const resp = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/diagnose-soil`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({
                pivot_id: selectedPivotId,
                season_id: selectedSeasonId || null,
                sample_depth_cm: 30,
                soil_texture: texture,
                behavior_range: diagnosis.weighted_score,
                photo_base64: photoBase64,
                photo_mime: photoFile!.type || 'image/jpeg',
                photo_url,
                source: 'web',
                company_id: companyId,
                dry_run: true, // não salva de novo — só retorna ai_analysis
              }),
            }
          )
          if (resp.ok) {
            const result = await resp.json()
            if (result.ai_validation) {
              aiResult = {
                agrees: result.ai_validation.agrees,
                confidence: result.ai_validation.confidence,
                estimated: result.ai_validation.estimated_behavior_range ?? diagnosis.weighted_score,
                notes: result.ai_validation.notes,
              }
              setAiValidation(aiResult)
            }
          }
        } catch (_) {
          // Gemini falhou — continua sem validação de foto
        }
      }

      // ── 3. Salvar no banco ───────────────────────────────────────────────────
      setSavingStep('saving')
      const notesStr = [
        notes.trim(),
        aiResult ? `IA: ${aiResult.confidence}% confiança${aiResult.agrees ? ' ✓' : ` — sugere faixa ${aiResult.estimated.toFixed(1)}`}` : '',
      ].filter(Boolean).join(' | ')

      const { data, error } = await supabase
        .from('soil_manual_diagnosis')
        .insert({
          company_id: companyId,
          pivot_id: selectedPivotId,
          season_id: selectedSeasonId || null,
          diagnosed_by: (await supabase.auth.getUser()).data.user?.id,
          depth_0_20_score: scores['0-20'],
          depth_20_40_score: scores['20-40'],
          depth_40_60_score: scores['40-60'],
          weighted_score: diagnosis.weighted_score,
          result: diagnosis.result,
          estimated_fc_percent: diagnosis.estimated_fc_percent,
          notes: notesStr || null,
          photo_url,
        })
        .select('id')
        .single()

      if (!error && data) {
        setSavedId(data.id)
        const { data: histData } = await supabase
          .from('soil_manual_diagnosis')
          .select('*, pivots(name)')
          .eq('company_id', companyId)
          .order('diagnosed_at', { ascending: false })
          .limit(30)
        setHistory(histData ?? [])
      }
    } finally {
      setSaving(false)
      setSavingStep(null)
    }
  }

  // ─── Reset ──────────────────────────────────────────────────────────────────

  function handleReset() {
    setStep(1)
    setSelectedPivotId('')
    setSelectedSeasonId('')
    setScores({ '0-20': 0, '20-40': 0, '40-60': 0 })
    setNotes('')
    setPhotoFile(null)
    setPhotoPreview(null)
    setDiagnosis(null)
    setSavedId(null)
    setAiValidation(null)
    setSavingStep(null)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 24px 80px', maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{
            fontSize: 24, fontWeight: 700, color: '#e2e8f0',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Droplets size={22} color="#38bdf8" />
            Diagnóstico Manual do Solo
          </h1>
          <p style={{ color: '#8899aa', fontSize: 13, marginTop: 4 }}>
            Método USDA/NRCS — Tato e aparência por profundidade
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        marginBottom: 28, background: '#0f1923',
        borderRadius: 12, padding: '10px 16px',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {STEPS.map((s, i) => {
          const active = step === s.id
          const done = step > s.id
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? '#0093D018' : active ? '#0093D0' : 'rgba(255,255,255,0.06)',
                  border: `2px solid ${done ? '#0093D0' : active ? '#0093D0' : 'transparent'}`,
                  color: done ? '#0093D0' : active ? '#fff' : '#778899',
                  fontSize: 11, fontWeight: 700,
                  transition: 'all 0.2s',
                }}>
                  {done ? <CheckCircle2 size={14} /> : s.id}
                </div>
                <span style={{ fontSize: 10, color: active ? '#e2e8f0' : '#778899', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 2, margin: '0 4px', marginBottom: 14,
                  background: done ? '#0093D0' : 'rgba(255,255,255,0.06)',
                  transition: 'background 0.2s',
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Seleção ──────────────────────────────────────── */}
      {step === 1 && (
        <div style={{
          background: '#0f1923', borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.06)', padding: 24,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 18 }}>
            Selecionar Pivô e Textura do Solo
          </h2>

          {/* Pivô */}
          <DropdownSelect
            label="Pivô *"
            value={selectedPivotId}
            placeholder="Selecione um pivô…"
            options={pivots.map(p => ({ value: p.id, label: p.name }))}
            onChange={v => { setSelectedPivotId(v); setSelectedSeasonId('') }}
            emptyMsg="Nenhum pivô cadastrado"
            style={{ marginBottom: 16 }}
          />

          {/* Safra (opcional) */}
          {seasons.length > 0 && (
            <DropdownSelect
              label="Safra (opcional)"
              value={selectedSeasonId}
              placeholder="Sem safra"
              options={seasons.map(s => ({ value: s.id, label: s.name }))}
              onChange={v => setSelectedSeasonId(v)}
              style={{ marginBottom: 16 }}
            />
          )}

          {/* Textura */}
          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 12, color: '#8899aa', fontWeight: 500, display: 'block', marginBottom: 8 }}>
              Textura do Solo *
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
              {ALL_TEXTURES.map(t => (
                <button
                  key={t}
                  onClick={() => setTexture(t)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1.5px solid ${texture === t ? '#0093D0' : 'rgba(255,255,255,0.07)'}`,
                    background: texture === t ? 'rgba(0,147,208,0.12)' : 'rgba(255,255,255,0.02)',
                    color: texture === t ? '#38bdf8' : '#8899aa',
                    fontSize: 12, fontWeight: texture === t ? 600 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {TEXTURE_LABELS[t]}
                </button>
              ))}
            </div>
          </label>

          {/* Dica */}
          <div style={{
            marginTop: 20, padding: '12px 14px',
            background: 'rgba(0,147,208,0.06)', borderRadius: 8,
            border: '1px solid rgba(0,147,208,0.15)',
          }}>
            <p style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.6 }}>
              <strong style={{ color: '#38bdf8' }}>Como usar:</strong> Colete amostras de solo nas
              profundidades 0-20, 20-40 e 40-60 cm. Aperte cada amostra na mão e observe a
              resposta conforme as opções de cada etapa.
            </p>
          </div>
        </div>
      )}

      {/* ── Steps 2-4: Profundidades ───────────────────────────────── */}
      {(step === 2 || step === 3 || step === 4) && (
        <div style={{
          background: '#0f1923', borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.06)', padding: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Layers size={18} color="#0093D0" />
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>
              Profundidade {currentDepth} cm
            </h2>
          </div>
          <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 20 }}>
            Como está o solo coletado a <strong style={{ color: '#e2e8f0' }}>{currentDepth} cm</strong> de profundidade?
            Textura: <strong style={{ color: '#38bdf8' }}>{TEXTURE_LABELS[texture]}</strong>
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {([1, 2, 3, 4, 5] as const).map(score => (
              <ScoreOption
                key={score}
                score={score}
                texture={texture}
                selected={scores[currentDepth] === score}
                onSelect={() => setScores(prev => ({ ...prev, [currentDepth]: score }))}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Step 5: Resultado ────────────────────────────────────────── */}
      {step === 5 && !diagnosis && (
        <div style={{ padding: 32, textAlign: 'center', color: '#778899', fontSize: 14 }}>
          <p>Scores incompletos. <button onClick={() => setStep(2)} style={{ color: '#0093D0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Voltar ao início</button></p>
        </div>
      )}
      {step === 5 && diagnosis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Card resultado principal */}
          <div style={{
            background: '#0f1923', borderRadius: 14,
            border: `1.5px solid ${diagnosis.color}40`, padding: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: '#8899aa', marginBottom: 4 }}>
                  {selectedPivot?.name} {farmName && `— ${farmName}`}
                </div>
                <ResultBadge result={diagnosis.result} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'monospace', color: diagnosis.color }}>
                  {diagnosis.estimated_fc_percent}%
                </div>
                <div style={{ fontSize: 11, color: '#778899' }}>da CC estimada</div>
              </div>
            </div>

            {/* Barra visual */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#778899' }}>PM (0%)</span>
                <span style={{ fontSize: 11, color: '#778899' }}>CC (100%)</span>
              </div>
              <div style={{ height: 10, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${diagnosis.estimated_fc_percent}%`,
                  background: `linear-gradient(90deg, ${diagnosis.color}88, ${diagnosis.color})`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              {/* Marcador de alerta 70% */}
              <div style={{ position: 'relative', height: 12 }}>
                <div style={{
                  position: 'absolute', left: '70%', top: 0,
                  width: 1, height: 8, background: '#f59e0b',
                }} />
                <span style={{
                  position: 'absolute', left: '70%', top: 8,
                  transform: 'translateX(-50%)', fontSize: 9, color: '#f59e0b',
                }}>70%</span>
              </div>
            </div>

            {/* Recomendação */}
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              background: `${diagnosis.color}0d`,
              border: `1px solid ${diagnosis.color}30`,
            }}>
              <p style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.6 }}>
                {diagnosis.recommendation}
              </p>
            </div>
          </div>

          {/* Resumo por profundidade */}
          <div style={{
            background: '#0f1923', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.06)', padding: 20,
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#8899aa', marginBottom: 14 }}>
              Resumo por profundidade
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(['0-20', '20-40', '40-60'] as const).map((depth, i) => {
                const scoreVal = scores[depth]
                const weight = [0.40, 0.35, 0.25][i]
                const scoreColors: Record<number, string> = { 1: '#ef4444', 2: '#f97316', 3: '#38bdf8', 4: '#22c55e', 5: '#a78bfa' }
                return (
                  <div key={depth} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 60, fontSize: 12, color: '#778899', fontWeight: 500 }}>{depth} cm</div>
                    <div style={{
                      flex: 1, height: 6, borderRadius: 99,
                      background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 99,
                        width: `${(scoreVal / 5) * 100}%`,
                        background: scoreColors[scoreVal] ?? '#778899',
                      }} />
                    </div>
                    <div style={{ width: 24, textAlign: 'right', fontSize: 13, fontWeight: 700, color: scoreColors[scoreVal] ?? '#778899' }}>
                      {scoreVal}
                    </div>
                    <div style={{ width: 40, fontSize: 11, color: '#778899' }}>({Math.round(weight * 100)}%)</div>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#8899aa' }}>Score ponderado</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: diagnosis.color }}>{diagnosis.weighted_score.toFixed(2)}</span>
            </div>
          </div>

          {/* Foto e observações */}
          <div style={{
            background: '#0f1923', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.06)', padding: 20,
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#8899aa', marginBottom: 14 }}>
              Foto e Observações <span style={{ fontSize: 11, fontWeight: 400 }}>(opcional)</span>
            </h3>

            {/* Foto */}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} style={{ display: 'none' }} />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', padding: '12px',
                borderRadius: 8, marginBottom: 12,
                border: '1px dashed rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.02)',
                color: '#8899aa', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Camera size={16} />
              {photoFile ? photoFile.name : 'Adicionar foto do solo'}
            </button>
            {photoPreview && (
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <img src={photoPreview} alt="Preview" style={{ width: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'cover' }} />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', border: 'none',
                    cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Notas */}
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observações adicionais… (ex: solo seco na camada superficial, sinais de compactação)"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px',
                background: '#0d1520', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: '#e2e8f0', fontSize: 13,
                resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
          </div>

          {/* Validação IA — aparece após salvar com foto */}
          {aiValidation && (
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              background: aiValidation.agrees ? 'rgba(56,189,248,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${aiValidation.agrees ? 'rgba(56,189,248,0.3)' : 'rgba(245,158,11,0.3)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{aiValidation.agrees ? '📷' : '⚠️'}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: aiValidation.agrees ? '#38bdf8' : '#f59e0b' }}>
                  Análise de Foto — {aiValidation.confidence}% confiança
                </span>
              </div>
              <p style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.5 }}>
                {aiValidation.notes}
              </p>
            </div>
          )}

          {/* Botões de ação */}
          {!savedId ? (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', padding: '14px',
                borderRadius: 10, border: 'none',
                background: saving ? 'rgba(0,147,208,0.4)' : '#0093D0',
                color: '#fff', fontSize: 15, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving
                ? savingStep === 'upload' ? 'Enviando foto…'
                : savingStep === 'gemini' ? 'Analisando com IA…'
                : 'Salvando…'
                : 'Salvar Diagnóstico'}
            </button>
          ) : (
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <CheckCircle2 size={18} color="#22c55e" />
              <span style={{ fontSize: 14, color: '#22c55e', fontWeight: 600 }}>
                Diagnóstico salvo com sucesso!
              </span>
            </div>
          )}

          <button
            onClick={handleReset}
            style={{
              width: '100%', padding: '12px',
              borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', color: '#8899aa', fontSize: 14,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <RotateCcw size={14} />
            Novo Diagnóstico
          </button>
        </div>
      )}

      {/* ── Navegação ─────────────────────────────────────────────────── */}
      {step < 5 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                flex: 1, padding: '12px',
                borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: '#8899aa', fontSize: 14,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <ArrowLeft size={14} /> Voltar
            </button>
          )}
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canProceed}
            style={{
              flex: 2, padding: '12px',
              borderRadius: 10, border: 'none',
              background: canProceed ? '#0093D0' : 'rgba(255,255,255,0.06)',
              color: canProceed ? '#fff' : '#778899', fontSize: 14, fontWeight: 600,
              cursor: canProceed ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {step === 4 ? 'Ver Resultado' : 'Próximo'}
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* ── Histórico ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: 40 }}>
        <button
          onClick={() => setShowHistory(h => !h)}
          style={{
            width: '100%', padding: '12px 16px',
            borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
            background: '#0f1923', color: '#8899aa', fontSize: 13,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <History size={15} color="#0093D0" />
          <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>Histórico de Diagnósticos</span>
          <span style={{ fontSize: 11, background: 'rgba(0,147,208,0.15)', color: '#0093D0', padding: '2px 8px', borderRadius: 99 }}>
            {history.length}
          </span>
          <ChevronDown size={14} style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
        <Link
          href="/diagnostico-solo/historico"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 8, padding: '8px 14px',
            borderRadius: 8, border: '1px solid rgba(0,147,208,0.2)',
            background: 'rgba(0,147,208,0.06)',
            color: '#0093D0', fontSize: 12, fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={13} />
          Ver histórico completo com gráficos
        </Link>
        {showHistory && (
          <div style={{
            marginTop: 8, background: '#0f1923',
            borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            {loadingHistory && (
              <div style={{ padding: 24, textAlign: 'center', color: '#778899' }}>
                <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto' }} />
              </div>
            )}
            {!loadingHistory && history.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#778899', fontSize: 13 }}>
                Nenhum diagnóstico registrado ainda.
              </div>
            )}
            {history.map((rec, i) => {
              const meta = RESULT_META[rec.result]
              const date = new Date(rec.diagnosed_at)
              return (
                <div
                  key={rec.id}
                  style={{
                    padding: '14px 16px',
                    borderBottom: i < history.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: meta.color, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>
                      {(rec.pivots as unknown as { name: string })?.name ?? 'Pivô'}
                    </div>
                    <div style={{ fontSize: 11, color: '#778899', marginTop: 2 }}>
                      {date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' · '}
                      {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <ResultBadge result={rec.result} size="sm" />
                    <div style={{ fontSize: 11, color: '#778899', marginTop: 3 }}>
                      {rec.estimated_fc_percent}% da CC
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}

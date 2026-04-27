'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { Farm } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'
import { createFarm, deleteFarm, listFarmsByCompany, updateFarm } from '@/services/farms'
import { listPivotsByFarmIds } from '@/services/pivots'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Plus, Pencil, Trash2, X, Loader2, Building2, Droplets } from 'lucide-react'

// ─── Tipos auxiliares ────────────────────────────────────────
interface FarmMeta {
  pivotCount: number
  areaHa: number | null
  lastIrrigationDate: string | null
  activeSeasons: number
}

// ─── Helpers ─────────────────────────────────────────────────
function formatLastIrrigation(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  if (diff <= 7) return `há ${diff} dias`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function validateEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function validateDocument(v: string) {
  const digits = v.replace(/\D/g, '')
  return digits.length === 11 || digits.length === 14
}

// ─── Estilos compartilhados ──────────────────────────────────
const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: '#cbd5e1', marginBottom: 8,
  letterSpacing: '0.08em', textTransform: 'uppercase',
}
const LABEL_SEC_STYLE: React.CSSProperties = { ...LABEL_STYLE, color: '#94a3b8' }

const INPUT_BASE: React.CSSProperties = {
  width: '100%', borderRadius: 10, fontSize: 14, fontWeight: 400,
  background: '#0b0f14', border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box', padding: '11px 14px',
}
const INPUT_MAIN: React.CSSProperties = {
  ...INPUT_BASE, fontSize: 18, fontWeight: 600, padding: '15px 16px',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
}

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: '#445566',
  padding: '14px 0 10px', borderTop: '1px solid rgba(255,255,255,0.04)',
  margin: '0 0 0',
}

// ─── Modal ────────────────────────────────────────────────────
interface FarmModalProps {
  farm: Farm | null
  companyId: string
  onClose: () => void
  onSaved: () => void
}

function FarmModal({ farm, companyId, onClose, onSaved }: FarmModalProps) {
  const isEdit = !!farm

  // Seção 1 — Identificação
  const [name, setName] = useState(farm?.name ?? '')
  const [docNumber, setDocNumber] = useState(farm?.document_number ?? '')
  const [ownerName, setOwnerName] = useState(farm?.owner_name ?? '')
  const [ownerEmail, setOwnerEmail] = useState(farm?.owner_email ?? '')
  const [ownerPhone, setOwnerPhone] = useState(farm?.owner_phone ?? '')

  // Seção 2 — Localização
  const [cep, setCep] = useState(farm?.cep ?? '')
  const [address, setAddress] = useState(farm?.address ?? '')
  const [city, setCity] = useState(farm?.city ?? '')
  const [stateUf, setStateUf] = useState(farm?.state_uf ?? '')
  const [altitude, setAltitude] = useState(farm?.altitude?.toString() ?? '')
  const [longitude, setLongitude] = useState(farm?.longitude?.toString() ?? '')

  // Seção 3 — Observações
  const [notes, setNotes] = useState(farm?.notes ?? '')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Nome obrigatório'
    if (docNumber.trim() && !validateDocument(docNumber)) errs.docNumber = 'CPF (11 dígitos) ou CNPJ (14 dígitos)'
    if (ownerEmail.trim() && !validateEmail(ownerEmail)) errs.ownerEmail = 'E-mail inválido'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setError('')
    setLoading(true)

    // Campos editáveis (sem company_id no update — evita conflito de constraint)
    const fields = {
      name: name.trim(),
      document_number: docNumber.trim() || null,
      owner_name: ownerName.trim() || null,
      owner_email: ownerEmail.trim() || null,
      owner_phone: ownerPhone.trim() || null,
      cep: cep.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      state_uf: stateUf.trim().toUpperCase() || null,
      altitude: altitude ? Number(altitude) : null,
      longitude: longitude ? Number(longitude) : null,
      notes: notes.trim() || null,
    }

    try {
      if (isEdit) {
        await updateFarm(farm.id, fields)
      } else {
        await createFarm({ ...fields, company_id: companyId })
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('[FarmModal] save error:', err)
      setError(err instanceof Error ? err.message : 'Falha ao salvar fazenda')
    } finally {
      setLoading(false)
    }
  }

  function inputFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.target.style.borderColor = '#0093D0'
    e.target.style.boxShadow = '0 0 0 3px rgba(0,147,208,0.12)'
  }
  function inputBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.target.style.borderColor = 'rgba(255,255,255,0.08)'
    e.target.style.boxShadow = 'none'
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)' }}
    >
      <div style={{
        background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, width: '100%', maxWidth: 520,
        boxShadow: '0 32px 64px -12px rgba(0,0,0,0.8)',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Cabeçalho fixo */}
        <div style={{ padding: 'clamp(16px, 4vw, 28px) clamp(16px, 4vw, 32px) 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                {isEdit ? 'Editar Fazenda' : 'Nova Fazenda'}
              </h2>
              <p style={{ fontSize: 12, color: '#556677', margin: '3px 0 0' }}>
                {isEdit ? 'Atualize os dados cadastrais' : 'Preencha as informações da fazenda'}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ padding: 7, borderRadius: 8, border: 'none', background: 'transparent', color: '#667788', cursor: 'pointer', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#667788' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Corpo scrollável */}
        <div style={{ overflowY: 'auto', padding: '20px clamp(16px, 4vw, 32px)', flex: 1 }}>
          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
              {error}
            </div>
          )}

          <form id="farm-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── SEÇÃO 1: IDENTIFICAÇÃO ──────────────────── */}
            <div>
              {/* Campo nome — dominante */}
              <label style={LABEL_STYLE}>Nome da Fazenda *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
                placeholder="Ex: Fazenda Primavera"
                style={INPUT_MAIN}
                onFocus={e => { e.target.style.borderColor = '#0093D0'; e.target.style.boxShadow = '0 0 0 3px rgba(0,147,208,0.14)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
              />
              {fieldErrors.name && <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>{fieldErrors.name}</p>}
            </div>

            <p style={SECTION_TITLE}>Responsável</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL_SEC_STYLE}>Nome do responsável</label>
                <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)}
                  placeholder="Ex: João Silva" style={INPUT_BASE} onFocus={inputFocus} onBlur={inputBlur} />
              </div>
              <div>
                <label style={LABEL_SEC_STYLE}>
                  CPF / CNPJ
                  <span style={{ color: '#4a5568', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}> — opcional</span>
                </label>
                <input type="text" value={docNumber} onChange={e => setDocNumber(e.target.value)}
                  placeholder="000.000.000-00" style={INPUT_BASE} onFocus={inputFocus} onBlur={inputBlur} />
                {fieldErrors.docNumber && <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>{fieldErrors.docNumber}</p>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL_SEC_STYLE}>E-mail</label>
                <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)}
                  placeholder="email@exemplo.com" style={INPUT_BASE} onFocus={inputFocus} onBlur={inputBlur} />
                {fieldErrors.ownerEmail && <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0' }}>{fieldErrors.ownerEmail}</p>}
              </div>
              <div>
                <label style={LABEL_SEC_STYLE}>Celular / WhatsApp</label>
                <input type="tel" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)}
                  placeholder="(99) 9 9999-9999" style={INPUT_BASE} onFocus={inputFocus} onBlur={inputBlur} />
              </div>
            </div>

            {/* ── SEÇÃO 2: LOCALIZAÇÃO ──────────────────── */}
            <p style={SECTION_TITLE}>Localização</p>

            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <div>
                <label style={LABEL_SEC_STYLE}>CEP</label>
                <input type="text" value={cep} onChange={e => setCep(e.target.value)}
                  placeholder="00000-000" style={INPUT_BASE} onFocus={inputFocus} onBlur={inputBlur} />
              </div>
              <div>
                <label style={LABEL_SEC_STYLE}>Endereço</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="Rodovia, km ou rua" style={INPUT_BASE} onFocus={inputFocus} onBlur={inputBlur} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12 }}>
              <div>
                <label style={LABEL_SEC_STYLE}>Cidade</label>
                <input type="text" value={city} onChange={e => setCity(e.target.value)}
                  placeholder="Ex: Cândido Mota" style={INPUT_BASE} onFocus={inputFocus} onBlur={inputBlur} />
              </div>
              <div>
                <label style={LABEL_SEC_STYLE}>UF</label>
                <input type="text" value={stateUf} onChange={e => setStateUf(e.target.value.slice(0, 2))}
                  placeholder="SP" maxLength={2} style={INPUT_BASE} onFocus={inputFocus} onBlur={inputBlur} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL_SEC_STYLE}>
                  Altitude (m)
                  <span style={{ color: '#4a5568', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}> — opcional</span>
                </label>
                <input type="number" value={altitude} onChange={e => setAltitude(e.target.value)}
                  placeholder="Ex: 820" style={INPUT_BASE} onFocus={inputFocus} onBlur={inputBlur} />
              </div>
              <div>
                <label style={LABEL_SEC_STYLE}>
                  Longitude
                  <span style={{ color: '#4a5568', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}> — opcional</span>
                </label>
                <input type="number" step="any" value={longitude} onChange={e => setLongitude(e.target.value)}
                  placeholder="Ex: -50.362" style={INPUT_BASE} onFocus={inputFocus} onBlur={inputBlur} />
              </div>
            </div>

            {/* ── SEÇÃO 3: OBSERVAÇÕES ─────────────────── */}
            <p style={SECTION_TITLE}>
              Observações
              <span style={{ color: '#4a5568', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}> — opcional</span>
            </p>

            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Informações adicionais sobre a fazenda..."
              rows={3}
              style={{
                ...INPUT_BASE, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5',
                minHeight: 80,
              }}
              onFocus={inputFocus}
              onBlur={inputBlur}
            />

          </form>
        </div>

        {/* Rodapé fixo */}
        <div style={{ padding: '16px clamp(16px, 4vw, 32px) 24px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0 20px', height: 46, borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
              color: '#667788', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#94a3b8' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#667788' }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="farm-form"
            disabled={loading}
            style={{
              flex: 1, height: 50, borderRadius: 10, fontSize: 14, fontWeight: 700, letterSpacing: '0.03em',
              background: 'linear-gradient(135deg, #0093D0, #006fa0)',
              border: '1px solid rgba(0,147,208,0.3)', color: '#fff',
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.65 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 2px 10px rgba(0,147,208,0.2)', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = 'linear-gradient(135deg, #00a8ef, #007db8)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,147,208,0.35)' } }}
            onMouseLeave={e => { if (!loading) { e.currentTarget.style.background = 'linear-gradient(135deg, #0093D0, #006fa0)'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,147,208,0.2)' } }}
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            {isEdit ? 'Salvar alterações' : 'Criar fazenda'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────
export default function FazendasPage() {
  const { company, loading: authLoading } = useAuth()
  const [farms, setFarms] = useState<Farm[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingFarm, setEditingFarm] = useState<Farm | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [farmMeta, setFarmMeta] = useState<Record<string, FarmMeta>>({})

  const loadFarms = useCallback(async () => {
    if (!company?.id) { setFarms([]); setLoading(false); return }
    setLoading(true)
    setPageError('')
    try {
      const data = await listFarmsByCompany(company.id)
      setFarms(data)

      if (data.length > 0) {
        const farmIds = data.map(f => f.id)
        const supabase = createClient()

        const [pivots, lastIrrigationsRes, activeSeasonsRes] = await Promise.all([
          listPivotsByFarmIds(farmIds),
          (supabase as any)
            .from('daily_management')
            .select('date, seasons!inner(farm_id)')
            .in('seasons.farm_id', farmIds)
            .not('actual_depth_mm', 'is', null)
            .gt('actual_depth_mm', 0)
            .order('date', { ascending: false })
            .limit(farmIds.length * 5),
          (supabase as any)
            .from('seasons')
            .select('farm_id')
            .in('farm_id', farmIds)
            .eq('is_active', true),
        ])

        const meta: Record<string, FarmMeta> = {}
        for (const farm of data) {
          const farmPivots = pivots.filter(p => p.farm_id === farm.id)
          const areaHa = farm.area_m2 ? farm.area_m2 / 10_000 : null
          meta[farm.id] = { pivotCount: farmPivots.length, areaHa, lastIrrigationDate: null, activeSeasons: 0 }
        }

        const rows = (lastIrrigationsRes.data ?? []) as Array<{ date: string; seasons: { farm_id: string } }>
        for (const row of rows) {
          const fid = row.seasons?.farm_id
          if (fid && meta[fid] && !meta[fid].lastIrrigationDate) {
            meta[fid].lastIrrigationDate = row.date
          }
        }

        const seasonRows = (activeSeasonsRes.data ?? []) as Array<{ farm_id: string }>
        for (const row of seasonRows) {
          if (meta[row.farm_id]) meta[row.farm_id].activeSeasons++
        }

        setFarmMeta(meta)
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Falha ao carregar fazendas')
      setFarms([])
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    if (authLoading) return
    loadFarms()
  }, [authLoading, loadFarms])

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta fazenda? Todos os pivôs e safras vinculados serão removidos.')) return
    setDeletingId(id)
    setPageError('')
    try {
      await deleteFarm(id)
      await loadFarms()
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Falha ao excluir fazenda')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {pageError && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
            {pageError}
          </div>
        )}

        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Fazendas</h1>
            <p style={{ fontSize: 13, color: '#8899aa', margin: '4px 0 0' }}>
              {!loading && `${farms.length} ${farms.length === 1 ? 'fazenda cadastrada' : 'fazendas cadastradas'}`}
            </p>
          </div>
          <button
            onClick={() => { setEditingFarm(null); setModalOpen(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 16px', minHeight: 44, borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: '#0093D0', border: '1px solid rgba(0,147,208,0.4)',
              color: '#fff', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,147,208,0.2)', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#007ab8'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,147,208,0.35)' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#0093D0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,147,208,0.2)' }}
          >
            <Plus size={15} />
            Nova fazenda
          </button>
        </div>

        {/* Conteúdo */}
        {authLoading || loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingBottom: 80 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: '#0093D0' }} />
          </div>
        ) : farms.length === 0 ? (
          <div style={{
            background: '#0f1923', border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 16, padding: '56px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16, margin: '0 auto 20px',
              background: 'rgba(0,147,208,0.08)', border: '1px solid rgba(0,147,208,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Building2 size={26} style={{ color: '#0093D0' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>
              Nenhuma fazenda cadastrada
            </h3>
            <p style={{ fontSize: 14, color: '#778899', margin: '0 auto 28px', maxWidth: 320 }}>
              Cadastre sua primeira fazenda para começar a gerenciar sua irrigação.
            </p>
            <button
              onClick={() => { setEditingFarm(null); setModalOpen(true) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(0,147,208,0.25)', transition: 'all 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#007ab8'}
              onMouseLeave={e => e.currentTarget.style.background = '#0093D0'}
            >
              <Plus size={15} />
              Nova fazenda
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {farms.map(farm => {
              const m = farmMeta[farm.id]
              const lastStr = formatLastIrrigation(m?.lastIrrigationDate ?? null)

              // Linha 1 de meta: localização
              const locationStr = [farm.city, farm.state_uf].filter(Boolean).join('/')
              // Linha 2: dados operacionais
              const opParts: string[] = []
              if (m?.pivotCount) opParts.push(`${m.pivotCount} ${m.pivotCount === 1 ? 'pivô' : 'pivôs'}`)
              if (m?.areaHa) opParts.push(`${m.areaHa.toFixed(0)} ha`)
              if (m?.activeSeasons) opParts.push(`${m.activeSeasons} ${m.activeSeasons === 1 ? 'safra ativa' : 'safras ativas'}`)

              return (
                <div
                  key={farm.id}
                  style={{
                    background: '#0f1923', border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 14, padding: '16px 20px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,147,208,0.2)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  {/* Ícone */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 11, flexShrink: 0,
                    background: 'rgba(0,147,208,0.08)', border: '1px solid rgba(0,147,208,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <MapPin size={18} style={{ color: '#0093D0' }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                      {farm.name}
                    </p>

                    {/* Localização + altitude */}
                    <p style={{ fontSize: 12, color: '#8899aa', margin: '3px 0 0' }}>
                      {[locationStr, farm.altitude ? `${farm.altitude} m alt.` : null].filter(Boolean).join(' · ') || 'Localização não informada'}
                    </p>

                    {/* Responsável */}
                    {farm.owner_name && (
                      <p style={{ fontSize: 12, color: '#667788', margin: '2px 0 0' }}>
                        Resp: {farm.owner_name}
                        {farm.owner_phone && <span style={{ color: '#4a5a6a' }}> · {farm.owner_phone}</span>}
                      </p>
                    )}

                    {/* Dados operacionais */}
                    {opParts.length > 0 && (
                      <p style={{ fontSize: 11, color: '#556677', margin: '3px 0 0' }}>
                        {opParts.join(' · ')}
                      </p>
                    )}

                    {/* Última irrigação */}
                    {lastStr && (
                      <p style={{ fontSize: 11, color: '#445566', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Droplets size={10} style={{ color: '#0093D0', opacity: 0.6, flexShrink: 0 }} />
                        Última irrigação: {lastStr}
                      </p>
                    )}
                  </div>

                  {/* CTA + Ações */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <Link
                      href="/manejo"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', minHeight: 44, borderRadius: 8, fontSize: 12, fontWeight: 500,
                        color: '#0093D0', background: 'rgba(0,147,208,0.08)',
                        border: '1px solid rgba(0,147,208,0.18)', textDecoration: 'none',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,147,208,0.15)'; e.currentTarget.style.color = '#33b5e5' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,147,208,0.08)'; e.currentTarget.style.color = '#0093D0' }}
                    >
                      <Droplets size={12} />
                      Manejo
                    </Link>

                    <button
                      onClick={() => { setEditingFarm(farm); setModalOpen(true) }}
                      title="Editar"
                      style={{ padding: 8, minHeight: 44, minWidth: 44, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#8899aa', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8899aa' }}
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      onClick={() => handleDelete(farm.id)}
                      disabled={deletingId === farm.id}
                      title="Excluir"
                      style={{ padding: 8, minHeight: 44, minWidth: 44, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#8899aa', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8899aa' }}
                    >
                      {deletingId === farm.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && company?.id && (
        <FarmModal
          farm={editingFarm}
          companyId={company.id}
          onClose={() => setModalOpen(false)}
          onSaved={loadFarms}
        />
      )}
    </>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { Farm } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'
import { createFarm, deleteFarm, listFarmsByCompany, updateFarm } from '@/services/farms'
import { listPivotsByFarmIds } from '@/services/pivots'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Plus, Pencil, Trash2, X, Loader2, Building2, Droplets } from 'lucide-react'

// ─── Tipos auxiliares ───────────────────────────────────────
interface FarmMeta {
  pivotCount: number
  areaHa: number | null
  lastIrrigationDate: string | null
}

// ─── Helpers ────────────────────────────────────────────────
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

// ─── Modal de criação/edição ────────────────────────────────
interface FarmModalProps {
  farm: Farm | null
  companyId: string
  onClose: () => void
  onSaved: () => void
}

function FarmModal({ farm, companyId, onClose, onSaved }: FarmModalProps) {
  const isEdit = !!farm
  const [name, setName] = useState(farm?.name ?? '')
  const [altitude, setAltitude] = useState(farm?.altitude?.toString() ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setLoading(true)

    const payload = {
      name: name.trim(),
      altitude: altitude ? Number(altitude) : null,
      company_id: companyId,
    }

    try {
      if (isEdit) {
        await updateFarm(farm.id, payload)
      } else {
        await createFarm(payload)
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar fazenda')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)' }}>
      <div style={{
        background: '#0d1520',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: '32px 36px', width: '100%', maxWidth: 460,
        boxShadow: '0 32px 64px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0', margin: 0, letterSpacing: '0.01em' }}>
              {isEdit ? 'Editar Fazenda' : 'Nova Fazenda'}
            </h2>
            <p style={{ fontSize: 12, color: '#556677', margin: '3px 0 0' }}>
              {isEdit ? 'Atualize os dados da fazenda' : 'Preencha o nome para começar'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ padding: 7, borderRadius: 8, border: 'none', background: 'transparent', color: '#667788', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#667788'; e.currentTarget.style.background = 'transparent' }}
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 10, background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.2)', color: '#ef4444', fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Campo principal — nome */}
          <div>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 700, color: '#cbd5e1',
              marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Nome da Fazenda *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
              placeholder="Ex: Fazenda Primavera"
              style={{
                width: '100%', padding: '16px 18px',
                borderRadius: 12, fontSize: 18, fontWeight: 600,
                background: '#0b0f14', border: '1px solid rgba(255,255,255,0.1)',
                color: '#e2e8f0', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = '#0093D0'; e.target.style.boxShadow = '0 0 0 3px rgba(0,147,208,0.14)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          {/* Campo secundário — altitude */}
          <div>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8',
              marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Altitude (m){' '}
              <span style={{ color: '#4a5568', fontWeight: 400, fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>
                — opcional
              </span>
            </label>
            <input
              type="number"
              value={altitude}
              onChange={e => setAltitude(e.target.value)}
              placeholder="Ex: 820"
              style={{
                width: '100%', padding: '13px 18px',
                borderRadius: 12, fontSize: 15, fontWeight: 400,
                background: '#0b0f14', border: '1px solid rgba(255,255,255,0.07)',
                color: '#e2e8f0', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = '#0093D0'; e.target.style.boxShadow = '0 0 0 3px rgba(0,147,208,0.1)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.07)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          {/* Ações */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: '0 0 auto', padding: '0 20px', height: 48, borderRadius: 11, fontSize: 13, fontWeight: 500,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                color: '#667788', cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#94a3b8' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#667788' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1, height: 52, borderRadius: 11, fontSize: 14, fontWeight: 700, letterSpacing: '0.03em',
                background: 'linear-gradient(135deg, #0093D0, #006fa0)',
                border: '1px solid rgba(0,147,208,0.3)', color: '#fff', cursor: loading ? 'default' : 'pointer',
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
        </form>
      </div>
    </div>
  )
}

// ─── Página principal ───────────────────────────────────────
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
    if (!company?.id) {
      setFarms([])
      setLoading(false)
      return
    }

    setLoading(true)
    setPageError('')
    try {
      const data = await listFarmsByCompany(company.id)
      setFarms(data)

      // Carrega metadados em paralelo
      if (data.length > 0) {
        const farmIds = data.map(f => f.id)
        const supabase = createClient()

        const [pivots, lastIrrigations] = await Promise.all([
          listPivotsByFarmIds(farmIds),
          // Busca última data de irrigação real por fazenda (via seasons → daily_management)
          (supabase as any)
            .from('daily_management')
            .select('date, seasons!inner(farm_id)')
            .in('seasons.farm_id', farmIds)
            .not('actual_depth_mm', 'is', null)
            .gt('actual_depth_mm', 0)
            .order('date', { ascending: false })
            .limit(farmIds.length * 5),
        ])

        // Agrega pivôs por fazenda
        const meta: Record<string, FarmMeta> = {}
        for (const farm of data) {
          const farmPivots = pivots.filter(p => p.farm_id === farm.id)
          const areaHa = farm.area_m2 ? farm.area_m2 / 10_000 : null
          meta[farm.id] = { pivotCount: farmPivots.length, areaHa, lastIrrigationDate: null }
        }

        // Última irrigação por fazenda
        const rows = (lastIrrigations.data ?? []) as Array<{ date: string; seasons: { farm_id: string } }>
        for (const row of rows) {
          const fid = row.seasons?.farm_id
          if (fid && meta[fid] && !meta[fid].lastIrrigationDate) {
            meta[fid].lastIrrigationDate = row.date
          }
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

  function openEdit(farm: Farm) {
    setEditingFarm(farm)
    setModalOpen(true)
  }

  function openNew() {
    setEditingFarm(null)
    setModalOpen(true)
  }

  // Linha de metadados do card
  const metaLine = useCallback((farm: Farm): string => {
    const m = farmMeta[farm.id]
    if (!m) return farm.altitude ? `${farm.altitude} m altitude` : ''
    const parts: string[] = []
    if (farm.altitude) parts.push(`${farm.altitude} m alt.`)
    if (m.pivotCount > 0) parts.push(`${m.pivotCount} ${m.pivotCount === 1 ? 'pivô' : 'pivôs'}`)
    if (m.areaHa) parts.push(`${m.areaHa.toFixed(0)} ha`)
    return parts.join(' · ')
  }, [farmMeta])

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Erro de página */}
        {pageError && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444', fontSize: 13 }}>
            {pageError}
          </div>
        )}

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Fazendas</h1>
            <p style={{ fontSize: 13, color: '#8899aa', marginTop: 4, margin: '4px 0 0' }}>
              {loading ? '' : `${farms.length} ${farms.length === 1 ? 'fazenda cadastrada' : 'fazendas cadastradas'}`}
            </p>
          </div>
          <button
            onClick={openNew}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, letterSpacing: '0.03em',
              background: '#0093D0', border: '1px solid rgba(0,147,208,0.4)', color: '#fff', cursor: 'pointer',
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
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: '#0093D0' }} />
          </div>
        ) : farms.length === 0 ? (
          // Estado vazio
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
            <p style={{ fontSize: 14, color: '#778899', marginBottom: 28, maxWidth: 320, margin: '0 auto 28px' }}>
              Cadastre sua primeira fazenda para começar a gerenciar sua irrigação.
            </p>
            <button
              onClick={openNew}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(0,147,208,0.25)', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#007ab8' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#0093D0' }}
            >
              <Plus size={15} />
              Nova fazenda
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {farms.map(farm => {
              const m = farmMeta[farm.id]
              const lastStr = formatLastIrrigation(m?.lastIrrigationDate ?? null)
              const meta = metaLine(farm)

              return (
                <div
                  key={farm.id}
                  style={{
                    background: '#0f1923',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 14,
                    padding: '16px 20px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(0,147,208,0.2)'
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
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
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', margin: 0, letterSpacing: '0.01em' }}>
                      {farm.name}
                    </p>
                    {meta && (
                      <p style={{ fontSize: 12, color: '#8899aa', margin: '3px 0 0' }}>
                        {meta}
                      </p>
                    )}
                    {lastStr && (
                      <p style={{ fontSize: 11, color: '#556677', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Droplets size={10} style={{ color: '#0093D0', opacity: 0.7, flexShrink: 0 }} />
                        Última irrigação: {lastStr}
                      </p>
                    )}
                  </div>

                  {/* CTA + Ações */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {/* CTA Manejo */}
                    <Link
                      href="/manejo"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                        color: '#0093D0', background: 'rgba(0,147,208,0.08)',
                        border: '1px solid rgba(0,147,208,0.18)', textDecoration: 'none',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(0,147,208,0.15)'
                        e.currentTarget.style.color = '#33b5e5'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(0,147,208,0.08)'
                        e.currentTarget.style.color = '#0093D0'
                      }}
                    >
                      <Droplets size={12} />
                      Manejo
                    </Link>

                    {/* Editar */}
                    <button
                      onClick={() => openEdit(farm)}
                      title="Editar"
                      style={{
                        padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'transparent', color: '#8899aa', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8899aa' }}
                    >
                      <Pencil size={14} />
                    </button>

                    {/* Excluir */}
                    <button
                      onClick={() => handleDelete(farm.id)}
                      disabled={deletingId === farm.id}
                      title="Excluir"
                      style={{
                        padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'transparent', color: '#8899aa', transition: 'all 0.15s',
                      }}
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

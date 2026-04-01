'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Farm } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'
import { createFarm, deleteFarm, listFarmsByCompany, updateFarm } from '@/services/farms'
import { MapPin, Plus, Pencil, Trash2, X, Loader2, Building2 } from 'lucide-react'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)' }}>
      <div style={{ background: 'linear-gradient(145deg, rgba(15, 25, 35, 0.95), rgba(10, 15, 20, 0.98))', border: '1px solid rgba(0, 229, 255, 0.15)', borderRadius: 24, padding: 32, width: '100%', maxWidth: 460, boxShadow: '0 30px 60px -10px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 229, 255, 0.05)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.02em' }}>
            {isEdit ? 'Editar Fazenda' : 'Nova Fazenda'}
          </h2>
          <button
            onClick={onClose}
            style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: '#556677', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#556677'; e.currentTarget.style.background = 'transparent' }}
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>
              Nome da Fazenda *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Ex: Fazenda Primavera"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, transition: 'all 0.2s',
                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = '#00E5FF'; e.target.style.boxShadow = '0 0 0 3px rgba(0, 229, 255, 0.15)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>
              Altitude (m)
            </label>
            <input
              type="number"
              value={altitude}
              onChange={e => setAltitude(e.target.value)}
              placeholder="Ex: 820"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, transition: 'all 0.2s',
                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = '#00E5FF'; e.target.style.boxShadow = '0 0 0 3px rgba(0, 229, 255, 0.15)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          <div className="flex gap-3 mt-4">
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
              type="submit"
              disabled={loading}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em',
                background: 'linear-gradient(135deg, #00E5FF 0%, #0077B6 100%)', border: 'none', color: '#fff', cursor: 'pointer',
                opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: '0 4px 15px rgba(0, 229, 255, 0.3)', transition: 'all 0.2s', textShadow: '0 1px 2px rgba(0,0,0,0.5)'
              }}
              onMouseEnter={e => { if(!loading) e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 229, 255, 0.5)' }}
              onMouseLeave={e => { if(!loading) e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 229, 255, 0.3)' }}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'SALVAR FAZENDA' : 'CRIAR FAZENDA'}
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

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Erro de página */}
        {pageError && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444', fontSize: 13 }}>
            {pageError}
          </div>
        )}

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>Fazendas</h1>
            <p className="text-sm mt-0.5" style={{ color: '#8899aa' }}>
              {farms.length} {farms.length === 1 ? 'fazenda cadastrada' : 'fazendas cadastradas'}
            </p>
          </div>
          <button
            onClick={openNew}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em',
              background: 'linear-gradient(135deg, #00E5FF, #0077B6)', border: 'none', color: '#fff', cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(0,229,255,0.3)', textShadow: '0 1px 2px rgba(0,0,0,0.5)', transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 229, 255, 0.5)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 229, 255, 0.3)'}
          >
            <Plus size={16} />
            NOVA FAZENDA
          </button>
        </div>

        {/* Conteúdo */}
        {authLoading || loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: '#00E5FF' }} />
          </div>
        ) : farms.length === 0 ? (
          // Empty state
          <div style={{ background: 'rgba(15, 25, 35, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
              background: 'rgba(0, 229, 255, 0.1)', border: '1px solid rgba(0, 229, 255, 0.3)',
              boxShadow: 'inset 0 0 10px rgba(0, 229, 255, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Building2 size={28} style={{ color: '#00E5FF', filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.5))' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>
              Nenhuma fazenda cadastrada
            </h3>
            <p style={{ fontSize: 14, color: '#556677', marginBottom: 24 }}>
              Cadastre sua primeira fazenda para começar a gerenciar a irrigação.
            </p>
            <button
              onClick={openNew}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em',
                background: 'linear-gradient(135deg, #00E5FF, #0077B6)', border: 'none', color: '#fff', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 229, 255, 0.25)', transition: 'all 0.2s', textShadow: '0 1px 2px rgba(0,0,0,0.5)'
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 229, 255, 0.4)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 229, 255, 0.25)'}
            >
              <Plus size={16} />
              CADASTRAR FAZENDA
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {farms.map(farm => (
              <div
                key={farm.id}
                style={{
                  background: 'rgba(15, 25, 35, 0.65)', backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
                  padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
                  transition: 'all 0.3s ease', cursor: 'default', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 229, 255, 0.08)'
                  e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.2)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                }}
              >
                {/* Ícone */}
                <div style={{
                  width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                  background: 'rgba(0, 229, 255, 0.1)', border: '1px solid rgba(0, 229, 255, 0.3)',
                  boxShadow: 'inset 0 0 10px rgba(0, 229, 255, 0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MapPin size={20} style={{ color: '#00E5FF', filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.4))' }} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', letterSpacing: '0.01em' }}>{farm.name}</p>
                  <p style={{ fontSize: 12, color: '#556677', marginTop: 2 }}>
                    {farm.altitude ? `Altitude: ${farm.altitude} m` : 'Altitude não informada'}
                    {farm.area_m2 ? ` · ${(farm.area_m2 / 10000).toFixed(1)} ha` : ''}
                  </p>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => openEdit(farm)}
                    title="Editar"
                    style={{
                      padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#8899aa', transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2e8f0' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8899aa' }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(farm.id)}
                    disabled={deletingId === farm.id}
                    title="Excluir"
                    style={{
                      padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#8899aa', transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8899aa' }}
                  >
                    {deletingId === farm.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
      company?.id && (
        <FarmModal
          farm={editingFarm}
          companyId={company.id}
          onClose={() => setModalOpen(false)}
          onSaved={loadFarms}
        />
      )
      )}
    </>
  )
}

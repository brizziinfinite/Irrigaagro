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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgb(0 0 0 / 0.7)' }}>
      <div style={{ background: '#111f14', border: '1px solid #1f3022', borderRadius: 20, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 20px 48px -8px rgb(0 0 0 / 0.6)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#ecefec' }}>
            {isEdit ? 'Editar Fazenda' : 'Nova Fazenda'}
          </h2>
          <button
            onClick={onClose}
            style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: '#3a5240', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#7a9e82'; (e.currentTarget as HTMLElement).style.background = '#1c2e20' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#3a5240'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#becec0', marginBottom: 6 }}>
              Nome da Fazenda *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Ex: Fazenda Primavera"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
                background: '#1c2e20', border: '1px solid #2a3d2d', color: '#ecefec', outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#4a9e1a'}
              onBlur={e => e.target.style.borderColor = '#2a3d2d'}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#becec0', marginBottom: 6 }}>
              Altitude (m)
            </label>
            <input
              type="number"
              value={altitude}
              onChange={e => setAltitude(e.target.value)}
              placeholder="Ex: 820"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
                background: '#1c2e20', border: '1px solid #2a3d2d', color: '#ecefec', outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#4a9e1a'}
              onBlur={e => e.target.style.borderColor = '#2a3d2d'}
            />
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 500,
                background: 'transparent', border: '1px solid #2a3d2d', color: '#7a9e82', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: 'linear-gradient(135deg, #166502, #4a9e1a)', border: 'none', color: '#fff', cursor: 'pointer',
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

// ─── Página principal ───────────────────────────────────────
export default function FazendasPage() {
  const { company, loading: authLoading } = useAuth()
  const [farms, setFarms] = useState<Farm[]>([])
  const [loading, setLoading] = useState(true)
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
    try {
      const data = await listFarmsByCompany(company.id)
      setFarms(data)
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
    try {
      await deleteFarm(id)
      await loadFarms()
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
      <div className="flex flex-col gap-5 max-w-4xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#ecefec' }}>Fazendas</h1>
            <p className="text-sm mt-0.5" style={{ color: '#7a9e82' }}>
              {farms.length} {farms.length === 1 ? 'fazenda cadastrada' : 'fazendas cadastradas'}
            </p>
          </div>
          <button
            onClick={openNew}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: 'linear-gradient(135deg, #166502, #4a9e1a)', border: 'none', color: '#fff', cursor: 'pointer',
              boxShadow: '0 2px 8px rgb(74 158 26 / 0.3)',
            }}
          >
            <Plus size={16} />
            Nova Fazenda
          </button>
        </div>

        {/* Conteúdo */}
        {authLoading || loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: '#4a9e1a' }} />
          </div>
        ) : farms.length === 0 ? (
          // Empty state
          <div style={{ background: '#111f14', border: '1px solid #1f3022', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
              background: 'rgb(74 158 26 / 0.1)', border: '1px solid rgb(74 158 26 / 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Building2 size={28} style={{ color: '#4a9e1a' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#ecefec', marginBottom: 8 }}>
              Nenhuma fazenda cadastrada
            </h3>
            <p style={{ fontSize: 14, color: '#535c3e', marginBottom: 24 }}>
              Cadastre sua primeira fazenda para começar a gerenciar a irrigação.
            </p>
            <button
              onClick={openNew}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: 'linear-gradient(135deg, #166502, #4a9e1a)', border: 'none', color: '#fff', cursor: 'pointer',
              }}
            >
              <Plus size={16} />
              Cadastrar Fazenda
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {farms.map(farm => (
              <div
                key={farm.id}
                style={{
                  background: '#111f14', border: '1px solid #1f3022', borderRadius: 14,
                  padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                {/* Ícone */}
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: 'rgb(74 158 26 / 0.1)', border: '1px solid rgb(74 158 26 / 0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MapPin size={18} style={{ color: '#4a9e1a' }} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#ecefec' }}>{farm.name}</p>
                  <p style={{ fontSize: 12, color: '#535c3e', marginTop: 2 }}>
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
                      padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: '#162219', color: '#7a9e82',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1c2e20'; (e.currentTarget as HTMLElement).style.color = '#becec0' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#162219'; (e.currentTarget as HTMLElement).style.color = '#7a9e82' }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(farm.id)}
                    disabled={deletingId === farm.id}
                    title="Excluir"
                    style={{
                      padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: '#162219', color: '#7a9e82',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgb(239 68 68 / 0.1)'; (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#162219'; (e.currentTarget as HTMLElement).style.color = '#7a9e82' }}
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

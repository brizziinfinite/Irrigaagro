'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { listFarmsByCompany } from '@/services/farms'
import { listPivotsByFarmIds } from '@/services/pivots'
import {
  listContactsByCompany,
  createContact,
  updateContact,
  deleteContact,
  listSubscriptionsByContact,
  upsertSubscription,
  deleteSubscription,
  type SubscriptionWithPivot,
} from '@/services/whatsapp-contacts'
import type {
  Farm,
  WhatsAppContact,
  WhatsAppContactInsert,
} from '@/types/database'
import type { PivotWithFarmName } from '@/services/pivots'
import {
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Bell,
  BellOff,
  ChevronDown,
  ChevronRight,
  Phone,
  User,
  Clock,
} from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────

interface ContactFormData {
  contact_name: string
  country_code: string
  local_phone: string
  notification_hour: string
  is_active: boolean
}

const COUNTRY_CODES = [
  { code: '55', flag: '🇧🇷', label: 'Brasil (+55)' },
  { code: '1',  flag: '🇺🇸', label: 'EUA / Canadá (+1)' },
  { code: '351', flag: '🇵🇹', label: 'Portugal (+351)' },
  { code: '54',  flag: '🇦🇷', label: 'Argentina (+54)' },
  { code: '598', flag: '🇺🇾', label: 'Uruguai (+598)' },
  { code: '595', flag: '🇵🇾', label: 'Paraguai (+595)' },
  { code: '56',  flag: '🇨🇱', label: 'Chile (+56)' },
  { code: '57',  flag: '🇨🇴', label: 'Colômbia (+57)' },
  { code: '34',  flag: '🇪🇸', label: 'Espanha (+34)' },
]

const INITIAL_FORM: ContactFormData = {
  contact_name: '',
  country_code: '55',
  local_phone: '',
  notification_hour: '7',
  is_active: true,
}

// ─── Helpers ─────────────────────────────────────────────────

function buildPhone(countryCode: string, localPhone: string): string {
  return countryCode + localPhone.replace(/\D/g, '')
}

function splitPhone(phone: string): { country_code: string; local_phone: string } {
  const digits = phone.replace(/\D/g, '')
  for (const c of COUNTRY_CODES) {
    if (digits.startsWith(c.code)) {
      return { country_code: c.code, local_phone: digits.slice(c.code.length) }
    }
  }
  return { country_code: '55', local_phone: digits }
}

function displayPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  return phone
}

// ─── Componente principal ─────────────────────────────────────

export default function WhatsAppPage() {
  const { company } = useAuth()

  const [contacts, setContacts] = useState<WhatsAppContact[]>([])
  const [pivots, setPivots] = useState<PivotWithFarmName[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  // Modal contato
  const [showModal, setShowModal] = useState(false)
  const [editingContact, setEditingContact] = useState<WhatsAppContact | null>(null)
  const [form, setForm] = useState<ContactFormData>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Assinaturas expandidas
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null)
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithPivot[]>([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [savingSub, setSavingSub] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!company?.id) return
    try {
      setLoading(true)
      const farms: Farm[] = await listFarmsByCompany(company.id)
      const farmIds = farms.map(f => f.id)
      const [c, p] = await Promise.all([
        listContactsByCompany(company.id),
        farmIds.length > 0 ? listPivotsByFarmIds(farmIds) : Promise.resolve([]),
      ])
      setContacts(c)
      setPivots(p)
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => { loadData() }, [loadData])

  // ─── Modal ───────────────────────────────────────────────

  function openCreate() {
    setEditingContact(null)
    setForm(INITIAL_FORM)
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(c: WhatsAppContact) {
    setEditingContact(c)
    const { country_code, local_phone } = splitPhone(c.phone)
    setForm({
      contact_name: c.contact_name,
      country_code,
      local_phone,
      notification_hour: String(c.notification_hour),
      is_active: c.is_active,
    })
    setFormError(null)
    setShowModal(true)
  }

  async function handleSave() {
    if (!company?.id) return
    setFormError(null)

    const phone = buildPhone(form.country_code, form.local_phone)
    if (!form.contact_name.trim()) { setFormError('Nome é obrigatório'); return }
    if (form.local_phone.replace(/\D/g, '').length < 8) { setFormError('Número inválido (mínimo 8 dígitos com DDD)'); return }

    const hour = parseInt(form.notification_hour)
    if (isNaN(hour) || hour < 0 || hour > 23) { setFormError('Hora inválida (0–23)'); return }

    setSaving(true)
    try {
      if (editingContact) {
        const updated = await updateContact(editingContact.id, {
          contact_name: form.contact_name.trim(),
          phone,
          notification_hour: hour,
          is_active: form.is_active,
        })
        setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))
      } else {
        const input: WhatsAppContactInsert = {
          company_id: company.id,
          contact_name: form.contact_name.trim(),
          phone,
          notification_hour: hour,
          is_active: form.is_active,
        }
        const created = await createContact(input)
        setContacts(prev => [...prev, created])
      }
      setShowModal(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este contato e todas as assinaturas?')) return
    try {
      await deleteContact(id)
      setContacts(prev => prev.filter(c => c.id !== id))
      if (expandedContactId === id) setExpandedContactId(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir')
    }
  }

  // ─── Assinaturas ─────────────────────────────────────────

  async function toggleExpand(contactId: string) {
    if (expandedContactId === contactId) {
      setExpandedContactId(null)
      return
    }
    setExpandedContactId(contactId)
    setLoadingSubs(true)
    try {
      const subs = await listSubscriptionsByContact(contactId)
      setSubscriptions(subs)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingSubs(false)
    }
  }

  async function handleToggleSub(
    contactId: string,
    pivotId: string,
    field: 'notify_irrigation' | 'notify_rain' | 'notify_daily_summary',
    currentSub: SubscriptionWithPivot | undefined
  ) {
    setSavingSub(`${contactId}-${pivotId}-${field}`)
    try {
      const current = currentSub ?? {
        contact_id: contactId,
        pivot_id: pivotId,
        notify_irrigation: false,
        notify_rain: false,
        notify_status: false,
        notify_daily_summary: false,
      }
      const updated = await upsertSubscription({
        contact_id: contactId,
        pivot_id: pivotId,
        notify_irrigation: current.notify_irrigation ?? false,
        notify_rain: current.notify_rain ?? false,
        notify_status: current.notify_status ?? false,
        notify_daily_summary: current.notify_daily_summary ?? false,
        [field]: !(currentSub?.[field] ?? false),
      })
      setSubscriptions(prev => {
        const exists = prev.find(s => s.contact_id === contactId && s.pivot_id === pivotId)
        if (exists) return prev.map(s =>
          s.contact_id === contactId && s.pivot_id === pivotId
            ? { ...s, ...updated }
            : s
        )
        return [...prev, { ...updated, pivots: pivots.find(p => p.id === pivotId) ? { id: pivotId, name: pivots.find(p => p.id === pivotId)!.name, farms: pivots.find(p => p.id === pivotId)!.farms } : null }]
      })
    } catch (e) {
      console.error(e)
    } finally {
      setSavingSub(null)
    }
  }

  async function handleRemoveSub(contactId: string, pivotId: string) {
    setSavingSub(`${contactId}-${pivotId}`)
    try {
      await deleteSubscription(contactId, pivotId)
      setSubscriptions(prev => prev.filter(s => !(s.contact_id === contactId && s.pivot_id === pivotId)))
    } catch (e) {
      console.error(e)
    } finally {
      setSavingSub(null)
    }
  }

  // ─── Render ───────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#8899aa' }}>
      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  )

  if (pageError) return (
    <div style={{ padding: 32, color: '#ef4444' }}>{pageError}</div>
  )

  const expandedSubs = subscriptions.filter(s => s.contact_id === expandedContactId)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MessageSquare size={22} color="#22c55e" />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>WhatsApp</h1>
          <span style={{
            background: 'rgba(34,197,94,0.12)', color: '#22c55e',
            fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
          }}>
            {contacts.length} contato{contacts.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button onClick={openCreate} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#0093D0', color: '#fff', border: 'none',
          borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
          cursor: 'pointer',
        }}>
          <Plus size={15} /> Novo contato
        </button>
      </div>

      {/* Info box */}
      <div style={{
        background: 'rgba(0,147,208,0.08)', border: '1px solid rgba(0,147,208,0.2)',
        borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#8899aa',
        lineHeight: 1.6,
      }}>
        <strong style={{ color: '#0093D0' }}>Como funciona:</strong> Cadastre os contatos que devem receber alertas via WhatsApp.
        Para cada contato, configure quais pivôs ele monitora e quais tipos de alerta recebe
        (irrigação, chuva, resumo diário).
      </div>

      {/* Lista de contatos */}
      {contacts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, color: '#778899',
        }}>
          <MessageSquare size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Nenhum contato cadastrado</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>Clique em "Novo contato" para começar</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contacts.map(contact => {
            const isExpanded = expandedContactId === contact.id
            const contactSubs = subscriptions.filter(s => s.contact_id === contact.id)

            return (
              <div key={contact.id} style={{
                background: '#0f1923',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, overflow: 'hidden',
              }}>
                {/* Linha do contato */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px',
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: contact.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(85,102,119,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <User size={16} color={contact.is_active ? '#22c55e' : '#778899'} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>
                        {contact.contact_name}
                      </span>
                      {!contact.is_active && (
                        <span style={{
                          fontSize: 10, background: 'rgba(85,102,119,0.2)', color: '#778899',
                          padding: '1px 6px', borderRadius: 10,
                        }}>inativo</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 2 }}>
                      <span style={{ fontSize: 12, color: '#8899aa', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={11} /> {displayPhone(contact.phone)}
                      </span>
                      <span style={{ fontSize: 12, color: '#8899aa', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} /> {String(contact.notification_hour).padStart(2, '0')}h
                      </span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => toggleExpand(contact.id)}
                      title="Gerenciar pivôs"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: isExpanded ? 'rgba(0,147,208,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isExpanded ? 'rgba(0,147,208,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        color: isExpanded ? '#0093D0' : '#8899aa',
                        borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      Pivôs
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <button onClick={() => openEdit(contact)} title="Editar" style={{
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 7, padding: 6, cursor: 'pointer', color: '#8899aa',
                      display: 'flex', alignItems: 'center',
                    }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(contact.id)} title="Excluir" style={{
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                      borderRadius: 7, padding: 6, cursor: 'pointer', color: '#ef4444',
                      display: 'flex', alignItems: 'center',
                    }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Painel de pivôs */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '12px 16px',
                  }}>
                    {loadingSubs ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#778899', fontSize: 13 }}>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Carregando…
                      </div>
                    ) : pivots.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: '#778899' }}>Nenhum pivô cadastrado.</p>
                    ) : (
                      <div>
                        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#778899', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Configurar alertas por pivô
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {pivots.map(pivot => {
                            const sub = expandedSubs.find(s => s.pivot_id === pivot.id)
                            const key = (field: string) => `${contact.id}-${pivot.id}-${field}`
                            return (
                              <div key={pivot.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                                background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 8, padding: '10px 12px',
                              }}>
                                {/* Nome pivô */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                                    {pivot.name}
                                  </span>
                                  {pivot.farms?.name && (
                                    <span style={{ fontSize: 11, color: '#778899', marginLeft: 6 }}>
                                      {pivot.farms.name}
                                    </span>
                                  )}
                                </div>

                                {/* Toggles */}
                                {(
                                  [
                                    { field: 'notify_irrigation', label: 'Irrigação', color: '#0093D0' },
                                    { field: 'notify_rain', label: 'Chuva', color: '#22d3ee' },
                                    { field: 'notify_daily_summary', label: 'Resumo', color: '#22c55e' },
                                  ] as const
                                ).map(({ field, label, color }) => {
                                  const active = sub?.[field] ?? false
                                  const loading = savingSub === key(field)
                                  return (
                                    <button
                                      key={field}
                                      disabled={loading}
                                      onClick={() => handleToggleSub(contact.id, pivot.id, field, sub as SubscriptionWithPivot | undefined)}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        background: active ? `${color}22` : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${active ? `${color}44` : 'rgba(255,255,255,0.08)'}`,
                                        color: active ? color : '#778899',
                                        borderRadius: 6, padding: '4px 9px', fontSize: 11,
                                        fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                                      }}
                                    >
                                      {loading
                                        ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                        : active ? <Bell size={11} /> : <BellOff size={11} />
                                      }
                                      {label}
                                    </button>
                                  )
                                })}

                                {/* Remover */}
                                {sub && (
                                  <button
                                    disabled={savingSub === `${contact.id}-${pivot.id}`}
                                    onClick={() => handleRemoveSub(contact.id, pivot.id)}
                                    title="Remover pivô"
                                    style={{
                                      background: 'none', border: 'none',
                                      color: '#778899', cursor: 'pointer', padding: 4,
                                      display: 'flex', alignItems: 'center',
                                    }}
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal criar/editar */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: '#0f1923', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14, padding: 28, width: 420, maxWidth: '92vw',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                {editingContact ? 'Editar contato' : 'Novo contato'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#8899aa', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Nome */}
              <label style={{ fontSize: 12, color: '#8899aa', fontWeight: 600 }}>
                Nome
                <input
                  value={form.contact_name}
                  onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                  placeholder="Ex: João Silva"
                  style={inputStyle}
                />
              </label>

              {/* Telefone */}
              <label style={{ fontSize: 12, color: '#8899aa', fontWeight: 600 }}>
                Telefone
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <select
                    value={form.country_code}
                    onChange={e => setForm(f => ({ ...f, country_code: e.target.value }))}
                    style={{
                      ...inputStyle, marginTop: 0, width: 'auto', flexShrink: 0,
                      paddingRight: 8, cursor: 'pointer',
                    }}
                  >
                    {COUNTRY_CODES.map(c => (
                      <option key={c.code} value={c.code}>{c.flag} {c.label}</option>
                    ))}
                  </select>
                  <input
                    value={form.local_phone}
                    onChange={e => setForm(f => ({ ...f, local_phone: e.target.value }))}
                    placeholder="(18) 99999-8888"
                    style={{ ...inputStyle, marginTop: 0, flex: 1 }}
                  />
                </div>
                <span style={{ fontSize: 11, color: '#778899', marginTop: 4, display: 'block' }}>
                  Número completo com DDD, sem espaços ou traços
                </span>
              </label>

              {/* Hora de notificação */}
              <label style={{ fontSize: 12, color: '#8899aa', fontWeight: 600 }}>
                Hora de notificação (0–23)
                <input
                  type="number"
                  min={0} max={23}
                  value={form.notification_hour}
                  onChange={e => setForm(f => ({ ...f, notification_hour: e.target.value }))}
                  style={inputStyle}
                />
              </label>

              {/* Ativo */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#e2e8f0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                />
                Contato ativo
              </label>

              {formError && (
                <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{formError}</p>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={() => setShowModal(false)} style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#8899aa', borderRadius: 8, padding: '9px 0', fontSize: 13, cursor: 'pointer',
                }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving} style={{
                  flex: 2, background: '#0093D0', border: 'none', color: '#fff',
                  borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 6,
  background: '#162030', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e2e8f0',
  outline: 'none', boxSizing: 'border-box',
}

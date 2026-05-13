'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
  Users,
  CircleDot,
  Zap,
  Info,
  Droplets,
  CalendarDays,
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

  // Assinaturas — mapa por contactId para acesso rápido
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null)
  const [allSubs, setAllSubs] = useState<Record<string, SubscriptionWithPivot[]>>({})
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

  // ─── KPIs computados ─────────────────────────────────────

  const activeContacts = useMemo(() => contacts.filter(c => c.is_active).length, [contacts])

  const monitoredPivotIds = useMemo(() => {
    const ids = new Set<string>()
    Object.values(allSubs).flat().forEach(s => ids.add(s.pivot_id))
    return ids.size
  }, [allSubs])

  const totalAlerts = useMemo(() => {
    return Object.values(allSubs).flat().reduce((acc, s) => {
      if (s.notify_irrigation) acc++
      if (s.notify_rain) acc++
      if (s.notify_daily_summary) acc++
      return acc
    }, 0)
  }, [allSubs])

  // Próximo envio: horário mais cedo dos contatos ativos
  const nextSendHour = useMemo(() => {
    const hours = contacts.filter(c => c.is_active).map(c => c.notification_hour)
    if (hours.length === 0) return null
    return Math.min(...hours)
  }, [contacts])

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
      setAllSubs(prev => { const n = { ...prev }; delete n[id]; return n })
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
    // Só busca se ainda não carregou
    if (allSubs[contactId]) return
    setLoadingSubs(true)
    try {
      const subs = await listSubscriptionsByContact(contactId)
      setAllSubs(prev => ({ ...prev, [contactId]: subs }))
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
      setAllSubs(prev => {
        const list = prev[contactId] ?? []
        const exists = list.find(s => s.pivot_id === pivotId)
        const pivot = pivots.find(p => p.id === pivotId)
        const newEntry = { ...updated, pivots: pivot ? { id: pivotId, name: pivot.name, farms: pivot.farms } : null }
        return {
          ...prev,
          [contactId]: exists
            ? list.map(s => s.pivot_id === pivotId ? { ...s, ...updated } : s)
            : [...list, newEntry],
        }
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
      setAllSubs(prev => ({
        ...prev,
        [contactId]: (prev[contactId] ?? []).filter(s => s.pivot_id !== pivotId),
      }))
    } catch (e) {
      console.error(e)
    } finally {
      setSavingSub(null)
    }
  }

  // ─── Render ───────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--color-text-secondary)' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: '#0093D0' }} />
    </div>
  )

  if (pageError) return (
    <div style={{ padding: 32, color: '#ef4444', fontSize: 14 }}>{pageError}</div>
  )

  return (
    <div style={{ maxWidth: 900 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={18} style={{ color: '#22c55e' }} />
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.025em' }}>
              Central WhatsApp
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', lineHeight: 1.625 }}>
            Configure quem recebe alertas de irrigação, chuva e resumo diário.
          </p>
        </div>
        <button onClick={openCreate} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: '#0093D0', color: '#fff', border: 'none',
          borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', minHeight: 44, boxShadow: '0 2px 8px rgba(0,147,208,0.25)',
        }}>
          <Plus size={15} /> Novo contato
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[
          { icon: <Users size={14} />, label: 'Contatos ativos', value: activeContacts, color: '#22c55e' },
          { icon: <CircleDot size={14} />, label: 'Pivôs monitorados', value: monitoredPivotIds, color: '#0093D0' },
          { icon: <Bell size={14} />, label: 'Alertas ativos', value: totalAlerts, color: '#f59e0b' },
          {
            icon: <Clock size={14} />,
            label: 'Próximo envio',
            value: nextSendHour !== null ? `${String(nextSendHour).padStart(2, '0')}h` : '—',
            color: '#22d3ee',
          },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ color: kpi.color }}>{kpi.icon}</span>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{kpi.label}</span>
            </div>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: kpi.color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.025em', lineHeight: 1 }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Como funciona ── */}
      <div style={{ background: 'rgba(0,147,208,0.04)', border: '1px solid rgba(0,147,208,0.12)', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Info size={13} style={{ color: '#0093D0' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0093D0' }}>Como funciona</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {[
            { icon: <Users size={14} />, title: 'Cadastre contatos', desc: 'Adicione quem deve receber as mensagens e o horário preferido.' },
            { icon: <CircleDot size={14} />, title: 'Vincule pivôs', desc: 'Defina quais pivôs cada pessoa monitora.' },
            { icon: <Bell size={14} />, title: 'Configure alertas', desc: 'Escolha irrigação, chuva e/ou resumo diário por pivô.' },
          ].map(item => (
            <div key={item.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,147,208,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#0093D0' }}>
                {item.icon}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>{item.title}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Lista de contatos ── */}
      {contacts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 14, color: 'var(--color-text-secondary)' }}>
          <MessageSquare size={36} style={{ marginBottom: 12, color: '#334455' }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>Nenhum contato cadastrado</p>
          <p style={{ margin: '4px 0 16px', fontSize: 12, color: '#445566' }}>Clique em &quot;Novo contato&quot; para configurar os alertas.</p>
          <button onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0093D0', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> Novo contato
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contacts.map(contact => {
            const isExpanded = expandedContactId === contact.id
            const contactSubs = allSubs[contact.id] ?? []
            const activeSubs = contactSubs.filter(s => s.notify_irrigation || s.notify_rain || s.notify_daily_summary)
            const linkedPivotNames = contactSubs.map(s => pivots.find(p => p.id === s.pivot_id)?.name).filter(Boolean)

            // Tipos de alerta únicos ativos
            const hasIrrigation = contactSubs.some(s => s.notify_irrigation)
            const hasRain = contactSubs.some(s => s.notify_rain)
            const hasSummary = contactSubs.some(s => s.notify_daily_summary)
            const hasAnySub = contactSubs.length > 0

            // Status do contato
            const statusLabel = !contact.is_active ? 'Pausado' : !hasAnySub ? 'Sem pivô' : 'Ativo'
            const statusColor = !contact.is_active ? '#64748b' : !hasAnySub ? '#f59e0b' : '#22c55e'
            const statusBg = !contact.is_active ? 'rgba(100,116,139,0.1)' : !hasAnySub ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)'
            const statusBorder = !contact.is_active ? 'rgba(100,116,139,0.2)' : !hasAnySub ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)'

            return (
              <div key={contact.id} style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.15s' }}>

                {/* ── Linha principal do contato ── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px' }}>

                  {/* Avatar */}
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: contact.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)', border: `1px solid ${contact.is_active ? 'rgba(34,197,94,0.2)' : 'rgba(100,116,139,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <User size={16} style={{ color: contact.is_active ? '#22c55e' : '#64748b' }} />
                  </div>

                  {/* Info principal */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Linha 1: nome + status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                        {contact.contact_name}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: statusBg, color: statusColor, border: `1px solid ${statusBorder}` }}>
                        {statusLabel}
                      </span>
                    </div>

                    {/* Linha 2: telefone + horário */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 14px', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={11} style={{ color: '#445566' }} /> {displayPhone(contact.phone)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} style={{ color: '#445566' }} /> Recebe às {String(contact.notification_hour).padStart(2, '0')}h
                      </span>
                    </div>

                    {/* Linha 3: chips de alertas ativos + pivôs */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {hasIrrigation && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(0,147,208,0.1)', color: '#0093D0', border: '1px solid rgba(0,147,208,0.22)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Zap size={8} /> Irrigação
                        </span>
                      )}
                      {hasRain && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(6,182,212,0.08)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.2)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Droplets size={8} /> Chuva
                        </span>
                      )}
                      {hasSummary && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(34,197,94,0.08)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CalendarDays size={8} /> Resumo diário
                        </span>
                      )}
                      {linkedPivotNames.length > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', padding: '2px 6px', borderRadius: 20, background: 'var(--color-surface-border2)', border: '1px solid var(--color-surface-border2)' }}>
                          {linkedPivotNames.length === 1 ? linkedPivotNames[0] : `${linkedPivotNames.length} pivôs`}
                        </span>
                      )}
                      {!hasAnySub && allSubs[contact.id] !== undefined && (
                        <span style={{ fontSize: 10, color: '#445566', fontStyle: 'italic' }}>Nenhum pivô vinculado</span>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <button
                      onClick={() => toggleExpand(contact.id)}
                      title="Pivôs e alertas"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: isExpanded ? 'rgba(0,147,208,0.12)' : 'var(--color-surface-border2)', border: `1px solid ${isExpanded ? 'rgba(0,147,208,0.3)' : 'rgba(255,255,255,0.07)'}`, color: isExpanded ? '#0093D0' : 'var(--color-text-secondary)', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                    >
                      {activeSubs.length > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#0093D0', color: '#fff', borderRadius: 10, padding: '0px 5px', lineHeight: '16px' }}>{activeSubs.length}</span>
                      )}
                      Pivôs e alertas
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <button onClick={() => openEdit(contact)} title="Editar contato"
                      style={{ padding: 8, minHeight: 34, minWidth: 34, borderRadius: 8, border: '1px solid transparent', background: 'var(--color-surface-border2)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#0093D0'; el.style.background = 'rgba(0,147,208,0.08)'; el.style.borderColor = 'rgba(0,147,208,0.2)' }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--color-text-muted)'; el.style.background = 'var(--color-surface-border2)'; el.style.borderColor = 'transparent' }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(contact.id)} title="Excluir contato"
                      style={{ padding: 8, minHeight: 34, minWidth: 34, borderRadius: 8, border: '1px solid transparent', background: 'var(--color-surface-border2)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#ef4444'; el.style.background = 'rgba(239,68,68,0.08)'; el.style.borderColor = 'rgba(239,68,68,0.2)' }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--color-text-muted)'; el.style.background = 'var(--color-surface-border2)'; el.style.borderColor = 'transparent' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* ── Painel de pivôs expandido ── */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)', padding: '14px 18px' }}>
                    {loadingSubs && !allSubs[contact.id] ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13 }}>
                        <Loader2 size={13} className="animate-spin" /> Carregando pivôs…
                      </div>
                    ) : pivots.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Nenhum pivô cadastrado na empresa.</p>
                    ) : (
                      <div>
                        <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: '#445566', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                          Alertas por pivô — clique para ativar/desativar
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {pivots.map(pivot => {
                            const sub = (allSubs[contact.id] ?? []).find(s => s.pivot_id === pivot.id)
                            const key = (field: string) => `${contact.id}-${pivot.id}-${field}`
                            return (
                              <div key={pivot.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 10, padding: '10px 14px' }}>
                                {/* Nome pivô */}
                                <div style={{ flex: 1, minWidth: 120 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{pivot.name}</span>
                                  {pivot.farms?.name && (
                                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>{pivot.farms.name}</span>
                                  )}
                                </div>

                                {/* Toggles de alertas */}
                                {(
                                  [
                                    { field: 'notify_irrigation' as const, label: 'Irrigação', color: '#0093D0', icon: <Zap size={10} /> },
                                    { field: 'notify_rain' as const, label: 'Chuva', color: '#22d3ee', icon: <Droplets size={10} /> },
                                    { field: 'notify_daily_summary' as const, label: 'Resumo', color: '#22c55e', icon: <CalendarDays size={10} /> },
                                  ]
                                ).map(({ field, label, color, icon }) => {
                                  const active = sub?.[field] ?? false
                                  const isLoading = savingSub === key(field)
                                  return (
                                    <button
                                      key={field}
                                      disabled={isLoading}
                                      onClick={() => handleToggleSub(contact.id, pivot.id, field, sub as SubscriptionWithPivot | undefined)}
                                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: active ? `${color}18` : 'var(--color-surface-border2)', border: `1px solid ${active ? `${color}40` : 'rgba(255,255,255,0.07)'}`, color: active ? color : 'var(--color-text-muted)', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
                                    >
                                      {isLoading ? <Loader2 size={10} className="animate-spin" /> : active ? <Bell size={10} /> : <BellOff size={10} />}
                                      {icon}
                                      {label}
                                    </button>
                                  )
                                })}

                                {/* Remover pivô */}
                                {sub && (
                                  <button
                                    disabled={savingSub === `${contact.id}-${pivot.id}`}
                                    onClick={() => handleRemoveSub(contact.id, pivot.id)}
                                    title="Remover todos os alertas deste pivô"
                                    style={{ padding: 5, background: 'none', border: '1px solid transparent', borderRadius: 6, color: '#334455', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#ef4444'; el.style.borderColor = 'rgba(239,68,68,0.2)' }}
                                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#334455'; el.style.borderColor = 'transparent' }}
                                  >
                                    <X size={12} />
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

      {/* ── Modal criar/editar ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)', borderRadius: 16, padding: 'clamp(16px,4vw,28px)', width: '100%', maxWidth: 440, boxShadow: '0 20px 48px -8px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.025em' }}>
                {editingContact ? 'Editar contato' : 'Novo contato'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Nome */}
              <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                Nome
                <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                  placeholder="Ex: João Silva" style={inputStyle} />
              </label>

              {/* Telefone */}
              <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                Telefone
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <select value={form.country_code} onChange={e => setForm(f => ({ ...f, country_code: e.target.value }))}
                    style={{ ...inputStyle, marginTop: 0, width: 'auto', flexShrink: 0, paddingRight: 8, cursor: 'pointer' }}>
                    {COUNTRY_CODES.map(c => (
                      <option key={c.code} value={c.code}>{c.flag} {c.label}</option>
                    ))}
                  </select>
                  <input value={form.local_phone} onChange={e => setForm(f => ({ ...f, local_phone: e.target.value }))}
                    placeholder="(18) 99999-8888" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
                </div>
                <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                  Número completo com DDD, sem espaços ou traços
                </span>
              </label>

              {/* Hora */}
              <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                Horário de recebimento (0–23h)
                <input type="number" min={0} max={23} value={form.notification_hour}
                  onChange={e => setForm(f => ({ ...f, notification_hour: e.target.value }))}
                  style={inputStyle} />
                <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>Ex: 7 = 07:00 da manhã</span>
              </label>

              {/* Ativo toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  style={{ width: 40, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.is_active ? '#0093D0' : '#1e2d40', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: form.is_active ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
                </button>
                <span style={{ fontSize: 13, color: 'var(--color-text)' }}>
                  {form.is_active ? 'Contato ativo — receberá alertas' : 'Contato pausado — não receberá alertas'}
                </span>
              </div>

              {formError && (
                <p style={{ margin: 0, fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{formError}</p>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, background: 'var(--color-surface-border2)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)', borderRadius: 9, padding: '10px 0', fontSize: 13, cursor: 'pointer', minHeight: 44 }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: '#0093D0', border: 'none', color: '#fff', borderRadius: 9, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}>
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Salvando…' : 'Salvar contato'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 6,
  background: 'var(--color-surface-sidebar)', border: '1px solid var(--color-surface-border)',
  borderRadius: 9, padding: '10px 12px', fontSize: 13, color: 'var(--color-text)',
  outline: 'none', boxSizing: 'border-box',
}

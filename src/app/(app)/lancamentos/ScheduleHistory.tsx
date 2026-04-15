'use client'

import { useState, useEffect } from 'react'
import { X, History, CheckCircle, XCircle, Clock, Trash2, MessageCircle, Printer, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  listSchedulesByCompany,
  cancelSchedule,
  confirmSchedule,
} from '@/services/irrigation-schedule'
import type { IrrigationSchedule, IrrigationCancelledReason } from '@/types/database'
import type { ManagementSeasonContext } from '@/services/management'

// ─── helpers ──────────────────────────────────────────────────

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(ymd: string, n: number) {
  const d = new Date(ymd + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toYMD(d)
}

function fmtDate(ymd: string) {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtDateLong(ymd: string) {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

function statusColor(status: string) {
  if (status === 'done')      return '#22c55e'
  if (status === 'cancelled') return '#ef4444'
  return '#0093D0'
}

function statusLabel(status: string) {
  if (status === 'done')      return 'Realizado'
  if (status === 'cancelled') return 'Cancelado'
  return 'Programado'
}

function statusIcon(status: string) {
  if (status === 'done')      return <CheckCircle size={12} />
  if (status === 'cancelled') return <XCircle size={12} />
  return <Clock size={12} />
}

// ─── tipos ────────────────────────────────────────────────────

interface WhatsappContact {
  id: string
  phone: string
  contact_name: string
  is_active: boolean
}

interface Props {
  companyId: string
  today: string
  metas: ManagementSeasonContext[]
  onSchedulesChanged: () => void
}

// ─── Modal de cancelamento inline ─────────────────────────────

function CancelModal({
  schedule, pivotName, onConfirm, onClose,
}: {
  schedule: IrrigationSchedule
  pivotName: string
  onConfirm: (reason: IrrigationCancelledReason, notes: string) => Promise<void>
  onClose: () => void
}) {
  const [reason, setReason] = useState<IrrigationCancelledReason>('chuva')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const REASONS = [
    { value: 'chuva' as IrrigationCancelledReason,  label: '🌧 Chuva',  color: '#22d3ee' },
    { value: 'quebra' as IrrigationCancelledReason, label: '🔧 Quebra', color: '#f59e0b' },
    { value: 'outro' as IrrigationCancelledReason,  label: '❓ Outro',  color: '#8899aa' },
  ]

  async function handle() {
    setLoading(true)
    try { await onConfirm(reason, notes) } finally { setLoading(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#0f1923', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 16, padding: 28, width: 360, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Cancelar irrigação</p>
            <p style={{ fontSize: 12, color: '#445566', margin: '2px 0 0' }}>{pivotName} · {fmtDateLong(schedule.date)}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#445566', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {REASONS.map(r => (
            <button key={r.value} onClick={() => setReason(r.value)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8,
              border: `1px solid ${reason === r.value ? r.color : 'rgba(255,255,255,0.08)'}`,
              background: reason === r.value ? `${r.color}18` : 'rgba(255,255,255,0.03)',
              color: reason === r.value ? r.color : '#667788', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{r.label}</button>
          ))}
        </div>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Observação opcional..."
          rows={2}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, resize: 'none',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
            background: 'transparent', color: '#667788', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Voltar</button>
          <button onClick={handle} disabled={loading} style={{
            flex: 2, padding: '10px', borderRadius: 8, border: 'none',
            background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>{loading ? 'Cancelando…' : 'Confirmar cancelamento'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de envio WhatsApp ───────────────────────────────────

function WhatsAppModal({
  schedules, metas, onClose,
}: {
  schedules: IrrigationSchedule[]
  metas: ManagementSeasonContext[]
  onClose: () => void
}) {
  const [contacts, setContacts] = useState<WhatsappContact[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const sb = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(sb as any).from('whatsapp_contacts')
      .select('id,phone,contact_name,is_active')
      .eq('is_active', true)
      .then(({ data }: { data: WhatsappContact[] | null }) => {
        if (data) setContacts(data)
      })
  }, [])

  function buildMessage(): string {
    const lines: string[] = []
    lines.push('🌱 *IrrigaAgro — Programação de Irrigação*')
    lines.push(`_Emitido em ${new Date().toLocaleString('pt-BR')}_\n`)

    // Agrupar por pivô
    const byPivot = new Map<string, IrrigationSchedule[]>()
    for (const s of schedules) {
      const arr = byPivot.get(s.pivot_id) ?? []
      arr.push(s)
      byPivot.set(s.pivot_id, arr)
    }

    for (const [pivotId, pivotSchedules] of byPivot) {
      const meta = metas.find(m => m.pivot?.id === pivotId)
      const pivotName = meta?.pivot?.name ?? 'Pivô'
      const farmName  = meta?.farm?.name  ?? ''
      lines.push(`*📍 ${pivotName}* — ${farmName}`)

      for (const s of pivotSchedules.sort((a, b) => a.date.localeCompare(b.date))) {
        const status = s.status === 'cancelled' ? '❌' : s.status === 'done' ? '✅' : '📋'
        const lamina = s.lamina_mm != null ? `${s.lamina_mm}mm` : '—'
        const vel    = s.speed_percent != null ? ` • ${s.speed_percent}%` : ''
        const hora   = s.start_time ? ` • ${s.start_time}${s.end_time ? `→${s.end_time}` : ''}` : ''
        const sectorSuffix = s.sector_id ? ` (setor)` : ''
        lines.push(`  ${status} ${fmtDate(s.date)}${sectorSuffix}: ${lamina}${vel}${hora}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  async function handleSend() {
    if (selectedIds.size === 0) { setError('Selecione ao menos um contato.'); return }
    setSending(true)
    setError('')
    const message = buildMessage()
    let anyError = false

    for (const id of selectedIds) {
      const contact = contacts.find(c => c.id === id)
      if (!contact) continue
      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: contact.phone, message }),
        })
        if (!res.ok) anyError = true
      } catch {
        anyError = true
      }
    }

    setSending(false)
    if (anyError) {
      setError('Houve erro ao enviar para alguns contatos.')
    } else {
      setSent(true)
      setTimeout(onClose, 1500)
    }
  }

  const message = buildMessage()

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={onClose}>
      <div style={{
        background: '#0d1520', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 16, padding: 28, width: 480, maxWidth: '95vw',
        maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MessageCircle size={18} style={{ color: '#22c55e' }} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Enviar por WhatsApp</p>
              <p style={{ fontSize: 11, color: '#445566', margin: 0 }}>{schedules.length} programação(ões)</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#445566', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Contatos */}
        <p style={{ fontSize: 11, color: '#6a8090', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Destinatários
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {contacts.length === 0 ? (
            <p style={{ fontSize: 12, color: '#445566', margin: 0 }}>Nenhum contato cadastrado em WhatsApp.</p>
          ) : contacts.map(c => {
            const sel = selectedIds.has(c.id)
            return (
              <button key={c.id} onClick={() => {
                setSelectedIds(prev => {
                  const next = new Set(prev)
                  sel ? next.delete(c.id) : next.add(c.id)
                  return next
                })
              }} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${sel ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.07)'}`,
                background: sel ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
                textAlign: 'left', width: '100%',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `2px solid ${sel ? '#22c55e' : 'rgba(255,255,255,0.2)'}`,
                  background: sel ? '#22c55e' : 'transparent',
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {sel && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0d1520' }} />}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>{c.contact_name}</p>
                  <p style={{ fontSize: 11, color: '#556677', margin: 0 }}>+{c.phone}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Preview da mensagem */}
        <p style={{ fontSize: 11, color: '#6a8090', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Preview da mensagem
        </p>
        <div style={{
          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 18,
          maxHeight: 200, overflowY: 'auto',
        }}>
          <pre style={{ fontSize: 11, color: '#8899aa', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6 }}>
            {message}
          </pre>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#ef4444', margin: '0 0 12px' }}>{error}</p>
        )}

        {sent ? (
          <div style={{ textAlign: 'center', padding: '12px 0', color: '#22c55e', fontSize: 14, fontWeight: 700 }}>
            ✓ Mensagem enviada com sucesso!
          </div>
        ) : (
          <button
            onClick={handleSend}
            disabled={sending || selectedIds.size === 0}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
              background: sending || selectedIds.size === 0
                ? 'rgba(34,197,94,0.2)'
                : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: sending || selectedIds.size === 0 ? '#334433' : '#fff',
              fontSize: 14, fontWeight: 700, cursor: sending || selectedIds.size === 0 ? 'not-allowed' : 'pointer',
            }}>
            {sending ? 'Enviando…' : `Enviar para ${selectedIds.size} contato(s)`}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Componente principal: Histórico ──────────────────────────

export function ScheduleHistory({
  companyId, today, metas, onSchedulesChanged,
}: Props) {
  const [schedules, setSchedules] = useState<IrrigationSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Filtros
  const [filterStatus, setFilterStatus] = useState<'all' | 'planned' | 'done' | 'cancelled'>('all')
  const [filterPivotId, setFilterPivotId] = useState<string>('all')

  // Modais
  const [cancelTarget, setCancelTarget] = useState<IrrigationSchedule | null>(null)
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  // Carregar histórico: 30 dias para trás + 7 dias futuros
  useEffect(() => {
    if (!expanded) return
    const from = addDays(today, -30)
    const to   = addDays(today, 7)
    setLoading(true)
    listSchedulesByCompany(companyId, from, to)
      .then(data => setSchedules(data))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false))
  }, [companyId, today, expanded])

  function refreshList() {
    const from = addDays(today, -30)
    const to   = addDays(today, 7)
    listSchedulesByCompany(companyId, from, to)
      .then(data => setSchedules(data))
      .catch(() => {})
  }

  async function handleDelete(s: IrrigationSchedule) {
    if (!confirm(`Excluir programação de ${fmtDate(s.date)}? Essa ação não pode ser desfeita.`)) return
    setDeleting(s.id)
    try {
      const sb = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('irrigation_schedule').delete().eq('id', s.id)
      setSchedules(prev => prev.filter(x => x.id !== s.id))
      onSchedulesChanged()
    } finally {
      setDeleting(null)
    }
  }

  async function handleConfirm(s: IrrigationSchedule) {
    setConfirming(s.id)
    try {
      const updated = await confirmSchedule(s.id)
      setSchedules(prev => prev.map(x => x.id === updated.id ? updated : x))
      onSchedulesChanged()
    } finally {
      setConfirming(null)
    }
  }

  async function handleCancelConfirm(reason: IrrigationCancelledReason, notes: string) {
    if (!cancelTarget) return
    const updated = await cancelSchedule(cancelTarget.id, reason, notes)
    setSchedules(prev => prev.map(x => x.id === updated.id ? updated : x))
    setCancelTarget(null)
    onSchedulesChanged()
  }

  // Aplicar filtros
  const filtered = schedules.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (filterPivotId !== 'all' && s.pivot_id !== filterPivotId) return false
    return true
  })

  // Pivôs disponíveis (para filtro)
  const pivotOptions = metas
    .filter(m => m.pivot != null)
    .map(m => ({ id: m.pivot!.id, name: m.pivot!.name }))

  // Agrupar por data (decrescente)
  const byDate = new Map<string, IrrigationSchedule[]>()
  for (const s of [...filtered].sort((a, b) => b.date.localeCompare(a.date))) {
    const arr = byDate.get(s.date) ?? []
    arr.push(s)
    byDate.set(s.date, arr)
  }

  return (
    <>
      {/* Modal cancelamento */}
      {cancelTarget && (
        <CancelModal
          schedule={cancelTarget}
          pivotName={metas.find(m => m.pivot?.id === cancelTarget.pivot_id)?.pivot?.name ?? 'Pivô'}
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {/* Modal WhatsApp */}
      {whatsappOpen && (
        <WhatsAppModal
          schedules={filtered}
          metas={metas}
          onClose={() => setWhatsappOpen(false)}
        />
      )}

      {/* Print: layout profissional — visível apenas na impressão */}
      <PrintLayout schedules={filtered} metas={metas} />

      {/* Seção */}
      <div style={{
        background: '#0d1520',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {/* Header clicável */}
        <div
          onClick={() => setExpanded(e => !e)}
          style={{
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'rgba(0,147,208,0.12)', border: '1px solid rgba(0,147,208,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <History size={16} style={{ color: '#0093D0' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
              Histórico de Programações
            </p>
            <p style={{ fontSize: 11, color: '#445566', margin: 0 }}>
              Últimos 30 dias + próximos 7 dias
            </p>
          </div>

          {/* Ações rápidas — apenas quando expandido */}
          {expanded && (
            <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => window.print()}
                title="Imprimir"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(0,147,208,0.25)',
                  background: 'rgba(0,147,208,0.08)', color: '#0093D0',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                <Printer size={13} /> Imprimir
              </button>
              <button
                onClick={() => setWhatsappOpen(true)}
                title="Enviar por WhatsApp"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.25)',
                  background: 'rgba(34,197,94,0.08)', color: '#22c55e',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                <MessageCircle size={13} /> WhatsApp
              </button>
            </div>
          )}

          <div style={{ color: '#334455', flexShrink: 0 }}>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>

        {/* Conteúdo */}
        {expanded && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '14px 16px 16px' }}>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {/* Status */}
              {(['all', 'planned', 'done', 'cancelled'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} style={{
                  padding: '5px 12px', borderRadius: 99, border: `1px solid ${filterStatus === s ? '#0093D0' : 'rgba(255,255,255,0.08)'}`,
                  background: filterStatus === s ? 'rgba(0,147,208,0.12)' : 'rgba(255,255,255,0.02)',
                  color: filterStatus === s ? '#0093D0' : '#556677',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}>
                  {s === 'all' ? 'Todos' : statusLabel(s)}
                </button>
              ))}

              {/* Pivô */}
              {pivotOptions.length > 1 && (
                <select
                  value={filterPivotId}
                  onChange={e => setFilterPivotId(e.target.value)}
                  style={{
                    padding: '5px 10px', borderRadius: 99,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: '#0d1520', color: '#8899aa',
                    fontSize: 11, cursor: 'pointer', outline: 'none',
                  }}>
                  <option value="all">Todos os pivôs</option>
                  {pivotOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}

              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#445566', alignSelf: 'center' }}>
                {filtered.length} registro(s)
              </span>
            </div>

            {/* Lista */}
            {loading ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#445566', fontSize: 13 }}>Carregando…</div>
            ) : byDate.size === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#445566', fontSize: 13 }}>
                Nenhuma programação encontrada.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Array.from(byDate.entries()).map(([date, rows]) => (
                  <div key={date}>
                    {/* Separador de data */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 0 4px', color: '#445566',
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: date === today ? '#0093D0' : date > today ? '#22c55e' : '#445566',
                      }}>
                        {date === today ? '● Hoje' : fmtDateLong(date)}
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                    </div>

                    {/* Linhas */}
                    {rows.map(s => {
                      const meta = metas.find(m => m.pivot?.id === s.pivot_id)
                      const pivotName  = meta?.pivot?.name ?? '—'
                      const farmName   = meta?.farm?.name  ?? ''
                      const color = statusColor(s.status)
                      const isDeleting   = deleting   === s.id
                      const isConfirming = confirming === s.id

                      return (
                        <div key={s.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 9, marginBottom: 2,
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.04)',
                          transition: 'background 0.1s',
                        }}>
                          {/* Status pill */}
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 99, flexShrink: 0,
                            background: `${color}15`, border: `1px solid ${color}35`,
                            color, fontSize: 10, fontWeight: 700,
                          }}>
                            {statusIcon(s.status)}
                            {statusLabel(s.status)}
                          </div>

                          {/* Pivô + setor */}
                          <div style={{ flex: '0 0 140px', minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#c8d8e8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {pivotName}
                            </p>
                            <p style={{ fontSize: 10, color: '#445566', margin: 0 }}>
                              {farmName}{s.sector_id ? ' · setor' : ''}
                            </p>
                          </div>

                          {/* Dados técnicos */}
                          <div style={{ display: 'flex', gap: 16, flex: 1, flexWrap: 'wrap' }}>
                            {s.lamina_mm != null && (
                              <div>
                                <p style={{ fontSize: 9, color: '#445566', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lâmina</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#0093D0', margin: 0, fontFamily: 'var(--font-mono)' }}>{s.lamina_mm}mm</p>
                              </div>
                            )}
                            {s.speed_percent != null && (
                              <div>
                                <p style={{ fontSize: 9, color: '#445566', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vel</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', margin: 0, fontFamily: 'var(--font-mono)' }}>{s.speed_percent}%</p>
                              </div>
                            )}
                            {s.start_time && (
                              <div>
                                <p style={{ fontSize: 9, color: '#445566', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horário</p>
                                <p style={{ fontSize: 12, fontWeight: 600, color: '#8899aa', margin: 0, fontFamily: 'var(--font-mono)' }}>
                                  {s.start_time}{s.end_time ? ` → ${s.end_time}` : ''}
                                </p>
                              </div>
                            )}
                            {s.status === 'cancelled' && s.cancelled_reason && (
                              <div>
                                <p style={{ fontSize: 9, color: '#445566', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motivo</p>
                                <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{s.cancelled_reason}</p>
                              </div>
                            )}
                          </div>

                          {/* Ações */}
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            {/* Confirmar realizado */}
                            {s.status === 'planned' && (
                              <button
                                onClick={() => handleConfirm(s)}
                                disabled={isConfirming}
                                title="Marcar como realizado"
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(34,197,94,0.3)',
                                  background: 'rgba(34,197,94,0.08)', color: '#22c55e',
                                  cursor: 'pointer',
                                }}>
                                {isConfirming ? '…' : <CheckCircle size={13} />}
                              </button>
                            )}
                            {/* Cancelar */}
                            {s.status === 'planned' && (
                              <button
                                onClick={() => setCancelTarget(s)}
                                title="Cancelar irrigação"
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(245,158,11,0.3)',
                                  background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
                                  cursor: 'pointer',
                                }}>
                                <XCircle size={13} />
                              </button>
                            )}
                            {/* Excluir */}
                            <button
                              onClick={() => handleDelete(s)}
                              disabled={isDeleting}
                              title="Excluir registro"
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)',
                                background: 'rgba(239,68,68,0.05)', color: '#ef4444',
                                cursor: 'pointer',
                              }}>
                              {isDeleting ? '…' : <Trash2 size={12} />}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Layout de impressão ───────────────────────────────────────

function PrintLayout({
  schedules, metas,
}: {
  schedules: IrrigationSchedule[]
  metas: ManagementSeasonContext[]
}) {
  if (schedules.length === 0) return null

  // Agrupar por pivô
  const byPivot = new Map<string, IrrigationSchedule[]>()
  for (const s of [...schedules].sort((a, b) => a.date.localeCompare(b.date))) {
    const arr = byPivot.get(s.pivot_id) ?? []
    arr.push(s)
    byPivot.set(s.pivot_id, arr)
  }

  return (
    <div className="print-only" style={{ display: 'none' }}>
      {/* Cabeçalho da empresa */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        paddingBottom: 14, marginBottom: 16,
        borderBottom: '3px solid #0093D0',
      }}>
        {/* Logo SVG IrrigaAgro */}
        <svg width="44" height="44" viewBox="0 0 64 64" fill="none">
          <defs>
            <linearGradient id="pb2" x1="8" y1="6" x2="36" y2="46" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38BDF8"/><stop offset="1" stopColor="#0284C7"/>
            </linearGradient>
            <linearGradient id="pg2" x1="28" y1="22" x2="54" y2="54" gradientUnits="userSpaceOnUse">
              <stop stopColor="#84CC16"/><stop offset="1" stopColor="#16A34A"/>
            </linearGradient>
          </defs>
          <path d="M31.5 4C31.5 4 13 22.6 13 35.5C13 47.4 21.8 56 33 56C44.2 56 53 47.4 53 35.5C53 22.6 31.5 4 31.5 4Z" fill="url(#pb2)"/>
          <path d="M30 24C41.6 24 51 33.4 51 45C51 48.2 50.3 51.1 48.9 53.7H30V24Z" fill="url(#pg2)" opacity="0.95"/>
          <rect x="23" y="37" width="6" height="13" rx="1.5" fill="#0B1220" opacity="0.9"/>
          <rect x="31" y="30" width="6" height="20" rx="1.5" fill="#0B1220" opacity="0.9"/>
          <rect x="39" y="23" width="6" height="27" rx="1.5" fill="#0B1220" opacity="0.9"/>
        </svg>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
            <span style={{ color: '#0284C7' }}>Irriga</span>
            <span style={{ color: '#16A34A', fontWeight: 300 }}>Agro</span>
          </div>
          <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>
            Programação de Irrigação
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#333', fontWeight: 600 }}>
            Emitido em {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 10, color: '#888' }}>Sistema IrrigaAgro · irrigaagro.com.br</div>
        </div>
      </div>

      {/* Tabela por pivô */}
      {Array.from(byPivot.entries()).map(([pivotId, rows]) => {
        const meta = metas.find(m => m.pivot?.id === pivotId)
        const pivotName = meta?.pivot?.name ?? '—'
        const farmName  = meta?.farm?.name  ?? ''

        return (
          <div key={pivotId} style={{ marginBottom: 24, pageBreakInside: 'avoid' }}>
            {/* Sub-cabeçalho do pivô */}
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              background: '#f0f7ff', borderRadius: 6,
              padding: '6px 12px', marginBottom: 8,
              borderLeft: '4px solid #0093D0',
            }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0284C7' }}>{pivotName}</span>
              <span style={{ fontSize: 12, color: '#666' }}>{farmName}</span>
              <span style={{ fontSize: 10, color: '#999', marginLeft: 'auto' }}>{rows.length} registro(s)</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Data', 'Setor', 'Lâmina (mm)', 'Vel (%)', 'Início', 'Fim', 'Chuva (mm)', 'Status', 'Obs'].map(h => (
                    <th key={h} style={{
                      textAlign: 'center', padding: '6px 8px',
                      borderBottom: '2px solid #0093D0', color: '#334455',
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const statusC = s.status === 'cancelled' ? '#ef4444' : s.status === 'done' ? '#22c55e' : '#0093D0'
                  return (
                    <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ textAlign: 'center', padding: '5px 8px', fontWeight: 700 }}>{fmtDate(s.date)}</td>
                      <td style={{ textAlign: 'center', padding: '5px 8px', color: '#666' }}>{s.sector_id ? 'Setor' : '—'}</td>
                      <td style={{ textAlign: 'center', padding: '5px 8px', fontWeight: 700, color: '#0093D0' }}>{s.lamina_mm ?? '—'}</td>
                      <td style={{ textAlign: 'center', padding: '5px 8px' }}>{s.speed_percent ?? '—'}</td>
                      <td style={{ textAlign: 'center', padding: '5px 8px' }}>{s.start_time ?? '—'}</td>
                      <td style={{ textAlign: 'center', padding: '5px 8px' }}>{s.end_time ?? '—'}</td>
                      <td style={{ textAlign: 'center', padding: '5px 8px' }}>{s.rainfall_mm ?? '—'}</td>
                      <td style={{ textAlign: 'center', padding: '5px 8px', color: statusC, fontWeight: 700, fontSize: 10 }}>
                        {statusLabel(s.status)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '5px 8px', color: '#888', fontSize: 10 }}>
                        {s.notes ?? ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      {/* Rodapé */}
      <div style={{ marginTop: 20, paddingTop: 10, borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, color: '#aaa' }}>IrrigaAgro — Sistema de Gestão de Irrigação</span>
        <span style={{ fontSize: 9, color: '#aaa' }}>www.irrigaagro.com.br</span>
      </div>
    </div>
  )
}

'use client'

import React, { useState, useEffect } from 'react'
import { X, History, CheckCircle, XCircle, Clock, Trash2, MessageCircle, Printer, ChevronDown, ChevronUp, Pencil, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  listSchedulesByCompany,
  cancelSchedule,
  confirmSchedule,
} from '@/services/irrigation-schedule'
import type { IrrigationSchedule, IrrigationCancelledReason, PivotSector } from '@/types/database'
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

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
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

// Determina o status geral de um lote
function batchStatus(rows: IrrigationSchedule[]): string {
  if (rows.every(r => r.status === 'done')) return 'done'
  if (rows.every(r => r.status === 'cancelled')) return 'cancelled'
  if (rows.some(r => r.status === 'planned')) return 'planned'
  return 'done'
}

// ─── tipos ────────────────────────────────────────────────────

interface WhatsappContact {
  id: string
  phone: string
  contact_name: string
  is_active: boolean
}

// ─── Toast simples ─────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: 'error' | 'success' }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: type === 'error' ? '#1a0a0a' : '#0a1a0a',
      border: `1px solid ${type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
      color: type === 'error' ? '#ef4444' : '#22c55e',
      borderRadius: 10, padding: '12px 18px', fontSize: 13, fontWeight: 600,
      maxWidth: 360, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      {type === 'error' ? '✗ ' : '✓ '}{message}
    </div>
  )
}

export interface BatchEditPayload {
  batchId: string
  pivotId: string
  schedules: IrrigationSchedule[]
}

export interface ReschedulePayload {
  originalRows: IrrigationSchedule[]   // lote original a ser cancelado
  newDate: string                       // nova data de início escolhida
  reason: IrrigationCancelledReason     // motivo do cancelamento
  notes: string
}

interface Props {
  companyId: string
  today: string
  metas: ManagementSeasonContext[]
  sectorsMap?: Record<string, PivotSector[]>   // pivotId → setores
  onSchedulesChanged: () => void
  onEditBatch?: (payload: BatchEditPayload) => void
  onReschedule?: (payload: ReschedulePayload) => void
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
  const [error, setError] = useState('')

  const REASONS = [
    { value: 'chuva' as IrrigationCancelledReason,  label: '🌧 Chuva',  color: '#22d3ee' },
    { value: 'quebra' as IrrigationCancelledReason, label: '🔧 Quebra', color: '#f59e0b' },
    { value: 'outro' as IrrigationCancelledReason,  label: '❓ Outro',  color: '#8899aa' },
  ]

  async function handle() {
    setLoading(true)
    setError('')
    try {
      await onConfirm(reason, notes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao cancelar. Tente novamente.')
    } finally {
      setLoading(false)
    }
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
        {error && (
          <p style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.08)', borderRadius: 6, padding: '8px 10px', margin: '10px 0 0' }}>
            ✗ {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
            background: 'transparent', color: '#667788', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Voltar</button>
          <button onClick={handle} disabled={loading} style={{
            flex: 2, padding: '10px', borderRadius: 8, border: 'none',
            background: loading ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.15)',
            color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
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

// ─── Layout de impressão ───────────────────────────────────────

// Paleta de cores por pivô — baseada nas cores reais do sistema IrrigaAgro
// Verde principal, depois âmbar, ciano, roxo...
const PIVOT_COLORS = [
  { bg: '#16a34a', light: '#dcfce7', text: '#14532d', border: '#86efac' },
  { bg: '#d97706', light: '#fef3c7', text: '#78350f', border: '#fcd34d' },
  { bg: '#0891b2', light: '#cffafe', text: '#164e63', border: '#67e8f9' },
  { bg: '#7c3aed', light: '#ede9fe', text: '#3b0764', border: '#c4b5fd' },
  { bg: '#be185d', light: '#fce7f3', text: '#831843', border: '#f9a8d4' },
  { bg: '#0f766e', light: '#ccfbf1', text: '#134e4a', border: '#5eead4' },
]

// Detecta se o horário "fim" passou da meia-noite comparado com "início"
function crossesMidnight(start: string, end: string): boolean {
  if (!start || !end) return false
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return eh * 60 + em < sh * 60 + sm
}

function fmtTime(time: string | null, start?: string | null): React.ReactNode {
  if (!time) return <span style={{ color: '#cbd5e1' }}>—</span>
  const nextDay = start ? crossesMidnight(start, time) : false
  return (
    <span>
      {time}
      {nextDay && <span style={{ fontSize: 8, color: '#f59e0b', fontWeight: 800, marginLeft: 2 }}>+1d</span>}
    </span>
  )
}

function weekdayAbbr(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()
}

function fmtDayMonth(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtMonthYear(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function PrintLayout({
  schedules, metas, sectorsMap, inline,
}: {
  schedules: IrrigationSchedule[]
  metas: ManagementSeasonContext[]
  sectorsMap?: Record<string, PivotSector[]>
  inline?: boolean   // quando true, aparece em tela (preview); quando false, só no @media print
}) {
  if (schedules.length === 0) return null

  const now = new Date()

  // Organizar por pivô
  const byPivot = new Map<string, IrrigationSchedule[]>()
  for (const s of [...schedules].sort((a, b) => a.date.localeCompare(b.date))) {
    const arr = byPivot.get(s.pivot_id) ?? []
    arr.push(s)
    byPivot.set(s.pivot_id, arr)
  }

  // Datas únicas ordenadas
  const allDates = Array.from(new Set(schedules.map(s => s.date))).sort()

  // Pivôs únicos na ordem de aparição
  const pivotIds = Array.from(byPivot.keys())

  // Nome do setor dado um sector_id
  function sectorName(pivotId: string, sectorId: string | null): string {
    if (!sectorId) return '—'
    const sectors = sectorsMap?.[pivotId] ?? []
    return sectors.find(s => s.id === sectorId)?.name ?? 'Setor'
  }

  // Fazendas únicas nesta programação
  const farms = Array.from(new Set(
    pivotIds.map(pid => metas.find(m => m.pivot?.id === pid)?.farm?.name).filter(Boolean)
  )) as string[]

  // Período
  const periodFrom = allDates[0]
  const periodTo   = allDates[allDates.length - 1]

  // Meses abrangidos (para o header do calendário)
  const months = Array.from(new Set(allDates.map(d => fmtMonthYear(d))))

  return (
    <div className={inline ? undefined : 'print-only'} style={{ display: inline ? 'block' : 'none', fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* ══════════════════════════════════════════════════
          CABEÇALHO
      ══════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        marginBottom: 20,
        borderRadius: 8, overflow: 'hidden',
        border: '1.5px solid #16a34a',
      }}>
        {/* Faixa verde esquerda com logo IrrigaAgro */}
        <div style={{
          background: 'linear-gradient(160deg, #14532d 0%, #16a34a 60%, #22c55e 100%)',
          padding: '16px 20px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          minWidth: 140, gap: 6,
        }}>
          {/* Ícone gota com barras — idêntico ao IrrigaAgroLogo.tsx */}
          <svg width="38" height="45" viewBox="0 0 84 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="pdropStroke" x1="42" y1="0" x2="42" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
              <linearGradient id="pbar1g" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
              <linearGradient id="pbar2g" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
              <linearGradient id="pbar3g" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
            <path d="M42 4 C42 4 8 44 8 64 C8 83 23 96 42 96 C61 96 76 83 76 64 C76 44 42 4 42 4 Z"
              stroke="url(#pdropStroke)" strokeWidth="3.5" fill="none" strokeLinejoin="round" />
            <rect x="22" y="62" width="10" height="22" rx="2.5" fill="url(#pbar1g)" />
            <rect x="37" y="50" width="10" height="34" rx="2.5" fill="url(#pbar2g)" />
            <rect x="52" y="38" width="10" height="46" rx="2.5" fill="url(#pbar3g)" />
          </svg>
          {/* Wordmark */}
          <div style={{ lineHeight: 1, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#4ade80', letterSpacing: '-0.01em' }}>Irriga</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#60a5fa', letterSpacing: '-0.01em' }}>Agro</span>
          </div>
          <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>
            Irrigação Inteligente
          </div>
        </div>

        {/* Conteúdo principal */}
        <div style={{ flex: 1, padding: '14px 18px', background: '#f8fdf8' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#14532d', marginBottom: 4, letterSpacing: '-0.3px' }}>
            Programação de Irrigação
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Fazenda(s)</span>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#14532d' }}>{farms.join(', ') || '—'}</div>
            </div>
            <div>
              <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Período</span>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#14532d' }}>
                {periodFrom === periodTo ? fmtDate(periodFrom) : `${fmtDate(periodFrom)} a ${fmtDate(periodTo)}`}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Pivôs</span>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#14532d' }}>{pivotIds.length}</div>
            </div>
            <div>
              <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Dias programados</span>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#14532d' }}>{allDates.length}</div>
            </div>
          </div>
        </div>

        {/* Data de emissão */}
        <div style={{
          padding: '14px 16px', background: '#f0fdf4',
          borderLeft: '1px solid #bbf7d0',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', minWidth: 140,
        }}>
          <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 2 }}>Emitido em</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#14532d' }}>
            {now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 6 }}>irrigaagro.com.br</div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          SEÇÃO 1 — CALENDÁRIO VISUAL
      ══════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 22, pageBreakInside: 'avoid' }}>

        {/* Título da seção */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ width: 4, height: 18, background: '#16a34a', borderRadius: 2 }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: '#14532d', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Calendário de Operação — {months.join(' / ')}
          </span>
        </div>

        {/* Legenda de pivôs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {pivotIds.map((pid, i) => {
            const meta = metas.find(m => m.pivot?.id === pid)
            const color = PIVOT_COLORS[i % PIVOT_COLORS.length]
            return (
              <div key={pid} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 8px', borderRadius: 4,
                background: color.light, border: `1px solid ${color.bg}`,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color.bg }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: color.text }}>
                  {meta?.pivot?.name ?? pid.slice(0, 6)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Grade calendário: linhas = dias, colunas = pivôs/setores */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5 }}>
            <thead>
              <tr>
                {/* Coluna de data */}
                <th style={{
                  width: 82, padding: '6px 8px', textAlign: 'left',
                  background: '#f1f5f9', borderBottom: '2px solid #16a34a',
                  fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b', fontWeight: 700,
                }}>
                  Data
                </th>
                {/* Uma coluna por pivô (ou setor se tiver) */}
                {pivotIds.flatMap((pid, pi) => {
                  const pivotMeta = metas.find(m => m.pivot?.id === pid)
                  const pivotName = pivotMeta?.pivot?.name ?? '—'
                  const sectors = sectorsMap?.[pid] ?? []
                  const color = PIVOT_COLORS[pi % PIVOT_COLORS.length]
                  if (sectors.length === 0) {
                    return [(
                      <th key={pid} style={{
                        padding: '6px 6px', textAlign: 'center',
                        background: color.bg, borderBottom: '2px solid ' + color.bg,
                        color: '#fff', fontSize: 8, fontWeight: 800, letterSpacing: '0.05em',
                        borderLeft: '2px solid white',
                      }}>
                        {pivotName}
                      </th>
                    )]
                  }
                  return sectors.map((sec, si) => (
                    <th key={`${pid}-${sec.id}`} style={{
                      padding: '6px 6px', textAlign: 'center',
                      background: si === 0 ? color.bg : color.bg + 'cc',
                      borderBottom: '2px solid ' + color.bg,
                      color: '#fff', fontSize: 8, fontWeight: 800, letterSpacing: '0.05em',
                      borderLeft: '2px solid white',
                    }}>
                      {pivotName}<br />
                      <span style={{ opacity: 0.85, fontWeight: 600 }}>{sec.name}</span>
                    </th>
                  ))
                })}
              </tr>
            </thead>
            <tbody>
              {allDates.map((date, di) => {
                const isEven = di % 2 === 0
                return (
                  <tr key={date} style={{ background: isEven ? '#fff' : '#f8fdf8' }}>
                    {/* Data */}
                    <td style={{
                      padding: '7px 8px', borderBottom: '1px solid #e2e8f0',
                      borderRight: '1px solid #e2e8f0',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{
                          fontSize: 8, fontWeight: 800, color: '#94a3b8',
                          background: '#f1f5f9', padding: '1px 4px', borderRadius: 3,
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>
                          {weekdayAbbr(date)}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>
                          {fmtDayMonth(date)}
                        </span>
                      </div>
                    </td>
                    {/* Células por pivô/setor */}
                    {pivotIds.flatMap((pid, pi) => {
                      const color = PIVOT_COLORS[pi % PIVOT_COLORS.length]
                      const pivotRows = byPivot.get(pid) ?? []
                      const sectors = sectorsMap?.[pid] ?? []

                      if (sectors.length === 0) {
                        // Pivô sem setores
                        const s = pivotRows.find(r => r.date === date && !r.sector_id)
                        return [(
                          <td key={pid} style={{
                            padding: '5px 6px', textAlign: 'center',
                            borderBottom: '1px solid #e2e8f0', borderLeft: '2px solid ' + color.light,
                          }}>
                            {s && s.status !== 'cancelled' ? (
                              <div style={{
                                background: color.light, border: `1px solid ${color.bg}40`,
                                borderRadius: 4, padding: '3px 5px',
                              }}>
                                {s.start_time && (
                                  <div style={{ fontSize: 9, fontWeight: 700, color: color.text, lineHeight: 1.3 }}>
                                    {s.start_time}{s.end_time ? <> → {fmtTime(s.end_time, s.start_time)}</> : ''}
                                  </div>
                                )}
                                <div style={{ fontSize: 9, fontWeight: 800, color: color.bg }}>
                                  {s.lamina_mm != null ? `${s.lamina_mm}mm` : ''}
                                  {s.speed_percent != null ? ` · ${s.speed_percent}%` : ''}
                                </div>
                                {s.status === 'done' && (
                                  <div style={{ fontSize: 8, color: '#16a34a', fontWeight: 700 }}>✓ realizado</div>
                                )}
                              </div>
                            ) : s?.status === 'cancelled' ? (
                              <div style={{ fontSize: 8, color: '#ef444460', textDecoration: 'line-through' }}>cancelado</div>
                            ) : (
                              <div style={{ color: '#e2e8f0', fontSize: 10 }}>—</div>
                            )}
                          </td>
                        )]
                      }

                      return sectors.map(sec => {
                        const s = pivotRows.find(r => r.date === date && r.sector_id === sec.id)
                        return (
                          <td key={`${pid}-${sec.id}`} style={{
                            padding: '5px 6px', textAlign: 'center',
                            borderBottom: '1px solid #e2e8f0', borderLeft: '2px solid ' + color.light,
                          }}>
                            {s && s.status !== 'cancelled' ? (
                              <div style={{
                                background: color.light, border: `1px solid ${color.bg}40`,
                                borderRadius: 4, padding: '3px 5px',
                              }}>
                                {s.start_time && (
                                  <div style={{ fontSize: 9, fontWeight: 700, color: color.text, lineHeight: 1.3 }}>
                                    {s.start_time}{s.end_time ? <> → {fmtTime(s.end_time, s.start_time)}</> : ''}
                                  </div>
                                )}
                                <div style={{ fontSize: 9, fontWeight: 800, color: color.bg }}>
                                  {s.lamina_mm != null ? `${s.lamina_mm}mm` : ''}
                                  {s.speed_percent != null ? ` · ${s.speed_percent}%` : ''}
                                </div>
                                {s.status === 'done' && (
                                  <div style={{ fontSize: 8, color: '#16a34a', fontWeight: 700 }}>✓ realizado</div>
                                )}
                              </div>
                            ) : s?.status === 'cancelled' ? (
                              <div style={{ fontSize: 8, color: '#ef444460', textDecoration: 'line-through' }}>cancelado</div>
                            ) : (
                              <div style={{ color: '#e2e8f0', fontSize: 10 }}>—</div>
                            )}
                          </td>
                        )
                      })
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          SEÇÃO 2 — DETALHAMENTO POR PIVÔ
      ══════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 4 }}>
        <div style={{ width: 4, height: 18, background: '#16a34a', borderRadius: 2 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: '#14532d', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Detalhamento por Pivô
        </span>
      </div>

      {pivotIds.map((pivotId, pi) => {
        const meta = metas.find(m => m.pivot?.id === pivotId)
        const pivotName = meta?.pivot?.name ?? '—'
        const farmName  = meta?.farm?.name  ?? ''
        const seasonName = meta?.season?.name ?? ''
        const rows = byPivot.get(pivotId) ?? []
        const color = PIVOT_COLORS[pi % PIVOT_COLORS.length]
        const totalLamina = rows.reduce((s, r) => s + (r.lamina_mm ?? 0), 0)
        const activeDays  = rows.filter(r => r.status !== 'cancelled').length

        return (
          <div key={pivotId} style={{ marginBottom: 18, pageBreakInside: 'avoid' }}>
            {/* Cabeçalho do pivô */}
            <div style={{
              display: 'flex', alignItems: 'center',
              background: `linear-gradient(90deg, ${color.bg} 0%, ${color.bg}cc 100%)`,
              borderRadius: '6px 6px 0 0', padding: '8px 14px',
              gap: 12,
            }}>
              {/* Ícone pivô */}
              <svg width="22" height="22" viewBox="0 0 64 64" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="32" cy="32" r="28" fill="rgba(255,255,255,0.15)" />
                <circle cx="32" cy="32" r="4" fill="white" />
                <line x1="32" y1="32" x2="55" y2="20" stroke="white" strokeWidth="3" strokeLinecap="round" />
                <line x1="32" y1="28" x2="32" y2="8" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '-0.3px' }}>{pivotName}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 1 }}>
                  {farmName}{seasonName ? ` · ${seasonName}` : ''}
                </div>
              </div>
              {/* KPIs do pivô */}
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dias ativos</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{activeDays}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total lâmina</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{totalLamina.toFixed(0)}<span style={{ fontSize: 9 }}>mm</span></div>
                </div>
              </div>
            </div>

            {/* Tabela de detalhe */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, border: `1px solid ${color.bg}40`, borderTop: 'none' }}>
              <thead>
                <tr style={{ background: color.light }}>
                  {['Data', 'Dia', 'Setor', 'Lâmina', 'Velocidade', 'Início', 'Fim', 'Chuva', 'Status'].map(h => (
                    <th key={h} style={{
                      padding: '5px 8px', textAlign: 'center',
                      fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: color.text, fontWeight: 800, borderBottom: `1.5px solid ${color.bg}60`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const isCancelled = s.status === 'cancelled'
                  const isDone = s.status === 'done'
                  const rowBg = isCancelled ? '#fff5f5' : i % 2 === 0 ? '#fff' : color.light + '50'
                  const statusColor = isCancelled ? '#ef4444' : isDone ? '#16a34a' : color.bg
                  const secName = sectorName(pivotId, s.sector_id)
                  return (
                    <tr key={s.id} style={{ background: rowBg, borderBottom: `1px solid ${color.bg}20`, opacity: isCancelled ? 0.5 : 1 }}>
                      <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#1e293b' }}>
                        {fmtDate(s.date)}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: 8, fontWeight: 800, color: '#64748b',
                          background: '#f1f5f9', padding: '1px 4px', borderRadius: 3,
                          textTransform: 'uppercase',
                        }}>
                          {weekdayAbbr(s.date)}
                        </span>
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        {secName !== '—' ? (
                          <span style={{
                            fontSize: 9, fontWeight: 800, color: color.text,
                            background: color.light, padding: '1px 6px', borderRadius: 3,
                            border: `1px solid ${color.bg}40`,
                          }}>
                            {secName}
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: 9 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 800, color: color.bg, fontSize: 11 }}>
                        {s.lamina_mm != null ? `${s.lamina_mm} mm` : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', color: '#f59e0b', fontWeight: 700 }}>
                        {s.speed_percent != null ? `${s.speed_percent}%` : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                        {s.start_time ?? <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                        {fmtTime(s.end_time, s.start_time)}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', color: '#0891b2', fontWeight: 600 }}>
                        {s.rainfall_mm != null && s.rainfall_mm > 0 ? `${s.rainfall_mm} mm` : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 7px', borderRadius: 3,
                          fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em',
                          color: statusColor,
                          background: isCancelled ? '#fee2e2' : isDone ? '#dcfce7' : color.light,
                          border: `1px solid ${statusColor}40`,
                        }}>
                          {isCancelled ? 'Cancelado' : isDone ? '✓ Realizado' : 'Programado'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      {/* ══════════════════════════════════════════════════
          RODAPÉ
      ══════════════════════════════════════════════════ */}
      <div style={{
        marginTop: 16, paddingTop: 10,
        borderTop: '2px solid #e2e8f0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 18, height: 18, background: '#16a34a', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="10" height="10" viewBox="0 0 64 64" fill="none">
              <path d="M31.5 4C31.5 4 13 22.6 13 35.5C13 47.4 21.8 56 33 56C44.2 56 53 47.4 53 35.5C53 22.6 31.5 4 31.5 4Z" fill="white"/>
            </svg>
          </div>
          <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>IrrigaAgro — Sistema de Gestão de Irrigação</span>
        </div>
        <span style={{ fontSize: 9, color: '#94a3b8' }}>www.irrigaagro.com.br</span>
      </div>
    </div>
  )
}

// ─── Modal Cancelar + Reprogramar ─────────────────────────────

function RescheduleModal({
  rows, pivotName, today,
  onConfirm, onClose,
}: {
  rows: IrrigationSchedule[]
  pivotName: string
  today: string
  onConfirm: (payload: ReschedulePayload) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState<IrrigationCancelledReason>('quebra')
  const [notes, setNotes] = useState('')
  const [newDate, setNewDate] = useState(addDays(today, 1))

  const REASONS = [
    { value: 'quebra' as IrrigationCancelledReason, label: '🔧 Dano mecânico',            color: '#f59e0b' },
    { value: 'outro'  as IrrigationCancelledReason, label: '⚡ Falta de energia / Outro', color: '#8899aa' },
    { value: 'chuva'  as IrrigationCancelledReason, label: '🌧 Chuva',                    color: '#22d3ee' },
  ]

  const fmtPreview = newDate
    ? new Date(newDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })
    : ''

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: '#0f1923', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 16, padding: 28, width: 400, maxWidth: '95vw',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <RefreshCw size={15} style={{ color: '#f59e0b' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Cancelar + Reprogramar</p>
            </div>
            <p style={{ fontSize: 12, color: '#445566', margin: 0, paddingLeft: 40 }}>{pivotName}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#445566', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Motivo */}
        <p style={{ fontSize: 10, color: '#6a8090', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Motivo do cancelamento</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {REASONS.map(r => (
            <button key={r.value} onClick={() => setReason(r.value)} style={{
              padding: '9px 14px', borderRadius: 9, textAlign: 'left',
              border: `1px solid ${reason === r.value ? r.color : 'rgba(255,255,255,0.07)'}`,
              background: reason === r.value ? `${r.color}15` : 'rgba(255,255,255,0.02)',
              color: reason === r.value ? r.color : '#667788',
              fontSize: 13, fontWeight: reason === r.value ? 700 : 400, cursor: 'pointer',
            }}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Observação */}
        <p style={{ fontSize: 10, color: '#6a8090', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Observação (opcional)</p>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Ex: falta de energia das 22h às 04h..."
          rows={2}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, resize: 'none', marginBottom: 18,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />

        {/* Nova data de início da semana */}
        <p style={{ fontSize: 10, color: '#6a8090', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
          Novo dia de início da programação
        </p>
        <input
          type="date"
          value={newDate}
          min={today}
          onChange={e => setNewDate(e.target.value)}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 8,
            background: 'rgba(0,147,208,0.06)', border: '1px solid rgba(0,147,208,0.25)',
            color: '#e2e8f0', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            boxSizing: 'border-box', outline: 'none', cursor: 'pointer',
          }}
        />
        {fmtPreview && (
          <p style={{ fontSize: 11, color: '#445566', margin: '0 0 20px', fontStyle: 'italic' }}>
            O grid abrirá zerado a partir de <strong style={{ color: '#0093D0' }}>{fmtPreview}</strong>. Programações existentes nessa semana serão removidas.
          </p>
        )}

        {/* Botões */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
            background: 'transparent', color: '#667788', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Voltar</button>
          <button
            onClick={() => onConfirm({ originalRows: rows, newDate, reason, notes })}
            style={{
              flex: 2, padding: '10px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <RefreshCw size={13} /> Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card de um lote de programação ───────────────────────────

function BatchCard({
  batchId, rows, metas, today, sectorsMap,
  onCancelRow, onConfirmRow, onDeleteBatch,
  onEdit, onPrint, onWhatsApp, onReschedule,
}: {
  batchId: string
  rows: IrrigationSchedule[]
  metas: ManagementSeasonContext[]
  today: string
  sectorsMap?: Record<string, PivotSector[]>
  onCancelRow: (s: IrrigationSchedule) => void
  onConfirmRow: (s: IrrigationSchedule) => void
  onDeleteBatch: (rows: IrrigationSchedule[]) => void
  onEdit: (rows: IrrigationSchedule[]) => void
  onPrint: (rows: IrrigationSchedule[]) => void
  onWhatsApp: (rows: IrrigationSchedule[]) => void
  onReschedule?: (payload: ReschedulePayload) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)

  // Informações do lote
  const pivotId   = rows[0]?.pivot_id ?? ''
  const meta      = metas.find(m => m.pivot?.id === pivotId)
  const pivotName = meta?.pivot?.name ?? '—'
  const farmName  = meta?.farm?.name  ?? ''
  const createdAt = rows[0]?.created_at ?? ''

  // Intervalo de datas do lote
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const dateFrom = sorted[0]?.date ?? ''
  const dateTo   = sorted[sorted.length - 1]?.date ?? ''

  // Estatísticas
  const avgLamina = rows.filter(r => r.lamina_mm != null).reduce((s, r, _, a) => s + (r.lamina_mm ?? 0) / a.length, 0)
  const planned   = rows.filter(r => r.status === 'planned').length
  const done      = rows.filter(r => r.status === 'done').length
  const cancelled = rows.filter(r => r.status === 'cancelled').length

  const st = batchStatus(rows)
  const color = statusColor(st)

  return (
    <>
    {showReschedule && (
      <RescheduleModal
        rows={rows}
        pivotName={pivotName}
        today={today}
        onConfirm={payload => {
          setShowReschedule(false)
          onReschedule?.(payload)
        }}
        onClose={() => setShowReschedule(false)}
      />
    )}
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${expanded ? 'rgba(0,147,208,0.2)' : 'rgba(255,255,255,0.05)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* Header clicável */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        {/* Status pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 99, flexShrink: 0,
          background: `${color}15`, border: `1px solid ${color}35`,
          color, fontSize: 10, fontWeight: 700,
        }}>
          {statusIcon(st)}
          {statusLabel(st)}
        </div>

        {/* Pivô + data criação */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#c8d8e8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pivotName} <span style={{ color: '#445566', fontWeight: 400, fontSize: 11 }}>— {farmName}</span>
          </p>
          <p style={{ fontSize: 11, color: '#445566', margin: '1px 0 0' }}>
            Feita em {fmtDateTime(createdAt)} &nbsp;·&nbsp;
            {dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} → ${fmtDate(dateTo)}`}
            &nbsp;·&nbsp; {rows.length} dia(s)
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
          {avgLamina > 0 && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 8, color: '#445566', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Média</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0093D0', margin: 0, fontFamily: 'var(--font-mono)' }}>
                {avgLamina.toFixed(1)}mm
              </p>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 8, color: '#445566', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dias</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', margin: 0, fontFamily: 'var(--font-mono)' }}>
              {planned > 0 && <span style={{ color: '#0093D0' }}>{planned}▶ </span>}
              {done > 0 && <span style={{ color: '#22c55e' }}>{done}✓ </span>}
              {cancelled > 0 && <span style={{ color: '#ef4444' }}>{cancelled}✕</span>}
            </p>
          </div>
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {/* Reprogramar — aparece se houver dias planejados OU marcados como done (pivô não trabalhou) */}
          {(planned > 0 || done > 0) && onReschedule && (
            <button
              onClick={() => setShowReschedule(true)}
              title="Cancelar e reprogramar para outra data"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', borderRadius: 7,
                border: '1px solid rgba(245,158,11,0.35)',
                background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              <RefreshCw size={11} /> Reprogramar
            </button>
          )}
          <button
            onClick={() => onEdit(rows)}
            title="Editar programação"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 10px', borderRadius: 7,
              border: '1px solid rgba(0,147,208,0.3)',
              background: 'rgba(0,147,208,0.08)', color: '#0093D0',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            <Pencil size={11} /> Editar
          </button>
          <button
            onClick={() => onPrint(rows)}
            title="Imprimir"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)', color: '#667788',
              cursor: 'pointer',
            }}>
            <Printer size={13} />
          </button>
          <button
            onClick={() => onWhatsApp(rows)}
            title="Enviar por WhatsApp"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 7,
              border: '1px solid rgba(34,197,94,0.25)',
              background: 'rgba(34,197,94,0.07)', color: '#22c55e',
              cursor: 'pointer',
            }}>
            <MessageCircle size={13} />
          </button>
          <button
            onClick={() => onDeleteBatch(rows)}
            title="Excluir programação inteira"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 7,
              border: '1px solid rgba(239,68,68,0.2)',
              background: 'rgba(239,68,68,0.05)', color: '#ef4444',
              cursor: 'pointer',
            }}>
            <Trash2 size={12} />
          </button>
        </div>

        <div style={{ color: '#334455', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Detalhe expandido */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '10px 14px 12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sorted.map(s => {
              const sColor = statusColor(s.status)
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}>
                  {/* Data */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: s.date === today ? '#0093D0' : '#8899aa',
                    minWidth: 52, fontFamily: 'var(--font-mono)',
                  }}>
                    {fmtDate(s.date)}
                  </span>

                  {/* Status */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '2px 7px', borderRadius: 99,
                    background: `${sColor}12`, border: `1px solid ${sColor}30`,
                    color: sColor, fontSize: 9, fontWeight: 700, flexShrink: 0,
                  }}>
                    {statusIcon(s.status)} {statusLabel(s.status)}
                  </div>

                  {/* Setor */}
                  {s.sector_id && (
                    <span style={{ fontSize: 10, color: '#556677', background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 4 }}>
                      setor
                    </span>
                  )}

                  {/* Dados técnicos */}
                  <div style={{ display: 'flex', gap: 14, flex: 1 }}>
                    {s.lamina_mm != null && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>
                        {s.lamina_mm}mm
                      </span>
                    )}
                    {s.speed_percent != null && (
                      <span style={{ fontSize: 12, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                        {s.speed_percent}%
                      </span>
                    )}
                    {s.start_time && (
                      <span style={{ fontSize: 11, color: '#667788', fontFamily: 'var(--font-mono)' }}>
                        {s.start_time}{s.end_time ? ` → ${s.end_time}` : ''}
                      </span>
                    )}
                    {s.rainfall_mm != null && s.rainfall_mm > 0 && (
                      <span style={{ fontSize: 11, color: '#22d3ee', fontFamily: 'var(--font-mono)' }}>
                        🌧{s.rainfall_mm}mm
                      </span>
                    )}
                    {s.status === 'cancelled' && s.cancelled_reason && (
                      <span style={{ fontSize: 10, color: '#ef4444' }}>{s.cancelled_reason}</span>
                    )}
                  </div>

                  {/* Ações por linha */}
                  {s.status === 'planned' && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => onConfirmRow(s)}
                        title="Marcar como realizado"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 24, height: 24, borderRadius: 6,
                          border: '1px solid rgba(34,197,94,0.3)',
                          background: 'rgba(34,197,94,0.08)', color: '#22c55e',
                          cursor: 'pointer',
                        }}>
                        <CheckCircle size={12} />
                      </button>
                      <button
                        onClick={() => onCancelRow(s)}
                        title="Cancelar"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 24, height: 24, borderRadius: 6,
                          border: '1px solid rgba(245,158,11,0.3)',
                          background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
                          cursor: 'pointer',
                        }}>
                        <XCircle size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
    </>
  )
}

// ─── Componente principal: Histórico ──────────────────────────

export function ScheduleHistory({
  companyId, today, metas, sectorsMap, onSchedulesChanged, onEditBatch, onReschedule,
}: Props) {
  const [schedules, setSchedules] = useState<IrrigationSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Filtro por pivô
  const [filterPivotId, setFilterPivotId] = useState<string>('all')

  // Modais
  const [cancelTarget, setCancelTarget] = useState<IrrigationSchedule | null>(null)
  const [whatsappRows, setWhatsappRows] = useState<IrrigationSchedule[] | null>(null)
  const [printRows, setPrintRows] = useState<IrrigationSchedule[] | null>(null)

  // Carregar histórico: 90 dias para trás + 14 dias futuros
  useEffect(() => {
    if (!expanded) return
    const from = addDays(today, -90)
    const to   = addDays(today, 14)
    setLoading(true)
    listSchedulesByCompany(companyId, from, to)
      .then(data => setSchedules(data))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false))
  }, [companyId, today, expanded])

  function refreshList() {
    const from = addDays(today, -90)
    const to   = addDays(today, 14)
    listSchedulesByCompany(companyId, from, to)
      .then(data => setSchedules(data))
      .catch(() => {})
  }

  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null)

  function showToast(msg: string, type: 'error' | 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleCancelConfirm(reason: IrrigationCancelledReason, notes: string) {
    if (!cancelTarget) return
    const updated = await cancelSchedule(cancelTarget.id, reason, notes)
    setSchedules(prev => prev.map(x => x.id === updated.id ? updated : x))
    setCancelTarget(null)
    onSchedulesChanged()
    showToast('Irrigação cancelada com sucesso.', 'success')
  }

  async function handleConfirmRow(s: IrrigationSchedule) {
    try {
      const updated = await confirmSchedule(s.id)
      setSchedules(prev => prev.map(x => x.id === updated.id ? updated : x))
      onSchedulesChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao confirmar.', 'error')
    }
  }

  async function handleDeleteBatch(rows: IrrigationSchedule[]) {
    if (!confirm(`Excluir esta programação (${rows.length} dia(s))? Essa ação não pode ser desfeita.`)) return
    const sb = createClient()
    const ids = rows.map(r => r.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from('irrigation_schedule').delete().in('id', ids)
    setSchedules(prev => prev.filter(x => !ids.includes(x.id)))
    onSchedulesChanged()
  }

  const [printPreview, setPrintPreview] = useState(false)

  function handlePrint(rows: IrrigationSchedule[]) {
    setPrintRows(rows)
    setPrintPreview(true)
  }

  function handlePrintConfirm() {
    setPrintPreview(false)
    setTimeout(() => {
      window.print()
      setPrintRows(null)
    }, 120)
  }

  function handlePrintClose() {
    setPrintPreview(false)
    setPrintRows(null)
  }

  // Aplicar filtro de pivô
  const filtered = schedules.filter(s => filterPivotId === 'all' || s.pivot_id === filterPivotId)

  // Agrupar por schedule_batch_id (ou por pivot_id+date como fallback para registros antigos)
  const batchMap = new Map<string, IrrigationSchedule[]>()
  for (const s of filtered) {
    const key = s.schedule_batch_id ?? `legacy-${s.pivot_id}-${s.date}`
    const arr = batchMap.get(key) ?? []
    arr.push(s)
    batchMap.set(key, arr)
  }

  // Ordenar batches por data de criação (mais recente primeiro)
  const batches = Array.from(batchMap.entries()).sort((a, b) => {
    const ta = a[1][0]?.created_at ?? ''
    const tb = b[1][0]?.created_at ?? ''
    return tb.localeCompare(ta)
  })

  // Pivôs disponíveis para filtro
  const pivotOptions = metas
    .filter(m => m.pivot != null)
    .map(m => ({ id: m.pivot!.id, name: m.pivot!.name }))

  return (
    <>
      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.type} />}

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
      {whatsappRows && (
        <WhatsAppModal
          schedules={whatsappRows}
          metas={metas}
          onClose={() => setWhatsappRows(null)}
        />
      )}

      {/* Layout de impressão — hidden para @media print */}
      {printRows && !printPreview && <PrintLayout schedules={printRows} metas={metas} sectorsMap={sectorsMap} />}

      {/* Modal de preview antes de imprimir */}
      {printRows && printPreview && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 3000,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', padding: '20px 16px',
          overflowY: 'auto',
        }}>
          {/* Toolbar do preview */}
          <div style={{
            width: '100%', maxWidth: 860,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16, flexShrink: 0,
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Preview de impressão</p>
              <p style={{ margin: 0, fontSize: 11, color: '#667788' }}>Verifique antes de imprimir</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handlePrintClose} style={{
                padding: '9px 18px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
                color: '#8899aa', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Fechar</button>
              <button onClick={handlePrintConfirm} style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                background: '#16a34a', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Printer size={14} /> Imprimir
              </button>
            </div>
          </div>

          {/* Folha simulada */}
          <div style={{
            width: '100%', maxWidth: 860,
            background: '#fff', borderRadius: 4,
            padding: '32px 36px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          }}>
            <PrintLayout schedules={printRows} metas={metas} sectorsMap={sectorsMap} inline />
          </div>
        </div>
      )}

      {/* Seção */}
      <div style={{
        background: '#0d1520',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div
          onClick={() => setExpanded(e => !e)}
          style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', userSelect: 'none' }}
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
              {expanded && batches.length > 0
                ? `${batches.length} programação(ões) encontrada(s)`
                : 'Clique para ver programações salvas'}
            </p>
          </div>
          <div style={{ color: '#334455', flexShrink: 0 }}>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>

        {/* Conteúdo */}
        {expanded && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '14px 16px 16px' }}>
            {/* Filtro de pivô */}
            {pivotOptions.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={filterPivotId}
                  onChange={e => setFilterPivotId(e.target.value)}
                  style={{
                    padding: '5px 10px', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: '#0d1520', color: '#8899aa',
                    fontSize: 11, cursor: 'pointer', outline: 'none',
                  }}>
                  <option value="all">Todos os pivôs</option>
                  {pivotOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <span style={{ fontSize: 11, color: '#445566' }}>
                  {batches.length} programação(ões)
                </span>
              </div>
            )}

            {/* Lista de lotes */}
            {loading ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#445566', fontSize: 13 }}>Carregando…</div>
            ) : batches.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#445566', fontSize: 13 }}>
                Nenhuma programação encontrada.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {batches.map(([batchId, rows]) => (
                  <BatchCard
                    key={batchId}
                    batchId={batchId}
                    rows={rows}
                    metas={metas}
                    today={today}
                    sectorsMap={sectorsMap}
                    onCancelRow={s => setCancelTarget(s)}
                    onConfirmRow={handleConfirmRow}
                    onDeleteBatch={handleDeleteBatch}
                    onEdit={rows => {
                      onEditBatch?.({
                        batchId: rows[0]?.schedule_batch_id ?? batchId,
                        pivotId: rows[0]?.pivot_id ?? '',
                        schedules: rows,
                      })
                    }}
                    onPrint={handlePrint}
                    onWhatsApp={rows => setWhatsappRows(rows)}
                    onReschedule={onReschedule}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Estilos de impressão */}
      <style>{`
        @media print { .print-only { display: block !important; } }
        @media screen { .print-only { display: none !important; } }
      `}</style>
    </>
  )
}

'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
  // Mix de done + cancelled: usa 'done' só se há pelo menos um realizado
  if (rows.some(r => r.status === 'done')) return 'done'
  return 'cancelled'
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
            <p style={{ fontSize: 12, color: '#667788', margin: '2px 0 0' }}>{pivotName} · {fmtDateLong(schedule.date)}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#667788', cursor: 'pointer' }}>
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
              <p style={{ fontSize: 11, color: '#667788', margin: 0 }}>{schedules.length} programação(ões)</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#667788', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 11, color: '#6a8090', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Destinatários
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {contacts.length === 0 ? (
            <p style={{ fontSize: 12, color: '#667788', margin: 0 }}>Nenhum contato cadastrado em WhatsApp.</p>
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
                  <p style={{ fontSize: 11, color: '#778899', margin: 0 }}>+{c.phone}</p>
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

// ─── Layout de impressão — estilo Valley ──────────────────────

// Calcula duração entre dois horários HH:MM, com suporte a virada de meia-noite
function calcDuration(start: string | null, end: string | null): string {
  if (!start || !end) return ''
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let totalMin = eh * 60 + em - (sh * 60 + sm)
  if (totalMin <= 0) totalMin += 24 * 60
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtDayMonth(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Estilo de célula da tabela — borda fina, padding compacto
const TD: React.CSSProperties = {
  border: '1px solid #c8cfd8',
  padding: '5px 8px',
  textAlign: 'center',
  fontSize: 11,
  color: '#111',
  background: '#fff',
}

const TD_FILLED: React.CSSProperties = {
  border: '1px solid #c8cfd8',
  padding: '5px 8px',
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 600,
  color: '#0f172a',
  background: '#f0f7ff',
}

// Data sem irrigação — flat, levemente apagada
const TH_DATE: React.CSSProperties = {
  border: '1px solid #0074a6',
  padding: '5px 8px',
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 700,
  color: '#fff',
  background: '#0074a6',
  minWidth: 52,
  opacity: 0.85,
}

// Data COM irrigação — 3D
const TH_DATE_ACTIVE: React.CSSProperties = {
  border: '1px solid #005d88',
  padding: '5px 8px',
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 700,
  color: '#fff',
  minWidth: 52,
  opacity: 1,
  background: 'linear-gradient(180deg, #0093d0 0%, #0074a6 50%, #005d88 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(0,0,0,0.2), 0 2px 5px rgba(0,93,136,0.4), 0 4px 8px rgba(0,93,136,0.2)',
}

const TH_LABEL: React.CSSProperties = {
  border: '1px solid #c8cfd8',
  padding: '5px 10px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 500,
  color: '#222',
  background: '#f8fafc',
  whiteSpace: 'nowrap',
}

function PrintLayout({
  schedules, metas, sectorsMap, inline,
}: {
  schedules: IrrigationSchedule[]
  metas: ManagementSeasonContext[]
  sectorsMap?: Record<string, PivotSector[]>
  inline?: boolean
}) {
  if (schedules.length === 0) return null

  const now = new Date()

  // Datas únicas ordenadas
  const allDates = Array.from(new Set(schedules.map(s => s.date))).sort()

  // Pivôs únicos na ordem de aparição
  const pivotIds = Array.from(new Set(schedules.map(s => s.pivot_id)))

  // Fazendas únicas
  const farms = Array.from(new Set(
    pivotIds.map(pid => metas.find(m => m.pivot?.id === pid)?.farm?.name).filter(Boolean)
  )) as string[]

  // Nome do setor dado um sector_id
  function sectorLabel(pivotId: string, sectorId: string | null): string {
    if (!sectorId) return ''
    const sectors = sectorsMap?.[pivotId] ?? []
    return sectors.find(s => s.id === sectorId)?.name ?? ''
  }

  return (
    <div
      className={inline ? undefined : 'print-only'}
      style={{ display: inline ? 'block' : 'none', fontFamily: 'Arial, sans-serif', color: '#111' }}
    >
      {/* ── Cabeçalho ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
        borderBottom: '2.5px solid #0074a6', paddingBottom: 10, marginBottom: 22,
        gap: 12,
      }}>
        {/* Logo IrrigaAgro — ícone + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <svg width="40" height="48" viewBox="0 0 84 100" fill="none" xmlns="http://www.w3.org/2000/svg"
            style={{ filter: 'drop-shadow(0 1px 0 rgba(0,80,130,0.3)) drop-shadow(0 2px 0 rgba(0,80,130,0.2)) drop-shadow(0 3px 5px rgba(0,0,0,0.18))' }}
          >
            <defs>
              <linearGradient id="dropG" x1="42" y1="0" x2="42" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0074a6" />
              </linearGradient>
              <linearGradient id="bar1G" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#16a34a" />
              </linearGradient>
              <linearGradient id="bar2G" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0093d0" />
              </linearGradient>
              <linearGradient id="bar3G" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
            {/* Contorno da gota */}
            <path
              d="M42 4 C42 4 8 44 8 64 C8 83 23 96 42 96 C61 96 76 83 76 64 C76 44 42 4 42 4 Z"
              stroke="url(#dropG)" strokeWidth="4" fill="rgba(56,189,248,0.06)"
              strokeLinejoin="round"
            />
            {/* Barras internas */}
            <rect x="22" y="62" width="10" height="22" rx="2.5" fill="url(#bar1G)" />
            <rect x="37" y="50" width="10" height="34" rx="2.5" fill="url(#bar2G)" />
            <rect x="52" y="38" width="10" height="46" rx="2.5" fill="url(#bar3G)" />
          </svg>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1, whiteSpace: 'nowrap',
              textShadow: '0 1px 0 rgba(0,0,0,0.15), 0 2px 0 rgba(0,0,0,0.10), 0 3px 4px rgba(0,0,0,0.12)',
            }}>
              <span style={{ color: '#0074a6' }}>Irriga</span><span style={{ color: '#16a34a' }}>Agro</span>
            </div>
            <div style={{
              fontSize: 9, color: '#94a3b8', letterSpacing: '0.01em',
              marginTop: 2, fontWeight: 400, textAlign: 'center',
            }}>
              irrigação inteligente
            </div>
          </div>
        </div>

        {/* Fazenda */}
        <div style={{ fontSize: 11, color: '#334155' }}>
          <strong>Fazenda:</strong> {farms.join(', ') || '—'}
        </div>

        {/* Data da programação */}
        <div style={{ fontSize: 11, color: '#334155' }}>
          Data da Programação: <strong>{now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong>
        </div>

        {/* Título */}
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px', flexShrink: 0 }}>
          Programação de Irrigação
        </div>
      </div>

      {/* ── Uma tabela por pivô+setor ── */}
      {pivotIds.flatMap(pivotId => {
        const meta = metas.find(m => m.pivot?.id === pivotId)
        const pivotName = meta?.pivot?.name ?? '—'
        const cropName  = meta?.crop?.name ?? ''
        const sectors = sectorsMap?.[pivotId] ?? []

        // Se tem setores, uma tabela por setor; se não, uma tabela para o pivô inteiro
        const groups: Array<{ sectorId: string | null; pivotLine: string; sectorLine: string; crop: string }> = sectors.length > 0
          ? sectors.map(sec => ({ sectorId: sec.id, pivotLine: pivotName, sectorLine: `Setor ${sec.name}`, crop: cropName }))
          : [{ sectorId: null, pivotLine: pivotName, sectorLine: '', crop: cropName }]

        return groups.map(({ sectorId, pivotLine, sectorLine, crop }) => {
          // Somente dias com irrigação não cancelada para este grupo
          const rowsByDate = new Map<string, IrrigationSchedule>()
          for (const s of schedules) {
            if (s.pivot_id !== pivotId) continue
            if (sectorId !== null && s.sector_id !== sectorId) continue
            if (sectorId === null && sectors.length > 0 && s.sector_id != null) continue
            if (s.status === 'cancelled') continue
            rowsByDate.set(s.date, s)
          }

          // 5 linhas de métricas — cada uma extrai um valor diferente do registro
          const METRICS: { label: string; unit: string; getValue: (s: IrrigationSchedule) => string }[] = [
            { label: 'Irrigação (mm)',    unit: 'mm', getValue: s => s.lamina_mm != null ? String(s.lamina_mm) : '' },
            { label: 'Velocidade (%)',    unit: '%',  getValue: s => s.speed_percent != null ? String(s.speed_percent) : '' },
            { label: 'Duração (h)',       unit: 'h',  getValue: s => calcDuration(s.start_time, s.end_time) },
            { label: 'Hora Inicial (h)',  unit: '',   getValue: s => s.start_time ?? '' },
            { label: 'Hora Final (h)',    unit: '',   getValue: s => s.end_time ?? '' },
          ]

          const groupKey = `${pivotId}-${sectorId ?? 'all'}`
          return (
            <div key={groupKey} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {/* Linha de cabeçalho com datas */}
                <thead>
                  <tr>
                    {/* Coluna nome — ocupada pelo rowspan abaixo, aqui só espaço */}
                    <th style={{ border: '1px solid #c8cfd8', background: '#edf2f7', width: 160 }} />
                    <th style={{ border: '1px solid #c8cfd8', background: '#edf2f7', width: 120, fontSize: 10, color: '#555', fontWeight: 600, padding: '5px 10px', textAlign: 'left', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      Parâmetro
                    </th>
                    {allDates.map(date => {
                      const dow = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()
                      const hasIrrigation = rowsByDate.has(date)
                      return (
                        <th key={date} style={hasIrrigation ? TH_DATE_ACTIVE : TH_DATE}>
                          {fmtDayMonth(date)}
                          <span style={{ display: 'block', fontSize: 8, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>{dow}</span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((metric, mi) => {
                    const isMain = mi === 0
                    const isEven = mi % 2 === 0
                    const rowBg = isMain ? '#f0f7ff' : isEven ? '#fafbfc' : '#fff'
                    return (
                    <tr key={metric.label}>
                      {/* Célula do nome do pivô/setor: só na 1ª linha, com rowspan */}
                      {mi === 0 && (
                        <td
                          rowSpan={METRICS.length}
                          style={{
                            border: '1px solid #c8cfd8',
                            borderLeft: '4px solid #0074a6',
                            padding: '10px 12px',
                            verticalAlign: 'middle',
                            textAlign: 'center',
                            lineHeight: 1.5,
                            background: 'linear-gradient(135deg, #f0f7ff 0%, #e8f2fb 100%)',
                            boxShadow: 'inset 2px 0 6px rgba(0,116,166,0.08)',
                          }}
                        >
                          <div>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{pivotLine}</span>
                            {sectorLine && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#0074a6', marginLeft: 5 }}>{sectorLine}</span>
                            )}
                          </div>
                          {crop && (
                            <div style={{ fontSize: 10, fontWeight: 400, color: '#64748b', marginTop: 3 }}>{crop}</div>
                          )}
                        </td>
                      )}
                      {/* Label da métrica com zebra */}
                      <td style={{ ...TH_LABEL, background: rowBg, fontWeight: isMain ? 700 : 500, color: isMain ? '#0f172a' : '#222' }}>
                        {metric.label}
                      </td>
                      {/* Valores por data */}
                      {allDates.map(date => {
                        const s = rowsByDate.get(date)
                        const val = s ? metric.getValue(s) : ''
                        if (!val) return <td key={date} style={{ ...TD, background: rowBg }}>—</td>
                        if (isMain) {
                          return (
                            <td key={date} style={{
                              ...TD_FILLED,
                              border: '1px solid #2563eb',
                              background: 'linear-gradient(180deg, #bfdbfe 0%, #93c5fd 55%, #60a5fa 100%)',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -2px 0 rgba(0,0,0,0.15), 0 2px 5px rgba(37,99,235,0.35), 0 4px 8px rgba(37,99,235,0.15)',
                            }}>
                              <span style={{ fontWeight: 700, fontSize: 12, color: '#1e3a8a' }}>{val}</span>
                              <span style={{ fontSize: 9, color: '#3b82f6', marginLeft: 2 }}>{metric.unit}</span>
                            </td>
                          )
                        }
                        return (
                          <td key={date} style={{ ...TD_FILLED, background: '#f0f7ff' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{val}</span>
                            {metric.unit && <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 2 }}>{metric.unit}</span>}
                          </td>
                        )
                      })}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })
      })}

      {/* Rodapé */}
      <div style={{
        marginTop: 16, paddingTop: 8,
        borderTop: '2px solid #e2e8f0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 9, color: '#94a3b8',
      }}>
        <span>Emitido em {now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
        <span style={{ color: '#0074a6', fontWeight: 600 }}>www.irrigaagro.com.br</span>
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

  // Se o lote já está todo cancelado, não precisa pedir motivo novamente
  const alreadyCancelled = rows.every(r => r.status === 'cancelled')

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
              <p style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{alreadyCancelled ? 'Reprogramar' : 'Cancelar + Reprogramar'}</p>
            </div>
            <p style={{ fontSize: 12, color: '#667788', margin: 0, paddingLeft: 40 }}>{pivotName}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#667788', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Motivo + Observação — só quando há dias ainda não cancelados */}
        {!alreadyCancelled && (<>
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
        </>)}

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
          <p style={{ fontSize: 11, color: '#667788', margin: '0 0 20px', fontStyle: 'italic' }}>
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
    {showReschedule && typeof document !== 'undefined' && createPortal(
      <RescheduleModal
        rows={rows}
        pivotName={pivotName}
        today={today}
        onConfirm={payload => {
          setShowReschedule(false)
          onReschedule?.(payload)
        }}
        onClose={() => setShowReschedule(false)}
      />,
      document.body
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
            {pivotName} <span style={{ color: '#667788', fontWeight: 400, fontSize: 11 }}>— {farmName}</span>
          </p>
          <p style={{ fontSize: 11, color: '#667788', margin: '1px 0 0' }}>
            Feita em {fmtDateTime(createdAt)} &nbsp;·&nbsp;
            {dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} → ${fmtDate(dateTo)}`}
            &nbsp;·&nbsp; {rows.length} dia(s)
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
          {avgLamina > 0 && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 8, color: '#667788', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Média</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0093D0', margin: 0, fontFamily: 'var(--font-mono)' }}>
                {avgLamina.toFixed(1)}mm
              </p>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 8, color: '#667788', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dias</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', margin: 0, fontFamily: 'var(--font-mono)' }}>
              {planned > 0 && <span style={{ color: '#0093D0' }}>{planned}▶ </span>}
              {done > 0 && <span style={{ color: '#22c55e' }}>{done}✓ </span>}
              {cancelled > 0 && <span style={{ color: '#ef4444' }}>{cancelled}✕</span>}
            </p>
          </div>
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {/* Reprogramar — aparece para qualquer lote não totalmente vazio (pode reprogramar mesmo cancelado) */}
          {(planned > 0 || done > 0 || cancelled > 0) && onReschedule && (
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

        <div style={{ color: '#778899', flexShrink: 0 }}>
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
                    <span style={{ fontSize: 10, color: '#778899', background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 4 }}>
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
  const [printSelectedPivots, setPrintSelectedPivots] = useState<Set<string>>(new Set())
  // Para "imprimir tudo": lista de batches com checkbox de seleção
  const [printBatchIds, setPrintBatchIds] = useState<string[] | null>(null) // null = single-batch mode
  const [printSelectedBatches, setPrintSelectedBatches] = useState<Set<string>>(new Set())

  function handlePrint(rows: IrrigationSchedule[], batchIds?: string[]) {
    // Seleciona todos os pivôs por padrão
    const ids = Array.from(new Set(rows.map(r => r.pivot_id)))
    setPrintSelectedPivots(new Set(ids))
    setPrintRows(rows)
    setPrintBatchIds(batchIds ?? null)
    if (batchIds) setPrintSelectedBatches(new Set(batchIds))
    setPrintPreview(true)
  }

  function handlePrintConfirm() {
    setPrintPreview(false)
    setTimeout(() => {
      // Gera nome do arquivo: "Programação Fazenda X - DD-MM-YYYY"
      const farms = Array.from(new Set(
        printRowsFiltered.map(r => metas.find(m => m.pivot?.id === r.pivot_id)?.farm?.name).filter(Boolean)
      )).join(', ')
      const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
      const prevTitle = document.title
      document.title = `Programação${farms ? ' ' + farms : ''} - ${date}`
      window.print()
      document.title = prevTitle
      setPrintRows(null)
      setPrintBatchIds(null)
      setPrintSelectedBatches(new Set())
    }, 120)
  }

  function handlePrintClose() {
    setPrintPreview(false)
    setPrintRows(null)
    setPrintBatchIds(null)
    setPrintSelectedBatches(new Set())
  }

  // Filtra os schedules pelos lotes e pivôs selecionados no preview
  const printRowsFiltered = (() => {
    if (!printRows) return []
    let rows = printRows
    // Se há seleção de lotes (modo "imprimir tudo"), filtra pelos batches marcados
    if (printBatchIds && printSelectedBatches.size > 0) {
      rows = rows.filter(r => {
        const key = r.schedule_batch_id ?? `legacy-${r.pivot_id}-${r.date}`
        return printSelectedBatches.has(key)
      })
    }
    // Filtra pelos pivôs selecionados
    return rows.filter(r => printSelectedPivots.has(r.pivot_id))
  })()

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
      {printRows && !printPreview && <PrintLayout schedules={printRowsFiltered} metas={metas} sectorsMap={sectorsMap} />}

      {/* Modal de preview antes de imprimir */}
      {printRows && printPreview && (() => {
        // Pivôs únicos disponíveis neste lote
        const availPivots = Array.from(new Set(printRows.map(r => r.pivot_id)))
          .map(pid => ({ id: pid, name: metas.find(m => m.pivot?.id === pid)?.pivot?.name ?? pid }))

        // Lotes disponíveis (só no modo "imprimir tudo")
        const availBatches = printBatchIds
          ? printBatchIds.map(batchId => {
              const batchRows = printRows.filter(r => {
                const key = r.schedule_batch_id ?? `legacy-${r.pivot_id}-${r.date}`
                return key === batchId
              })
              const firstRow = batchRows[0]
              const pivotName = metas.find(m => m.pivot?.id === firstRow?.pivot_id)?.pivot?.name ?? '—'
              const sorted = [...batchRows].sort((a, b) => a.date.localeCompare(b.date))
              const dateFrom = sorted[0]?.date
              const dateTo = sorted[sorted.length - 1]?.date
              const dateRange = dateFrom === dateTo
                ? fmtDate(dateFrom ?? '')
                : `${fmtDate(dateFrom ?? '')} → ${fmtDate(dateTo ?? '')}`
              const createdAt = firstRow?.created_at ? fmtDateTime(firstRow.created_at) : ''
              return { batchId, pivotName, dateRange, days: batchRows.length, createdAt }
            })
          : null

        const canPrint = printRowsFiltered.length > 0 &&
          (printBatchIds ? printSelectedBatches.size > 0 : printSelectedPivots.size > 0)

        return (
          // Overlay fixo — SEM overflow (não scrola o container raiz)
          <div style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* ── Toolbar FIXA no topo — nunca some com o scroll ── */}
            <div style={{
              flexShrink: 0,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 12,
              padding: '14px 20px',
              background: 'rgba(13,18,26,0.98)',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
              {/* Esquerda: título + seleção de lotes/pivôs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Preview de impressão</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#667788' }}>
                    {printBatchIds ? 'Selecione as programações a incluir' : 'Preview da programação selecionada'}
                  </p>
                </div>

                {/* Seleção de lotes — aparece no modo "imprimir tudo" */}
                {availBatches && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {availBatches.map(b => {
                      const selected = printSelectedBatches.has(b.batchId)
                      return (
                        <button
                          key={b.batchId}
                          onClick={() => setPrintSelectedBatches(prev => {
                            const next = new Set(prev)
                            selected ? next.delete(b.batchId) : next.add(b.batchId)
                            return next
                          })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 11px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                            border: `1px solid ${selected ? 'rgba(0,147,208,0.5)' : 'rgba(255,255,255,0.08)'}`,
                            background: selected ? 'rgba(0,147,208,0.12)' : 'rgba(255,255,255,0.03)',
                            transition: 'all 0.15s',
                          }}>
                          <span style={{
                            width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                            border: `2px solid ${selected ? '#0093D0' : '#667788'}`,
                            background: selected ? '#0093D0' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {selected && (
                              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                                <polyline points="1.5,5 4,7.5 8.5,2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: selected ? 700 : 400, color: selected ? '#c8d8e8' : '#667788' }}>
                            {b.pivotName}
                          </span>
                          <span style={{ fontSize: 10, color: selected ? '#0093D0' : '#667788' }}>
                            {b.dateRange} · {b.days}d
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Checkboxes de pivôs — só quando não há seleção de lotes e há mais de 1 pivô */}
                {!availBatches && availPivots.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {availPivots.map(p => {
                      const selected = printSelectedPivots.has(p.id)
                      return (
                        <button
                          key={p.id}
                          onClick={() => setPrintSelectedPivots(prev => {
                            const next = new Set(prev)
                            selected ? next.delete(p.id) : next.add(p.id)
                            return next
                          })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                            border: `1px solid ${selected ? 'rgba(0,147,208,0.5)' : 'rgba(255,255,255,0.1)'}`,
                            background: selected ? 'rgba(0,147,208,0.12)' : 'rgba(255,255,255,0.03)',
                            color: selected ? '#0093D0' : '#667788',
                            fontSize: 12, fontWeight: selected ? 700 : 400, transition: 'all 0.15s',
                          }}>
                          <span style={{
                            width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                            border: `2px solid ${selected ? '#0093D0' : '#667788'}`,
                            background: selected ? '#0093D0' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {selected && (
                              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                                <polyline points="1.5,5 4,7.5 8.5,2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          {p.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Direita: botões Fechar / Imprimir — sempre visíveis */}
              <div style={{ display: 'flex', gap: 10, alignSelf: 'center', flexShrink: 0 }}>
                <button onClick={handlePrintClose} style={{
                  padding: '9px 18px', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
                  color: '#8899aa', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>Fechar</button>
                <button
                  onClick={handlePrintConfirm}
                  disabled={!canPrint}
                  style={{
                    padding: '9px 18px', borderRadius: 8, border: 'none',
                    background: !canPrint ? 'rgba(22,163,74,0.2)' : '#16a34a',
                    color: !canPrint ? '#334433' : '#fff',
                    fontSize: 13, fontWeight: 700,
                    cursor: !canPrint ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                  <Printer size={14} /> Imprimir
                </button>
              </div>
            </div>

            {/* ── Área scrollável: folha simulada ── */}
            <div style={{
              flex: 1, overflowY: 'auto',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '24px 16px 40px',
            }}>
              <div style={{
                width: '100%', maxWidth: 860,
                background: '#fff', borderRadius: 4,
                padding: '32px 36px',
                boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
              }}>
                <PrintLayout schedules={printRowsFiltered} metas={metas} sectorsMap={sectorsMap} inline />
              </div>
            </div>
          </div>
        )
      })()}

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
            <p style={{ fontSize: 11, color: '#667788', margin: 0 }}>
              {expanded && batches.length > 0
                ? `${batches.length} programação(ões) encontrada(s)`
                : 'Clique para ver programações salvas'}
            </p>
          </div>
          <div style={{ color: '#778899', flexShrink: 0 }}>
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>

        {/* Conteúdo */}
        {expanded && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '14px 16px 16px' }}>
            {/* Filtro de pivô + botão imprimir tudo */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {pivotOptions.length > 1 && (
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
                )}
                <span style={{ fontSize: 11, color: '#667788' }}>
                  {batches.length} programação(ões)
                </span>
              </div>

              {/* Botão imprimir tudo — junta todos os schedules filtrados com seleção de lotes */}
              {filtered.length > 0 && (
                <button
                  onClick={() => {
                    const allBatchIds = batches.map(([batchId]) => batchId)
                    handlePrint(filtered, allBatchIds)
                  }}
                  title="Imprimir programação de todos os pivôs visíveis"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.04)', color: '#8899aa',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>
                  <Printer size={12} /> Imprimir tudo
                </button>
              )}
            </div>

            {/* Lista de lotes */}
            {loading ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#667788', fontSize: 13 }}>Carregando…</div>
            ) : batches.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#667788', fontSize: 13 }}>
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
        @media screen { .print-only { display: none !important; } }
        @media print {
          /* Esconde absolutamente tudo */
          * { visibility: hidden !important; }
          /* Mostra só o print-only e seus filhos */
          .print-only,
          .print-only * { visibility: visible !important; }
          /* Posiciona no topo da página */
          .print-only {
            display: block !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 24px !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>
    </>
  )
}

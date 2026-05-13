'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, CheckCircle, Clock, Ban, Users, Building2, RefreshCw } from 'lucide-react'

type CompanyMember = {
  user_id: string
  role: string
  // Supabase retorna array quando usa join por FK
  users: { email: string } | { email: string }[] | null
}

type Company = {
  id: string
  name: string
  status: string
  created_at: string
  company_members: CompanyMember[]
}

interface Props {
  companies: Company[]
}

const STATUS_CONFIG = {
  active:    { label: 'Ativo',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)',    icon: CheckCircle },
  pending:   { label: 'Pendente', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   icon: Clock       },
  suspended: { label: 'Suspenso', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    icon: Ban         },
}

export function AdminClient({ companies: initial }: Props) {
  const [companies, setCompanies] = useState(initial)
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'suspended'>('all')
  const filtered = filter === 'all' ? companies : companies.filter(c => c.status === filter)

  const pendingCount = companies.filter(c => c.status === 'pending').length

  async function updateStatus(companyId: string, newStatus: 'active' | 'suspended') {
    setLoading(companyId)
    setMessage(null)

    const supabase = createClient()
    const { error } = await supabase
      .from('companies')
      .update({ status: newStatus })
      .eq('id', companyId)

    if (error) {
      setMessage({ type: 'err', text: 'Erro ao atualizar: ' + error.message })
    } else {
      // Invalida o cookie de status cacheado para que o cliente veja a mudança imediatamente
      document.cookie = 'co_status=; max-age=0; path=/'

      setCompanies(prev =>
        prev.map(c => c.id === companyId ? { ...c, status: newStatus } : c)
      )

      // Dispara e-mail de notificação via API route
      const company = companies.find(c => c.id === companyId)
      const ownerMember = company?.company_members.find(m => m.role === 'owner')
      const ownerUsers = ownerMember?.users
      const ownerEmail = ownerUsers
        ? (Array.isArray(ownerUsers) ? ownerUsers[0]?.email : ownerUsers.email)
        : undefined
      if (ownerEmail && newStatus === 'active') {
        fetch('/api/admin/notify-activation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: ownerEmail, companyName: company?.name }),
        }).catch(() => {}) // fire and forget
      }

      setMessage({ type: 'ok', text: newStatus === 'active' ? 'Acesso liberado.' : 'Conta suspensa.' })
    }

    setLoading(null)
    setTimeout(() => setMessage(null), 4000)
  }

  function getOwnerEmail(company: Company) {
    const member = company.company_members.find(m => m.role === 'owner')
    if (!member?.users) return '—'
    const u = Array.isArray(member.users) ? member.users[0] : member.users
    return u?.email ?? '—'
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'rgba(0,147,208,0.15)', border: '1px solid rgba(0,147,208,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={20} color="#0093D0" />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
            Administração
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
            Gestão de clientes e acessos
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total', value: companies.length, icon: Building2, color: 'var(--color-text-secondary)' },
          { label: 'Pendentes', value: pendingCount, icon: Clock, color: '#f59e0b' },
          { label: 'Ativos', value: companies.filter(c => c.status === 'active').length, icon: CheckCircle, color: '#22c55e' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{
            background: 'var(--color-surface-card)', borderRadius: 10,
            border: '1px solid var(--color-surface-border2)', padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <Icon size={18} color={color} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'pending', 'active', 'suspended'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
              border: filter === f ? '1px solid #0093D0' : '1px solid var(--color-surface-border)',
              background: filter === f ? 'rgba(0,147,208,0.15)' : 'transparent',
              color: filter === f ? '#0093D0' : 'var(--color-text-secondary)',
            }}
          >
            {f === 'all' ? 'Todos' : STATUS_CONFIG[f].label}
            {f === 'pending' && pendingCount > 0 && (
              <span style={{
                marginLeft: 6, background: '#f59e0b', color: '#000',
                borderRadius: 99, padding: '1px 6px', fontSize: 10, fontWeight: 700,
              }}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: message.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${message.type === 'ok' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          color: message.type === 'ok' ? '#22c55e' : '#ef4444',
        }}>
          {message.text}
        </div>
      )}

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '48px 24px',
            background: 'var(--color-surface-card)', borderRadius: 12,
            border: '1px solid var(--color-surface-border2)', color: 'var(--color-text-muted)', fontSize: 14,
          }}>
            Nenhum cliente encontrado.
          </div>
        )}

        {filtered.map(company => {
          const cfg = STATUS_CONFIG[company.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending
          const StatusIcon = cfg.icon
          const isPending = company.status === 'pending'
          const isActive = company.status === 'active'
          const isLoading = loading === company.id

          return (
            <div
              key={company.id}
              style={{
                background: 'var(--color-surface-card)', borderRadius: 12,
                border: isPending
                  ? '1px solid rgba(245,158,11,0.25)'
                  : '1px solid var(--color-surface-border2)',
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 16,
              }}
            >
              {/* Status badge */}
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: cfg.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <StatusIcon size={16} color={cfg.color} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
                    {company.name}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                    background: cfg.bg, color: cfg.color,
                  }}>
                    {cfg.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {getOwnerEmail(company)} · Cadastro: {formatDate(company.created_at)}
                </div>
                <div style={{ fontSize: 11, color: '#334455', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={10} />
                  {company.company_members.length} membro{company.company_members.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {!isActive && (
                  <button
                    onClick={() => updateStatus(company.id, 'active')}
                    disabled={isLoading}
                    style={{
                      padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      background: isLoading ? 'rgba(34,197,94,0.05)' : '#22c55e',
                      color: isLoading ? '#22c55e' : '#000',
                      border: 'none',
                      display: 'flex', alignItems: 'center', gap: 6,
                      opacity: isLoading ? 0.6 : 1,
                    }}
                  >
                    {isLoading ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={12} />}
                    Ativar
                  </button>
                )}
                {!isActive || company.status === 'active' ? (
                  isActive && (
                    <button
                      onClick={() => updateStatus(company.id, 'suspended')}
                      disabled={isLoading}
                      style={{
                        padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        background: 'transparent',
                        color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.3)',
                        display: 'flex', alignItems: 'center', gap: 6,
                        opacity: isLoading ? 0.6 : 1,
                      }}
                    >
                      {isLoading ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Ban size={12} />}
                      Suspender
                    </button>
                  )
                ) : null}
                {company.status === 'suspended' && (
                  <button
                    onClick={() => updateStatus(company.id, 'active')}
                    disabled={isLoading}
                    style={{
                      padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      background: 'transparent',
                      color: '#0093D0',
                      border: '1px solid rgba(0,147,208,0.3)',
                      display: 'flex', alignItems: 'center', gap: 6,
                      opacity: isLoading ? 0.6 : 1,
                    }}
                  >
                    Reativar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

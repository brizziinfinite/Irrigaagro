'use client'

import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { useAuth } from '@/hooks/useAuth'
import { Menu, ChevronDown, MapPin } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { PushNotificationToggle } from '@/components/PushNotificationToggle'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Central de Controle',
  '/manejo':    'Manejo Diário',
  '/precipitacoes': 'Precipitações',
  '/estacoes':  'Estações',
  '/diagnostico-pivo': 'Diagnóstico Pivô',
  '/fazendas':  'Fazendas',
  '/pivos':     'Pivôs',
  '/safras':    'Safras',
  '/culturas':  'Culturas',
  '/relatorios':'Relatórios',
  '/whatsapp':  'WhatsApp',
  '/lancamentos': 'Lançamentos',
  '/recomendacoes': 'Recomendações',
}

interface HeaderProps {
  user: User
  onMenuClick: () => void
}

export function Header({ user: _, onMenuClick }: HeaderProps) {
  const pathname = usePathname()
  const { company, farm, farms, switchFarm } = useAuth()
  const pageTitle = PAGE_TITLES[pathname] ?? 'IrrigaAgro'
  const [farmMenuOpen, setFarmMenuOpen] = useState(false)
  const farmMenuRef = useRef<HTMLDivElement>(null)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (farmMenuRef.current && !farmMenuRef.current.contains(e.target as Node)) {
        setFarmMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <header
      className="flex-shrink-0 py-3 flex items-center justify-between gap-3"
      style={{
        background: 'var(--color-surface-sidebar)',
        borderBottom: '1px solid var(--color-surface-border2)',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingLeft: 'max(20px, env(safe-area-inset-left))',
        paddingRight: 'max(20px, env(safe-area-inset-right))',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Botão mobile */}
        <button
          className="md:hidden flex items-center justify-center rounded-xl transition-colors"
          style={{
            color: 'var(--color-text-secondary)',
            width: 44,
            height: 44,
            minWidth: 44,
            border: '1px solid var(--color-surface-border)',
            background: 'var(--color-surface-elevated)',
          }}
          onClick={onMenuClick}
          aria-label="Abrir menu"
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-card2)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-elevated)'}
        >
          <Menu size={22} />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm">
          <span style={{ color: 'var(--color-text-faint)' }} className="hidden sm:inline">IrrigaAgro</span>
          <span style={{ color: 'var(--color-surface-border)' }} className="hidden sm:inline">/</span>
          <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{pageTitle}</span>
          {/* Dot "live" — só no dashboard */}
          {pathname === '/dashboard' && (
            <span
              title="Dados ao vivo"
              style={{
                display: 'inline-block',
                width: 7, height: 7,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 6px rgba(34,197,94,0.8)',
                animation: 'live-dot 2.4s ease-in-out infinite',
                flexShrink: 0,
                marginLeft: 2,
              }}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Empresa ativa */}
        {company && (
          <span
            className="hidden sm:inline-flex items-center rounded-xl font-medium max-w-[160px] truncate"
            style={{
              height: 36, padding: '0 12px', fontSize: 13,
              border: '1px solid var(--color-surface-border)',
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text-secondary)',
            }}
            title={company.name}
          >
            {company.name}
          </span>
        )}

        {/* Seletor de fazenda — só aparece se empresa tiver fazendas cadastradas */}
        {farms.length > 0 && (
          <div ref={farmMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setFarmMenuOpen(o => !o)}
              className="hidden sm:flex items-center gap-1.5 rounded-xl transition-colors"
              style={{
                height: 36, padding: '0 10px',
                border: '1px solid var(--color-surface-border)',
                background: farm ? 'rgba(0,147,208,0.08)' : 'var(--color-surface-elevated)',
                color: farm ? '#0093D0' : 'var(--color-text-secondary)',
                fontSize: 13, fontWeight: 500,
                maxWidth: 160, cursor: 'pointer',
              }}
            >
              <MapPin size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {farm ? farm.name : 'Todas as fazendas'}
              </span>
              <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
            </button>

            {farmMenuOpen && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  minWidth: 200, zIndex: 100,
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-surface-border)',
                  borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  overflow: 'hidden',
                }}
              >
                {/* Todas as fazendas */}
                <button
                  onClick={() => { switchFarm(null); setFarmMenuOpen(false) }}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '10px 14px', fontSize: 13,
                    color: !farm ? '#0093D0' : 'var(--color-text-secondary)',
                    background: !farm ? 'rgba(0,147,208,0.08)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    borderBottom: '1px solid var(--color-surface-border2)',
                    fontWeight: !farm ? 600 : 400,
                  }}
                >
                  Todas as fazendas
                </button>
                {farms.map(f => (
                  <button
                    key={f.id}
                    onClick={() => { switchFarm(f.id); setFarmMenuOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '10px 14px', fontSize: 13,
                      color: farm?.id === f.id ? '#0093D0' : 'var(--color-text-secondary)',
                      background: farm?.id === f.id ? 'rgba(0,147,208,0.08)' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      fontWeight: farm?.id === f.id ? 600 : 400,
                    }}
                    onMouseEnter={e => { if (farm?.id !== f.id) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-elevated)' }}
                    onMouseLeave={e => { if (farm?.id !== f.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Toggle notificações push */}
        <PushNotificationToggle />
      </div>
    </header>
  )
}

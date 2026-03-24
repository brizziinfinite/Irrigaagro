'use client'

import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { Bell, ChevronDown, Menu, Droplets } from 'lucide-react'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/manejo':    'Manejo Diário',
  '/precipitacoes': 'Precipitações',
  '/estacoes':  'Estações',
  '/diagnostico-pivo': 'Diagnóstico Pivô',
  '/fazendas':  'Fazendas',
  '/pivos':     'Pivôs',
  '/safras':    'Safras',
  '/culturas':  'Culturas',
  '/relatorios':'Relatórios',
}

interface HeaderProps {
  user: User
  onMenuClick: () => void
}

export function Header({ user: _, onMenuClick }: HeaderProps) {
  const pathname = usePathname()
  const pageTitle = PAGE_TITLES[pathname] ?? 'IrrigaAgro'

  return (
    <header
      className="flex-shrink-0 px-6 md:px-8 lg:px-10 py-3 flex items-center justify-between gap-3"
      style={{
        background: 'var(--color-surface-sidebar)',
        borderBottom: '1px solid var(--color-surface-border2)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Botão mobile */}
        <button
          className="md:hidden p-2 rounded-xl transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onClick={onMenuClick}
          aria-label="Abrir menu"
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-elevated)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <Menu size={18} />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm">
          <span style={{ color: 'var(--color-text-faint)' }} className="hidden sm:inline">IrrigaAgro</span>
          <span style={{ color: 'var(--color-surface-border)' }} className="hidden sm:inline">/</span>
          <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{pageTitle}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Seletor de safra */}
        <button
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors"
          style={{
            border: '1px solid var(--color-surface-border)',
            background: 'var(--color-surface-elevated)',
            color: 'var(--color-text-secondary)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-card2)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-elevated)'}
        >
          <Droplets size={13} style={{ color: '#0093D0' }} />
          <span className="font-medium whitespace-nowrap">Safra 2025/26 · Soja</span>
          <ChevronDown size={12} style={{ color: 'var(--color-text-faint)' }} />
        </button>

        {/* Notificações */}
        <button
          className="relative p-2 rounded-xl transition-colors"
          style={{
            border: '1px solid var(--color-surface-border)',
            background: 'var(--color-surface-elevated)',
            color: 'var(--color-text-secondary)',
          }}
          aria-label="Notificações"
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-card2)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-elevated)'}
        >
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
        </button>
      </div>
    </header>
  )
}

'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Menu, X } from 'lucide-react'

interface AppShellProps {
  user: User
  children: React.ReactNode
}

export function AppShell({ user, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-surface-bg)' }}>

      {/* Sidebar desktop */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar user={user} />
      </div>

      {/* Drawer mobile — overlay escuro + sidebar deslizando da esquerda */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <button
            className="absolute inset-0"
            style={{ background: 'rgb(0 0 0 / 0.6)' }}
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer — mesma largura que o sidebar desktop (260px) */}
          <div className="relative h-full w-[280px] shadow-2xl">
            <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
            <button
              className="absolute top-3 right-3 flex items-center justify-center rounded-xl"
              style={{
                width: 36, height: 36,
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--color-text-secondary)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Área principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          user={user}
          onMenuClick={() => setMobileOpen(true)}
        />
        {/* padding responsivo: compacto no mobile, espaçoso no desktop */}
        <main
          className="flex-1 overflow-auto px-4 py-4 md:px-7 md:py-6 lg:px-10 lg:py-7"
          style={{ background: 'var(--color-surface-bg)' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

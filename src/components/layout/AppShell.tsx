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

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0"
            style={{ background: 'rgb(0 0 0 / 0.6)' }}
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-60 shadow-2xl">
            <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
            <button
              className="absolute top-4 right-[-44px] rounded-xl p-2"
              style={{ background: 'var(--color-surface-card)', color: 'var(--color-text-secondary)' }}
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
        <main
          className="flex-1 overflow-auto p-5 md:p-7"
          style={{ background: 'var(--color-surface-bg)' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

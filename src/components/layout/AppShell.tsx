'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { InstallBanner } from '@/components/InstallBanner'
import { X } from 'lucide-react'

interface AppShellProps {
  user: User
  children: React.ReactNode
  isSuperAdmin?: boolean
}

export function AppShell({ user, children, isSuperAdmin }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-surface-bg)' }}>

      {/* Sidebar desktop */}
      <div className="hidden md:flex flex-shrink-0 h-full">
        <Sidebar user={user} isSuperAdmin={isSuperAdmin} />
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
          <div className="relative h-full w-[280px] shadow-2xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <Sidebar user={user} isSuperAdmin={isSuperAdmin} onNavigate={() => setMobileOpen(false)} />
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
        <main
          className="flex-1 overflow-auto"
          style={{ background: 'var(--color-surface-bg)', padding: '24px 28px' }}
        >
          {children}
        </main>
      </div>

      <InstallBanner />
    </div>
  )
}

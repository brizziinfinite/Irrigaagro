'use client'

import { useState, useEffect } from 'react'

const DISMISSED_KEY = 'irrigaagro_install_banner_dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallBanner() {
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Já instalado como PWA
    const isStandalone =
      ('standalone' in navigator && (navigator as Navigator & { standalone: boolean }).standalone === true) ||
      window.matchMedia('(display-mode: standalone)').matches

    // Já dispensou antes
    const dismissed = localStorage.getItem(DISMISSED_KEY)

    if (isStandalone || dismissed) return

    // Android/Chrome: captura beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setIsIOS(false)
      const t = setTimeout(() => setShow(true), 2500)
      return () => clearTimeout(t)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS Safari
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const safari = /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent)
    if (ios && safari) {
      setIsIOS(true)
      const t = setTimeout(() => setShow(true), 2500)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', handler)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem(DISMISSED_KEY, '1')
    }
    setShow(false)
    setDeferredPrompt(null)
  }

  if (!show) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        left: 16,
        right: 16,
        zIndex: 9999,
        background: 'linear-gradient(135deg, #0f1923, #152233)',
        border: '1px solid rgba(0,147,208,0.3)',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,147,208,0.1)',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        animation: 'fadeInUp 0.35s ease-out both',
      }}
    >
      {/* Ícone */}
      <img
        src="/icons/apple-touch-icon.png"
        alt="IrrigaAgro"
        style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
      />

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', margin: 0, lineHeight: 1.3 }}>
          Adicione à Tela de Início
        </p>
        <p style={{ fontSize: 12, color: '#8899aa', margin: '4px 0 0', lineHeight: 1.4 }}>
          {isIOS ? (
            <>
              Toque em{' '}
              <span style={{ color: '#0093D0', fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }}>
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                Compartilhar
              </span>
              {' '}e depois{' '}
              <span style={{ color: '#0093D0', fontWeight: 600 }}>&ldquo;Adicionar à Tela de Início&rdquo;</span>
              {' '}para acesso rápido no campo.
            </>
          ) : (
            <>Instale o app para acesso rápido no campo, mesmo com sinal fraco.</>
          )}
        </p>

        {/* Botão instalar Android */}
        {!isIOS && (
          <button
            onClick={handleInstall}
            style={{
              marginTop: 10,
              padding: '7px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#0093D0',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Instalar app
          </button>
        )}
      </div>

      {/* Fechar */}
      <button
        onClick={dismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#556677', padding: 4, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 36, minHeight: 36,
        }}
        aria-label="Fechar"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}

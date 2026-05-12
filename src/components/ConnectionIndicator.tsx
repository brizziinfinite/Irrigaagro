'use client'

import { useEffect, useState } from 'react'

export function ConnectionIndicator() {
  const [offline, setOffline] = useState(false)
  const [showUpdateToast, setShowUpdateToast] = useState(false)

  useEffect(() => {
    // Estado inicial
    setOffline(!navigator.onLine)

    const handleOffline = () => setOffline(true)
    const handleOnline = () => setOffline(false)

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    // Expõe callback global para o SW invocar toast de atualização
    ;(window as Window & { __showSwUpdateToast?: () => void }).__showSwUpdateToast = () =>
      setShowUpdateToast(true)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  return (
    <>
      {/* Barra de offline */}
      {offline && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: '#92400e',
            color: '#fef3c7',
            fontSize: 13,
            fontFamily: 'sans-serif',
            padding: '6px 16px',
            textAlign: 'center',
            borderBottom: '1px solid #b45309',
          }}
        >
          Sem conexão. Os dados podem estar desatualizados.
        </div>
      )}

      {/* Toast de nova versão do SW */}
      {showUpdateToast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'var(--color-surface-card)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            color: 'var(--color-text)',
            fontSize: 13,
            fontFamily: 'sans-serif',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}
        >
          <span>Nova versão disponível.</span>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#0093D0',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '4px 12px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Recarregar
          </button>
          <button
            onClick={() => setShowUpdateToast(false)}
            style={{
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}

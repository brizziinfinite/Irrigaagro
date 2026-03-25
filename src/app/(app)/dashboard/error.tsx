'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard] Error boundary:', error)
  }, [error])

  return (
    <div style={{ padding: '60px 40px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>!</div>
      <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        Erro no Dashboard
      </h2>
      <p style={{ color: '#8899aa', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
        {error.message || 'Ocorreu um erro inesperado ao carregar o dashboard.'}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          background: '#0093D0', color: '#fff', border: 'none', cursor: 'pointer',
        }}
      >
        Tentar novamente
      </button>
    </div>
  )
}

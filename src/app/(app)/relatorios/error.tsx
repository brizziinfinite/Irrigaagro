'use client'

import { useEffect } from 'react'

export default function RelatoriosError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[relatorios] Error boundary:', error)
  }, [error])

  return (
    <div style={{ padding: '60px 40px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>!</div>
      <h2 style={{ color: 'var(--color-text)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        Erro nos Relatórios
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
        {error.message || 'Ocorreu um erro inesperado ao carregar os relatórios.'}
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

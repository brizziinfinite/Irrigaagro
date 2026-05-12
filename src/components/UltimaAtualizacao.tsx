'use client'

interface UltimaAtualizacaoProps {
  fetchedAt: string | null // ISO timestamp
  className?: string
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function UltimaAtualizacao({ fetchedAt, className }: UltimaAtualizacaoProps) {
  if (!fetchedAt) {
    return (
      <span
        className={className}
        style={{
          fontSize: 12,
          color: '#ef4444',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 6,
          padding: '2px 8px',
          display: 'inline-block',
        }}
      >
        Sem dados em cache
      </span>
    )
  }

  const ageMs = Date.now() - new Date(fetchedAt).getTime()
  const ageH = ageMs / 1000 / 3600

  // Até 6h: badge sutil
  if (ageH <= 6) {
    return (
      <span
        className={className}
        style={{
          fontSize: 11,
          color: 'var(--color-text-muted)',
          display: 'inline-block',
        }}
      >
        Atualizado às {formatTime(fetchedAt)}
      </span>
    )
  }

  // 6h a 24h: aviso amarelo
  if (ageH <= 24) {
    return (
      <span
        className={className}
        style={{
          fontSize: 12,
          color: '#f59e0b',
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 6,
          padding: '2px 8px',
          display: 'inline-block',
        }}
      >
        Última atualização: {formatDateTime(fetchedAt)}
      </span>
    )
  }

  // Mais de 24h: aviso vermelho
  return (
    <span
      className={className}
      style={{
        fontSize: 12,
        color: '#ef4444',
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: 6,
        padding: '2px 8px',
        display: 'inline-block',
      }}
    >
      Dados de ontem ou anteriores. Conecte-se para atualizar.
    </span>
  )
}

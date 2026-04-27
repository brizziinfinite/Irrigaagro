interface Props {
  showAdmin?: boolean
}

export function EmailLogo({ showAdmin = false }: Props) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>

      {/* Ícone SVG — gota com barras */}
      <svg width="40" height="48" viewBox="0 0 84 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="email-dropG" x1="42" y1="0" x2="42" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0074a6" />
          </linearGradient>
          <linearGradient id="email-bar1G" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
          <linearGradient id="email-bar2G" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0093d0" />
          </linearGradient>
          <linearGradient id="email-bar3G" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        {/* Contorno da gota */}
        <path
          d="M42 4 C42 4 8 44 8 64 C8 83 23 96 42 96 C61 96 76 83 76 64 C76 44 42 4 42 4 Z"
          stroke="url(#email-dropG)" strokeWidth="4" fill="rgba(56,189,248,0.06)"
          strokeLinejoin="round"
        />
        {/* Barra esquerda — verde */}
        <rect x="22" y="62" width="10" height="22" rx="2.5" fill="url(#email-bar1G)" />
        {/* Barra central — azul */}
        <rect x="37" y="50" width="10" height="34" rx="2.5" fill="url(#email-bar2G)" />
        {/* Barra direita — azul claro */}
        <rect x="52" y="38" width="10" height="46" rx="2.5" fill="url(#email-bar3G)" />
      </svg>

      {/* Wordmark + subtítulo */}
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#0074a6' }}>Irriga</span>
          <span style={{ color: '#16a34a' }}>Agro</span>
          {showAdmin && (
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8, fontWeight: 400, letterSpacing: '0.02em' }}>
              Admin
            </span>
          )}
        </div>
        <div style={{
          fontSize: 9, color: '#94a3b8', letterSpacing: '0.01em',
          marginTop: 2, fontWeight: 400, textAlign: 'center',
        }}>
          irrigação inteligente
        </div>
      </div>

    </div>
  )
}

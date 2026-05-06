'use client'

import React from 'react'

type IrrigaAgroLogoProps = {
  size?: number
  showText?: boolean
  className?: string
}

export default function IrrigaAgroLogo({
  size = 32,
  showText = true,
  className = '',
}: IrrigaAgroLogoProps) {
  // Gota maior: ocupa a altura total incluindo a tagline
  const wordSize = Math.round(size * 0.92)
  const tagSize = Math.max(12, Math.round(size * 0.24))
  const totalH = Math.round(size + tagSize * 1.6)   // altura total = wordmark + gap + tagline
  const iconH = totalH
  const iconW = Math.round(totalH * 0.84)

  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.28) }}
    >
      {/* Gota com barras internas */}
      <svg
        width={iconW}
        height={iconH}
        viewBox="0 0 84 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Ícone IrrigaAgro"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="dropStroke" x1="42" y1="0" x2="42" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#4ade80" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
          <linearGradient id="bar1g" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%"   stopColor="#4ade80" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="bar2g" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%"   stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="bar3g" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%"   stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>

        {/* Contorno da gota */}
        <path
          d="M42 4 C42 4 8 44 8 64 C8 83 23 96 42 96 C61 96 76 83 76 64 C76 44 42 4 42 4 Z"
          stroke="url(#dropStroke)"
          strokeWidth="3.5"
          fill="none"
          strokeLinejoin="round"
        />

        {/* Barra esquerda — mais baixa */}
        <rect x="22" y="62" width="10" height="22" rx="2.5" fill="url(#bar1g)" />

        {/* Barra central — média */}
        <rect x="37" y="50" width="10" height="34" rx="2.5" fill="url(#bar2g)" />

        {/* Barra direita — mais alta */}
        <rect x="52" y="38" width="10" height="46" rx="2.5" fill="url(#bar3g)" />
      </svg>

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: Math.round(size * 0.07) }}>
          {/* Wordmark */}
          <span style={{
            fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
            fontSize: wordSize,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>
            <span style={{ color: '#4ade80' }}>Irriga</span>
            <span style={{ color: '#60a5fa' }}>Agro</span>
          </span>

          {/* Tagline — centralizada sob o wordmark */}
          <span style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: tagSize,
            fontWeight: 400,
            letterSpacing: '0.10em',
            color: 'rgba(255,255,255,0.45)',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}>
            Irrigação Inteligente
          </span>
        </div>
      )}
    </div>
  )
}

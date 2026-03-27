'use client'

import React from 'react'

type GotejoLogoProps = {
  size?: number
  showText?: boolean
  className?: string
}

export default function GotejoLogo({
  size = 32,
  showText = true,
  className = '',
}: GotejoLogoProps) {
  const iconH = size
  const iconW = Math.round(size * 0.87)
  const wordSize = Math.round(size * 0.95)
  const tagSize = Math.round(size * 0.195)

  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3) }}
    >
      <svg
        width={iconW}
        height={iconH}
        viewBox="0 0 200 230"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Logotipo Gotejo"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="dropGrad" x1="60" y1="10" x2="160" y2="210" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8"/>
            <stop offset="50%" stopColor="#00D4AA"/>
            <stop offset="100%" stopColor="#22C55E"/>
          </linearGradient>
          <linearGradient id="barGrad" x1="0" y1="190" x2="0" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00D4AA"/>
            <stop offset="100%" stopColor="#22C55E"/>
          </linearGradient>
        </defs>
        <path d="M100 12 C100 12 38 98 38 140 C38 176 65 202 100 202 C135 202 162 176 162 140 C162 98 100 12 100 12Z" fill="none" stroke="url(#dropGrad)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="66" y="150" width="18" height="36" rx="3" fill="url(#barGrad)" opacity="0.9"/>
        <rect x="91" y="128" width="18" height="58" rx="3" fill="url(#barGrad)"/>
        <rect x="116" y="106" width="18" height="80" rx="3" fill="url(#barGrad)" opacity="0.9"/>
        <line x1="60" y1="189" x2="140" y2="189" stroke="rgba(0,212,170,0.4)" strokeWidth="2" strokeLinecap="round"/>
      </svg>

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          {/* Wordmark */}
          <span style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: wordSize,
            letterSpacing: '0.02em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>
            <span style={{
              background: 'linear-gradient(135deg, #00D4AA, #38BDF8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>G</span>
            <span style={{ color: '#fff' }}>otejo</span>
          </span>

          {/*
            Tagline: usamos um SVG de texto para garantir que a largura seja
            exatamente igual à do wordmark — sem distorção, sem depender de JS.
            O SVG tem width=100% e o <text> usa textLength="100%" lengthAdjust="spacing"
            para distribuir o espaço entre letras automaticamente.
          */}
          <svg
            width="100%"
            height={tagSize + 2}
            viewBox={`0 0 100 ${tagSize + 2}`}
            preserveAspectRatio="none"
            style={{ marginTop: Math.round(size * 0.07), overflow: 'visible' }}
          >
            <text
              x="0"
              y={tagSize}
              fontSize={tagSize}
              fontWeight="600"
              fontFamily="inherit"
              fill="rgba(255,255,255,0.28)"
              textLength="100"
              lengthAdjust="spacing"
              style={{ textTransform: 'uppercase', letterSpacing: 0 }}
            >
              IRRIGAÇÃO INTELIGENTE
            </text>
          </svg>
        </div>
      )}
    </div>
  )
}

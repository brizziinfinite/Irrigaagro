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
  return (
    <div className={`flex items-center gap-3 ${className}`} style={{ alignItems: 'center' }}>
      <svg
        width={size}
        height={Math.round(size * 1.15)}
        viewBox="0 0 200 230"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Logotipo Gotejo"
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
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, letterSpacing: 1, lineHeight: 1 }}>
            <span style={{
              background: 'linear-gradient(135deg, #00D4AA, #38BDF8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>G</span>
            <span style={{ color: '#fff' }}>otejo</span>
          </span>
          <span style={{
            fontSize: 7,
            fontWeight: 500,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.25)',
            letterSpacing: '2.8px',
            marginTop: 3,
          }}>Irrigação Inteligente</span>
        </div>
      )}
    </div>
  )
}

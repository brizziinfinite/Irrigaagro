'use client'

import React from 'react'

type IrrigaAgroLogoProps = {
  size?: number
  showText?: boolean
  compactText?: boolean
  className?: string
}

export default function IrrigaAgroLogo({
  size = 32,
  showText = true,
  compactText = false,
  className = '',
}: IrrigaAgroLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-label="Logotipo IrrigaAgro"
      >
        <defs>
          <linearGradient id="ia-blue" x1="8" y1="6" x2="36" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38BDF8" />
            <stop offset="1" stopColor="#0284C7" />
          </linearGradient>
          <linearGradient id="ia-green" x1="28" y1="22" x2="54" y2="54" gradientUnits="userSpaceOnUse">
            <stop stopColor="#84CC16" />
            <stop offset="1" stopColor="#16A34A" />
          </linearGradient>
        </defs>

        <path
          d="M31.5 4C31.5 4 13 22.6 13 35.5C13 47.4 21.8 56 33 56C44.2 56 53 47.4 53 35.5C53 22.6 31.5 4 31.5 4Z"
          fill="url(#ia-blue)"
        />

        <path
          d="M31.5 8C31.5 8 16 24.2 16 35.3C16 45.6 23.4 53 33 53"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        <path
          d="M30 24C41.6 24 51 33.4 51 45C51 48.2 50.3 51.1 48.9 53.7H30V24Z"
          fill="url(#ia-green)"
          opacity="0.95"
        />

        <rect x="23" y="37" width="6" height="13" rx="1.5" fill="#0B1220" opacity="0.9" />
        <rect x="31" y="30" width="6" height="20" rx="1.5" fill="#0B1220" opacity="0.9" />
        <rect x="39" y="23" width="6" height="27" rx="1.5" fill="#0B1220" opacity="0.9" />
      </svg>

      {showText && (
        <span className="leading-none">
          <span className="font-extrabold tracking-tight text-sky-400">
            {compactText ? 'Irriga' : 'Irriga'}
          </span>
          {!compactText && <span className="font-light tracking-tight text-emerald-400">Agro</span>}
        </span>
      )}
    </div>
  )
}

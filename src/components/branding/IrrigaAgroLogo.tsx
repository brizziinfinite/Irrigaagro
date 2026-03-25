'use client'

import { useId } from 'react'

type IrrigaAgroLogoProps = {
  size?: number
  showText?: boolean
  compactText?: boolean
  mono?: boolean
  className?: string
}

export default function IrrigaAgroLogo({
  size = 32,
  showText = true,
  compactText = false,
  mono = false,
  className = '',
}: IrrigaAgroLogoProps) {
  const id = useId().replace(/:/g, '')
  const leafGradientId = `ia-leaf-${id}`
  const chartGradientId = `ia-chart-${id}`

  const leafA = mono ? '#E2E8F0' : '#86EFAC'
  const leafB = mono ? '#94A3B8' : '#16A34A'
  const chartA = mono ? '#CBD5E1' : '#7DD3FC'
  const chartB = mono ? '#94A3B8' : '#0284C7'
  const veinColor = mono ? '#CBD5E1' : '#E8FFF1'
  const baseStroke = mono ? '#94A3B8' : '#9FB0BD'
  const wordPrimary = mono ? 'text-slate-200' : 'text-slate-100'
  const wordAccent = mono ? 'text-slate-400' : 'text-emerald-400'

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-label="Logotipo IrrigaAgro"
        role="img"
      >
        <defs>
          <linearGradient id={leafGradientId} x1="15" y1="10" x2="45" y2="51" gradientUnits="userSpaceOnUse">
            <stop stopColor={leafA} />
            <stop offset="1" stopColor={leafB} />
          </linearGradient>
          <linearGradient id={chartGradientId} x1="23" y1="17" x2="48" y2="45" gradientUnits="userSpaceOnUse">
            <stop stopColor={chartA} />
            <stop offset="1" stopColor={chartB} />
          </linearGradient>
        </defs>

        <path
          d="M15 36.2C15 22.4 24.9 12 39.6 11.2C45.3 16.3 48.8 22.7 50.1 30.8C51.2 37.3 50.6 43.2 49.4 47.1C45.9 49.9 41.3 51.5 36 51.5C23.9 51.5 15 45.2 15 36.2Z"
          fill={`url(#${leafGradientId})`}
        />

        <path
          d="M20.7 38.5C25.7 33.2 31.2 28.5 37.5 24.5C41.2 22.2 45 20.2 49 18.5"
          stroke={veinColor}
          strokeWidth="2"
          strokeLinecap="round"
        />

        <path
          d="M22.5 45.5H48.5"
          stroke={baseStroke}
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.65"
        />

        <rect x="24.5" y="32" width="5.2" height="13.5" rx="1.6" fill={`url(#${chartGradientId})`} />
        <rect x="32.2" y="26" width="5.2" height="19.5" rx="1.6" fill={`url(#${chartGradientId})`} />
        <rect x="39.9" y="19.5" width="5.2" height="26" rx="1.6" fill={`url(#${chartGradientId})`} />
      </svg>

      {showText && (
        <span className="leading-none">
          <span className={`font-extrabold tracking-tight ${wordPrimary}`}>Irriga</span>
          {!compactText && (
            <span className={`font-medium tracking-tight ${wordAccent}`}>Agro</span>
          )}
        </span>
      )}
    </div>
  )
}

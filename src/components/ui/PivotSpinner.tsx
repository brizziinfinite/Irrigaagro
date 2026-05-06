'use client'

import React from 'react'

interface PivotSpinnerProps {
  size?: number
  color?: string
  label?: string
}

export default function PivotSpinner({
  size = 48,
  color = '#0093D0',
  label,
}: PivotSpinnerProps) {
  const cx = size / 2
  const cy = size / 2
  const armLen = size * 0.42

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Torre central */}
        <circle cx={cx} cy={cy} r={size * 0.08} fill={color} />

        {/* Braço do pivô girando */}
        <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'pivot-spin 2s linear infinite' }}>
          {/* Braço principal */}
          <line
            x1={cx} y1={cy}
            x2={cx + armLen} y2={cy}
            stroke={color} strokeWidth={size * 0.05} strokeLinecap="round"
          />
          {/* Rodas/torres ao longo do braço */}
          <circle cx={cx + armLen * 0.33} cy={cy} r={size * 0.045} fill={color} opacity={0.7} />
          <circle cx={cx + armLen * 0.66} cy={cy} r={size * 0.045} fill={color} opacity={0.7} />
          <circle cx={cx + armLen} cy={cy} r={size * 0.055} fill={color} opacity={0.9} />

          {/* Canhões de irrigação (gotinhas) */}
          <circle cx={cx + armLen * 0.25} cy={cy + size * 0.09} r={size * 0.025} fill={color} opacity={0.5} />
          <circle cx={cx + armLen * 0.5}  cy={cy + size * 0.11} r={size * 0.025} fill={color} opacity={0.5} />
          <circle cx={cx + armLen * 0.75} cy={cy + size * 0.10} r={size * 0.025} fill={color} opacity={0.5} />
        </g>

        {/* Trilha circular (campo irrigado) */}
        <circle
          cx={cx} cy={cy}
          r={armLen}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.018}
          strokeOpacity={0.15}
          strokeDasharray={`${size * 0.12} ${size * 0.06}`}
        />

        <style>{`
          @keyframes pivot-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </svg>

      {label && (
        <span style={{ fontSize: 13, color: '#8899aa', fontWeight: 400 }}>{label}</span>
      )}
    </div>
  )
}

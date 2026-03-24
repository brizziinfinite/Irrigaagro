'use client'

import { Sun, Droplets, CloudRain, Wind, Zap } from 'lucide-react'
import type { DailyManagement } from '@/types/database'

interface WeatherBlockProps {
  lastManagementBySeason: Record<string, DailyManagement>
}

function fmtVal(n: number | null | undefined, dec = 1): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(dec)
}

export function WeatherBlock({ lastManagementBySeason }: WeatherBlockProps) {
  const latest = Object.values(lastManagementBySeason)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null

  return (
    <div style={{
      background: '#0f1923',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Sun size={12} style={{ color: '#f59e0b' }} />
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: '#556677',
        }}>
          Clima Atual
        </span>
        {latest?.date && (
          <span style={{ fontSize: 10, color: '#556677', marginLeft: 'auto' }}>
            {new Date(latest.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </span>
        )}
      </div>

      {!latest ? (
        <p style={{ fontSize: 12, color: '#556677', textAlign: 'center', padding: '12px 0' }}>
          Nenhum dado climático registrado ainda.
        </p>
      ) : (
        <>
          {/* Temperatura */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 28, fontWeight: 800, color: '#f59e0b',
              fontFamily: 'var(--font-mono)', lineHeight: 1,
            }}>
              {fmtVal(latest.temp_max, 0)}°
            </span>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#556677', fontFamily: 'var(--font-mono)' }}>
              / {fmtVal(latest.temp_min, 0)}°
            </span>
            {latest.temp_max != null && latest.temp_min != null && (
              <span style={{ fontSize: 11, color: '#556677', marginLeft: 4 }}>
                Amplitude {(latest.temp_max - latest.temp_min).toFixed(0)}°
              </span>
            )}
          </div>

          {/* Grid 2×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { Icon: Droplets, label: 'Umidade',  value: fmtVal(latest.humidity_percent, 0), unit: '%',    color: '#22d3ee' },
              { Icon: Wind,     label: 'Vento',    value: fmtVal(latest.wind_speed_ms),       unit: 'm/s',  color: '#8899aa' },
              { Icon: CloudRain,label: 'Chuva',    value: fmtVal(latest.rainfall_mm),         unit: 'mm',   color: '#60a5fa' },
              { Icon: Zap,      label: 'ETo',      value: fmtVal(latest.eto_mm),              unit: 'mm',   color: '#a78bfa' },
            ].map(({ Icon, label, value, unit, color }) => (
              <div key={label} style={{
                background: '#0d1520',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon size={11} style={{ color }} />
                  <span style={{ fontSize: 9, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                    {value}
                  </span>
                  <span style={{ fontSize: 10, color: '#556677' }}>{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

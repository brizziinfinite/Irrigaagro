'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, AlertTriangle, AlertCircle, Info, Droplets } from 'lucide-react'
import type { DailyManagement } from '@/types/database'
import type { ProjectionDay } from '@/lib/water-balance'

type IrrigationStatus = 'azul' | 'verde' | 'amarelo' | 'vermelho' | 'sem_safra'

const STATUS_CONFIG: Record<IrrigationStatus, { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2 }> = {
  azul:      { label: 'Irrigando',     color: '#06b6d4', bg: 'rgb(6 182 212 / 0.12)',  border: 'rgb(6 182 212 / 0.25)',  icon: Droplets      },
  verde:     { label: 'OK',            color: '#22c55e', bg: 'rgb(34 197 94 / 0.12)',   border: 'rgb(34 197 94 / 0.25)',  icon: CheckCircle2  },
  amarelo:   { label: 'Atenção',       color: '#f59e0b', bg: 'rgb(245 158 11 / 0.12)',  border: 'rgb(245 158 11 / 0.25)', icon: AlertTriangle },
  vermelho:  { label: 'Irrigar Agora', color: '#ef4444', bg: 'rgb(239 68 68 / 0.12)',   border: 'rgb(239 68 68 / 0.25)',  icon: AlertCircle   },
  sem_safra: { label: 'Sem safra',     color: '#535c3e', bg: 'rgb(83 92 62 / 0.12)',    border: 'rgb(83 92 62 / 0.25)',   icon: Info          },
}

function resolveStatus(lastM: DailyManagement | null, hasActiveSeason: boolean, threshold = 70): IrrigationStatus {
  if (!hasActiveSeason) return 'sem_safra'
  if (!lastM) return 'verde'
  const pct = lastM.field_capacity_percent ?? null
  if (pct === null) return 'verde'
  if (pct >= threshold) return 'verde'
  if (pct >= threshold - 10) return 'amarelo'
  return 'vermelho'
}

function fmtVal(n: number | null | undefined, dec = 1): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(dec)
}

interface PivotTableProps {
  pivots: Array<{
    id: string
    name: string
    farms: { id: string; name: string } | null
    alert_threshold_percent: number | null
  }>
  lastManagementByPivot: Record<string, DailyManagement>
  activePivotIds: Set<string>
  projectionByPivot: Record<string, ProjectionDay[]>
}

type FilterType = 'all' | IrrigationStatus

export function PivotTable({ pivots, lastManagementByPivot, activePivotIds, projectionByPivot }: PivotTableProps) {
  const [filter, setFilter] = useState<FilterType>('all')

  const pivotsWithStatus = pivots.map(pivot => {
    const m = lastManagementByPivot[pivot.id] ?? null
    const threshold = pivot.alert_threshold_percent ?? 70
    const status = resolveStatus(m, activePivotIds.has(pivot.id), threshold)
    const proj = projectionByPivot[pivot.id] ?? []

    let nextIrrigation: string | null = null
    if ((proj[0]?.recommendedDepthMm ?? 0) > 0) nextIrrigation = 'Hoje'
    else if ((proj[1]?.recommendedDepthMm ?? 0) > 0) nextIrrigation = 'Amanhã'

    return { pivot, m, status, threshold, nextIrrigation }
  })

  // Counts para filtros
  const counts = {
    all: pivotsWithStatus.length,
    azul: pivotsWithStatus.filter(p => p.status === 'azul').length,
    verde: pivotsWithStatus.filter(p => p.status === 'verde').length,
    amarelo: pivotsWithStatus.filter(p => p.status === 'amarelo').length,
    vermelho: pivotsWithStatus.filter(p => p.status === 'vermelho').length,
    sem_safra: pivotsWithStatus.filter(p => p.status === 'sem_safra').length,
  }

  const filtered = filter === 'all' ? pivotsWithStatus : pivotsWithStatus.filter(p => p.status === filter)

  const filterButtons = ([
    { key: 'all'      as FilterType, label: `Todos · ${counts.all}`,            color: '#7a9e82' },
    { key: 'vermelho' as FilterType, label: `Irrigar · ${counts.vermelho}`,      color: '#ef4444' },
    { key: 'amarelo'  as FilterType, label: `Atenção · ${counts.amarelo}`,       color: '#f59e0b' },
    { key: 'verde'    as FilterType, label: `OK · ${counts.verde}`,              color: '#22c55e' },
  ] as Array<{ key: FilterType; label: string; color: string }>)
    .filter(b => b.key === 'all' || counts[b.key as IrrigationStatus] > 0)

  return (
    <div style={{
      background: '#111f14',
      border: '1px solid #1f3022',
      borderRadius: 16,
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header + filtros */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1f3022' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: '#3a5240', display: 'block', marginBottom: 10,
        }}>
          Pivôs
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filterButtons.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                fontSize: 10, fontWeight: 700,
                padding: '4px 10px', borderRadius: 99,
                cursor: 'pointer',
                background: filter === key ? `${color}20` : 'transparent',
                border: `1px solid ${filter === key ? `${color}50` : '#1f3022'}`,
                color: filter === key ? color : '#535c3e',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 60px 48px 48px 80px',
        padding: '8px 16px',
        background: '#162219',
        borderBottom: '1px solid #1a2e1d',
      }}>
        {['Pivô', 'Status', 'Umid.', 'ETo', 'Chuva', 'Próx. Irrig.'].map(col => (
          <span key={col} style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#3a5240',
          }}>
            {col}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: '#535c3e' }}>Nenhum pivô neste filtro.</span>
          </div>
        ) : (
          filtered.map(({ pivot, m, status, threshold, nextIrrigation }, i) => {
            const cfg = STATUS_CONFIG[status]
            const StatusIcon = cfg.icon
            const pct = m?.field_capacity_percent ?? null
            const pctColor = pct === null ? '#535c3e'
              : pct >= threshold ? '#22c55e'
              : pct >= threshold - 10 ? '#f59e0b'
              : '#ef4444'

            return (
              <div
                key={pivot.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 60px 48px 48px 80px',
                  padding: '10px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #1a2e1d' : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#162219'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                {/* Nome */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#ecefec', lineHeight: 1.2 }}>{pivot.name}</p>
                  {pivot.farms?.name && (
                    <p style={{ fontSize: 10, color: '#535c3e', marginTop: 1 }}>{pivot.farms.name}</p>
                  )}
                </div>

                {/* Status badge */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 7px', borderRadius: 99,
                  background: cfg.bg, border: `1px solid ${cfg.border}`,
                  width: 'fit-content',
                }}>
                  <StatusIcon size={9} style={{ color: cfg.color }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                </div>

                {/* Umidade */}
                <span style={{
                  fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: pctColor,
                }}>
                  {pct !== null ? `${Math.round(pct)}%` : '—'}
                </span>

                {/* ETo */}
                <span style={{ fontSize: 12, color: '#7a9e82', fontFamily: 'var(--font-mono)' }}>
                  {fmtVal(m?.eto_mm)}
                </span>

                {/* Chuva */}
                <span style={{ fontSize: 12, color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>
                  {fmtVal(m?.rainfall_mm)}
                </span>

                {/* Próx. irrigação */}
                {nextIrrigation ? (
                  <Link href="/manejo" style={{
                    fontSize: 10, fontWeight: 700, textDecoration: 'none',
                    color: nextIrrigation === 'Hoje' ? '#ef4444' : '#f59e0b',
                  }}>
                    {nextIrrigation}
                  </Link>
                ) : (
                  <span style={{ fontSize: 11, color: '#3a5240' }}>—</span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

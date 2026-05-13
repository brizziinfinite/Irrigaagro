'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, AlertTriangle, AlertCircle, Info, Droplets } from 'lucide-react'
import type { DailyManagement } from '@/types/database'
import type { ProjectionDay } from '@/lib/water-balance'

type IrrigationStatus = 'azul' | 'verde' | 'amarelo' | 'vermelho' | 'sem_safra'

const STATUS_CONFIG: Record<IrrigationStatus, { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2 }> = {
  azul:      { label: 'Irrigando',   color: '#0093D0', bg: 'rgb(0 147 208 / 0.12)',  border: 'rgb(0 147 208 / 0.25)',  icon: Droplets      },
  verde:     { label: 'Confortável', color: '#22c55e', bg: 'rgb(34 197 94 / 0.12)',  border: 'rgb(34 197 94 / 0.25)',  icon: CheckCircle2  },
  amarelo:   { label: 'Atenção',     color: '#f59e0b', bg: 'rgb(245 158 11 / 0.12)', border: 'rgb(245 158 11 / 0.25)', icon: AlertTriangle },
  vermelho:  { label: 'Crítico',     color: '#ef4444', bg: 'rgb(239 68 68 / 0.12)',  border: 'rgb(239 68 68 / 0.25)',  icon: AlertCircle   },
  sem_safra: { label: 'Sem safra',   color: 'var(--color-text-muted)', bg: 'rgb(85 102 119 / 0.12)', border: 'rgb(85 102 119 / 0.25)', icon: Info          },
}

function resolveStatus(lastM: DailyManagement | null, hasActiveSeason: boolean): IrrigationStatus {
  if (!hasActiveSeason) return 'sem_safra'
  if (!lastM) return 'verde'
  const pct = lastM.field_capacity_percent ?? null
  if (pct === null) return 'verde'
  // Paleta unificada: Verde ≥75% | Âmbar 60–75% | Vermelho <60%
  if (pct >= 75) return 'verde'
  if (pct >= 60) return 'amarelo'
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

// 7 colunas: Pivô | Status | Umid. | ETo | Chuva | Lâmina | Próx. Irrig.
const GRID_COLS = '1fr 90px 56px 46px 46px 60px 80px'
const HEADERS   = ['Pivô', 'Status', 'Umid.', 'ETo', 'Chuva', 'Lâmina', 'Próx. Irrig.']

export function PivotTable({ pivots, lastManagementByPivot, activePivotIds, projectionByPivot }: PivotTableProps) {
  const [filter, setFilter] = useState<FilterType>('all')

  const pivotsWithStatus = pivots.map(pivot => {
    const m = lastManagementByPivot[pivot.id] ?? null
    const threshold = pivot.alert_threshold_percent ?? 70
    const status = resolveStatus(m, activePivotIds.has(pivot.id))
    const proj = projectionByPivot[pivot.id] ?? []

    let nextIrrigation: string | null = null
    if ((proj[0]?.recommendedDepthMm ?? 0) > 0) nextIrrigation = 'Hoje'
    else if ((proj[1]?.recommendedDepthMm ?? 0) > 0) nextIrrigation = 'Amanhã'

    return { pivot, m, status, threshold, nextIrrigation }
  })

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
    { key: 'all'      as FilterType, label: `Todos · ${counts.all}`,            color: 'var(--color-text-secondary)' },
    { key: 'vermelho' as FilterType, label: `Irrigar · ${counts.vermelho}`,      color: '#ef4444' },
    { key: 'amarelo'  as FilterType, label: `Atenção · ${counts.amarelo}`,       color: '#f59e0b' },
    { key: 'verde'    as FilterType, label: `OK · ${counts.verde}`,              color: '#22c55e' },
  ] as Array<{ key: FilterType; label: string; color: string }>)
    .filter(b => b.key === 'all' || counts[b.key as IrrigationStatus] > 0)

  return (
    <div style={{
      background: 'var(--color-surface-card)',
      border: '1px solid var(--color-surface-border2)',
      borderRadius: 16,
      overflow: 'clip',
    }}>
      {/* Header + filtros */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-surface-border2)' }}>
        <span style={{
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: '#cbd5e1', display: 'block', marginBottom: 10,
        }}>
          Pivôs
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filterButtons.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                fontSize: 11, fontWeight: 700,
                padding: '4px 10px', borderRadius: 99,
                cursor: 'pointer',
                background: filter === key ? `${color}20` : 'transparent',
                border: `1px solid ${filter === key ? `${color}50` : 'var(--color-surface-border2)'}`,
                color: filter === key ? color : 'var(--color-text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Wrapper com scroll horizontal para mobile */}
      <div style={{ overflowX: 'auto' }}>

      {/* Tabela header — 7 colunas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: GRID_COLS,
        minWidth: 500,
        padding: '8px 16px',
        background: 'var(--color-surface-elevated)',
        borderBottom: '1px solid var(--color-surface-border2)',
      }}>
        {HEADERS.map(col => (
          <span key={col} style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#94a3b8',
          }}>
            {col}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div>
        {filtered.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Nenhum pivô neste filtro.</span>
          </div>
        ) : (
          filtered.map(({ pivot, m, status, threshold: _threshold, nextIrrigation }, i) => {
            const cfg = STATUS_CONFIG[status]
            const StatusIcon = cfg.icon
            const pct = m?.field_capacity_percent ?? null
            const pctColor = pct === null ? '#778899'
              : pct >= 75 ? '#22c55e'
              : pct >= 60 ? '#f59e0b'
              : '#ef4444'
            const lamina = m?.actual_depth_mm ?? m?.recommended_depth_mm ?? null

            return (
              <div
                key={pivot.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_COLS,
                  minWidth: 500,
                  padding: '10px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--color-surface-border2)' : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-sidebar)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                {/* Nome */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.2 }}>{pivot.name}</p>
                  {pivot.farms?.name && (
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{pivot.farms.name}</p>
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
                  <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                </div>

                {/* Umidade */}
                <span style={{
                  fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)',
                  color: pctColor,
                }}>
                  {pct !== null ? `${Math.round(pct)}%` : '—'}
                </span>

                {/* ETo */}
                <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                  {fmtVal(m?.eto_mm)}
                </span>

                {/* Chuva */}
                <span style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>
                  {fmtVal(m?.rainfall_mm)}
                </span>

                {/* Lâmina */}
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>
                  {lamina != null ? `${lamina.toFixed(1)}mm` : '—'}
                </span>

                {/* Próx. irrigação */}
                {nextIrrigation ? (
                  <Link href="/manejo" style={{
                    fontSize: 11, fontWeight: 700, textDecoration: 'none',
                    color: nextIrrigation === 'Hoje' ? '#ef4444' : '#f59e0b',
                  }}>
                    {nextIrrigation}
                  </Link>
                ) : (
                  <span style={{ fontSize: 12, color: '#64748b' }}>—</span>
                )}
              </div>
            )
          })
        )}
      </div>
      </div>{/* fim overflowX:auto */}
    </div>
  )
}

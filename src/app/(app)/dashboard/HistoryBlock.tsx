'use client'

import { useState, useRef, useEffect } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import type { DailyManagement, Season, Pivot } from '@/types/database'

interface HistoryBlockProps {
  historyBySeason: Record<string, DailyManagement[]>
  activeSeasons: Season[]
  pivots: Array<Pivot & { farms: { id: string; name: string } | null }>
  lastManagementByPivot: Record<string, DailyManagement>
  activePivotIds: Set<string>
}

// Cores para linha de umidade em modo comparativo
const COMPARE_COLORS = ['#CCFF00', '#00E5FF', '#f59e0b', '#a78bfa']

function statusColor(pct: number | null) {
  if (pct == null) return '#778899'
  if (pct >= 75) return '#22c55e'
  if (pct >= 60) return '#f59e0b'
  return '#ef4444'
}

function getActivePivotList(
  pivots: HistoryBlockProps['pivots'],
  activePivotIds: Set<string>,
  lastManagementByPivot: Record<string, DailyManagement>,
) {
  return pivots
    .filter(p => activePivotIds.has(p.id))
    .map(p => ({
      id: p.id,
      name: p.name,
      farmName: p.farms?.name ?? '',
      pct: lastManagementByPivot[p.id]?.field_capacity_percent ?? null,
      threshold: p.alert_threshold_percent ?? 70,
    }))
    .sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999)) // mais crítico primeiro
}

export function HistoryBlock({
  historyBySeason,
  activeSeasons,
  pivots,
  lastManagementByPivot,
  activePivotIds,
}: HistoryBlockProps) {
  const activePivotList = getActivePivotList(pivots, activePivotIds, lastManagementByPivot)

  // Estado: pivô selecionado (single) ou lista para comparativo
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [compareMode, setCompareMode] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Default: pivô mais crítico (primeiro da lista ordenada)
  const defaultId = activePivotList[0]?.id ?? null

  // IDs efetivos exibidos no gráfico
  const displayIds: string[] = compareMode
    ? (selectedIds.length >= 2 ? selectedIds.slice(0, 4) : activePivotList.slice(0, 2).map(p => p.id))
    : [selectedIds[0] ?? defaultId ?? '']

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Monta chartData: merge de datas de todos os pivôs exibidos
  function getSeasonHistory(pivotId: string) {
    const season = activeSeasons.find(s => s.pivot_id === pivotId)
    return season ? (historyBySeason[season.id] ?? []) : []
  }

  function buildChartData() {
    if (compareMode) {
      // Coleta todas as datas únicas
      const dateSet = new Set<string>()
      for (const id of displayIds) {
        for (const m of getSeasonHistory(id)) dateSet.add(m.date)
      }
      const dates = [...dateSet].sort()

      return dates.map(date => {
        const row: Record<string, number | string | null> = {
          date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        }
        for (let i = 0; i < displayIds.length; i++) {
          const history = getSeasonHistory(displayIds[i])
          const m = history.find(h => h.date === date)
          row[`moisture_${i}`] = m?.field_capacity_percent != null ? Number(m.field_capacity_percent.toFixed(0)) : null
        }
        // Usa irrigação/chuva do primeiro pivô como referência
        const primary = getSeasonHistory(displayIds[0]).find(h => h.date === date)
        row.irrigation = Number((primary?.actual_depth_mm ?? 0).toFixed(1))
        row.rainfall   = Number((primary?.rainfall_mm ?? 0).toFixed(1))
        return row
      })
    }

    // Single pivot
    const pivotId = displayIds[0]
    return getSeasonHistory(pivotId).map(m => ({
      date: new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      irrigation: Number((m.actual_depth_mm ?? 0).toFixed(1)),
      rainfall:   Number((m.rainfall_mm ?? 0).toFixed(1)),
      moisture_0: m.field_capacity_percent != null ? Number(m.field_capacity_percent.toFixed(0)) : null,
    }))
  }

  const chartData = buildChartData()
  const hasData = chartData.length > 0 && chartData.some(d => d.moisture_0 !== null)

  // Info do pivô principal (single mode)
  const primaryPivot = activePivotList.find(p => p.id === displayIds[0])
  const threshold = primaryPivot?.threshold ?? 70

  function toggleSelect(id: string) {
    if (compareMode) {
      setSelectedIds(prev => {
        if (prev.includes(id)) return prev.filter(x => x !== id)
        if (prev.length >= 4) return prev // max 4
        return [...prev, id]
      })
    } else {
      setSelectedIds([id])
      setDropdownOpen(false)
    }
  }

  function toggleCompareMode() {
    const next = !compareMode
    setCompareMode(next)
    if (next) {
      // Pré-seleciona os 2 primeiros
      setSelectedIds(activePivotList.slice(0, 2).map(p => p.id))
    } else {
      setSelectedIds([])
    }
  }

  const canCompare = activePivotList.length >= 2

  // Label do botão do dropdown (single mode)
  const selectedPivot = activePivotList.find(p => p.id === (selectedIds[0] ?? defaultId))

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(18,24,32,0.97), rgba(13,18,26,0.98))',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      borderRadius: 20,
      padding: '20px 22px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>
      {/* ─── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>

        {/* Esquerda: dot + título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {compareMode ? (
            // Dots das duas séries em comparativo
            <div style={{ display: 'flex', gap: 4 }}>
              {displayIds.slice(0, 2).map((id, i) => {
                const p = activePivotList.find(x => x.id === id)
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(255,255,255,0.04)', borderRadius: 99,
                    padding: '2px 8px',
                    border: `1px solid ${COMPARE_COLORS[i]}30`,
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: COMPARE_COLORS[i], boxShadow: `0 0 6px ${COMPARE_COLORS[i]}80` }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#c8d4e0', whiteSpace: 'nowrap' }}>{p?.name ?? '—'}</span>
                    {p?.pct != null && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(p.pct), fontFamily: 'var(--font-mono)' }}>{Math.round(p.pct)}%</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(selectedPivot?.pct ?? null), boxShadow: `0 0 8px ${statusColor(selectedPivot?.pct ?? null)}`, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#c8d4e0', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                {selectedPivot?.name ?? 'Nenhum pivô ativo'}
              </span>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>
                · últimos {chartData.length} dias
              </span>
            </>
          )}
        </div>

        {/* Direita: seletor + botão comparar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

          {/* Dropdown pivot selector */}
          {activePivotList.length > 0 && (
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: dropdownOpen ? 'rgba(0,147,208,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${dropdownOpen ? 'rgba(0,147,208,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 8, fontSize: 11, padding: '5px 9px', cursor: 'pointer',
                  color: compareMode ? '#0093D0' : (selectedIds.length > 0 ? '#0093D0' : '#7788aa'),
                  fontWeight: 600, transition: 'all 0.15s',
                }}
              >
                {compareMode ? `${displayIds.length} pivôs` : (selectedPivot?.name ?? 'Selecionar')}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  style={{ opacity: 0.6, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {dropdownOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
                  minWidth: 220, background: '#0d1520',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12, overflow: 'hidden',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                }}>
                  <div style={{ padding: '9px 14px 7px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#445566' }}>
                      {compareMode ? 'Comparar pivôs (máx. 4)' : 'Selecionar pivô'}
                    </span>
                  </div>
                  {activePivotList.map((p, i) => {
                    const isSelected = compareMode ? displayIds.includes(p.id) : (selectedIds[0] ?? defaultId) === p.id
                    const colorIdx = compareMode ? displayIds.indexOf(p.id) : -1
                    const chipColor = colorIdx >= 0 ? COMPARE_COLORS[colorIdx] : '#0093D0'
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleSelect(p.id)}
                        style={{
                          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 14px', fontSize: 12, cursor: 'pointer', border: 'none',
                          background: isSelected ? `${chipColor}12` : 'transparent',
                          color: isSelected ? chipColor : '#8899aa',
                          fontWeight: isSelected ? 600 : 400,
                          borderBottom: i < activePivotList.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        {/* checkbox / color swatch */}
                        <span style={{
                          width: 14, height: 14, borderRadius: compareMode ? 4 : '50%', flexShrink: 0,
                          border: `1.5px solid ${isSelected ? chipColor : 'rgba(255,255,255,0.15)'}`,
                          background: isSelected ? chipColor : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.1s',
                        }}>
                          {isSelected && !compareMode && (
                            <svg width="6" height="6" viewBox="0 0 10 10" fill="none" stroke="#000" strokeWidth="2.5">
                              <polyline points="2 5 4 7 8 3"/>
                            </svg>
                          )}
                          {isSelected && compareMode && (
                            <span style={{ fontSize: 7, fontWeight: 800, color: '#000', lineHeight: 1 }}>{colorIdx + 1}</span>
                          )}
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        {p.pct != null && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(p.pct), fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                            {Math.round(p.pct)}%
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Botão comparar */}
          {canCompare && (
            <button
              onClick={toggleCompareMode}
              title={compareMode ? 'Sair do comparativo' : 'Comparar pivôs'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: compareMode ? 'rgba(0,147,208,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${compareMode ? 'rgba(0,147,208,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8, fontSize: 11, padding: '5px 9px', cursor: 'pointer',
                color: compareMode ? '#0093D0' : '#7788aa', fontWeight: 600,
                transition: 'all 0.15s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              {compareMode ? 'Sair' : 'Comparar'}
            </button>
          )}

          {/* % atual — só single mode */}
          {!compareMode && selectedPivot?.pct != null && (
            <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: statusColor(selectedPivot.pct) }}>
              {Math.round(selectedPivot.pct)}%
            </span>
          )}
        </div>
      </div>

      {/* ─── Chart ───────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={hasData ? chartData : []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#778899', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
            />
            <YAxis
              yAxisId="mm"
              tick={{ fill: '#778899', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              domain={[0, 110]}
              tick={{ fill: '#778899', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />

            {hasData && (
              <ReferenceLine
                yAxisId="pct"
                y={threshold}
                stroke="#f59e0b"
                strokeDasharray="5 4"
                strokeWidth={1}
                label={{ position: 'insideTopRight', value: `${threshold}%`, fill: '#f59e0b', fontSize: 9, fontWeight: 700 }}
              />
            )}

            {hasData && (
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0d1520',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  color: '#e2e8f0',
                  fontSize: 12,
                }}
                labelStyle={{ color: '#8899aa', marginBottom: 4 }}
                cursor={{ fill: 'rgb(255 255 255 / 0.03)' }}
                formatter={(value, name) => {
                  if (String(name).startsWith('moisture_')) {
                    const idx = parseInt(String(name).split('_')[1])
                    const pivot = activePivotList.find(p => p.id === displayIds[idx])
                    return [value, `Umidade — ${pivot?.name ?? `Pivô ${idx + 1}`}`]
                  }
                  const labels: Record<string, string> = {
                    irrigation: 'Lâmina (mm)',
                    rainfall: 'Chuva (mm)',
                  }
                  return [value, labels[String(name)] ?? name]
                }}
              />
            )}

            {/* Barras — sempre da série primária */}
            <Bar yAxisId="mm" dataKey="irrigation" name="irrigation" fill={hasData ? '#00E5FF' : 'rgba(0,229,255,0.15)'} radius={[4,4,0,0]} maxBarSize={28} opacity={0.85} />
            <Bar yAxisId="mm" dataKey="rainfall"   name="rainfall"   fill={hasData ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.10)'} radius={[4,4,0,0]} maxBarSize={28} opacity={0.6} />

            {/* Linhas de umidade — uma por pivô selecionado */}
            {hasData && displayIds.map((id, i) => (
              <Line
                key={id}
                yAxisId="pct"
                type="monotone"
                dataKey={`moisture_${i}`}
                name={`moisture_${i}`}
                stroke={COMPARE_COLORS[i]}
                strokeWidth={i === 0 ? 2.5 : 2}
                strokeDasharray={i > 0 ? '6 3' : undefined}
                dot={{ fill: '#141e2b', stroke: COMPARE_COLORS[i], strokeWidth: 2, r: i === 0 ? 3.5 : 3 }}
                activeDot={{ r: 5, fill: '#141e2b', stroke: COMPARE_COLORS[i], strokeWidth: 2.5 }}
                connectNulls
                style={{ filter: `drop-shadow(0 0 4px ${COMPARE_COLORS[i]}40)` }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>

        {!hasData && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 240, marginTop: -240, position: 'relative',
            color: '#94a3b8', fontSize: 14,
          }}>
            Aguardando registros de manejo.
          </div>
        )}
      </div>

      {/* ─── Legend ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12, flexWrap: 'wrap' }}>
        {compareMode ? (
          // Legenda dinâmica em modo comparativo
          <>
            {displayIds.map((id, i) => {
              const p = activePivotList.find(x => x.id === id)
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 20, height: 2, background: COMPARE_COLORS[i], borderRadius: 1, opacity: hasData ? 1 : 0.4,
                    boxShadow: hasData ? `0 0 4px ${COMPARE_COLORS[i]}80` : 'none',
                    ...(i > 0 ? { backgroundImage: `repeating-linear-gradient(90deg, ${COMPARE_COLORS[i]} 0, ${COMPARE_COLORS[i]} 6px, transparent 6px, transparent 9px)` } : {})
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{p?.name ?? `Pivô ${i+1}`}</span>
                </div>
              )
            })}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00E5FF', boxShadow: hasData ? '0 0 6px #00E5FF' : 'none', opacity: hasData ? 1 : 0.4 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Irrigação (mm)</span>
            </div>
          </>
        ) : (
          [
            { color: COMPARE_COLORS[0], label: 'Umidade (%)' },
            { color: '#00E5FF',           label: 'Irrigação (mm)' },
            { color: 'rgba(255,255,255,0.7)', label: 'Chuva (mm)' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: hasData ? `0 0 6px ${color}` : 'none', opacity: hasData ? 1 : 0.4 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Line, Area,
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

/**
 * Encontra o pivô mais crítico: menor FC% = mais precisa de atenção.
 * Se todos iguais, retorna o primeiro alfabeticamente.
 */
function findCriticalPivot(
  pivots: HistoryBlockProps['pivots'],
  lastManagementByPivot: Record<string, DailyManagement>,
  activePivotIds: Set<string>,
): { pivotId: string; pivotName: string; seasonId: string | null; pct: number | null } | null {
  let critical: { pivotId: string; pivotName: string; pct: number | null } | null = null

  for (const pivot of pivots) {
    if (!activePivotIds.has(pivot.id)) continue
    const mgmt = lastManagementByPivot[pivot.id]
    const pct = mgmt?.field_capacity_percent ?? null

    if (!critical) {
      critical = { pivotId: pivot.id, pivotName: pivot.name, pct }
      continue
    }

    // Menor FC% = mais crítico
    if (pct !== null && (critical.pct === null || pct < critical.pct)) {
      critical = { pivotId: pivot.id, pivotName: pivot.name, pct }
    }
  }

  return critical ? { ...critical, seasonId: null } : null
}

export function HistoryBlock({
  historyBySeason,
  activeSeasons,
  pivots,
  lastManagementByPivot,
  activePivotIds,
}: HistoryBlockProps) {
  // Encontra o pivô mais crítico
  const critical = findCriticalPivot(pivots, lastManagementByPivot, activePivotIds)

  // Encontra a season do pivô crítico
  const criticalSeason = critical
    ? activeSeasons.find(s => s.pivot_id === critical.pivotId)
    : null

  const criticalHistory = criticalSeason
    ? (historyBySeason[criticalSeason.id] ?? [])
    : []

  const threshold = critical
    ? (pivots.find(p => p.id === critical.pivotId)?.alert_threshold_percent ?? 70)
    : 70

  // Monta dados do gráfico para o pivô crítico
  const chartData = criticalHistory.map(m => ({
    date: new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    irrigation: Number((m.actual_depth_mm ?? 0).toFixed(1)),
    rainfall: Number((m.rainfall_mm ?? 0).toFixed(1)),
    moisture: m.field_capacity_percent != null ? Number(m.field_capacity_percent.toFixed(0)) : null,
  }))

  const hasData = chartData.length > 0 && chartData.some(d => d.moisture !== null)
  const pivotName = critical?.pivotName ?? 'Nenhum pivô ativo'

  // Cor do status do pivô
  const pct = critical?.pct ?? null
  const statusColor = pct == null ? '#556677'
    : pct >= threshold * 1.15 ? '#22c55e'
    : pct >= threshold ? '#f59e0b'
    : '#ef4444'

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(18,24,32,0.97), rgba(13,18,26,0.98))',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      borderRadius: 20,
      padding: '26px 24px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header — mostra automaticamente o pivô mais crítico */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 8px ${statusColor}`,
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 13, fontWeight: 700, color: '#c8d4e0',
            letterSpacing: '-0.01em',
          }}>
            {pivotName}
          </span>
          <span style={{ fontSize: 11, color: '#445566', fontWeight: 500 }}>
            · últimos {chartData.length || 0} dias
          </span>
        </div>
        {pct != null && (
          <span style={{
            fontSize: 12, fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: statusColor,
          }}>
            {Math.round(pct)}%
          </span>
        )}
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={hasData ? chartData : []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#556677', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
            />
            <YAxis
              yAxisId="mm"
              tick={{ fill: '#556677', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              domain={[0, 110]}
              tick={{ fill: '#556677', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />

            {/* Zona de perigo — abaixo do threshold */}
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
                  const labels: Record<string, string> = {
                    irrigation: 'Lâmina (mm)',
                    rainfall: 'Chuva (mm)',
                    moisture: 'Umidade (%)',
                  }
                  return [value, labels[String(name)] ?? name]
                }}
              />
            )}

            <Bar yAxisId="mm" dataKey="irrigation" name="irrigation" fill={hasData ? '#00E5FF' : 'rgba(0,229,255,0.15)'} radius={[4, 4, 0, 0]} maxBarSize={28} opacity={0.85} />
            <Bar yAxisId="mm" dataKey="rainfall" name="rainfall" fill={hasData ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.10)'} radius={[4, 4, 0, 0]} maxBarSize={28} opacity={0.6} />

            {hasData && (
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="moisture"
                name="moisture"
                stroke="#CCFF00"
                strokeWidth={2.5}
                dot={{ fill: '#141e2b', stroke: '#CCFF00', strokeWidth: 2, r: 3.5 }}
                activeDot={{ r: 5, fill: '#141e2b', stroke: '#CCFF00', strokeWidth: 2.5 }}
                connectNulls
                style={{ filter: 'drop-shadow(0 0 4px rgba(204,255,0,0.4))' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {!hasData && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 240, marginTop: -240, position: 'relative',
            color: '#334455', fontSize: 13,
          }}>
            Aguardando registros de manejo.
          </div>
        )}
      </div>

      {/* Legend — simplificada */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 12 }}>
        {[
          { color: '#CCFF00', label: 'Umidade (%)' },
          { color: '#00E5FF', label: 'Irrigação (mm)' },
          { color: 'rgba(255,255,255,0.7)', label: 'Chuva (mm)' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: hasData ? `0 0 6px ${color}` : 'none', opacity: hasData ? 1 : 0.4 }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#556677' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

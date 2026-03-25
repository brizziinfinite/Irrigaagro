'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import type { DailyManagement, Season } from '@/types/database'

interface HistoryBlockProps {
  historyBySeason: Record<string, DailyManagement[]>
  activeSeasons: Season[]
}

function last7DaysLabels(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  })
}

export function HistoryBlock({ historyBySeason }: HistoryBlockProps) {
  const dayMap = new Map<string, { irrigation: number; rainfall: number; moisture: number; count: number }>()

  for (const records of Object.values(historyBySeason)) {
    for (const m of records) {
      const existing = dayMap.get(m.date) ?? { irrigation: 0, rainfall: 0, moisture: 0, count: 0 }
      dayMap.set(m.date, {
        irrigation: existing.irrigation + (m.actual_depth_mm ?? 0),
        rainfall: existing.rainfall + (m.rainfall_mm ?? 0),
        moisture: existing.moisture + (m.field_capacity_percent ?? 0),
        count: existing.count + (m.field_capacity_percent !== null ? 1 : 0),
      })
    }
  }

  const hasData = dayMap.size > 0

  const chartData = hasData
    ? Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({
          date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          irrigation: Number(d.irrigation.toFixed(1)),
          rainfall: Number(d.rainfall.toFixed(1)),
          moisture: d.count > 0 ? Number((d.moisture / d.count).toFixed(0)) : null,
        }))
    : last7DaysLabels().map(date => ({ date, irrigation: 0, rainfall: 0, moisture: null }))

  return (
    <div style={{
      background: '#0f1923',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
      padding: 18,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: '#556677',
        }}>
          Histórico — Últimos 7 dias
        </span>
        {!hasData && (
          <span style={{ fontSize: 10, color: '#556677' }}>Aguardando registros</span>
        )}
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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
              domain={[0, 100]}
              tick={{ fill: '#556677', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
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
              />
            )}
            <Bar yAxisId="mm" dataKey="irrigation" fill={hasData ? '#0093D0' : 'rgba(0,147,208,0.15)'} radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar yAxisId="mm" dataKey="rainfall" fill={hasData ? '#22d3ee' : 'rgba(34,211,238,0.12)'} opacity={0.7} radius={[4, 4, 0, 0]} maxBarSize={32} />
            {hasData && (
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="moisture"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', r: 3, strokeWidth: 0 }}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        {[
          { color: '#0093D0', label: 'Irrigação' },
          { color: '#22d3ee', label: 'Chuva' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: hasData ? 1 : 0.3 }} />
            <span style={{ fontSize: 10, color: '#556677' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

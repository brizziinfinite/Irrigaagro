'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts'
import type { DailyManagement, Season } from '@/types/database'

interface HistoryChartProps {
  historyBySeason: Record<string, DailyManagement[]>
  activeSeasons: Season[]
}

export function HistoryChart({ historyBySeason }: HistoryChartProps) {
  const dayMap = new Map<string, { irrigation: number; rainfall: number; moisture: number; count: number }>()

  for (const records of Object.values(historyBySeason)) {
    for (const m of records) {
      const existing = dayMap.get(m.date) ?? { irrigation: 0, rainfall: 0, moisture: 0, count: 0 }
      dayMap.set(m.date, {
        irrigation: existing.irrigation + (m.actual_depth_mm ?? m.recommended_depth_mm ?? 0),
        rainfall: existing.rainfall + (m.rainfall_mm ?? 0),
        moisture: existing.moisture + (m.field_capacity_percent ?? 0),
        count: existing.count + (m.field_capacity_percent !== null ? 1 : 0),
      })
    }
  }

  const chartData = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      irrigation: Number(d.irrigation.toFixed(1)),
      rainfall: Number(d.rainfall.toFixed(1)),
      moisture: d.count > 0 ? Number((d.moisture / d.count).toFixed(0)) : null,
    }))

  const hasData = chartData.length > 0

  return (
    <div style={{
      background: '#0f1923',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: 18,
      height: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: '#556677',
        }}>
          Histórico 7 dias
        </span>
      </div>

      {!hasData ? (
        <div style={{
          height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8,
        }}>
          <p style={{ fontSize: 12, color: '#556677', textAlign: 'center' }}>
            Histórico aparecerá após os primeiros registros de manejo.
          </p>
        </div>
      ) : (
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
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#556677', paddingTop: 8 }}
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  irrigation: 'Irrigação (mm)',
                  rainfall: 'Chuva (mm)',
                  moisture: 'Umidade (%)',
                }
                return labels[value] ?? value
              }}
            />
            <Bar yAxisId="mm" dataKey="irrigation" fill="#0093D0" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar yAxisId="mm" dataKey="rainfall" fill="#22d3ee" opacity={0.7} radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="moisture"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ fill: '#22c55e', r: 3, strokeWidth: 0 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

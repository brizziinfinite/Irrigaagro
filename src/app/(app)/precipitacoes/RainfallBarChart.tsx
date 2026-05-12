'use client'

import { useMemo } from 'react'
import type { RainfallRecord } from '@/types/database'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'

function buildRainfallMap(records: RainfallRecord[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of records) map[r.date] = (map[r.date] ?? 0) + r.rainfall_mm
  return map
}

interface Props {
  records: RainfallRecord[]
  year: number
  month: number
}

export default function RainfallBarChart({ records, year, month }: Props) {
  const data = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const byDate = buildRainfallMap(records)
    const map: Record<number, number> = {}
    for (const [date, mm] of Object.entries(byDate)) {
      const d = new Date(date + 'T00:00:00')
      if (d.getFullYear() === year && d.getMonth() === month) {
        map[d.getDate()] = mm
      }
    }
    return Array.from({ length: daysInMonth }, (_, i) => ({
      day: String(i + 1),
      mm: map[i + 1] ?? 0
    }))
  }, [records, year, month])

  const avgMm = useMemo(() => data.reduce((s, d) => s + d.mm, 0) / data.length, [data])

  return (
    <div style={{ position: 'relative', width: '100%', height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="barGradRain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.03)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }}
            axisLine={{ stroke: 'var(--color-surface-border2)' }}
            tickLine={false}
            interval={0}
            tickFormatter={(v, i) => i === 0 || i === data.length - 1 || (i + 1) % 5 === 0 ? v : ''}
          />
          <YAxis
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => v > 0 ? v : ''}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            contentStyle={{ backgroundColor: 'var(--color-surface-sidebar)', border: '1px solid var(--color-surface-border)', borderRadius: 10, color: 'var(--color-text)', fontSize: 12, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
            formatter={(value: unknown) => [`${Number(value).toFixed(1)} mm`, 'Precipitação']}
            labelFormatter={(label) => `Dia ${label}`}
            labelStyle={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}
          />
          {avgMm > 0 && <ReferenceLine y={avgMm} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />}
          <Bar dataKey="mm" fill="url(#barGradRain)" radius={[4, 4, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

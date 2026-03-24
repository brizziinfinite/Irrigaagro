'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'

const data = [
  { day: 'Qui', moisture: 75 },
  { day: 'Sex', moisture: 72 },
  { day: 'Sáb', moisture: 78 },
  { day: 'Dom', moisture: 80 },
  { day: 'Seg', moisture: 76 },
  { day: 'Ter', moisture: 79 },
  { day: 'Qua', moisture: 82 },
]

export function MoistureChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0093D0" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#0093D0" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#556677' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#556677' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12, color: '#e2e8f0' }}
          formatter={(v: unknown) => [`${v}%`, 'Umidade']}
        />
        <ReferenceLine y={85} stroke="#06b6d4" strokeDasharray="4 4"
          label={{ value: 'CC', position: 'right', fontSize: 10, fill: '#06b6d4' }} />
        <ReferenceLine y={40} stroke="#ef4444" strokeDasharray="4 4"
          label={{ value: 'PMP', position: 'right', fontSize: 10, fill: '#ef4444' }} />
        <Area
          type="monotone"
          dataKey="moisture"
          stroke="#0093D0"
          strokeWidth={2.5}
          fill="url(#soilGrad)"
          dot={{ fill: '#0093D0', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#22d3ee', stroke: '#080e14', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

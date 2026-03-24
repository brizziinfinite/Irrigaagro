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
            <stop offset="0%"   stopColor="#4a9e1a" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#4a9e1a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3d2d" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#535c3e' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#535c3e' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#162219', border: '1px solid #2a3d2d', borderRadius: 10, fontSize: 12, color: '#ecefec' }}
          formatter={(v: unknown) => [`${v}%`, 'Umidade']}
        />
        <ReferenceLine y={85} stroke="#06b6d4" strokeDasharray="4 4"
          label={{ value: 'CC', position: 'right', fontSize: 10, fill: '#06b6d4' }} />
        <ReferenceLine y={40} stroke="#ef4444" strokeDasharray="4 4"
          label={{ value: 'PMP', position: 'right', fontSize: 10, fill: '#ef4444' }} />
        <Area
          type="monotone"
          dataKey="moisture"
          stroke="#4a9e1a"
          strokeWidth={2.5}
          fill="url(#soilGrad)"
          dot={{ fill: '#4a9e1a', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#7ca136', stroke: '#0b1a0e', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

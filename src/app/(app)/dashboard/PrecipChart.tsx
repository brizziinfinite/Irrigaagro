'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

const data = [
  { week: 'Sem 1', chuva: 22, irrigacao: 15 },
  { week: 'Sem 2', chuva: 8,  irrigacao: 25 },
  { week: 'Sem 3', chuva: 35, irrigacao: 5  },
  { week: 'Sem 4', chuva: 12, irrigacao: 18 },
]

export function PrecipChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a3d2d" vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#535c3e' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#535c3e' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#162219', border: '1px solid #2a3d2d', borderRadius: 10, fontSize: 12, color: '#ecefec' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#a9b4a2' }} />
        <Bar dataKey="chuva"     name="Chuva"     fill="#06b6d4" radius={[5, 5, 0, 0]} />
        <Bar dataKey="irrigacao" name="Irrigação" fill="#4a9e1a" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

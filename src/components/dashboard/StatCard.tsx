'use client'

import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: number
  colorVariant?: 'green' | 'blue' | 'yellow' | 'red'
  className?: string
}

const colorVariants = {
  green: 'border-l-4 border-l-[#16a34a] bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7]',
  blue: 'border-l-4 border-l-[#0ea5e9] bg-gradient-to-br from-[#f0f9ff] to-[#cffafe]',
  yellow: 'border-l-4 border-l-[#f59e0b] bg-gradient-to-br from-[#fffbeb] to-[#fef3c7]',
  red: 'border-l-4 border-l-[#ef4444] bg-gradient-to-br from-[#fef2f2] to-[#fee2e2]',
}

const trendColors = {
  up: 'text-[#16a34a]',
  down: 'text-[#ef4444]',
  neutral: 'text-[#6b7280]',
}

export function StatCard({
  icon,
  label,
  value,
  unit = '',
  trend,
  trendValue,
  colorVariant = 'blue',
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1',
        colorVariants[colorVariant],
        className
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="inline-flex p-3 rounded-lg bg-white/50 group-hover:bg-white transition-colors">
          <div className="text-2xl">{icon}</div>
        </div>
        {trend && trendValue !== undefined && (
          <div className={cn('flex items-center gap-1 text-sm font-semibold', trendColors[trend])}>
            {trend === 'up' && <TrendingUp size={16} />}
            {trend === 'down' && <TrendingDown size={16} />}
            {trend !== 'neutral' && <span>{Math.abs(trendValue)}%</span>}
          </div>
        )}
      </div>

      <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">{label}</p>

      <div className="flex items-baseline gap-1">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {unit && <span className="text-sm font-medium text-gray-700 mb-1">{unit}</span>}
      </div>

      {/* Subtle accent gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </Card>
  )
}

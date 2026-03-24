'use client'

import { useMemo } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { StatCard } from '@/components/dashboard/StatCard'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatNumber, cn } from '@/lib/utils'
import {
  Droplets,
  Sun,
  CloudRain,
  Timer,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'

// Mock data for soil moisture over time (last 7 days)
const soilMoistureData = [
  { date: 'Dom', moisture: 68 },
  { date: 'Seg', moisture: 65 },
  { date: 'Ter', moisture: 72 },
  { date: 'Qua', moisture: 78 },
  { date: 'Qui', moisture: 75 },
  { date: 'Sex', moisture: 71 },
  { date: 'Sab', moisture: 82 },
]

// Mock data for precipitation vs irrigation
const precipitationData = [
  { week: 'Semana 1', rainfall: 15, irrigation: 20 },
  { week: 'Semana 2', rainfall: 8, irrigation: 25 },
  { week: 'Semana 3', rainfall: 22, irrigation: 15 },
  { week: 'Semana 4', rainfall: 5, irrigation: 28 },
]

// Constants for soil water levels (Field Capacity and Wilting Point)
const FIELD_CAPACITY = 85 // Capacidade de Campo
const WILTING_POINT = 40 // Ponto de Murcha

interface SoilMoistureChartData {
  date: string
  moisture: number
}

interface PrecipitationChartData {
  week: string
  rainfall: number
  irrigation: number
}

export function Dashboard() {
  const { user } = useAuth()

  // Current metrics (mock data for soybean crop)
  const currentDate = useMemo(() => new Date(), [])
  const metrics = useMemo(
    () => ({
      soilMoisture: 82,
      etoToday: 4.2,
      accumulatedRainfall: 45,
      nextIrrigation: 'Em 2 dias',
    }),
    []
  )

  // Determine soil moisture status
  const getMoistureStatus = (moisture: number) => {
    if (moisture >= FIELD_CAPACITY) return { status: 'ótimo', color: 'green' }
    if (moisture >= 60) return { status: 'bom', color: 'green' }
    if (moisture >= 50) return { status: 'adequado', color: 'yellow' }
    return { status: 'crítico', color: 'red' }
  }

  const moistureStatus = getMoistureStatus(metrics.soilMoisture)
  const moisturePercentage = (metrics.soilMoisture / FIELD_CAPACITY) * 100

  // Get user display name
  const userDisplayName =
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Agricultor'

  // Format date to Brazilian format
  const formattedDate = formatDate(currentDate.toISOString(), 'dd \'de\' MMMM \'de\' yyyy')

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f9fafb] via-[#ffffff] to-[#f0fdf4] p-4 sm:p-6 lg:p-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
          Bem-vindo, {userDisplayName}!
        </h1>
        <p className="text-lg text-gray-600">
          {formattedDate}
        </p>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Soil Moisture Card */}
        <div className="relative">
          <StatCard
            icon={<Droplets className={cn(
              'transition-colors',
              moistureStatus.color === 'green' && 'text-[#16a34a]',
              moistureStatus.color === 'yellow' && 'text-[#f59e0b]',
              moistureStatus.color === 'red' && 'text-[#ef4444]',
            )} />}
            label="Umidade do Solo"
            value={metrics.soilMoisture}
            unit="%"
            colorVariant={moistureStatus.color as 'green' | 'yellow' | 'red'}
            trend="up"
            trendValue={3.5}
          />
          {/* Circular Progress Indicator */}
          <div className="absolute top-4 right-4 w-12 h-12">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 120 120">
              {/* Background circle */}
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-gray-200"
              />
              {/* Progress circle */}
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${339.29 * (moisturePercentage / 100)} 339.29`}
                className={cn(
                  'transition-all',
                  moistureStatus.color === 'green' && 'text-[#16a34a]',
                  moistureStatus.color === 'yellow' && 'text-[#f59e0b]',
                  moistureStatus.color === 'red' && 'text-[#ef4444]',
                )}
                strokeLinecap="round"
              />
              {/* Center text */}
              <text
                x="60"
                y="65"
                textAnchor="middle"
                className="text-sm font-bold fill-gray-900"
                fontSize="16"
              >
                {moisturePercentage.toFixed(0)}%
              </text>
            </svg>
          </div>
        </div>

        {/* ETo Today Card */}
        <StatCard
          icon={<Sun className="text-[#f59e0b]" />}
          label="ETo Hoje"
          value={metrics.etoToday}
          unit="mm"
          colorVariant="yellow"
          trend="neutral"
        />

        {/* Accumulated Rainfall Card */}
        <StatCard
          icon={<CloudRain className="text-[#0ea5e9]" />}
          label="Chuva Acumulada"
          value={metrics.accumulatedRainfall}
          unit="mm"
          colorVariant="blue"
          trend="up"
          trendValue={8.2}
        />

        {/* Next Irrigation Card */}
        <StatCard
          icon={<Timer className="text-[#16a34a]" />}
          label="Próxima Irrigação"
          value={metrics.nextIrrigation}
          colorVariant="green"
          trend="neutral"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Soil Moisture Chart - Takes 2 columns on desktop */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Umidade do Solo"
            subtitle="Últimos 7 dias - Soja"
          />
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={soilMoistureData as SoilMoistureChartData[]}>
                <defs>
                  <linearGradient id="moistureGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  domain={[30, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  }}
                  formatter={(value: any) => `${value}%`}
                />
                {/* Reference line for Field Capacity */}
                <ReferenceLine
                  y={FIELD_CAPACITY}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  label={{
                    value: 'Capacidade de Campo',
                    position: 'insideTopRight',
                    offset: -10,
                    fill: '#f59e0b',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                />
                {/* Reference line for Wilting Point */}
                <ReferenceLine
                  y={WILTING_POINT}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{
                    value: 'Ponto de Murcha',
                    position: 'insideBottomRight',
                    offset: -10,
                    fill: '#ef4444',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                />
                {/* Main line */}
                <Line
                  type="monotone"
                  dataKey="moisture"
                  stroke="#16a34a"
                  strokeWidth={3}
                  dot={{ fill: '#16a34a', r: 5 }}
                  activeDot={{ r: 7 }}
                  fill="url(#moistureGradient)"
                  isAnimationActive
                  animationDuration={600}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Irrigation Status Alert Card */}
        <Card className="border-l-4 border-l-[#f59e0b] bg-gradient-to-br from-[#fffbeb] to-[#fef3c7]">
          <CardHeader
            title="Recomendações"
            action={<AlertTriangle className="text-[#f59e0b]" size={24} />}
          />
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-lg border border-[#fbbf24]">
                <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <TrendingUp size={16} className="text-[#16a34a]" />
                  Umidade Adequada
                </h4>
                <p className="text-sm text-gray-700">
                  A umidade do solo está em nível ótimo (82%). Continue monitorando.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border border-[#fbbf24]">
                <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <Sun size={16} className="text-[#f59e0b]" />
                  ETo Moderada
                </h4>
                <p className="text-sm text-gray-700">
                  Evapotranspiração de {formatNumber(metrics.etoToday, 1)} mm hoje. Sem irrigação urgente necessária.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border border-[#fbbf24]">
                <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <CloudRain size={16} className="text-[#0ea5e9]" />
                  Próxima Chuva
                </h4>
                <p className="text-sm text-gray-700">
                  Previsão de chuva em 2-3 dias. Planeje irrigação conforme necessário.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Precipitation vs Irrigation Chart */}
      <div className="mt-6">
        <Card>
          <CardHeader
            title="Precipitação x Irrigação"
            subtitle="Últimas 4 semanas - Comparativo"
          />
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={precipitationData as PrecipitationChartData[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="week"
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  label={{ value: 'mm', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  }}
                  formatter={(value: any) => `${value} mm`}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="square"
                />
                <Bar
                  dataKey="rainfall"
                  fill="#0ea5e9"
                  name="Chuva"
                  radius={[8, 8, 0, 0]}
                  animationDuration={600}
                />
                <Bar
                  dataKey="irrigation"
                  fill="#16a34a"
                  name="Irrigação"
                  radius={[8, 8, 0, 0]}
                  animationDuration={600}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Footer Info */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Dados atualizados em tempo real • IrrigaAgro v1.0
        </p>
      </div>
    </div>
  )
}

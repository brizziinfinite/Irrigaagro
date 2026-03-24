import { useState } from 'react'
import {
  Plus,
  Calculator,
  Droplets,
  Thermometer,
  Wind,
  Sun,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { DailyManagement } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { cn, formatDate, formatNumber } from '@/lib/utils'
import { calculateETo } from '@/lib/calculations/penman-monteith'
import { calculateKc, calculateETc } from '@/lib/calculations/etc'
import { getIrrigationRecommendation } from '@/lib/calculations/irrigation'

// Mock data for soybean irrigation
const mockDailyRecords: DailyManagement[] = [
  {
    id: '1',
    season_id: 'season-1',
    date: '2026-03-11',
    das: 45,
    crop_stage: 2,
    temp_max: 28,
    temp_min: 18,
    humidity_percent: 65,
    wind_speed_ms: 2.5,
    solar_radiation_wm2: 800,
    eto_mm: 5.2,
    etc_mm: 3.8,
    rainfall_mm: 0,
    kc: 0.73,
    ks: 0.95,
    ctda: 45,
    cta: 42.8,
    irn_mm: 50,
    itn_mm: 45,
    recommended_speed_percent: 15,
    recommended_depth_mm: 25,
    field_capacity_percent: 72,
    needs_irrigation: false,
    actual_speed_percent: null,
    actual_depth_mm: null,
    irrigation_start: null,
    irrigation_end: null,
    irrigation_duration_hours: null,
    soil_moisture_measured: null,
    soil_moisture_calculated: 180,
    cost_per_mm_alq: null,
    cost_per_mm_ha: null,
    energy_kwh: null,
    created_at: '2026-03-11T00:00:00Z',
    updated_at: '2026-03-11T00:00:00Z',
  },
  {
    id: '2',
    season_id: 'season-1',
    date: '2026-03-10',
    das: 44,
    crop_stage: 2,
    temp_max: 27,
    temp_min: 17,
    humidity_percent: 68,
    wind_speed_ms: 2.2,
    solar_radiation_wm2: 780,
    eto_mm: 5.0,
    etc_mm: 3.6,
    rainfall_mm: 5,
    kc: 0.72,
    ks: 0.98,
    ctda: 44,
    cta: 41.8,
    irn_mm: 51,
    itn_mm: 46,
    recommended_speed_percent: 12,
    recommended_depth_mm: 20,
    field_capacity_percent: 75,
    needs_irrigation: false,
    actual_speed_percent: null,
    actual_depth_mm: null,
    irrigation_start: null,
    irrigation_end: null,
    irrigation_duration_hours: null,
    soil_moisture_measured: null,
    soil_moisture_calculated: 185,
    cost_per_mm_alq: null,
    cost_per_mm_ha: null,
    energy_kwh: null,
    created_at: '2026-03-10T00:00:00Z',
    updated_at: '2026-03-10T00:00:00Z',
  },
  {
    id: '3',
    season_id: 'season-1',
    date: '2026-03-09',
    das: 43,
    crop_stage: 2,
    temp_max: 29,
    temp_min: 19,
    humidity_percent: 62,
    wind_speed_ms: 3.0,
    solar_radiation_wm2: 820,
    eto_mm: 5.5,
    etc_mm: 4.0,
    rainfall_mm: 0,
    kc: 0.71,
    ks: 0.90,
    ctda: 43,
    cta: 40.8,
    irn_mm: 48,
    itn_mm: 43,
    recommended_speed_percent: 18,
    recommended_depth_mm: 30,
    field_capacity_percent: 65,
    needs_irrigation: true,
    actual_speed_percent: 18,
    actual_depth_mm: 30,
    irrigation_start: '2026-03-09T06:00:00Z',
    irrigation_end: '2026-03-09T18:00:00Z',
    irrigation_duration_hours: 12,
    soil_moisture_measured: 155,
    soil_moisture_calculated: 165,
    cost_per_mm_alq: 1.5,
    cost_per_mm_ha: 4.2,
    energy_kwh: 45,
    created_at: '2026-03-09T00:00:00Z',
    updated_at: '2026-03-09T18:00:00Z',
  },
]

interface FormData {
  date: string
  tempMax: string
  tempMin: string
  humidity: string
  windSpeed: string
  solarRadiation: string
  rainfall: string
}

const initialFormData: FormData = {
  date: '',
  tempMax: '',
  tempMin: '',
  humidity: '',
  windSpeed: '',
  solarRadiation: '',
  rainfall: '',
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'ok':
      return 'bg-green-100 text-green-800 border-green-300'
    case 'warning':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-300'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300'
  }
}

function getStatusLabel(fcPercent: number): string {
  if (fcPercent > 75) return 'OK'
  if (fcPercent > 60) return 'Atenção'
  return 'Irrigar!'
}

function getStatusType(fcPercent: number): 'ok' | 'warning' | 'critical' {
  if (fcPercent > 75) return 'ok'
  if (fcPercent > 60) return 'warning'
  return 'critical'
}

export function Management() {
  const [records, setRecords] = useState<DailyManagement[]>(mockDailyRecords)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [calculatedEto, setCalculatedEto] = useState<number | null>(null)
  const [calculatedValues, setCalculatedValues] = useState<{
    eto: number
    etc: number
    kc: number
    ks: number
    recommendation: string
  } | null>(null)

  const handleFormChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleCalculateEto = () => {
    if (
      !formData.tempMax ||
      !formData.tempMin ||
      !formData.humidity ||
      !formData.windSpeed ||
      !formData.solarRadiation
    ) {
      alert('Por favor, preencha todos os campos meteorológicos')
      return
    }

    // Estimate day of year from date
    const date = new Date(formData.date)
    const dayOfYear = Math.floor(
      (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
        (24 * 60 * 60 * 1000)
    )

    // Calculate ETo using Penman-Monteith
    const etoResult = calculateETo({
      tempMax: parseFloat(formData.tempMax),
      tempMin: parseFloat(formData.tempMin),
      humidity: parseFloat(formData.humidity),
      windSpeed2m: parseFloat(formData.windSpeed),
      solarRadiation: parseFloat(formData.solarRadiation),
      latitude: -14.235,
      altitude: 450,
      dayOfYear,
    })

    // Calculate Kc (using typical soybean values)
    const kc = calculateKc({
      das: 45,
      stage1Duration: 15,
      stage2Duration: 25,
      stage3Duration: 40,
      stage4Duration: 30,
      kcIni: 0.4,
      kcMid: 1.15,
      kcFinal: 0.5,
    })

    // Calculate ETc
    const etc = calculateETc(etoResult, kc, 0.95)

    // Get irrigation recommendation
    const recommendation = getIrrigationRecommendation(180, 250, 75, etc, 100)

    setCalculatedEto(etoResult)
    setCalculatedValues({
      eto: etoResult,
      etc,
      kc,
      ks: 0.95,
      recommendation: recommendation.message,
    })
  }

  const handleAddRecord = () => {
    if (!formData.date) {
      alert('Por favor, selecione uma data')
      return
    }

    const newRecord: DailyManagement = {
      id: Date.now().toString(),
      season_id: 'season-1',
      date: formData.date,
      das: 46,
      crop_stage: 2,
      temp_max: formData.tempMax ? parseFloat(formData.tempMax) : null,
      temp_min: formData.tempMin ? parseFloat(formData.tempMin) : null,
      humidity_percent: formData.humidity ? parseFloat(formData.humidity) : null,
      wind_speed_ms: formData.windSpeed ? parseFloat(formData.windSpeed) : null,
      solar_radiation_wm2: formData.solarRadiation
        ? parseFloat(formData.solarRadiation)
        : null,
      eto_mm: calculatedValues?.eto ?? null,
      etc_mm: calculatedValues?.etc ?? null,
      rainfall_mm: formData.rainfall ? parseFloat(formData.rainfall) : 0,
      kc: calculatedValues?.kc ?? null,
      ks: calculatedValues?.ks ?? 0.95,
      ctda: 46,
      cta: 43.7,
      irn_mm: 51,
      itn_mm: 46,
      recommended_speed_percent: null,
      recommended_depth_mm: null,
      field_capacity_percent: null,
      needs_irrigation: false,
      actual_speed_percent: null,
      actual_depth_mm: null,
      irrigation_start: null,
      irrigation_end: null,
      irrigation_duration_hours: null,
      soil_moisture_measured: null,
      soil_moisture_calculated: null,
      cost_per_mm_alq: null,
      cost_per_mm_ha: null,
      energy_kwh: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    setRecords((prev) => [newRecord, ...prev])
    setFormData(initialFormData)
    setCalculatedEto(null)
    setCalculatedValues(null)
    setIsModalOpen(false)
  }

  const today = new Date()
  const seasonName = 'Safra 2025/26 - Soja'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text">Manejo Diário</h1>
          <p className="text-text-muted mt-1">
            {seasonName} • {formatDate(today.toISOString())}
          </p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Adicionar Registro
        </Button>
      </div>

      {/* Data Table */}
      <div className="grid gap-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full">
            <thead className="bg-surface-secondary border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-sm text-text">
                  Data
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm text-text">
                  DAS
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm text-text">
                  Fase
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm text-text">
                  ETo
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm text-text">
                  ETc
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm text-text">
                  Chuva
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm text-text">
                  % CC
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm text-text">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-semibold text-sm text-text">
                  Ação
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((record) => (
                <div key={record.id}>
                  <tr
                    className="hover:bg-surface-secondary transition-colors cursor-pointer"
                    onClick={() =>
                      setExpandedId(
                        expandedId === record.id ? null : record.id
                      )
                    }
                  >
                    <td className="px-4 py-3 text-sm text-text">
                      {formatDate(record.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-text">
                      {record.das}
                    </td>
                    <td className="px-4 py-3 text-sm text-text">
                      V{record.crop_stage}
                    </td>
                    <td className="px-4 py-3 text-sm text-text">
                      {record.eto_mm
                        ? formatNumber(record.eto_mm)
                        : '—'}{' '}
                      mm
                    </td>
                    <td className="px-4 py-3 text-sm text-text">
                      {record.etc_mm
                        ? formatNumber(record.etc_mm)
                        : '—'}{' '}
                      mm
                    </td>
                    <td className="px-4 py-3 text-sm text-text">
                      {formatNumber(record.rainfall_mm || 0)} mm
                    </td>
                    <td className="px-4 py-3 text-sm text-text font-medium">
                      {record.field_capacity_percent
                        ? formatNumber(record.field_capacity_percent)
                        : '—'}
                      %
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={cn(
                          'inline-block px-3 py-1 rounded-full border text-xs font-medium',
                          record.field_capacity_percent
                            ? getStatusColor(
                                getStatusType(
                                  record.field_capacity_percent
                                )
                              )
                            : 'bg-gray-100 text-gray-800 border-gray-300'
                        )}
                      >
                        {record.field_capacity_percent
                          ? getStatusLabel(record.field_capacity_percent)
                          : 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {expandedId === record.id ? (
                        <ChevronUp className="h-4 w-4 text-text-muted" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-text-muted" />
                      )}
                    </td>
                  </tr>
                  {expandedId === record.id && (
                    <tr className="bg-surface-secondary">
                      <td colSpan={9} className="px-4 py-4">
                        <Card className="bg-surface border-0 p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs text-text-muted font-medium uppercase">
                                Temperatura
                              </p>
                              <p className="text-sm text-text mt-1">
                                Máx: {record.temp_max}°C
                              </p>
                              <p className="text-sm text-text">
                                Mín: {record.temp_min}°C
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-muted font-medium uppercase">
                                Umidade
                              </p>
                              <p className="text-sm text-text mt-1">
                                {record.humidity_percent}%
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-muted font-medium uppercase">
                                Vento
                              </p>
                              <p className="text-sm text-text mt-1">
                                {record.wind_speed_ms} m/s
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-muted font-medium uppercase">
                                Radiação Solar
                              </p>
                              <p className="text-sm text-text mt-1">
                                {record.solar_radiation_wm2} W/m²
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-muted font-medium uppercase">
                                Kc
                              </p>
                              <p className="text-sm text-text mt-1">
                                {record.kc
                                  ? formatNumber(record.kc)
                                  : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-text-muted font-medium uppercase">
                                Ks
                              </p>
                              <p className="text-sm text-text mt-1">
                                {record.ks
                                  ? formatNumber(record.ks)
                                  : '—'}
                              </p>
                            </div>
                            {record.needs_irrigation && (
                              <>
                                <div>
                                  <p className="text-xs text-text-muted font-medium uppercase">
                                    Profundidade Recomendada
                                  </p>
                                  <p className="text-sm text-text mt-1">
                                    {record.recommended_depth_mm
                                      ? formatNumber(
                                          record.recommended_depth_mm
                                        )
                                      : '—'}{' '}
                                    mm
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-text-muted font-medium uppercase">
                                    Velocidade Pivô
                                  </p>
                                  <p className="text-sm text-text mt-1">
                                    {record.recommended_speed_percent
                                      ? formatNumber(
                                          record.recommended_speed_percent
                                        )
                                      : '—'}
                                    %
                                  </p>
                                </div>
                                {record.irrigation_duration_hours && (
                                  <div>
                                    <p className="text-xs text-text-muted font-medium uppercase">
                                      Duração Irrigação
                                    </p>
                                    <p className="text-sm text-text mt-1">
                                      {formatNumber(
                                        record.irrigation_duration_hours
                                      )}{' '}
                                      h
                                    </p>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </Card>
                      </td>
                    </tr>
                  )}
                </div>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader title="Adicionar Registro Diário" />
            <CardContent className="space-y-4">
              {/* Weather Data Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Data"
                  variant="date"
                  value={formData.date}
                  onChange={(e) =>
                    handleFormChange('date', e.currentTarget.value)
                  }
                />
                <Input
                  label="Temperatura Máxima (°C)"
                  variant="number"
                  placeholder="28"
                  value={formData.tempMax}
                  onChange={(e) =>
                    handleFormChange('tempMax', e.currentTarget.value)
                  }
                />
                <Input
                  label="Temperatura Mínima (°C)"
                  variant="number"
                  placeholder="18"
                  value={formData.tempMin}
                  onChange={(e) =>
                    handleFormChange('tempMin', e.currentTarget.value)
                  }
                />
                <Input
                  label="Umidade Relativa (%)"
                  variant="number"
                  placeholder="65"
                  value={formData.humidity}
                  onChange={(e) =>
                    handleFormChange('humidity', e.currentTarget.value)
                  }
                />
                <Input
                  label="Velocidade do Vento (m/s)"
                  variant="number"
                  placeholder="2.5"
                  step="0.1"
                  value={formData.windSpeed}
                  onChange={(e) =>
                    handleFormChange('windSpeed', e.currentTarget.value)
                  }
                />
                <Input
                  label="Radiação Solar (W/m²)"
                  variant="number"
                  placeholder="800"
                  value={formData.solarRadiation}
                  onChange={(e) =>
                    handleFormChange('solarRadiation', e.currentTarget.value)
                  }
                />
                <Input
                  label="Chuva (mm)"
                  variant="number"
                  placeholder="0"
                  value={formData.rainfall}
                  onChange={(e) =>
                    handleFormChange('rainfall', e.currentTarget.value)
                  }
                />
              </div>

              {/* Calculate ETo Button */}
              <Button
                onClick={handleCalculateEto}
                variant="secondary"
                className="w-full flex items-center justify-center gap-2"
              >
                <Calculator className="h-4 w-4" />
                Calcular ETo
              </Button>

              {/* Calculated Values Display */}
              {calculatedValues && (
                <Card className="bg-primary-50 border-primary-200">
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-primary-500" />
                        <span className="text-sm font-medium text-text">
                          ETo
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-text">
                        {formatNumber(calculatedValues.eto)} mm/dia
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-primary-500" />
                        <span className="text-sm font-medium text-text">
                          ETc
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-text">
                        {formatNumber(calculatedValues.etc)} mm/dia
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text">
                        Kc
                      </span>
                      <span className="text-sm font-semibold text-text">
                        {formatNumber(calculatedValues.kc)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-primary-200 pt-3">
                      <span className="text-sm font-medium text-text">
                        Recomendação
                      </span>
                      <span className="text-xs text-text text-right">
                        {calculatedValues.recommendation}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false)
                    setFormData(initialFormData)
                    setCalculatedValues(null)
                  }}
                >
                  Cancelar
                </Button>
                <Button onClick={handleAddRecord}>Adicionar Registro</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

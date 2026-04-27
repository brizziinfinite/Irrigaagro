'use client'

import { useEffect, useMemo, useState } from 'react'
import type * as React from 'react'
import { useAuth } from '@/hooks/useAuth'
import { listFarmsByCompany } from '@/services/farms'
import {
  createWeatherStation,
  deleteWeatherStation,
  listWeatherStationsByFarmIds,
  updateWeatherStation,
} from '@/services/weather-stations'
import {
  deleteWeatherData,
  getWeatherDataByStationDate,
  listWeatherDataByStation,
  upsertWeatherData,
} from '@/services/weather-data'
import type {
  Farm,
  WeatherData,
  WeatherStation,
  WeatherStationProvider,
} from '@/types/database'
import {
  CloudSun,
  Loader2,
  Plus,
  RadioTower,
  Trash2,
  Pencil,
  X,
} from 'lucide-react'

interface StationFormData {
  farmId: string
  name: string
  deviceId: string
  apiProvider: WeatherStationProvider
}

interface WeatherFormData {
  date: string
  tempMax: string
  tempMin: string
  humidity: string
  windSpeed: string
  solarRadiation: string
  rainfall: string
  eto: string
  etoCorrected: string
  source: string
  rawData: string
}

const initialStationForm: StationFormData = {
  farmId: '',
  name: '',
  deviceId: '',
  apiProvider: 'manual',
}

const initialWeatherForm: WeatherFormData = {
  date: '',
  tempMax: '',
  tempMin: '',
  humidity: '',
  windSpeed: '',
  solarRadiation: '',
  rainfall: '',
  eto: '',
  etoCorrected: '',
  source: 'manual',
  rawData: '',
}

function getDefaultDateValue() {
  return new Date().toISOString().slice(0, 10)
}

function parseNullableNumber(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR')
}

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value)
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 14,
        background: '#0d1520',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#e2e8f0',
        outline: 'none',
        ...(props.style ?? {}),
      }}
    />
  )
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: '100%',
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 13,
        background: '#0d1520',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#e2e8f0',
        outline: 'none',
        resize: 'vertical',
        ...(props.style ?? {}),
      }}
    />
  )
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        width: '100%',
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 14,
        background: '#0d1520',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#e2e8f0',
        outline: 'none',
        ...(props.style ?? {}),
      }}
    />
  )
}

interface StationModalProps {
  station: WeatherStation | null
  farms: Farm[]
  onClose: () => void
  onSaved: (station: WeatherStation) => void
}

function StationModal({ station, farms, onClose, onSaved }: StationModalProps) {
  const [form, setForm] = useState<StationFormData>({
    farmId: station?.farm_id ?? farms[0]?.id ?? '',
    name: station?.name ?? '',
    deviceId: station?.device_id ?? '',
    apiProvider: station?.api_provider ?? 'manual',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = Boolean(station)

  const VALID_PROVIDERS = new Set(['manual', 'fieldclimate', 'davis', 'inmet'])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.farmId || !form.name.trim()) {
      setError('Preencha fazenda e nome da estação.')
      return
    }

    if (!farms.some(f => f.id === form.farmId)) {
      setError('Fazenda selecionada não pertence à sua empresa.')
      return
    }

    if (!VALID_PROVIDERS.has(form.apiProvider)) {
      setError('Provider inválido.')
      return
    }

    try {
      setSaving(true)
      setError('')
      const payload = {
        farm_id: form.farmId,
        name: form.name.trim(),
        device_id: form.deviceId.trim() || null,
        api_provider: form.apiProvider,
      }
      const saved = isEdit
        ? await updateWeatherStation(station!.id, payload)
        : await createWeatherStation(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar estação')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgb(0 0 0 / 0.7)' }}>
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 'clamp(16px, 4vw, 24px)', width: '100%', maxWidth: 520, boxShadow: '0 20px 48px -8px rgb(0 0 0 / 0.6)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            {isEdit ? 'Editar estação' : 'Nova estação'}
          </h2>
          <button onClick={onClose} style={{ padding: 8, minWidth: 36, minHeight: 36, borderRadius: 8, border: 'none', background: 'transparent', color: '#778899', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Fazenda">
            <SelectInput value={form.farmId} onChange={(e) => setForm((prev) => ({ ...prev, farmId: e.target.value }))} disabled={saving || farms.length === 0}>
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>{farm.name}</option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Nome da estação">
            <TextInput value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} disabled={saving} />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Device ID">
              <TextInput value={form.deviceId} onChange={(e) => setForm((prev) => ({ ...prev, deviceId: e.target.value }))} disabled={saving} />
            </Field>

            <Field label="Provider">
              <SelectInput value={form.apiProvider} onChange={(e) => setForm((prev) => ({ ...prev, apiProvider: e.target.value as WeatherStationProvider }))} disabled={saving}>
                <option value="manual">Manual</option>
                <option value="fieldclimate">FieldClimate</option>
                <option value="davis">Davis</option>
                <option value="inmet">INMET</option>
              </SelectInput>
            </Field>
          </div>

          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 500, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px 0', minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function EstacoesPage() {
  const { company, loading: authLoading } = useAuth()
  const [farms, setFarms] = useState<Farm[]>([])
  const [stations, setStations] = useState<WeatherStation[]>([])
  const [weatherRows, setWeatherRows] = useState<WeatherData[]>([])
  const [loading, setLoading] = useState(true)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherSaving, setWeatherSaving] = useState(false)
  const [deletingStationId, setDeletingStationId] = useState<string | null>(null)
  const [deletingWeatherId, setDeletingWeatherId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [weatherError, setWeatherError] = useState('')
  const [selectedStationId, setSelectedStationId] = useState('')
  const [stationModalOpen, setStationModalOpen] = useState(false)
  const [editingStation, setEditingStation] = useState<WeatherStation | null>(null)
  const [weatherForm, setWeatherForm] = useState<WeatherFormData>({
    ...initialWeatherForm,
    date: getDefaultDateValue(),
  })

  useEffect(() => {
    if (authLoading) return

    if (!company?.id) {
      setFarms([])
      setStations([])
      setSelectedStationId('')
      setLoading(false)
      setLoadError('Nenhuma empresa ativa encontrada.')
      return
    }

    let cancelled = false

    const loadData = async () => {
      try {
        setLoading(true)
        setLoadError('')
        const farmRows = await listFarmsByCompany(company.id)
        const stationRows = await listWeatherStationsByFarmIds(farmRows.map((farm) => farm.id))

        if (cancelled) return

        setFarms(farmRows)
        setStations(stationRows)
        setSelectedStationId((current) => {
          if (current && stationRows.some((station) => station.id === current)) return current
          return stationRows[0]?.id ?? ''
        })
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Falha ao carregar estações')
          setFarms([])
          setStations([])
          setSelectedStationId('')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [authLoading, company?.id])

  useEffect(() => {
    if (!selectedStationId) {
      setWeatherRows([])
      return
    }

    let cancelled = false

    const loadWeather = async () => {
      try {
        setWeatherLoading(true)
        setWeatherError('')
        const data = await listWeatherDataByStation(selectedStationId)
        if (!cancelled) {
          setWeatherRows(data)
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherError(error instanceof Error ? error.message : 'Falha ao carregar dados climáticos')
        }
      } finally {
        if (!cancelled) {
          setWeatherLoading(false)
        }
      }
    }

    loadWeather()

    return () => {
      cancelled = true
    }
  }, [selectedStationId])

  useEffect(() => {
    if (!selectedStationId || !weatherForm.date) {
      return
    }

    let cancelled = false

    const loadSnapshot = async () => {
      try {
        setWeatherError('')
        const row = await getWeatherDataByStationDate(selectedStationId, weatherForm.date)
        if (cancelled) return

        setWeatherForm((prev) => ({
          ...prev,
          tempMax: row?.temp_max?.toString() ?? '',
          tempMin: row?.temp_min?.toString() ?? '',
          humidity: row?.humidity_percent?.toString() ?? '',
          windSpeed: row?.wind_speed_ms?.toString() ?? '',
          solarRadiation: row?.solar_radiation_wm2?.toString() ?? '',
          rainfall: row?.rainfall_mm?.toString() ?? '',
          eto: row?.eto_mm?.toString() ?? '',
          etoCorrected: row?.eto_corrected_mm?.toString() ?? '',
          source: row?.source ?? 'manual',
          rawData: row?.raw_data ? JSON.stringify(row.raw_data, null, 2) : '',
        }))
      } catch (error) {
        if (!cancelled) {
          setWeatherError(error instanceof Error ? error.message : 'Falha ao buscar clima por data')
        }
      }
    }

    loadSnapshot()

    return () => {
      cancelled = true
    }
  }, [selectedStationId, weatherForm.date])

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) ?? null,
    [selectedStationId, stations]
  )

  function getFarmName(farmId: string) {
    return farms.find((farm) => farm.id === farmId)?.name ?? 'Fazenda desconhecida'
  }

  async function handleSaveWeather() {
    if (!selectedStationId || !weatherForm.date) {
      setWeatherError('Selecione estação e data.')
      return
    }

    let rawData = null
    if (weatherForm.rawData.trim()) {
      try {
        rawData = JSON.parse(weatherForm.rawData)
      } catch {
        setWeatherError('Raw data deve estar em JSON válido.')
        return
      }
    }

    try {
      setWeatherSaving(true)
      setWeatherError('')
      const saved = await upsertWeatherData({
        station_id: selectedStationId,
        date: weatherForm.date,
        temp_max: parseNullableNumber(weatherForm.tempMax),
        temp_min: parseNullableNumber(weatherForm.tempMin),
        humidity_percent: parseNullableNumber(weatherForm.humidity),
        wind_speed_ms: parseNullableNumber(weatherForm.windSpeed),
        solar_radiation_wm2: parseNullableNumber(weatherForm.solarRadiation),
        rainfall_mm: parseNullableNumber(weatherForm.rainfall),
        eto_mm: parseNullableNumber(weatherForm.eto),
        eto_corrected_mm: parseNullableNumber(weatherForm.etoCorrected),
        source: weatherForm.source.trim() || 'manual',
        raw_data: rawData,
      })

      setWeatherRows((prev) => {
        const next = [saved, ...prev.filter((row) => row.id !== saved.id && !(row.station_id === saved.station_id && row.date === saved.date))]
        return next.sort((a, b) => b.date.localeCompare(a.date))
      })
    } catch (error) {
      setWeatherError(error instanceof Error ? error.message : 'Falha ao salvar dado climático')
    } finally {
      setWeatherSaving(false)
    }
  }

  async function handleDeleteStation(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta estação meteorológica?')) return
    try {
      setDeletingStationId(id)
      setLoadError('')
      await deleteWeatherStation(id)
      setStations((prev) => {
        const next = prev.filter((station) => station.id !== id)
        if (selectedStationId === id) {
          setSelectedStationId(next[0]?.id ?? '')
        }
        return next
      })
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao excluir estação')
    } finally {
      setDeletingStationId(null)
    }
  }

  async function handleDeleteWeather(id: string) {
    if (!confirm('Tem certeza que deseja excluir este registro climático?')) return
    try {
      setDeletingWeatherId(id)
      setWeatherError('')
      await deleteWeatherData(id)
      setWeatherRows((prev) => prev.filter((row) => row.id !== id))
    } catch (error) {
      setWeatherError(error instanceof Error ? error.message : 'Falha ao excluir dado climático')
    } finally {
      setDeletingWeatherId(null)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>Estações meteorológicas</h1>
            <p className="text-sm mt-0.5" style={{ color: '#8899aa' }}>
              {stations.length} {stations.length === 1 ? 'estação cadastrada' : 'estações cadastradas'} · clima por estação e data
            </p>
          </div>
          <button
            onClick={() => {
              setEditingStation(null)
              setStationModalOpen(true)
            }}
            disabled={loading || farms.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer',
              boxShadow: '0 2px 8px rgb(0 147 208 / 0.25)', opacity: loading || farms.length === 0 ? 0.6 : 1,
            }}
          >
            <Plus size={16} />
            Nova Estação
          </button>
        </div>

        {loadError && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444' }}>
            {loadError}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, color: '#8899aa' }}>
            Carregando estações...
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr]">
            <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24 }}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#778899' }}>Estações</p>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0', marginTop: 4 }}>Vínculo com fazendas reais</h2>
                </div>
              </div>

              {stations.length === 0 ? (
                <div style={{ padding: '40px 24px', textAlign: 'center', background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, color: '#8899aa' }}>
                  <RadioTower size={32} color="#778899" style={{ margin: '0 auto 12px' }} />
                  Nenhuma estação cadastrada.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {stations.map((station) => {
                    const isActive = selectedStationId === station.id
                    return (
                      <div
                        key={station.id}
                        style={{
                          borderRadius: 16,
                          border: `1px solid ${isActive ? '#2f6fcd' : 'rgba(255,255,255,0.06)'}`,
                          background: isActive ? '#16273b' : '#0d1520',
                          padding: 16,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button onClick={() => setSelectedStationId(station.id)} style={{ textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', flex: 1 }}>
                            <div className="flex items-center gap-2">
                              <RadioTower size={16} color={isActive ? '#60a5fa' : '#0093D0'} />
                              <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{station.name}</span>
                            </div>
                            <p style={{ fontSize: 13, color: '#8899aa', marginTop: 8 }}>{getFarmName(station.farm_id)}</p>
                            <p style={{ fontSize: 12, color: '#778899', marginTop: 4 }}>
                              provider: {station.api_provider} · device: {station.device_id || '—'}
                            </p>
                          </button>
                          <div className="flex gap-2">
                            <button onClick={() => { setEditingStation(station); setStationModalOpen(true) }} style={{ padding: 8, minHeight: 36, minWidth: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: '#0d1520', color: '#8899aa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDeleteStation(station.id)} disabled={deletingStationId === station.id} style={{ padding: 8, minHeight: 36, minWidth: 36, borderRadius: 10, border: '1px solid rgb(239 68 68 / 0.25)', background: 'rgb(239 68 68 / 0.08)', color: '#f87171', cursor: 'pointer', opacity: deletingStationId === station.id ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24 }}>
              <div className="mb-4">
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#778899' }}>Dado climático do dia</p>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0', marginTop: 4 }}>
                  {selectedStation ? selectedStation.name : 'Selecione uma estação'}
                </h2>
                <p style={{ fontSize: 13, color: '#8899aa', marginTop: 6 }}>
                  Salvamento com `upsert` por estação e data para manter um registro único diário.
                </p>
              </div>

              {weatherError && (
                <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444' }}>
                  {weatherError}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Estação">
                  <SelectInput value={selectedStationId} onChange={(e) => setSelectedStationId(e.target.value)} disabled={stations.length === 0}>
                    {stations.length === 0 ? (
                      <option value="">Nenhuma estação disponível</option>
                    ) : (
                      stations.map((station) => (
                        <option key={station.id} value={station.id}>
                          {station.name} · {getFarmName(station.farm_id)}
                        </option>
                      ))
                    )}
                  </SelectInput>
                </Field>
                <Field label="Data">
                  <TextInput type="date" value={weatherForm.date} onChange={(e) => setWeatherForm((prev) => ({ ...prev, date: e.target.value }))} disabled={!selectedStationId || weatherSaving} />
                </Field>
                <Field label="Fonte">
                  <TextInput value={weatherForm.source} onChange={(e) => setWeatherForm((prev) => ({ ...prev, source: e.target.value }))} disabled={!selectedStationId || weatherSaving} />
                </Field>
                <Field label="Temp. máx. (°C)">
                  <TextInput type="number" step="0.1" value={weatherForm.tempMax} onChange={(e) => setWeatherForm((prev) => ({ ...prev, tempMax: e.target.value }))} disabled={!selectedStationId || weatherSaving} />
                </Field>
                <Field label="Temp. mín. (°C)">
                  <TextInput type="number" step="0.1" value={weatherForm.tempMin} onChange={(e) => setWeatherForm((prev) => ({ ...prev, tempMin: e.target.value }))} disabled={!selectedStationId || weatherSaving} />
                </Field>
                <Field label="Umidade (%)">
                  <TextInput type="number" step="0.1" value={weatherForm.humidity} onChange={(e) => setWeatherForm((prev) => ({ ...prev, humidity: e.target.value }))} disabled={!selectedStationId || weatherSaving} />
                </Field>
                <Field label="Vento (m/s)">
                  <TextInput type="number" step="0.1" value={weatherForm.windSpeed} onChange={(e) => setWeatherForm((prev) => ({ ...prev, windSpeed: e.target.value }))} disabled={!selectedStationId || weatherSaving} />
                </Field>
                <Field label="Radiação (W/m²)">
                  <TextInput type="number" step="0.1" value={weatherForm.solarRadiation} onChange={(e) => setWeatherForm((prev) => ({ ...prev, solarRadiation: e.target.value }))} disabled={!selectedStationId || weatherSaving} />
                </Field>
                <Field label="Chuva (mm)">
                  <TextInput type="number" step="0.1" value={weatherForm.rainfall} onChange={(e) => setWeatherForm((prev) => ({ ...prev, rainfall: e.target.value }))} disabled={!selectedStationId || weatherSaving} />
                </Field>
                <Field label="ETo (mm)">
                  <TextInput type="number" step="0.01" value={weatherForm.eto} onChange={(e) => setWeatherForm((prev) => ({ ...prev, eto: e.target.value }))} disabled={!selectedStationId || weatherSaving} />
                </Field>
                <Field label="ETo corrigida (mm)">
                  <TextInput type="number" step="0.01" value={weatherForm.etoCorrected} onChange={(e) => setWeatherForm((prev) => ({ ...prev, etoCorrected: e.target.value }))} disabled={!selectedStationId || weatherSaving} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Raw data (JSON)">
                    <TextArea rows={5} value={weatherForm.rawData} onChange={(e) => setWeatherForm((prev) => ({ ...prev, rawData: e.target.value }))} disabled={!selectedStationId || weatherSaving} style={{ fontFamily: 'var(--font-mono)' }} />
                  </Field>
                </div>
              </div>

              <div className="flex justify-end mt-5">
                <button
                  onClick={handleSaveWeather}
                  disabled={!selectedStationId || weatherSaving}
                  style={{
                    padding: '10px 18px', minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
                    background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer',
                    opacity: !selectedStationId || weatherSaving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  {weatherSaving && <Loader2 size={14} className="animate-spin" />}
                  Salvar clima
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24 }}>
          <div className="flex items-center gap-2 mb-4">
            <CloudSun size={16} color="#0093D0" />
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>Histórico climático recente</h2>
          </div>

          {weatherLoading ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#8899aa' }}>Carregando dados climáticos...</div>
          ) : weatherRows.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, color: '#8899aa' }}>
              <CloudSun size={32} color="#778899" style={{ margin: '0 auto 12px' }} />
              Nenhum `weather_data` encontrado para a estação selecionada.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {weatherRows.map((row) => (
                <div key={row.id} style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', background: '#0d1520', padding: 16 }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#778899' }}>
                        {formatDate(row.date)}
                      </p>
                      <p style={{ fontSize: 12, color: '#8899aa', marginTop: 6 }}>Fonte: {row.source}</p>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" style={{ marginTop: 14 }}>
                        <div><p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#778899' }}>Tmax</p><p style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>{row.temp_max != null ? `${formatNumber(row.temp_max)}°C` : '—'}</p></div>
                        <div><p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#778899' }}>Tmin</p><p style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>{row.temp_min != null ? `${formatNumber(row.temp_min)}°C` : '—'}</p></div>
                        <div><p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#778899' }}>Chuva</p><p style={{ fontSize: 14, fontWeight: 600, color: '#67e8f9', marginTop: 4 }}>{row.rainfall_mm != null ? `${formatNumber(row.rainfall_mm)} mm` : '—'}</p></div>
                        <div><p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#778899' }}>ETo</p><p style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginTop: 4 }}>{row.eto_corrected_mm != null ? `${formatNumber(row.eto_corrected_mm, 2)} mm*` : row.eto_mm != null ? `${formatNumber(row.eto_mm, 2)} mm` : '—'}</p></div>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteWeather(row.id)} disabled={deletingWeatherId === row.id} style={{ padding: '8px 12px', minHeight: 44, borderRadius: 10, border: '1px solid rgb(239 68 68 / 0.25)', background: 'rgb(239 68 68 / 0.08)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: deletingWeatherId === row.id ? 0.6 : 1 }}>
                      <Trash2 size={14} />
                      Deletar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {stationModalOpen && (
        <StationModal
          station={editingStation}
          farms={farms}
          onClose={() => {
            setStationModalOpen(false)
            setEditingStation(null)
          }}
          onSaved={(saved) => {
            setStations((prev) => {
              const exists = prev.some((station) => station.id === saved.id)
              const next = exists
                ? prev.map((station) => (station.id === saved.id ? saved : station))
                : [saved, ...prev]
              return next.sort((a, b) => a.name.localeCompare(b.name))
            })
            setSelectedStationId(saved.id)
            setStationModalOpen(false)
            setEditingStation(null)
          }}
        />
      )}
    </>
  )
}

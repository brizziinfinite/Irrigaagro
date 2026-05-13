'use client'

import { useEffect, useMemo, useState } from 'react'
import type * as React from 'react'
import { useAuth } from '@/hooks/useAuth'
import { persistedFetch } from '@/lib/persistedFetch'
import { useOnlineGuard } from '@/hooks/useOnlineGuard'
import { UltimaAtualizacao } from '@/components/UltimaAtualizacao'
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
  Thermometer,
  Droplets,
  Wind,
  ChevronDown,
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
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
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

function formatSource(source: string): string {
  const map: Record<string, string> = {
    manual: 'Lançamento manual',
    plugfield: 'Plugfield (automático)',
    plugfield_fao56: 'Plugfield — FAO-56',
    nasa: 'NASA POWER (automático)',
    nasa_power: 'NASA POWER (automático)',
    google_sheets: 'Planilha Google',
    inmet: 'INMET (automático)',
    open_meteo: 'Open-Meteo (automático)',
  }
  return map[source] ?? source
}

// ─── Divisor de grupo de campos ──────────────────────────────
function FieldGroup({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ color: '#445566' }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>{label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {children}
      </div>
    </div>
  )
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
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
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
        background: 'var(--color-surface-sidebar)',
        border: '1px solid var(--color-surface-border)',
        color: 'var(--color-text)',
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
        background: 'var(--color-surface-sidebar)',
        border: '1px solid var(--color-surface-border)',
        color: 'var(--color-text)',
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
        background: 'var(--color-surface-sidebar)',
        border: '1px solid var(--color-surface-border)',
        color: 'var(--color-text)',
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
      <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 20, padding: 'clamp(16px, 4vw, 24px)', width: '100%', maxWidth: 520, boxShadow: '0 20px 48px -8px rgb(0 0 0 / 0.6)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
            {isEdit ? 'Editar estação' : 'Nova estação'}
          </h2>
          <button onClick={onClose} style={{ padding: 8, minWidth: 36, minHeight: 36, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 500, background: 'transparent', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
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
  const { isOnline, guardAction } = useOnlineGuard()
  const [estacoesCacheInfo, setEstacoesCacheInfo] = useState<{ fetchedAt: string | null; fromCache: boolean }>({ fetchedAt: null, fromCache: false })
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
  const [historyPage, setHistoryPage] = useState(10)
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
      setLoading(true)
      setLoadError('')
      const { data: farmRows, fetchedAt, fromCache, error } = await persistedFetch(
        `estacoes:farms:${company.id}`,
        () => listFarmsByCompany(company.id)
      )
      if (cancelled) return
      if (farmRows) {
        setEstacoesCacheInfo({ fetchedAt, fromCache })
        const { data: stationRows } = await persistedFetch(
          `estacoes:stations:${company.id}`,
          () => listWeatherStationsByFarmIds(farmRows.map((farm) => farm.id))
        )
        if (cancelled) return
        setFarms(farmRows)
        setStations(stationRows ?? [])
        setSelectedStationId((current) => {
          if (current && (stationRows ?? []).some((station) => station.id === current)) return current
          return stationRows?.[0]?.id ?? ''
        })
      } else {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Falha ao carregar estações')
          setFarms([])
          setStations([])
          setSelectedStationId('')
        }
      }
      if (!cancelled) setLoading(false)
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

    setHistoryPage(10)
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

  // Última leitura da estação selecionada
  const lastRow = weatherRows[0] ?? null
  const etoDisplay = lastRow
    ? (lastRow.eto_corrected_mm != null ? formatNumber(lastRow.eto_corrected_mm, 2) : lastRow.eto_mm != null ? formatNumber(lastRow.eto_mm, 2) : null)
    : null

  const visibleRows = weatherRows.slice(0, historyPage)

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 style={{ color: 'var(--color-text)', fontSize: 24, fontWeight: 600, letterSpacing: '-0.025em', margin: 0 }}>Estações meteorológicas</h1>
            <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.625, margin: '2px 0 0' }}>
              {stations.length} {stations.length === 1 ? 'estação cadastrada' : 'estações cadastradas'}
            </p>
            {(estacoesCacheInfo.fromCache || estacoesCacheInfo.fetchedAt) && (
              <div style={{ marginTop: 4 }}>
                <UltimaAtualizacao fetchedAt={estacoesCacheInfo.fetchedAt} />
              </div>
            )}
          </div>
          <button
            onClick={() => { setEditingStation(null); setStationModalOpen(true) }}
            disabled={loading || farms.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,147,208,0.25)', opacity: loading || farms.length === 0 ? 0.6 : 1 }}
          >
            <Plus size={16} /> Nova Estação
          </button>
        </div>

        {loadError && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
            {loadError}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 16, color: 'var(--color-text-secondary)' }}>
            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 12px', color: '#0093D0' }} />
            Carregando estações...
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr]">

            {/* ── Coluna esquerda: lista de estações ── */}
            <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 20, padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', margin: 0 }}>Suas estações</p>
                <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', lineHeight: 1.5 }}>Clique para selecionar e registrar leituras</p>
              </div>

              {stations.length === 0 ? (
                <div style={{ padding: '40px 24px', textAlign: 'center', background: 'var(--color-surface-sidebar)', border: '1px solid var(--color-surface-border2)', borderRadius: 16, color: 'var(--color-text-secondary)' }}>
                  <RadioTower size={28} style={{ margin: '0 auto 12px', color: '#334455' }} />
                  <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Nenhuma estação cadastrada.</p>
                  <p style={{ fontSize: 12, color: '#445566', marginTop: 4 }}>Crie uma estação para começar a registrar dados climáticos.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {stations.map((station) => {
                    const isActive = selectedStationId === station.id
                    const providerLabel = formatSource(station.api_provider)
                    return (
                      <div key={station.id} style={{ borderRadius: 14, border: `1px solid ${isActive ? 'rgba(0,147,208,0.35)' : 'var(--color-surface-border2)'}`, background: isActive ? 'rgba(0,147,208,0.06)' : 'var(--color-surface-sidebar)', padding: '14px 16px', transition: 'all 0.15s' }}>
                        <div className="flex items-start justify-between gap-3">
                          <button onClick={() => setSelectedStationId(station.id)} style={{ textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <RadioTower size={15} style={{ color: isActive ? '#0093D0' : '#445566', flexShrink: 0 }} />
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>{station.name}</span>
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>{getFarmName(station.farm_id)}</p>
                            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
                              {providerLabel}{station.device_id ? ` · ID: ${station.device_id}` : ''}
                            </p>
                          </button>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => { setEditingStation(station); setStationModalOpen(true) }} title="Editar estação"
                              style={{ padding: 8, minHeight: 34, minWidth: 34, borderRadius: 8, border: '1px solid transparent', background: 'var(--color-surface-border2)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#0093D0'; el.style.background = 'rgba(0,147,208,0.08)'; el.style.borderColor = 'rgba(0,147,208,0.2)' }}
                              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--color-text-muted)'; el.style.background = 'var(--color-surface-border2)'; el.style.borderColor = 'transparent' }}>
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDeleteStation(station.id)} disabled={deletingStationId === station.id} title="Excluir estação"
                              style={{ padding: 8, minHeight: 34, minWidth: 34, borderRadius: 8, border: '1px solid transparent', background: 'var(--color-surface-border2)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', opacity: deletingStationId === station.id ? 0.5 : 1 }}
                              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#ef4444'; el.style.background = 'rgba(239,68,68,0.08)'; el.style.borderColor = 'rgba(239,68,68,0.2)' }}
                              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--color-text-muted)'; el.style.background = 'var(--color-surface-border2)'; el.style.borderColor = 'transparent' }}>
                              {deletingStationId === station.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Coluna direita: formulário de lançamento ── */}
            <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 20, padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', margin: 0 }}>Lançamento climático</p>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', margin: '4px 0 0', letterSpacing: '-0.01em' }}>
                  {selectedStation ? selectedStation.name : 'Selecione uma estação'}
                </h2>

                {/* Resumo última leitura */}
                {lastRow && etoDisplay && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, background: 'rgba(0,147,208,0.08)', border: '1px solid rgba(0,147,208,0.2)' }}>
                      <CloudSun size={11} style={{ color: '#0093D0' }} />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>ETo:</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>{etoDisplay} mm</span>
                    </div>
                    {lastRow.rainfall_mm != null && lastRow.rainfall_mm > 0 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.18)' }}>
                        <Droplets size={11} style={{ color: '#06b6d4' }} />
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Chuva:</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{formatNumber(lastRow.rainfall_mm)} mm</span>
                      </div>
                    )}
                    <span style={{ fontSize: 11, color: '#445566', alignSelf: 'center' }}>
                      última leitura: {formatDate(lastRow.date)}
                    </span>
                  </div>
                )}
              </div>

              {weatherError && (
                <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                  {weatherError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Estação + Data */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Estação">
                    <SelectInput value={selectedStationId} onChange={(e) => setSelectedStationId(e.target.value)} disabled={stations.length === 0}>
                      {stations.length === 0
                        ? <option value="">Nenhuma estação</option>
                        : stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                      }
                    </SelectInput>
                  </Field>
                  <Field label="Data">
                    <TextInput type="date" value={weatherForm.date} onChange={e => setWeatherForm(p => ({ ...p, date: e.target.value }))} disabled={!selectedStationId || weatherSaving} style={{ colorScheme: 'dark' }} />
                  </Field>
                </div>

                {/* Grupo: Temperatura */}
                <FieldGroup label="Temperatura" icon={<Thermometer size={13} />}>
                  <Field label="Máxima (°C)">
                    <TextInput type="number" step="0.1" value={weatherForm.tempMax} onChange={e => setWeatherForm(p => ({ ...p, tempMax: e.target.value }))} disabled={!selectedStationId || weatherSaving} placeholder="—" />
                  </Field>
                  <Field label="Mínima (°C)">
                    <TextInput type="number" step="0.1" value={weatherForm.tempMin} onChange={e => setWeatherForm(p => ({ ...p, tempMin: e.target.value }))} disabled={!selectedStationId || weatherSaving} placeholder="—" />
                  </Field>
                </FieldGroup>

                {/* Grupo: Água */}
                <FieldGroup label="Água" icon={<Droplets size={13} />}>
                  <Field label="Chuva (mm)">
                    <TextInput type="number" step="0.1" value={weatherForm.rainfall} onChange={e => setWeatherForm(p => ({ ...p, rainfall: e.target.value }))} disabled={!selectedStationId || weatherSaving} placeholder="—" />
                  </Field>
                  <Field label="Umidade (%)">
                    <TextInput type="number" step="0.1" value={weatherForm.humidity} onChange={e => setWeatherForm(p => ({ ...p, humidity: e.target.value }))} disabled={!selectedStationId || weatherSaving} placeholder="—" />
                  </Field>
                </FieldGroup>

                {/* Grupo: Clima */}
                <FieldGroup label="Clima" icon={<Wind size={13} />}>
                  <Field label="Vento (m/s)">
                    <TextInput type="number" step="0.1" value={weatherForm.windSpeed} onChange={e => setWeatherForm(p => ({ ...p, windSpeed: e.target.value }))} disabled={!selectedStationId || weatherSaving} placeholder="—" />
                  </Field>
                  <Field label="Radiação (W/m²)">
                    <TextInput type="number" step="0.1" value={weatherForm.solarRadiation} onChange={e => setWeatherForm(p => ({ ...p, solarRadiation: e.target.value }))} disabled={!selectedStationId || weatherSaving} placeholder="—" />
                  </Field>
                </FieldGroup>

                {/* ETo — destacado */}
                <div style={{ background: 'rgba(0,147,208,0.04)', border: '1px solid rgba(0,147,208,0.15)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <CloudSun size={13} style={{ color: '#0093D0' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0093D0' }}>Evapotranspiração</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="ETo calculada (mm)">
                      <TextInput type="number" step="0.01" value={weatherForm.eto} onChange={e => setWeatherForm(p => ({ ...p, eto: e.target.value }))} disabled={!selectedStationId || weatherSaving} placeholder="—" />
                    </Field>
                    <Field label="ETo corrigida (mm)">
                      <TextInput type="number" step="0.01" value={weatherForm.etoCorrected} onChange={e => setWeatherForm(p => ({ ...p, etoCorrected: e.target.value }))} disabled={!selectedStationId || weatherSaving} placeholder="—" />
                    </Field>
                  </div>
                </div>

                {/* Fonte + Raw Data */}
                <Field label="Origem dos dados">
                  <SelectInput value={weatherForm.source} onChange={e => setWeatherForm(p => ({ ...p, source: e.target.value }))} disabled={!selectedStationId || weatherSaving}>
                    <option value="manual">Lançamento manual</option>
                    <option value="plugfield">Plugfield (automático)</option>
                    <option value="plugfield_fao56">Plugfield — FAO-56</option>
                    <option value="nasa_power">NASA POWER (automático)</option>
                    <option value="google_sheets">Planilha Google</option>
                    <option value="inmet">INMET (automático)</option>
                    <option value="open_meteo">Open-Meteo (automático)</option>
                  </SelectInput>
                </Field>

                <Field label="Dados brutos (JSON — opcional)">
                  <TextArea rows={3} value={weatherForm.rawData} onChange={e => setWeatherForm(p => ({ ...p, rawData: e.target.value }))} disabled={!selectedStationId || weatherSaving} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                </Field>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button onClick={() => { if (!guardAction()) return; handleSaveWeather() }} disabled={!selectedStationId || weatherSaving || !isOnline}
                    style={{ padding: '10px 22px', minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#0093D0', border: 'none', color: '#fff', cursor: 'pointer', opacity: !selectedStationId || weatherSaving || !isOnline ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 8px rgba(0,147,208,0.25)' }}>
                    {weatherSaving && <Loader2 size={14} className="animate-spin" />}
                    Salvar leitura
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Histórico climático ── */}
        <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 20, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <CloudSun size={15} style={{ color: '#0093D0' }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.01em' }}>Histórico climático</h2>
            {weatherRows.length > 0 && (
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: 'var(--color-surface-sidebar)', color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.05)', marginLeft: 2 }}>{weatherRows.length} registros</span>
            )}
          </div>

          {weatherLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto 10px', color: '#0093D0' }} />
            </div>
          ) : weatherRows.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', background: 'var(--color-surface-sidebar)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, color: 'var(--color-text-secondary)' }}>
              <CloudSun size={28} style={{ margin: '0 auto 12px', color: '#334455' }} />
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Nenhum registro encontrado para a estação selecionada.</p>
            </div>
          ) : (
            <>
              {/* Header da tabela */}
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 60px 60px 60px 70px 36px', gap: 8, padding: '6px 12px', marginBottom: 4 }}>
                {['Data', 'Origem', 'Tmax', 'Tmin', 'Chuva', 'Umid', 'ETo', ''].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#445566' }}>{h}</span>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visibleRows.map((row) => {
                  const etoVal = row.eto_corrected_mm != null ? row.eto_corrected_mm : row.eto_mm
                  return (
                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 60px 60px 60px 70px 36px', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--color-surface-sidebar)', alignItems: 'center' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#111e2e' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-sidebar)' }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>{formatDate(row.date)}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatSource(row.source)}>{formatSource(row.source)}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{row.temp_max != null ? `${formatNumber(row.temp_max)}°` : '—'}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{row.temp_min != null ? `${formatNumber(row.temp_min)}°` : '—'}</span>
                      <span style={{ fontSize: 12, color: row.rainfall_mm ? '#06b6d4' : '#334455', fontFamily: 'var(--font-mono)', fontWeight: row.rainfall_mm ? 700 : 400 }}>{row.rainfall_mm != null ? `${formatNumber(row.rainfall_mm)}` : '—'}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{row.humidity_percent != null ? `${formatNumber(row.humidity_percent)}%` : '—'}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: etoVal != null ? '#0093D0' : '#334455', fontFamily: 'var(--font-mono)' }}>{etoVal != null ? `${formatNumber(etoVal, 2)}` : '—'}</span>
                      <button onClick={() => handleDeleteWeather(row.id)} disabled={deletingWeatherId === row.id} title="Excluir registro"
                        style={{ padding: 6, minHeight: 28, minWidth: 28, borderRadius: 7, border: '1px solid transparent', background: 'transparent', color: '#334455', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', opacity: deletingWeatherId === row.id ? 0.5 : 1 }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#ef4444'; el.style.background = 'rgba(239,68,68,0.08)'; el.style.borderColor = 'rgba(239,68,68,0.2)' }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#334455'; el.style.background = 'transparent'; el.style.borderColor = 'transparent' }}>
                        {deletingWeatherId === row.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Paginação */}
              {weatherRows.length > historyPage && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button
                    onClick={() => setHistoryPage(p => p + 10)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', background: 'var(--color-surface-border2)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#0093D0'; el.style.borderColor = 'rgba(0,147,208,0.2)' }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--color-text-secondary)'; el.style.borderColor = 'rgba(255,255,255,0.07)' }}
                  >
                    <ChevronDown size={14} />
                    Ver mais ({weatherRows.length - historyPage} restantes)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {stationModalOpen && (
        <StationModal
          station={editingStation}
          farms={farms}
          onClose={() => { setStationModalOpen(false); setEditingStation(null) }}
          onSaved={(saved) => {
            setStations((prev) => {
              const exists = prev.some(s => s.id === saved.id)
              const next = exists ? prev.map(s => s.id === saved.id ? saved : s) : [saved, ...prev]
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

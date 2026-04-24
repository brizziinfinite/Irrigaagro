'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  BellRing,
  MapPin,
  Orbit,
  Sprout,
  Thermometer,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  getPivotDiagnostic,
  listPivotDiagnosticSummaries,
  type PivotDiagnostic,
  type PivotDiagnosticSummary,
} from '@/services/pivot-diagnostics'
import { listWeatherDataByStation } from '@/services/weather-data'
import type { WeatherData } from '@/types/database'
// isSuperAdmin removido do cliente — verificação feita via /api/auth/is-super-admin

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
}

function formatNumber(value: number, decimals = 1): string {
  return value.toFixed(decimals).replace('.', ',')
}

function getEtoSourceLabel(source: string | null): string {
  switch (source) {
    case 'weather_corrected':
      return 'Estação corrigida'
    case 'weather_raw':
      return 'Estação bruta'
    case 'calculated_penman_monteith':
      return 'Penman-Monteith por geolocalização'
    case 'manual':
      return 'Manual'
    default:
      return 'Sem origem registrada'
  }
}

function getRainfallSourceLabel(source: string): string {
  switch (source) {
    case 'rainfall_records':
      return 'rainfall_records'
    case 'weather_data':
      return 'weather_data'
    case 'geolocalização do pivô':
      return 'geolocalização do pivô'
    default:
      return 'manual/ausente'
  }
}

function getStatusConfig(status: PivotDiagnostic['status'] | PivotDiagnostic['automationStatus']) {
  if (status === 'OK' || status === 'Automação pronta' || status === 'Manejo do dia já gerado') {
    return { label: status, color: '#22c55e', bg: 'rgb(34 197 94 / 0.12)', border: 'rgb(34 197 94 / 0.25)' }
  }
  if (status === 'atenção' || status === 'Automação com restrições') {
    return { label: status, color: '#f59e0b', bg: 'rgb(245 158 11 / 0.12)', border: 'rgb(245 158 11 / 0.25)' }
  }
  return { label: status, color: '#ef4444', bg: 'rgb(239 68 68 / 0.12)', border: 'rgb(239 68 68 / 0.25)' }
}

interface ChipTone {
  label: string
  color: string
  bg: string
  border: string
}

function StatusPill({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 10px',
      borderRadius: 999,
      background: tone.bg,
      border: `1px solid ${tone.border}`,
      color: tone.color,
      fontSize: 11,
      fontWeight: 700,
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function SummaryCard({
  eyebrow,
  title,
  value,
  helper,
  icon,
  tone,
}: {
  eyebrow: string
  title: string
  value: string
  helper: string
  icon: ReactNode
  tone?: ChipTone | null
}) {
  return (
    <div style={{
      background: '#0f1923',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      minHeight: 180,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>{eyebrow}</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#8899aa', marginTop: 4 }}>{title}</p>
        </div>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.06)',
          background: '#0d1520',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8899aa',
          flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      <div style={{ marginTop: 'auto' }}>
        <p style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.05, color: '#e2e8f0' }}>{value}</p>
        <p style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.5, marginTop: 8 }}>{helper}</p>
        {tone ? (
          <div style={{ marginTop: 12 }}>
            <StatusPill label={tone.label} tone={tone} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function EtoCalibrationPanel({ rows, loading }: { rows: WeatherData[]; loading: boolean }) {
  // Filtra apenas linhas com eto_plugfield_mm preenchido (dados do Plugfield)
  const calibRows = rows.filter(r => r.eto_plugfield_mm != null && r.eto_mm != null)

  const avg = calibRows.length > 0
    ? calibRows.reduce((acc, r) => acc + (r.eto_mm! - r.eto_plugfield_mm!), 0) / calibRows.length
    : null

  function rowColor(diff: number): string {
    const abs = Math.abs(diff)
    if (abs < 0.5) return '#22c55e'
    if (abs < 1.5) return '#f59e0b'
    return '#ef4444'
  }

  function rowBg(diff: number): string {
    const abs = Math.abs(diff)
    if (abs < 0.5) return 'rgb(34 197 94 / 0.06)'
    if (abs < 1.5) return 'rgb(245 158 11 / 0.06)'
    return 'rgb(239 68 68 / 0.06)'
  }

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(245,158,11,0.20)', borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Comparativo ETo — Calibração</p>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#f59e0b', background: 'rgb(245 158 11 / 0.12)', border: '1px solid rgb(245 158 11 / 0.25)',
              borderRadius: 6, padding: '3px 7px', lineHeight: 1,
            }}>SUPER ADMIN</span>
          </div>
          <p style={{ fontSize: 12, color: '#8899aa', marginTop: 4 }}>
            ETo FAO-56 com Rs NASA vs valor bruto Plugfield — últimos 30 dias
          </p>
        </div>
        {avg !== null && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#778899' }}>Diferença média</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: avg >= 0 ? '#22c55e' : '#ef4444', marginTop: 4 }}>
              {avg >= 0 ? '+' : ''}{avg.toFixed(2)} mm
            </p>
            <p style={{ fontSize: 11, color: '#778899', marginTop: 2 }}>{calibRows.length} dias com dados Plugfield</p>
          </div>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: '#8899aa', padding: '24px 0', textAlign: 'center' }}>Carregando histórico...</p>
      ) : calibRows.length === 0 ? (
        <div style={{ borderRadius: 14, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', padding: 16 }}>
          <p style={{ fontSize: 13, color: '#8899aa' }}>
            Sem dados de calibração disponíveis. O campo <code style={{ color: '#f59e0b', fontSize: 12 }}>eto_plugfield_mm</code> será preenchido após o próximo ciclo do cron com dados Plugfield.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Data', 'Rs fonte', 'ETo FAO-56 (nosso)', 'ETo Plugfield', 'Diferença (mm)', 'Diferença (%)'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#778899', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calibRows.map(row => {
                const diff = row.eto_mm! - row.eto_plugfield_mm!
                const diffPct = row.eto_plugfield_mm! !== 0 ? (diff / row.eto_plugfield_mm!) * 100 : 0
                const color = rowColor(diff)
                return (
                  <tr key={row.id} style={{ background: rowBg(diff), borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 12px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                      {new Date(row.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      {row.rs_source === 'nasa' ? (
                        <span style={{ color: '#0093D0', fontWeight: 600 }}>NASA</span>
                      ) : row.rs_source === 'plugfield_fallback' ? (
                        <span style={{ color: '#8899aa' }}>Plugfield</span>
                      ) : (
                        <span style={{ color: '#778899' }}>{row.rs_source ?? '—'}</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                      {row.eto_mm!.toFixed(2)} mm
                    </td>
                    <td style={{ padding: '8px 12px', color: '#8899aa', fontVariantNumeric: 'tabular-nums' }}>
                      {row.eto_plugfield_mm!.toFixed(2)} mm
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 12px', color, fontVariantNumeric: 'tabular-nums' }}>
                      {diff >= 0 ? '+' : ''}{diffPct.toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {avg !== null && (
              <tfoot>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                  <td colSpan={4} style={{ padding: '8px 12px', color: '#8899aa', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Média do período
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 800, color: avg >= 0 ? '#22c55e' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                    {avg >= 0 ? '+' : ''}{avg.toFixed(2)}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#8899aa' }}>—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

export default function PivotDiagnosticsPage() {
  const { company, user, loading: authLoading } = useAuth()
  const [summaries, setSummaries] = useState<PivotDiagnosticSummary[]>([])
  const [selectedPivotId, setSelectedPivotId] = useState('')
  const [diagnostic, setDiagnostic] = useState<PivotDiagnostic | null>(null)
  const [loading, setLoading] = useState(true)
  const [diagnosticLoading, setDiagnosticLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [etoHistory, setEtoHistory] = useState<WeatherData[]>([])
  const [etoHistoryLoading, setEtoHistoryLoading] = useState(false)

  const [superAdmin, setSuperAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/auth/is-super-admin')
      .then(r => r.json())
      .then((d: { superAdmin: boolean }) => setSuperAdmin(d.superAdmin))
      .catch(() => setSuperAdmin(false))
  }, [])

  useEffect(() => {
    if (authLoading) return
    const companyId = company?.id
    if (!companyId) {
      setSummaries([])
      setSelectedPivotId('')
      setDiagnostic(null)
      setLoading(false)
      setError('Nenhuma empresa ativa encontrada')
      return
    }
    const activeCompanyId = companyId

    let cancelled = false

    async function loadSummaries() {
      try {
        setLoading(true)
        setError(null)
        const data = await listPivotDiagnosticSummaries(activeCompanyId)
        if (cancelled) return
        setSummaries(data)
        setSelectedPivotId((current) => current || data[0]?.pivotId || '')
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar pivôs para diagnóstico')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSummaries()
    return () => { cancelled = true }
  }, [authLoading, company?.id])

  useEffect(() => {
    const companyId = company?.id
    if (!companyId || !selectedPivotId) {
      setDiagnostic(null)
      return
    }
    const activeCompanyId = companyId

    let cancelled = false

    async function loadDiagnostic() {
      try {
        setDiagnosticLoading(true)
        setError(null)
        const data = await getPivotDiagnostic(activeCompanyId, selectedPivotId)
        if (!cancelled) setDiagnostic(data)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar diagnóstico do pivô')
          setDiagnostic(null)
        }
      } finally {
        if (!cancelled) setDiagnosticLoading(false)
      }
    }

    loadDiagnostic()
    return () => { cancelled = true }
  }, [company?.id, selectedPivotId])

  // Super admin: carrega histórico de weather_data para comparativo ETo
  const etoStationId = diagnostic?.preferredStation?.id ?? diagnostic?.farmStations[0]?.id ?? null

  useEffect(() => {
    if (!superAdmin || !etoStationId) {
      setEtoHistory([])
      return
    }

    let cancelled = false

    async function loadEtoHistory() {
      setEtoHistoryLoading(true)
      try {
        const data = await listWeatherDataByStation(etoStationId!, 30)
        if (!cancelled) setEtoHistory(data)
      } catch {
        if (!cancelled) setEtoHistory([])
      } finally {
        if (!cancelled) setEtoHistoryLoading(false)
      }
    }

    loadEtoHistory()
    return () => { cancelled = true }
  }, [superAdmin, etoStationId])

  const selectedSummary = useMemo(
    () => summaries.find((item) => item.pivotId === selectedPivotId) ?? null,
    [selectedPivotId, summaries]
  )

  const statusTone = diagnostic ? getStatusConfig(diagnostic.status) : null
  const automationTone = diagnostic ? getStatusConfig(diagnostic.automationStatus) : null

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px 32px' }}>
      <div style={{
        background: 'linear-gradient(135deg, #0f1923 0%, #0d1520 60%, #1b2c1e 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 24,
        padding: '24px 24px 22px',
        marginBottom: 20,
      }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8899aa' }}>
          Diagnóstico operacional
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
          <div style={{ maxWidth: 760 }}>
            <h1 style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 800, color: '#e2e8f0' }}>
              Centro operacional do pivô em campo.
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#8899aa', marginTop: 10 }}>
              Visualize rapidamente clima, ETo, chuva, safra ativa, prontidão da automação e lacunas operacionais do pivô selecionado.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 140, padding: '14px 16px', borderRadius: 16, background: 'rgb(255 255 255 / 0.04)', border: '1px solid rgb(255 255 255 / 0.08)' }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8899aa' }}>Pivôs</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0', marginTop: 6 }}>{summaries.length}</p>
            </div>
            <div style={{ minWidth: 220, padding: '14px 16px', borderRadius: 16, background: 'rgb(255 255 255 / 0.04)', border: '1px solid rgb(255 255 255 / 0.08)' }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8899aa' }}>Selecionado</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0', marginTop: 6, lineHeight: 1.1 }}>{selectedSummary?.pivotName ?? '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          borderRadius: 14,
          border: '1px solid rgb(239 68 68 / 0.25)',
          background: 'rgb(239 68 68 / 0.08)',
          padding: '12px 14px',
          marginBottom: 18,
          color: '#fca5a5',
        }}>
          <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 13, lineHeight: 1.5 }}>{error}</p>
        </div>
      ) : null}

      <div style={{
        background: '#0f1923',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: 20,
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto auto',
        gap: 16,
        alignItems: 'end',
        marginBottom: 20,
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8899aa', marginBottom: 6 }}>Selecionar pivô</label>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedPivotId}
              onChange={(e) => setSelectedPivotId(e.currentTarget.value)}
              disabled={loading || summaries.length === 0}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 14,
                background: '#0d1520',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                outline: 'none',
              }}
            >
              {summaries.length > 0 ? summaries.map((item) => (
                <option key={item.pivotId} value={item.pivotId}>
                  {item.pivotName} · {item.farmName}
                </option>
              )) : <option value="">Nenhum pivô disponível</option>}
            </select>
          </div>
        </div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Fazenda</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginTop: 6 }}>{selectedSummary?.farmName ?? '—'}</p>
        </div>
        {statusTone ? <StatusPill label={statusTone.label} tone={statusTone} /> : null}
      </div>

      {loading || diagnosticLoading ? (
        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '64px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#8899aa' }}>Carregando diagnóstico do pivô...</p>
        </div>
      ) : !diagnostic ? (
        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '64px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#8899aa' }}>Selecione um pivô para visualizar o diagnóstico.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            background: '#0f1923',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16,
            padding: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Resumo operacional de hoje</p>
                <p style={{ fontSize: 12, color: '#8899aa', marginTop: 4 }}>Leitura rápida para decisão de manejo no pivô selecionado</p>
              </div>
              <StatusPill label={statusTone?.label ?? diagnostic.status} tone={statusTone ?? getStatusConfig(diagnostic.status)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
              <SummaryCard
                eyebrow="Clima / ETo"
                title="ETo mais recente"
                value={diagnostic.etoValue != null ? `${formatNumber(diagnostic.etoValue, 2)} mm` : 'Sem ETo'}
                helper={[
                  getEtoSourceLabel(diagnostic.etoSource),
                  diagnostic.etoConfidence ? `confiança ${diagnostic.etoConfidence}` : null,
                  diagnostic.lastManagement?.date ? formatDate(diagnostic.lastManagement.date) : null,
                ].filter(Boolean).join(' · ') || 'Sem referência disponível'}
                icon={<Thermometer size={18} />}
                tone={diagnostic.etoValue != null ? getStatusConfig('OK') : getStatusConfig('sem dados')}
              />
              <SummaryCard
                eyebrow="Chuva"
                title="Leitura de precipitação"
                value={diagnostic.rainfallValue != null ? `${formatNumber(diagnostic.rainfallValue, 1)} mm` : 'Sem chuva'}
                helper={[
                  getRainfallSourceLabel(diagnostic.rainfallSource),
                  diagnostic.rainfallDate ? formatDate(diagnostic.rainfallDate) : null,
                ].filter(Boolean).join(' · ') || 'Sem referência disponível'}
                icon={<BellRing size={18} />}
                tone={diagnostic.rainfallValue != null ? getStatusConfig('OK') : getStatusConfig('sem dados')}
              />
              <SummaryCard
                eyebrow="Manejo"
                title="Último registro salvo"
                value={
                  diagnostic.lastManagement?.recommended_depth_mm != null
                    ? `Rec. ${formatNumber(diagnostic.lastManagement.recommended_depth_mm, 1)} mm`
                    : 'Sem registro'
                }
                helper={
                  diagnostic.lastManagement
                    ? [
                        diagnostic.lastManagement.actual_depth_mm != null
                          ? `Real ${formatNumber(diagnostic.lastManagement.actual_depth_mm, 1)} mm`
                          : 'Real sem registro',
                        formatDate(diagnostic.lastManagement.date),
                      ].join(' · ')
                    : 'Sem manejo salvo recente'
                }
                icon={<Sprout size={18} />}
                tone={diagnostic.lastManagement ? getStatusConfig('OK') : getStatusConfig('sem dados')}
              />
              <SummaryCard
                eyebrow="Fonte climática"
                title="Rota ativa hoje"
                value={diagnostic.climateRouteLabel}
                helper={
                  diagnostic.preferredStation?.name
                    ? `Preferencial: ${diagnostic.preferredStation.name}`
                    : diagnostic.farmStations[0]?.name
                      ? `Fazenda: ${diagnostic.farmStations[0].name}`
                      : 'Fallback manual/local'
                }
                icon={<Orbit size={18} />}
                tone={diagnostic.climateRoute === 'manual' ? getStatusConfig('atenção') : getStatusConfig('OK')}
              />
              <SummaryCard
                eyebrow="Leitura geral"
                title="Situação atual"
                value={diagnostic.status}
                helper={diagnostic.alerts.length > 0 ? `${diagnostic.alerts.length} alerta(s) ativo(s)` : 'Sem alertas operacionais'}
                icon={<AlertCircle size={18} />}
                tone={statusTone}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Automação do manejo diário</p>
                  <p style={{ fontSize: 12, color: '#8899aa', marginTop: 4 }}>Prontidão atual para geração operacional do manejo</p>
                </div>
                <StatusPill label={automationTone?.label ?? diagnostic.automationStatus} tone={automationTone ?? getStatusConfig(diagnostic.automationStatus)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', background: '#0d1520', padding: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Status da automação</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginTop: 10 }}>{diagnostic.automationStatus}</p>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: '#8899aa', marginTop: 8 }}>
                    {diagnostic.hasManagementToday ? 'O pivô já possui manejo salvo para hoje.' : diagnostic.automationReason ?? 'Sem motivo adicional registrado.'}
                  </p>
                </div>
                <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', background: '#0d1520', padding: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Ação sugerida</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginTop: 10 }}>{diagnostic.suggestedAction}</p>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: '#8899aa', marginTop: 8 }}>
                    {diagnostic.automationReason ?? 'O pivô tem contexto suficiente para seguir com a operação.'}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Contexto do pivô</p>
                  <p style={{ fontSize: 12, color: '#8899aa', marginTop: 4 }}>Identificação, safra e vínculos principais</p>
                </div>
                <StatusPill label="contexto" tone={{ label: 'contexto', color: '#06b6d4', bg: 'rgb(6 182 212 / 0.12)', border: 'rgb(6 182 212 / 0.25)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', background: '#0d1520', padding: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Pivô</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginTop: 10 }}>{diagnostic.pivot.name}</p>
                  <p style={{ fontSize: 13, color: '#8899aa', marginTop: 6 }}>{diagnostic.farm.name}</p>
                </div>
                <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', background: '#0d1520', padding: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Coordenadas</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginTop: 10 }}>
                    {diagnostic.pivot.latitude != null && diagnostic.pivot.longitude != null
                      ? `${formatNumber(diagnostic.pivot.latitude, 6)}, ${formatNumber(diagnostic.pivot.longitude, 6)}`
                      : 'Sem coordenadas'}
                  </p>
                  <p style={{ fontSize: 13, color: '#8899aa', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={12} /> {diagnostic.pivot.latitude != null && diagnostic.pivot.longitude != null ? 'Geolocalização disponível' : 'Necessária para fallback climático'}
                  </p>
                </div>
                <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', background: '#0d1520', padding: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Safra ativa</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginTop: 10 }}>{diagnostic.activeSeason?.name ?? 'Sem safra ativa'}</p>
                  <p style={{ fontSize: 13, color: '#8899aa', marginTop: 6 }}>
                    {diagnostic.activeSeason?.planting_date ? `Plantio: ${formatDate(diagnostic.activeSeason.planting_date)}` : 'Sem data de plantio'}
                  </p>
                </div>
                <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', background: '#0d1520', padding: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#778899' }}>Cultura</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginTop: 10 }}>{diagnostic.crop?.name ?? 'Sem cultura vinculada'}</p>
                  <p style={{ fontSize: 13, color: '#8899aa', marginTop: 6 }}>
                    {diagnostic.preferredStation?.name
                      ? `Estação preferencial: ${diagnostic.preferredStation.name}`
                      : diagnostic.farmStations[0]?.name
                        ? `Estação da fazenda: ${diagnostic.farmStations[0].name}`
                        : 'Sem estação associada'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Alertas e diagnóstico</p>
                <p style={{ fontSize: 12, color: '#8899aa', marginTop: 4 }}>Lacunas operacionais que afetam leitura e automação</p>
              </div>
              <StatusPill label={diagnostic.alerts.length > 0 ? `${diagnostic.alerts.length} alerta(s)` : 'sem alertas'} tone={diagnostic.alerts.length > 0 ? getStatusConfig('atenção') : getStatusConfig('OK')} />
            </div>
            {diagnostic.alerts.length === 0 ? (
              <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', background: '#0d1520', padding: 16 }}>
                <p style={{ fontSize: 14, color: '#8899aa' }}>Sem alertas operacionais para o pivô selecionado.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {diagnostic.alerts.map((alert) => {
                  const tone = alert.toLowerCase().includes('sem') ? getStatusConfig('sem dados') : getStatusConfig('atenção')
                  return (
                    <div key={alert} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', background: '#0d1520', padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.5 }}>{alert}</p>
                        <StatusPill label={tone.label} tone={tone} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {superAdmin && (
            <EtoCalibrationPanel rows={etoHistory} loading={etoHistoryLoading} />
          )}
        </div>
      )}
    </div>
  )
}

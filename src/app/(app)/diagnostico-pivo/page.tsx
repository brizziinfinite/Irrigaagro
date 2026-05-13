'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  CloudRain,
  Cpu,
  MapPin,
  Orbit,
  Play,
  Sprout,
  Thermometer,
  XCircle,
  Zap,
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

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
}

function formatDateRelative(value: string): string {
  const today = new Date()
  const d = new Date(`${value}T12:00:00`)
  const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'hoje'
  if (diffDays === 1) return 'ontem'
  if (diffDays <= 7) return `há ${diffDays} dias`
  return formatDate(value)
}

function formatNumber(value: number, decimals = 1): string {
  return value.toFixed(decimals).replace('.', ',')
}

function getNowLabel(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function getEtoSourceLabel(source: string | null): string {
  if (!source) return 'Origem desconhecida'
  switch (source) {
    case 'weather_corrected':   return 'Estação — corrigida FAO-56'
    case 'weather_raw':         return 'Estação — leitura bruta'
    case 'calculated_penman_monteith': return 'NASA POWER — Penman-Monteith'
    case 'manual':              return 'Entrada manual'
    default:                    return source  // passa a string diretamente (ex: "Plugfield FAO-56")
  }
}

function getRainfallSourceLabel(source: string): string {
  switch (source) {
    case 'rainfall_records': return 'Registro de chuva'
    case 'weather_data':     return 'Estação climática'
    case 'geolocalização do pivô': return 'Geolocalização do pivô'
    default:                 return 'Sem registro hoje'
  }
}

// ─── Tons de status ──────────────────────────────────────────────────────────

type ToneKey = 'ok' | 'warning' | 'critical' | 'info' | 'nodata'

interface Tone {
  label: string
  color: string
  bg: string
  border: string
  icon: ReactNode
}

function getTone(key: ToneKey, label?: string): Tone {
  const TONES: Record<ToneKey, Omit<Tone, 'label' | 'icon'> & { defaultLabel: string; defaultIcon: ReactNode }> = {
    ok:       { defaultLabel: 'OK',       color: '#22c55e', bg: 'rgb(34 197 94 / 0.12)',   border: 'rgb(34 197 94 / 0.25)',   defaultIcon: <CheckCircle2 size={13} /> },
    warning:  { defaultLabel: 'Atenção',  color: '#f59e0b', bg: 'rgb(245 158 11 / 0.12)',  border: 'rgb(245 158 11 / 0.25)',  defaultIcon: <AlertTriangle size={13} /> },
    critical: { defaultLabel: 'Crítico',  color: '#ef4444', bg: 'rgb(239 68 68 / 0.12)',   border: 'rgb(239 68 68 / 0.25)',   defaultIcon: <XCircle size={13} /> },
    info:     { defaultLabel: 'Info',     color: '#06b6d4', bg: 'rgb(6 182 212 / 0.12)',   border: 'rgb(6 182 212 / 0.25)',   defaultIcon: <AlertCircle size={13} /> },
    nodata:   { defaultLabel: 'Sem dado', color: 'var(--color-text-secondary)', bg: 'rgb(119 136 153 / 0.10)', border: 'rgb(119 136 153 / 0.20)', defaultIcon: <AlertCircle size={13} /> },
  }
  const t = TONES[key]
  return { label: label ?? t.defaultLabel, color: t.color, bg: t.bg, border: t.border, icon: t.defaultIcon }
}

function statusToneFromDiagnostic(status: PivotDiagnostic['status']): Tone {
  if (status === 'OK')       return getTone('ok', 'OK')
  if (status === 'atenção')  return getTone('warning', 'Atenção')
  return getTone('nodata', 'Sem dados')
}

function automationToneFromDiagnostic(s: PivotDiagnostic['automationStatus']): Tone {
  if (s === 'Automação pronta' || s === 'Manejo do dia já gerado') return getTone('ok', s)
  if (s === 'Automação com restrições')                             return getTone('warning', s)
  return getTone('critical', s)
}

// ─── Componentes base ────────────────────────────────────────────────────────

function Pill({ tone, size = 'md' }: { tone: Tone; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? '8px 10px' : '6px 12px'
  const fs = size === 'sm' ? 11 : 12
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: px, borderRadius: 999,
      background: tone.bg, border: `1px solid ${tone.border}`,
      color: tone.color, fontSize: fs, fontWeight: 700,
      lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {tone.icon}
      {tone.label}
    </span>
  )
}

function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{children}</p>
      {sub && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--color-surface-border2)' }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight ? 'var(--color-text)' : '#c0ccd8' }}>{value}</span>
    </div>
  )
}

// ─── Card de métrica ─────────────────────────────────────────────────────────

interface MetricCardProps {
  eyebrow: string
  value: string
  interpretation: string
  icon: ReactNode
  tone: Tone
  sub?: string
  accent?: boolean
}

function MetricCard({ eyebrow, value, interpretation, icon, tone, sub, accent }: MetricCardProps) {
  return (
    <div style={{
      background: accent ? `linear-gradient(135deg, ${tone.bg} 0%, var(--color-surface-card) 60%)` : 'var(--color-surface-card)',
      border: `1px solid ${accent ? tone.border : 'var(--color-surface-border2)'}`,
      borderRadius: 16,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>{eyebrow}</p>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: tone.bg, border: `1px solid ${tone.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: tone.color, flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      <div>
        <p style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>{value}</p>
        <p style={{ fontSize: 12, color: tone.color, fontWeight: 600, marginTop: 6, lineHeight: 1.4 }}>{interpretation}</p>
        {sub && <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{sub}</p>}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        <Pill tone={tone} size="sm" />
      </div>
    </div>
  )
}

// ─── Interpretações de métricas ───────────────────────────────────────────────

function interpretEto(value: number | null): { text: string; tone: Tone } {
  if (value == null) return { text: 'Sem leitura disponível — automação limitada', tone: getTone('nodata') }
  if (value < 2)    return { text: 'Evapotranspiração baixa — plantas com baixa demanda hídrica', tone: getTone('ok', 'Baixa') }
  if (value < 5)    return { text: 'Evapotranspiração normal — condições típicas de irrigação', tone: getTone('ok', 'Normal') }
  if (value < 7)    return { text: 'Evapotranspiração elevada — monitorar estresse hídrico', tone: getTone('warning', 'Elevada') }
  return { text: 'Evapotranspiração muito alta — irrigar com prioridade', tone: getTone('critical', 'Crítica') }
}

function interpretRainfall(value: number | null): { text: string; tone: Tone } {
  if (value == null || value === 0) return { text: 'Nenhuma precipitação registrada hoje', tone: getTone('nodata', 'Sem chuva') }
  if (value < 5)   return { text: 'Chuva insignificante — não computa no balanço hídrico', tone: getTone('warning', 'Insignificante') }
  if (value < 15)  return { text: 'Chuva leve — pode reduzir necessidade de irrigação', tone: getTone('ok', 'Leve') }
  if (value < 30)  return { text: 'Chuva moderada — descanso de 24-48h recomendado', tone: getTone('ok', 'Moderada') }
  return { text: 'Chuva intensa — verificar drenagem e suspender irrigação', tone: getTone('info', 'Intensa') }
}

function interpretManagement(d: PivotDiagnostic): { text: string; tone: Tone } {
  if (!d.lastManagement) return { text: 'Sem histórico de manejo — cálculo de balanço hídrico indisponível', tone: getTone('critical') }
  const lm = d.lastManagement
  if (d.hasManagementToday) {
    const rec = lm.recommended_depth_mm ?? 0
    const real = lm.actual_depth_mm ?? 0
    if (Math.abs(rec - real) < 2) return { text: 'Irrigação do dia aplicada conforme recomendado', tone: getTone('ok', 'Em dia') }
    if (real > rec) return { text: `Aplicação acima do recomendado em ${formatNumber(real - rec, 1)} mm`, tone: getTone('warning', 'Acima') }
    return { text: `Déficit de ${formatNumber(rec - real, 1)} mm em relação ao recomendado`, tone: getTone('warning', 'Déficit') }
  }
  return { text: `Último registro ${formatDateRelative(lm.date)} — manejo hoje ainda não gerado`, tone: getTone('warning', 'Pendente') }
}

// ─── Botão de ação principal ──────────────────────────────────────────────────

interface ActionButtonProps {
  label: string
  sub?: string
  onClick?: () => void
  disabled?: boolean
  tone: Tone
  icon?: ReactNode
  loading?: boolean
}

function ActionButton({ label, sub, onClick, disabled, tone, icon, loading }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: '100%',
        padding: '14px 18px',
        borderRadius: 14,
        border: `1px solid ${disabled ? 'var(--color-surface-border2)' : tone.border}`,
        background: disabled ? 'var(--color-surface-sidebar)' : tone.bg,
        color: disabled ? 'var(--color-text-muted)' : tone.color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        transition: 'opacity 0.15s',
        opacity: loading ? 0.7 : 1,
        minHeight: 56,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: disabled ? 'var(--color-surface-border2)' : `${tone.color}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: disabled ? 'var(--color-text-muted)' : tone.color,
      }}>
        {loading ? <span style={{ fontSize: 12 }}>...</span> : (icon ?? <Play size={16} />)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{loading ? 'Processando...' : label}</p>
        {sub && <p style={{ fontSize: 12, color: disabled ? '#445566' : 'var(--color-text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{sub}</p>}
      </div>
      {!disabled && <ChevronRight size={16} style={{ flexShrink: 0, color: 'var(--color-text-secondary)' }} />}
    </button>
  )
}

// ─── Alerta card ──────────────────────────────────────────────────────────────

function AlertCard({ text }: { text: string }) {
  // Interpreta severidade pelo texto
  const isCritical = text.toLowerCase().includes('sem safra') || text.toLowerCase().includes('sem cultura') || text.toLowerCase().includes('sem coordenada') || text.toLowerCase().includes('sem estação')
  const tone = isCritical ? getTone('critical') : getTone('warning')

  // Traduz alertas técnicos para linguagem humana
  function humanize(t: string): { title: string; action: string } {
    if (t.includes('sem safra') || t.includes('Sem safra')) return { title: 'Nenhuma safra ativa cadastrada', action: 'Crie uma safra para este pivô antes de gerar manejo' }
    if (t.includes('sem cultura') || t.includes('Sem cultura')) return { title: 'Cultura não vinculada à safra', action: 'Selecione a cultura na safra ativa para calcular Kc correto' }
    if (t.includes('sem coordenada') || t.toLowerCase().includes('coordenad')) return { title: 'Coordenadas do pivô não cadastradas', action: 'Cadastre latitude e longitude para usar fallback climático via NASA' }
    if (t.toLowerCase().includes('estação') && t.toLowerCase().includes('sem')) return { title: 'Sem estação climática associada', action: 'Vincule uma estação ao pivô ou à fazenda para ETo mais preciso' }
    if (t.toLowerCase().includes('eto') && t.toLowerCase().includes('sem')) return { title: 'ETo indisponível para hoje', action: 'Verifique a estação climática ou os dados NASA POWER' }
    if (t.toLowerCase().includes('manejo')) return { title: 'Manejo não gerado hoje', action: 'Execute a automação ou registre manejo manualmente' }
    return { title: t, action: 'Verifique e corrija para restaurar funcionamento completo' }
  }

  const { title, action } = humanize(text)

  return (
    <div style={{
      borderRadius: 14, border: `1px solid ${tone.border}`,
      background: tone.bg, padding: '14px 16px',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{ color: tone.color, flexShrink: 0, marginTop: 1 }}>
        {isCritical ? <XCircle size={16} /> : <AlertTriangle size={16} />}
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.4 }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{action}</p>
      </div>
    </div>
  )
}

// ─── Painel de calibração ETo (super admin) ───────────────────────────────────

function EtoCalibrationPanel({ rows, loading }: { rows: WeatherData[]; loading: boolean }) {
  const calibRows = rows.filter(r => r.eto_plugfield_mm != null && r.eto_mm != null)
  const avg = calibRows.length > 0
    ? calibRows.reduce((acc, r) => acc + (r.eto_mm! - r.eto_plugfield_mm!), 0) / calibRows.length
    : null

  function rowColor(diff: number) {
    const abs = Math.abs(diff)
    if (abs < 0.5) return '#22c55e'
    if (abs < 1.5) return '#f59e0b'
    return '#ef4444'
  }
  function rowBg(diff: number) {
    const abs = Math.abs(diff)
    if (abs < 0.5) return 'rgb(34 197 94 / 0.06)'
    if (abs < 1.5) return 'rgb(245 158 11 / 0.06)'
    return 'rgb(239 68 68 / 0.06)'
  }

  return (
    <div style={{ background: 'var(--color-surface-card)', border: '1px solid rgba(245,158,11,0.20)', borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Comparativo ETo — Calibração</p>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#f59e0b', background: 'rgb(245 158 11 / 0.12)', border: '1px solid rgb(245 158 11 / 0.25)',
              borderRadius: 6, padding: '3px 7px', lineHeight: 1,
            }}>SUPER ADMIN</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>ETo FAO-56 com Rs NASA vs valor bruto Plugfield — últimos 30 dias</p>
        </div>
        {avg !== null && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>Diferença média</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: avg >= 0 ? '#22c55e' : '#ef4444', marginTop: 4 }}>
              {avg >= 0 ? '+' : ''}{avg.toFixed(2)} mm
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{calibRows.length} dias com dados Plugfield</p>
          </div>
        )}
      </div>
      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '24px 0', textAlign: 'center' }}>Carregando histórico...</p>
      ) : calibRows.length === 0 ? (
        <div style={{ borderRadius: 14, background: 'var(--color-surface-sidebar)', border: '1px solid var(--color-surface-border2)', padding: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Sem dados de calibração. <code style={{ color: '#f59e0b', fontSize: 12 }}>eto_plugfield_mm</code> será preenchido após o próximo ciclo do cron.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                {['Data', 'Rs fonte', 'ETo FAO-56 (nosso)', 'ETo Plugfield', 'Diferença (mm)', 'Diferença (%)'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calibRows.map(row => {
                const diff = row.eto_mm! - row.eto_plugfield_mm!
                const diffPct = row.eto_plugfield_mm! !== 0 ? (diff / row.eto_plugfield_mm!) * 100 : 0
                const color = rowColor(diff)
                return (
                  <tr key={row.id} style={{ background: rowBg(diff), borderBottom: '1px solid var(--color-surface-border2)' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{new Date(row.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      {row.rs_source === 'nasa' ? <span style={{ color: '#0093D0', fontWeight: 600 }}>NASA</span>
                        : row.rs_source === 'plugfield_fallback' ? <span style={{ color: 'var(--color-text-secondary)' }}>Plugfield</span>
                        : <span style={{ color: 'var(--color-text-secondary)' }}>{row.rs_source ?? '—'}</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>{row.eto_mm!.toFixed(2)} mm</td>
                    <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{row.eto_plugfield_mm!.toFixed(2)} mm</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)}</td>
                    <td style={{ padding: '8px 12px', color, fontVariantNumeric: 'tabular-nums' }}>{diff >= 0 ? '+' : ''}{diffPct.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
            {avg !== null && (
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--color-surface-border)', background: 'rgba(255,255,255,0.02)' }}>
                  <td colSpan={4} style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Média do período</td>
                  <td style={{ padding: '8px 12px', fontWeight: 800, color: avg >= 0 ? '#22c55e' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{avg >= 0 ? '+' : ''}{avg.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PivotDiagnosticsPage() {
  const { company, loading: authLoading } = useAuth()
  const [summaries, setSummaries] = useState<PivotDiagnosticSummary[]>([])
  const [selectedPivotId, setSelectedPivotId] = useState('')
  const [diagnostic, setDiagnostic] = useState<PivotDiagnostic | null>(null)
  const [loading, setLoading] = useState(true)
  const [diagnosticLoading, setDiagnosticLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [etoHistory, setEtoHistory] = useState<WeatherData[]>([])
  const [etoHistoryLoading, setEtoHistoryLoading] = useState(false)
  const [superAdmin, setSuperAdmin] = useState(false)
  const [nowLabel, setNowLabel] = useState('')
  const [generatingManagement, setGeneratingManagement] = useState(false)

  useEffect(() => { setNowLabel(getNowLabel()) }, [])

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
    let cancelled = false
    async function loadSummaries() {
      try {
        setLoading(true)
        setError(null)
        const data = await listPivotDiagnosticSummaries(companyId!)
        if (cancelled) return
        setSummaries(data)
        setSelectedPivotId((cur) => cur || data[0]?.pivotId || '')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar pivôs')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadSummaries()
    return () => { cancelled = true }
  }, [authLoading, company?.id])

  useEffect(() => {
    const companyId = company?.id
    if (!companyId || !selectedPivotId) { setDiagnostic(null); return }
    let cancelled = false
    async function loadDiagnostic() {
      try {
        setDiagnosticLoading(true)
        setError(null)
        const data = await getPivotDiagnostic(companyId!, selectedPivotId)
        if (!cancelled) setDiagnostic(data)
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Falha ao carregar diagnóstico'); setDiagnostic(null) }
      } finally {
        if (!cancelled) setDiagnosticLoading(false)
      }
    }
    loadDiagnostic()
    return () => { cancelled = true }
  }, [company?.id, selectedPivotId])

  const etoStationId = diagnostic?.preferredStation?.id ?? diagnostic?.farmStations[0]?.id ?? null

  useEffect(() => {
    if (!superAdmin || !etoStationId) { setEtoHistory([]); return }
    let cancelled = false
    async function load() {
      setEtoHistoryLoading(true)
      try {
        const data = await listWeatherDataByStation(etoStationId!, 30)
        if (!cancelled) setEtoHistory(data)
      } catch { if (!cancelled) setEtoHistory([]) }
      finally { if (!cancelled) setEtoHistoryLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [superAdmin, etoStationId])

  const statusTone = useMemo(
    () => diagnostic ? statusToneFromDiagnostic(diagnostic.status) : null,
    [diagnostic]
  )
  const automationTone = useMemo(
    () => diagnostic ? automationToneFromDiagnostic(diagnostic.automationStatus) : null,
    [diagnostic]
  )

  const etoInterpret   = useMemo(() => interpretEto(diagnostic?.etoValue ?? null), [diagnostic])
  const rainInterpret  = useMemo(() => interpretRainfall(diagnostic?.rainfallValue ?? null), [diagnostic])
  const mngmInterpret  = useMemo(() => interpretManagement(diagnostic ?? { lastManagement: null, hasManagementToday: false } as unknown as PivotDiagnostic), [diagnostic])

  const canGenerateManagement = useMemo(() =>
    diagnostic?.automationStatus === 'Automação pronta' && !diagnostic.hasManagementToday,
    [diagnostic]
  )

  async function handleGenerateManagement() {
    if (!canGenerateManagement || generatingManagement) return
    setGeneratingManagement(true)
    try {
      const res = await fetch('/api/cron/daily-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pivotId: selectedPivotId }),
      })
      if (res.ok) {
        // Recarrega diagnóstico para refletir novo manejo
        const companyId = company?.id
        if (companyId) {
          const data = await getPivotDiagnostic(companyId, selectedPivotId)
          setDiagnostic(data)
        }
      }
    } catch { /* silencioso — não bloqueia a UX */ }
    finally { setGeneratingManagement(false) }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px 40px' }}>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-surface-card) 0%, var(--color-surface-sidebar) 60%, #1b2c1e 100%)',
        border: `1px solid ${statusTone ? statusTone.border : 'var(--color-surface-border2)'}`,
        borderRadius: 24,
        padding: '24px 24px 22px',
        marginBottom: 20,
        transition: 'border-color 0.3s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
            Diagnóstico operacional
          </p>
          {statusTone && <Pill tone={statusTone} size="sm" />}
          {nowLabel && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--color-text-muted)' }}>
              <Clock size={12} /> Atualizado às {nowLabel}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 680 }}>
            <h1 style={{ fontSize: 30, lineHeight: 1.1, fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
              {diagnostic
                ? `${diagnostic.pivot.name} — ${diagnostic.farm.name}`
                : 'Centro operacional do pivô'
              }
            </h1>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              {diagnostic
                ? diagnostic.status === 'OK'
                  ? 'Todos os dados estão completos. O pivô está pronto para automação e manejo diário.'
                  : diagnostic.status === 'atenção'
                    ? `${diagnostic.alerts.length} lacuna(s) operacional detectada(s). Veja os alertas abaixo.`
                    : 'Dados insuficientes para cálculo. Configure os itens em alerta para restaurar o funcionamento.'
                : 'Selecione um pivô para visualizar o diagnóstico operacional completo.'
              }
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 120, padding: '12px 16px', borderRadius: 14, background: 'var(--color-surface-border2)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>Pivôs</p>
              <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text)', marginTop: 4 }}>{summaries.length}</p>
            </div>
            {diagnostic?.activeSeason && (
              <div style={{ minWidth: 180, padding: '12px 16px', borderRadius: 14, background: 'var(--color-surface-border2)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>Safra ativa</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text)', marginTop: 4, lineHeight: 1.2 }}>{diagnostic.activeSeason.name}</p>
                {diagnostic.crop && <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3 }}>{diagnostic.crop.name}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ERRO GLOBAL ────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          borderRadius: 14, border: '1px solid rgb(239 68 68 / 0.25)',
          background: 'rgb(239 68 68 / 0.08)', padding: '12px 14px', marginBottom: 18, color: '#fca5a5',
        }}>
          <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 13, lineHeight: 1.5 }}>{error}</p>
        </div>
      )}

      {/* ── SELETOR DE PIVÔ ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 16,
        padding: 20, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'end', marginBottom: 20,
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Selecionar pivô</label>
          <select
            value={selectedPivotId}
            onChange={(e) => setSelectedPivotId(e.currentTarget.value)}
            disabled={loading || summaries.length === 0}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
              background: 'var(--color-surface-sidebar)', border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text)', outline: 'none',
            }}
          >
            {summaries.length > 0
              ? summaries.map((s) => <option key={s.pivotId} value={s.pivotId}>{s.pivotName} · {s.farmName}</option>)
              : <option value="">Nenhum pivô disponível</option>}
          </select>
        </div>
        {statusTone && <Pill tone={statusTone} />}
      </div>

      {/* ── LOADING / VAZIO ─────────────────────────────────────────────────── */}
      {loading || diagnosticLoading ? (
        <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 16, padding: '64px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Carregando diagnóstico...</p>
        </div>
      ) : !diagnostic ? (
        <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 16, padding: '64px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Selecione um pivô para visualizar o diagnóstico.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── MÉTRICAS DO DIA ─────────────────────────────────────────────── */}
          <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18, alignItems: 'flex-start' }}>
              <SectionTitle sub="Leitura rápida para decisão de manejo hoje">
                Situação atual
              </SectionTitle>
              {statusTone && <Pill tone={statusTone} />}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
              <MetricCard
                eyebrow="Evapotranspiração"
                value={diagnostic.etoValue != null ? `${formatNumber(diagnostic.etoValue, 2)} mm` : '—'}
                interpretation={etoInterpret.text}
                sub={`${getEtoSourceLabel(diagnostic.etoSource)}${diagnostic.etoConfidence ? ` · ${diagnostic.etoConfidence}` : ''}`}
                icon={<Thermometer size={16} />}
                tone={etoInterpret.tone}
                accent={diagnostic.etoValue != null && diagnostic.etoValue >= 5}
              />
              <MetricCard
                eyebrow="Precipitação hoje"
                value={diagnostic.rainfallValue != null && diagnostic.rainfallValue > 0 ? `${formatNumber(diagnostic.rainfallValue, 1)} mm` : '0 mm'}
                interpretation={rainInterpret.text}
                sub={`${getRainfallSourceLabel(diagnostic.rainfallSource)}${diagnostic.rainfallDate ? ` · ${formatDateRelative(diagnostic.rainfallDate)}` : ''}`}
                icon={<CloudRain size={16} />}
                tone={rainInterpret.tone}
              />
              <MetricCard
                eyebrow="Último manejo"
                value={
                  diagnostic.lastManagement?.recommended_depth_mm != null
                    ? `${formatNumber(diagnostic.lastManagement.recommended_depth_mm, 1)} mm`
                    : '—'
                }
                interpretation={mngmInterpret.text}
                sub={diagnostic.lastManagement ? `Real: ${diagnostic.lastManagement.actual_depth_mm != null ? `${formatNumber(diagnostic.lastManagement.actual_depth_mm, 1)} mm` : 'não registrado'} · ${formatDateRelative(diagnostic.lastManagement.date)}` : ''}
                icon={<Sprout size={16} />}
                tone={mngmInterpret.tone}
                accent={diagnostic.hasManagementToday}
              />
              <MetricCard
                eyebrow="Rota climática"
                value={diagnostic.climateRouteLabel}
                interpretation={
                  diagnostic.climateRoute === 'pivot_station' ? 'Dados da estação vinculada ao pivô — alta precisão'
                    : diagnostic.climateRoute === 'farm_station' ? 'Dados da estação da fazenda — boa precisão'
                    : diagnostic.climateRoute === 'pivot_geolocation' ? 'Dados NASA via geolocalização — precisão moderada'
                    : 'Dados manuais ou sem fonte — precisão reduzida'
                }
                sub={
                  diagnostic.preferredStation?.name
                    ? `Estação: ${diagnostic.preferredStation.name}`
                    : diagnostic.farmStations[0]?.name
                      ? `Fazenda: ${diagnostic.farmStations[0].name}`
                      : 'Sem estação — usando fallback'
                }
                icon={<Orbit size={16} />}
                tone={diagnostic.climateRoute === 'manual' ? getTone('warning') : getTone('ok')}
              />
            </div>
          </div>

          {/* ── AUTOMAÇÃO + CONTEXTO ─────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

            {/* Automação */}
            <div style={{
              background: 'var(--color-surface-card)',
              border: `1px solid ${automationTone ? automationTone.border : 'var(--color-surface-border2)'}`,
              borderRadius: 16, padding: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18, alignItems: 'flex-start' }}>
                <SectionTitle sub="Prontidão para geração automática do manejo">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Cpu size={15} style={{ color: '#0093D0' }} />
                    Automação do manejo
                  </span>
                </SectionTitle>
                {automationTone && <Pill tone={automationTone} />}
              </div>

              {/* Status da automação */}
              <div style={{ borderRadius: 14, border: '1px solid var(--color-surface-border2)', background: 'var(--color-surface-sidebar)', padding: 16, marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 8 }}>Status</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: automationTone?.color ?? 'var(--color-text)' }}>{diagnostic.automationStatus}</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                  {diagnostic.hasManagementToday
                    ? 'Manejo de hoje já foi gerado com sucesso.'
                    : diagnostic.automationReason ?? 'Sem detalhes adicionais.'}
                </p>
              </div>

              {/* Botão de ação */}
              <ActionButton
                label={
                  diagnostic.hasManagementToday
                    ? 'Manejo já gerado hoje'
                    : diagnostic.automationStatus === 'Automação pronta'
                      ? 'Gerar manejo agora'
                      : diagnostic.suggestedAction
                }
                sub={
                  diagnostic.hasManagementToday
                    ? 'O cron já processou este pivô hoje'
                    : canGenerateManagement
                      ? 'Calcula balanço hídrico e salva lâmina recomendada'
                      : diagnostic.automationReason ?? undefined
                }
                onClick={canGenerateManagement ? handleGenerateManagement : undefined}
                disabled={!canGenerateManagement}
                loading={generatingManagement}
                tone={canGenerateManagement ? getTone('ok') : automationTone ?? getTone('nodata')}
                icon={canGenerateManagement ? <Zap size={16} /> : diagnostic.hasManagementToday ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              />
            </div>

            {/* Contexto do pivô */}
            <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 16, padding: 20 }}>
              <SectionTitle sub="Identificação, safra e vínculos principais">Contexto do pivô</SectionTitle>
              <div style={{ borderRadius: 14, border: '1px solid var(--color-surface-border2)', background: 'var(--color-surface-sidebar)', padding: '4px 16px' }}>
                <InfoRow label="Pivô" value={diagnostic.pivot.name} highlight />
                <InfoRow label="Fazenda" value={diagnostic.farm.name} />
                <InfoRow
                  label="Coordenadas"
                  value={
                    diagnostic.pivot.latitude != null && diagnostic.pivot.longitude != null
                      ? `${formatNumber(diagnostic.pivot.latitude, 5)}, ${formatNumber(diagnostic.pivot.longitude, 5)}`
                      : 'Não cadastradas'
                  }
                />
                <InfoRow label="Safra ativa" value={diagnostic.activeSeason?.name ?? 'Nenhuma'} highlight={!!diagnostic.activeSeason} />
                <InfoRow label="Plantio" value={diagnostic.activeSeason?.planting_date ? formatDate(diagnostic.activeSeason.planting_date) : '—'} />
                <InfoRow label="Cultura" value={diagnostic.crop?.name ?? 'Sem cultura'} highlight={!!diagnostic.crop} />
                <InfoRow
                  label="Estação climática"
                  value={
                    diagnostic.preferredStation?.name
                      ?? diagnostic.farmStations[0]?.name
                      ?? 'Nenhuma associada'
                  }
                />
                <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={12} style={{ color: 'var(--color-text-secondary)' }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    {diagnostic.pivot.latitude != null ? 'Geolocalização disponível' : 'Cadastre coordenadas para fallback NASA'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── ALERTAS ──────────────────────────────────────────────────────── */}
          <div style={{ background: 'var(--color-surface-card)', border: `1px solid ${diagnostic.alerts.length > 0 ? 'rgba(245,158,11,0.20)' : 'rgba(34,197,94,0.20)'}`, borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: diagnostic.alerts.length > 0 ? 16 : 0, alignItems: 'flex-start' }}>
              <SectionTitle sub={diagnostic.alerts.length > 0 ? 'Corrija as lacunas abaixo para restaurar o funcionamento completo' : 'Todos os dados operacionais estão completos'}>
                {diagnostic.alerts.length > 0
                  ? `${diagnostic.alerts.length} alerta${diagnostic.alerts.length > 1 ? 's' : ''} ativo${diagnostic.alerts.length > 1 ? 's' : ''}`
                  : 'Sem alertas operacionais'
                }
              </SectionTitle>
              <Pill tone={diagnostic.alerts.length > 0 ? getTone('warning', `${diagnostic.alerts.length} alerta${diagnostic.alerts.length > 1 ? 's' : ''}`) : getTone('ok', 'Tudo OK')} />
            </div>
            {diagnostic.alerts.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0' }}>
                <CheckCircle2 size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
                <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Este pivô está 100% operacional para automação e manejo diário.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                {diagnostic.alerts.map((alert) => (
                  <AlertCard key={alert} text={alert} />
                ))}
              </div>
            )}
          </div>

          {/* ── CALIBRAÇÃO ETO (super admin) ─────────────────────────────────── */}
          {superAdmin && (
            <EtoCalibrationPanel rows={etoHistory} loading={etoHistoryLoading} />
          )}

        </div>
      )}
    </div>
  )
}

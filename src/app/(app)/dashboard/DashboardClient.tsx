'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { PivotDiagnostic } from '@/services/pivot-diagnostics'
import { useState } from 'react'
import type { Pivot, Season, DailyManagement, EnergyBill } from '@/types/database'
import { DecisionCard } from './DecisionCard'
import { EnergyBlock } from './EnergyBlock'
import { CriticalPivots } from './CriticalPivots'
import { ProjectionBlock } from './ProjectionBlock'
import { CompactKpis } from './CompactKpis'
import { SoilGaugesBlock } from './SoilGaugesBlock'
import { HistoryBlock } from './HistoryBlock'
import type { ProjectionDay } from '@/lib/water-balance'
import {
  CircleDot, Building2, Plus, ArrowRight,
  Droplets, Sun, CloudRain, Zap,
  CheckCircle2, AlertTriangle, AlertCircle, Info, Clock,
} from 'lucide-react'

const PivotMap = dynamic(
  () => import('./PivotMap').then(m => ({ default: m.PivotMap })),
  { ssr: false, loading: () => (
    <div style={{
      height: 340, borderRadius: 16, background: '#0f1923',
      border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#556677', fontSize: 13,
    }}>
      Carregando mapa…
    </div>
  )}
)

// ─── Status ──────────────────────────────────────────────────
type IrrigationStatus = 'azul' | 'verde' | 'amarelo' | 'vermelho' | 'sem_safra'

const STATUS_CONFIG: Record<IrrigationStatus, {
  label: string; color: string; bg: string; border: string
  icon: typeof CheckCircle2; desc: string
}> = {
  azul:      { label: 'Irrigando',     color: '#0093D0', bg: 'rgb(0 147 208 / 0.12)',   border: 'rgb(0 147 208 / 0.25)',  icon: Droplets,      desc: 'Irrigação em andamento' },
  verde:     { label: 'OK',            color: '#22c55e', bg: 'rgb(34 197 94 / 0.12)',   border: 'rgb(34 197 94 / 0.25)',  icon: CheckCircle2,  desc: 'Sem necessidade de irrigação' },
  amarelo:   { label: 'Atenção',       color: '#f59e0b', bg: 'rgb(245 158 11 / 0.12)',  border: 'rgb(245 158 11 / 0.25)', icon: AlertTriangle, desc: 'Irrigação recomendada em breve' },
  vermelho:  { label: 'Irrigar Agora', color: '#ef4444', bg: 'rgb(239 68 68 / 0.12)',   border: 'rgb(239 68 68 / 0.25)',  icon: AlertCircle,   desc: 'Solo abaixo do nível crítico' },
  sem_safra: { label: 'Sem safra',     color: '#556677', bg: 'rgb(85 102 119 / 0.12)',  border: 'rgb(85 102 119 / 0.25)', icon: Info,          desc: 'Nenhuma safra ativa' },
}

// threshold: limiar configurado no pivô (padrão 70)
function resolveStatus(lastM: DailyManagement | null, hasActiveSeason: boolean, threshold = 70): IrrigationStatus {
  if (!hasActiveSeason) return 'sem_safra'
  if (!lastM) return 'verde'
  const pct = lastM.field_capacity_percent ?? null
  if (pct === null) return 'verde'
  if (pct >= threshold) return 'verde'
  if (pct >= threshold - 10) return 'amarelo'
  return 'vermelho'
}

function fmtVal(n: number | null | undefined, dec = 1): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(dec)
}

// ─── Onboarding ──────────────────────────────────────────────
function Onboarding() {
  const steps = [
    { num: 1, title: 'Cadastre sua Fazenda',   desc: 'Informe nome, localização e altitude.',           href: '/fazendas' },
    { num: 2, title: 'Adicione um Pivô',        desc: 'Vincule o equipamento à fazenda.',               href: '/pivos'    },
    { num: 3, title: 'Configure uma Safra',     desc: 'Defina cultura, datas e parâmetros de solo.',    href: '/safras'   },
    { num: 4, title: 'Inicie o Manejo Diário',  desc: 'Registre dados climáticos e calcule irrigação.', href: '/manejo'   },
  ]
  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto py-8">
      <div style={{ textAlign: 'center', padding: '0 16px' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px',
          background: '#0093D0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgb(0 147 208 / 0.4)',
        }}>
          <Droplets size={32} className="text-white" strokeWidth={2} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', marginBottom: 10 }}>Bem-vindo ao IrrigaAgro</h1>
        <p style={{ fontSize: 15, color: '#8899aa', lineHeight: 1.6 }}>
          Siga os passos abaixo para configurar seu sistema de manejo hídrico baseado no método FAO-56.
        </p>
      </div>
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '8px 0', overflow: 'hidden' }}>
        {steps.map((step, i) => (
          <Link key={step.num} href={step.href} style={{
            display: 'flex', alignItems: 'center', gap: 16, padding: '18px 24px',
            textDecoration: 'none', borderBottom: i < steps.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#0d1520'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'rgb(0 147 208 / 0.12)', border: '1px solid rgb(0 147 208 / 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#0093D0',
            }}>{step.num}</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{step.title}</p>
              <p style={{ fontSize: 12, color: '#556677', marginTop: 2 }}>{step.desc}</p>
            </div>
            <ArrowRight size={16} style={{ color: '#556677', flexShrink: 0 }} />
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── Cor por % campo ─────────────────────────────────────────
function pctColor(pct: number, threshold = 70): string {
  if (pct >= threshold) return '#22c55e'          // verde
  if (pct >= threshold - 10) return '#f97316'     // laranja
  return '#ef4444'                                // vermelho
}

// ─── Mini-timeline 7 dias ────────────────────────────────────
function MiniTimeline({ days, time360h, threshold }: {
  days: ProjectionDay[]
  time360h: number | null
  threshold: number
}) {
  if (!days.length) return null

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Clock size={11} style={{ color: '#556677' }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#556677' }}>
          Projeção 7 dias
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {days.map((day, i) => {
          const pct      = day.fieldCapacityPercent
          const color    = pctColor(pct, threshold)
          const needsIrr = day.recommendedDepthMm > 0
          const depth    = needsIrr ? day.recommendedDepthMm : 0
          const speed    = needsIrr ? (day.recommendedSpeedPercent ?? 0) : 0
          const duration = (needsIrr && speed && time360h) ? time360h / (speed / 100) : 0
          const d        = new Date(day.date + 'T12:00:00')
          const label    = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3)

          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              {/* Label dia */}
              <span style={{ fontSize: 9, color: '#556677', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{label}</span>

              {/* Card do dia — todos no mesmo estilo */}
              <div style={{
                width: '100%', borderRadius: 8,
                background: `${color}18`,
                border: `1px solid ${color}40`,
                overflow: 'hidden',
              }}>
                {/* % campo — TOPO destaque */}
                <div style={{ padding: '7px 4px 5px', textAlign: 'center', borderBottom: `1px solid ${color}25` }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                    {Math.round(pct)}
                  </span>
                  <span style={{ fontSize: 8, color, opacity: 0.7 }}>%</span>
                </div>

                {/* Dados de irrigação — sempre visíveis (zeros quando não irriga) */}
                <div style={{ padding: '5px 3px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  {/* Lâmina */}
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: needsIrr ? '#e2e8f0' : '#556677', fontFamily: 'var(--font-mono)' }}>
                      {depth > 0 ? depth.toFixed(1) : '0'}
                    </span>
                    <span style={{ fontSize: 8, color: '#556677' }}>mm</span>
                  </div>
                  {/* Velocidade */}
                  <div style={{ fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1, color: needsIrr ? '#0093D0' : '#556677' }}>
                    {speed > 0 ? `${speed}%` : '0%'}
                  </div>
                  {/* Duração */}
                  <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: needsIrr ? '#8899aa' : '#556677' }}>
                    {duration > 0 ? `${duration.toFixed(1)}h` : '0h'}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Card de pivô ─────────────────────────────────────────────
interface PivotWithFarm extends Pivot {
  farms: { id: string; name: string } | null
}

interface PivotCardProps {
  pivot: PivotWithFarm
  hasActiveSeason: boolean
  lastManagement: DailyManagement | null
  projection: ProjectionDay[]
  diagnostic: PivotDiagnostic | null
}

function PivotCard({ pivot, hasActiveSeason, lastManagement, projection, diagnostic }: PivotCardProps) {
  const threshold  = pivot.alert_threshold_percent ?? 70
  const status     = resolveStatus(lastManagement, hasActiveSeason, threshold)
  const cfg        = STATUS_CONFIG[status]
  const StatusIcon = cfg.icon
  const pct        = lastManagement?.field_capacity_percent ?? null
  const m          = lastManagement

  // Recomendação: usa dados reais do dia ou projeção D+1 como fallback
  const proj0       = projection[0] ?? null
  const needsIrrig  = (m?.recommended_depth_mm ?? 0) > 0 || (proj0?.recommendedDepthMm ?? 0) > 0
  const recDepth    = m?.recommended_depth_mm     ?? proj0?.recommendedDepthMm     ?? null
  const recSpeed    = m?.recommended_speed_percent ?? proj0?.recommendedSpeedPercent ?? null
  const recDuration = (recSpeed && pivot.time_360_h)
    ? pivot.time_360_h / (recSpeed / 100)
    : null
  const recIsProjected = !m && proj0 !== null

  return (
    <div style={{
      background: '#0f1923',
      border: `1px solid ${needsIrrig && hasActiveSeason ? cfg.border : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 16, padding: 18,
      display: 'flex', flexDirection: 'column', gap: 14,
      boxShadow: needsIrrig && hasActiveSeason && status === 'vermelho'
        ? `0 0 24px rgb(239 68 68 / 0.08)` : 'none',
    }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'rgb(0 147 208 / 0.1)', border: '1px solid rgb(0 147 208 / 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CircleDot size={15} style={{ color: '#0093D0' }} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{pivot.name}</p>
          <p style={{ fontSize: 11, color: '#556677', marginTop: 1 }}>
              {pivot.farms?.name ?? 'Sem fazenda'}
            {m?.date && (
                <span style={{ marginLeft: 6, color: '#556677' }}>
                  · {new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
              )}
            </p>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
          borderRadius: 20, background: cfg.bg, border: `1px solid ${cfg.border}`,
          flexShrink: 0,
        }}>
          <StatusIcon size={11} style={{ color: cfg.color }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
        </div>
      </div>

      {diagnostic && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={{ background: '#0d1520', borderRadius: 8, padding: '8px 10px' }}>
            <p style={{ fontSize: 9, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Clima</p>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#8899aa', marginTop: 4 }}>{diagnostic.climateRouteLabel}</p>
          </div>
          <div style={{ background: '#0d1520', borderRadius: 8, padding: '8px 10px' }}>
            <p style={{ fontSize: 9, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Automação</p>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#8899aa', marginTop: 4 }}>{diagnostic.automationStatus}</p>
          </div>
        </div>
      )}

      {/* ══ RECOMENDAÇÃO DE IRRIGAÇÃO — TOPO, acima da barra ══ */}
      {hasActiveSeason && (
        <div style={{
          borderRadius: 10,
          background: needsIrrig ? cfg.bg : '#0d1520',
          border: `1px solid ${needsIrrig ? cfg.border : 'rgba(255,255,255,0.04)'}`,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 12px',
            borderBottom: `1px solid ${needsIrrig ? cfg.border : 'rgba(255,255,255,0.04)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Droplets size={11} style={{ color: needsIrrig ? cfg.color : '#556677' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: needsIrrig ? cfg.color : '#556677' }}>
                {needsIrrig ? 'Irrigação Recomendada' : 'Irrigação'}
              </span>
            </div>
            {recIsProjected && (
              <span style={{ fontSize: 9, color: '#556677', background: 'rgba(255,255,255,0.04)', padding: '2px 7px', borderRadius: 20 }}>
                projeção
              </span>
            )}
          </div>

          {/* Corpo: 3 métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            {[
              { label: 'Lâmina',     value: recDepth    != null ? recDepth.toFixed(1)   : '—', unit: 'mm', color: needsIrrig ? '#e2e8f0' : '#556677' },
              { label: 'Velocidade', value: recSpeed    != null ? String(recSpeed)       : '—', unit: '%',  color: needsIrrig ? '#0093D0' : '#556677' },
              { label: 'Duração',    value: recDuration != null ? recDuration.toFixed(1) : '—', unit: 'h',  color: needsIrrig ? '#e2e8f0' : '#556677' },
            ].map(({ label, value, unit, color }, i) => (
              <div key={label} style={{
                padding: '10px 8px', textAlign: 'center',
                borderRight: i < 2 ? `1px solid ${needsIrrig ? cfg.border : 'rgba(255,255,255,0.04)'}` : 'none',
              }}>
                <p style={{ fontSize: 9, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                  {label}
                </p>
                <p style={{ fontSize: 20, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                  {value}
                </p>
                <p style={{ fontSize: 9, color: '#556677', marginTop: 2 }}>{unit}</p>
              </div>
            ))}
          </div>

          {/* Footer: OK */}
          {!needsIrrig && (
            <div style={{ padding: '5px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={10} style={{ color: '#22c55e' }} />
              <span style={{ fontSize: 10, color: '#556677' }}>Solo OK — sem necessidade de irrigação hoje</span>
            </div>
          )}
        </div>
      )}

      {/* Barra de umidade */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: '#556677' }}>Capacidade de Campo</span>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: pct !== null ? cfg.color : '#556677' }}>
            {pct !== null ? `${pct.toFixed(0)}%` : '—'}
          </span>
        </div>
        <div style={{ height: 7, background: '#0d1520', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
          {/* Marcador limiar */}
          <div style={{ position: 'absolute', left: `${threshold}%`, top: 0, bottom: 0, width: 1, background: '#f97316', opacity: 0.6, zIndex: 1 }} />
          <div style={{
            width: pct !== null ? `${Math.min(100, Math.max(0, pct))}%` : '0%',
            height: '100%', background: cfg.color, borderRadius: 99, transition: 'width 0.4s',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: 9, color: '#556677' }}>0%</span>
          <span style={{ fontSize: 9, color: '#f97316', opacity: 0.7 }}>▲ {threshold}% alerta</span>
          <span style={{ fontSize: 9, color: '#556677' }}>100%</span>
        </div>
      </div>

      {/* Métricas do dia — 4 colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
        {[
          { icon: Sun,       label: 'ETo',   value: fmtVal(m?.eto_mm),      unit: 'mm', color: '#f59e0b' },
          { icon: Droplets,  label: 'ETc',   value: fmtVal(m?.etc_mm),      unit: 'mm', color: '#06b6d4' },
          { icon: CloudRain, label: 'Chuva', value: fmtVal(m?.rainfall_mm), unit: 'mm', color: '#8899aa' },
          { icon: Zap,       label: 'Kc',    value: fmtVal(m?.kc, 2),       unit: '',   color: '#a78bfa' },
        ].map(({ icon: Icon, label, value, unit, color }) => (
          <div key={label} style={{ background: '#0d1520', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
            <Icon size={12} style={{ color: m ? color : '#556677', margin: '0 auto 3px' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
              {value}
            </p>
            <p style={{ fontSize: 9, color: '#556677', marginTop: 2 }}>{label}{unit ? ` (${unit})` : ''}</p>
          </div>
        ))}
      </div>

      {/* Projeção 7 dias */}
      {projection.length > 0 && (
        <MiniTimeline days={projection} time360h={pivot.time_360_h ?? null} threshold={threshold} />
      )}

      {/* CTA sem safra */}
      {!hasActiveSeason && (
        <Link href="/safras" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 600,
          background: 'rgb(0 147 208 / 0.1)', border: '1px solid rgb(0 147 208 / 0.2)',
          color: '#0093D0', textDecoration: 'none',
        }}>
          <Plus size={13} /> Iniciar Safra
        </Link>
      )}
    </div>
  )
}

// ─── Dashboard principal ──────────────────────────────────────
interface PivotWithFarmType extends Pivot {
  farms: { id: string; name: string } | null
}

interface Props {
  pivots: PivotWithFarmType[]
  activeSeasons: Season[]
  hasPivots: boolean
  lastManagementBySeason: Record<string, DailyManagement>
  historyBySeason: Record<string, DailyManagement[]>
  projectionBySeason: Record<string, ProjectionDay[]>
  diagnosticsByPivot: Record<string, PivotDiagnostic>
  energyBills: EnergyBill[]
  summary: {
    totalPivots: number
    activePivots: number
    automationReady: number
    automationRestricted: number
    automationUnavailable: number
    handledToday: number
    pivotsWithClimateFallback: number
    pivotsWithAlerts: number
  }
}

export function DashboardClient({
  pivots,
  activeSeasons,
  hasPivots,
  lastManagementBySeason,
  historyBySeason,
  projectionBySeason,
  diagnosticsByPivot,
  energyBills,
  summary,
}: Props) {
  const [expandedPivots, setExpandedPivots] = useState<Set<string>>(new Set())

  if (!hasPivots) return <Onboarding />

  const activePivotIds = new Set(activeSeasons.map(s => s.pivot_id).filter((id): id is string => id !== null))

  const lastManagementByPivot: Record<string, DailyManagement> = {}
  const projectionByPivot: Record<string, ProjectionDay[]> = {}
  for (const season of activeSeasons) {
    if (season.pivot_id) {
      if (lastManagementBySeason[season.id]) lastManagementByPivot[season.pivot_id] = lastManagementBySeason[season.id]
      if (projectionBySeason[season.id])    projectionByPivot[season.pivot_id]    = projectionBySeason[season.id]
    }
  }

  const grouped: Record<string, PivotWithFarmType[]> = {}
  for (const p of pivots) {
    const farmName = p.farms?.name ?? 'Sem fazenda'
    if (!grouped[farmName]) grouped[farmName] = []
    grouped[farmName].push(p)
  }

  const totalPivots  = summary.totalPivots
  const activePivots = summary.activePivots

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ① Título simples */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.01em', margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: '#8899aa', marginTop: 4 }}>
            {totalPivots} {totalPivots === 1 ? 'pivô' : 'pivôs'} · {activePivots} com safra ativa
          </p>
        </div>
        <Link href="/manejo" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: 'linear-gradient(135deg, #005A8C, #0093D0)',
          color: '#fff', textDecoration: 'none', flexShrink: 0,
          boxShadow: '0 4px 16px rgba(0,147,208,0.4)',
        }}>
          <Droplets size={14} /> Manejo Diário
        </Link>
      </div>

      {/* ② DecisionCard — resposta em 1 segundo */}
      <DecisionCard
        pivots={pivots}
        activeSeasons={activeSeasons}
        lastManagementByPivot={lastManagementByPivot}
        summary={summary}
      />

      {/* ③ Mapa */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#556677',
          }}>
            Mapa dos Pivôs
          </span>
        </div>
        <PivotMap pivots={pivots.map(p => ({
          id:             p.id,
          name:           p.name,
          farm_name:      p.farms?.name ?? '',
          latitude:       p.latitude,
          longitude:      p.longitude,
          status:         resolveStatus(lastManagementByPivot[p.id] ?? null, activePivotIds.has(p.id), p.alert_threshold_percent ?? 70),
          lastManagement: lastManagementByPivot[p.id] ?? null,
        }))} />
      </div>

      {/* ④ Pivôs Críticos + Projeção (50/50) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <CriticalPivots
          pivots={pivots}
          lastManagementByPivot={lastManagementByPivot}
          activePivotIds={activePivotIds}
          diagnosticsByPivot={diagnosticsByPivot}
        />
        <ProjectionBlock
          projectionBySeason={projectionBySeason}
          activeSeasons={activeSeasons}
        />
      </div>

      {/* ⑤ KPIs compactos (5 colunas) */}
      <CompactKpis
        summary={summary}
        lastManagementBySeason={lastManagementBySeason}
      />

      {/* ⑥ Gauges + Histórico (1fr / 2fr) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
        <SoilGaugesBlock
          pivots={pivots}
          lastManagementByPivot={lastManagementByPivot}
          activePivotIds={activePivotIds}
        />
        <HistoryBlock
          historyBySeason={historyBySeason}
          activeSeasons={activeSeasons}
        />
      </div>

      {/* ⑦ Energia & Custos */}
      <EnergyBlock energyBills={energyBills} />

      {/* ⑧ Detalhes dos Pivôs — colapsáveis */}
      <div style={{
        background: '#0f1923',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#556677',
          }}>
            Detalhes dos Pivôs
          </span>
          <span style={{ fontSize: 10, color: '#556677' }}>Clique para expandir</span>
        </div>

        {/* Pivot rows */}
        {Object.entries(grouped).map(([farmName, farmPivots]) =>
          farmPivots.map(pivot => {
            const isOpen = expandedPivots.has(pivot.id)
            const status = resolveStatus(lastManagementByPivot[pivot.id] ?? null, activePivotIds.has(pivot.id), pivot.alert_threshold_percent ?? 70)
            const cfg = STATUS_CONFIG[status]
            const pct = lastManagementByPivot[pivot.id]?.field_capacity_percent ?? null

            return (
              <div key={pivot.id}>
                {/* Linha compacta */}
                <div
                  onClick={() => {
                    const next = new Set(expandedPivots)
                    isOpen ? next.delete(pivot.id) : next.add(pivot.id)
                    setExpandedPivots(next)
                  }}
                  style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: isOpen ? '#141e2b' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{pivot.name}</span>
                    <span style={{ fontSize: 11, color: '#556677' }}>
                      {farmName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: 8,
                      fontSize: 10, fontWeight: 700,
                      background: cfg.bg, color: cfg.color,
                      border: `1px solid ${cfg.border}`,
                    }}>
                      {cfg.label}
                    </span>
                    <span style={{
                      fontSize: 16, fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      color: cfg.color,
                      minWidth: 42, textAlign: 'right',
                    }}>
                      {pct !== null ? `${Math.round(pct)}%` : '—'}
                    </span>
                    <span style={{
                      fontSize: 12, color: '#556677',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform 0.2s',
                    }}>▼</span>
                  </div>
                </div>

                {/* PivotCard expandido */}
                {isOpen && (
                  <div style={{ padding: '8px 12px 12px', background: '#141e2b' }}>
                    <PivotCard
                      pivot={pivot}
                      hasActiveSeason={activePivotIds.has(pivot.id)}
                      lastManagement={lastManagementByPivot[pivot.id] ?? null}
                      projection={projectionByPivot[pivot.id] ?? []}
                      diagnostic={diagnosticsByPivot[pivot.id] ?? null}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ⑧ Resumo operacional */}
      {(summary.pivotsWithAlerts > 0 || summary.pivotsWithClimateFallback > 0) && (
        <div style={{
          background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16,
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'rgb(245 158 11 / 0.1)', border: '1px solid rgb(245 158 11 / 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Info size={16} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Resumo operacional do parque</p>
            <p style={{ fontSize: 12, color: '#556677', marginTop: 2 }}>
              {summary.pivotsWithAlerts} pivô(s) com alertas operacionais · {summary.pivotsWithClimateFallback} usando fallback climático
            </p>
          </div>
          <Link href="/diagnostico-pivo" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            borderRadius: 10, fontSize: 12, fontWeight: 600, flexShrink: 0,
            background: 'rgb(245 158 11 / 0.1)', border: '1px solid rgb(245 158 11 / 0.2)',
            color: '#f59e0b', textDecoration: 'none',
          }}>
            Diagnóstico <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* ⑨ Aviso sem dados */}
      {Object.keys(lastManagementBySeason).length === 0 && activePivots > 0 && (
        <div style={{
          background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16,
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'rgb(245 158 11 / 0.1)', border: '1px solid rgb(245 158 11 / 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Info size={16} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Aguardando primeiro registro</p>
            <p style={{ fontSize: 12, color: '#556677', marginTop: 2 }}>
              O cron automático registra o balanço às 02h BRT. Você também pode registrar manualmente em{' '}
              <strong style={{ color: '#8899aa' }}>Manejo Diário</strong>.
            </p>
          </div>
          <Link href="/manejo" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            borderRadius: 10, fontSize: 12, fontWeight: 600, flexShrink: 0,
            background: 'rgb(245 158 11 / 0.1)', border: '1px solid rgb(245 158 11 / 0.2)',
            color: '#f59e0b', textDecoration: 'none',
          }}>
            Registrar <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </div>
  )
}

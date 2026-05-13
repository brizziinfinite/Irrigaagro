'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import type { PivotDiagnostic } from '@/services/pivot-diagnostics'
import type { ManagementSeasonContext } from '@/services/management'
import type { Pivot, Season, DailyManagement, EnergyBill } from '@/types/database'
import { DecisionCard } from './DecisionCard'
import { KpiCards } from './KpiCards'
import { EnergyBlock } from './EnergyBlock'
import { CriticalPivots } from './CriticalPivots'
import { RecommendationsMatrix } from './RecommendationsMatrix'
import { SoilGaugesBlock } from './SoilGaugesBlock'
import { HistoryBlock } from './HistoryBlock'
import {
  ArrowRight,
  Droplets, AlertTriangle, AlertCircle, Info,
  CheckCircle2, X, CalendarClock
} from 'lucide-react'
import { findRecommendedSpeed, getFFactorForDas } from '@/lib/water-balance'
const WaterBalanceChart = dynamic(
  () => import('@/app/(app)/manejo/WaterBalanceChart'),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: 200, borderRadius: 8, background: 'var(--color-surface-border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>
        Carregando gráfico…
      </div>
    ),
  }
)

const PivotMap = dynamic(
  () => import('./PivotMap').then(m => ({ default: m.PivotMap })),
  { ssr: false, loading: () => (
    <div style={{
      height: 340, borderRadius: 16, background: 'var(--color-surface-card)',
      border: '1px solid var(--color-surface-border2)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13,
    }}>
      Carregando mapa…
    </div>
  )}
)

// ─── Status ──────────────────────────────────────────────────
type IrrigationStatus = 'azul' | 'verde' | 'amarelo' | 'vermelho' | 'sem_safra'


// threshold: limiar configurado no pivô (padrão 70)
// Zona amarela: threshold × 1,15 (alinhado ao getIrrigationStatus de water-balance.ts)
function resolveStatus(lastM: DailyManagement | null, hasActiveSeason: boolean): IrrigationStatus {
  if (!hasActiveSeason) return 'sem_safra'
  if (!lastM) return 'verde'
  const pct = lastM.field_capacity_percent ?? null
  if (pct === null) return 'verde'
  // Paleta unificada: Verde ≥75% | Âmbar 60–75% | Vermelho <60%
  if (pct >= 75) return 'verde'
  if (pct >= 60) return 'amarelo'
  return 'vermelho'
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
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)', marginBottom: 10 }}>Bem-vindo ao IrrigaAgro</h1>
        <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          Siga os passos abaixo para configurar seu sistema de manejo hídrico baseado no método FAO-56.
        </p>
      </div>
      <div style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border2)', borderRadius: 20, padding: '8px 0', overflow: 'hidden' }}>
        {steps.map((step, i) => (
          <Link key={step.num} href={step.href} style={{
            display: 'flex', alignItems: 'center', gap: 16, padding: '18px 24px',
            textDecoration: 'none', borderBottom: i < steps.length - 1 ? '1px solid var(--color-surface-border2)' : 'none',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-sidebar)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'rgb(0 147 208 / 0.12)', border: '1px solid rgb(0 147 208 / 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#0093D0',
            }}>{step.num}</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{step.title}</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{step.desc}</p>
            </div>
            <ArrowRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          </Link>
        ))}
      </div>
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
  contexts: ManagementSeasonContext[]
  hasPivots: boolean
  lastManagementBySeason: Record<string, DailyManagement>
  historyBySeason: Record<string, DailyManagement[]>
  /** ADc projetado para hoje (%), descontando ETc dos dias sem registro */
  currentFieldCapacityBySeasonId: Record<string, number>
  /** ADc projetado para hoje (mm), ponto de partida para projeções */
  currentAdcBySeasonId?: Record<string, number>
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
    aguaHojeMm?: number
  }
}

export function DashboardClient({
  pivots,
  activeSeasons,
  contexts,
  hasPivots,
  lastManagementBySeason,
  historyBySeason,
  currentFieldCapacityBySeasonId,
  currentAdcBySeasonId,
  diagnosticsByPivot,
  energyBills,
  summary,
}: Props) {
  const [selectedPivotPlotId, setSelectedPivotPlotId] = useState<string | null>(null)

  // today memoizado para não recriar string a cada render (violação da REGRA #3)
  const today = useMemo(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
  }, [])

  if (!hasPivots) return <Onboarding />

  const activePivotIds = new Set(activeSeasons.map(s => s.pivot_id).filter((id): id is string => id !== null))

  const lastManagementByPivot: Record<string, DailyManagement> = {}
  for (const season of activeSeasons) {
    if (season.pivot_id && lastManagementBySeason[season.id]) {
      const rawRecord = lastManagementBySeason[season.id]
      const currentPct = currentFieldCapacityBySeasonId[season.id] ?? rawRecord.field_capacity_percent
      lastManagementByPivot[season.pivot_id] = { ...rawRecord, field_capacity_percent: currentPct }
    }
  }

  // ─── Projeção de irrigação (fonte única de verdade para DecisionCard + Recomendações) ───
  interface PivotRec {
    pivotId: string
    pivotName: string
    pct: number | null
    needsIrrigationToday: boolean
    laminaToday: number | null
    speedToday: number | null
    daysAway: number | null
    laminaProjected: number | null
    speedProjected: number | null
  }

  const pivotRecs: PivotRec[] = []

  for (const pivot of pivots) {
    if (!activePivotIds.has(pivot.id)) continue
    const mgmt = lastManagementByPivot[pivot.id]
    const pct = mgmt?.field_capacity_percent ?? null

    if (mgmt?.needs_irrigation) {
      pivotRecs.push({
        pivotId: pivot.id,
        pivotName: pivot.name,
        pct,
        needsIrrigationToday: true,
        laminaToday: mgmt.recommended_depth_mm ?? null,
        speedToday: mgmt.recommended_speed_percent ?? null,
        daysAway: null,
        laminaProjected: null,
        speedProjected: null,
      })
      continue
    }

    // Projeção simples sem forecast (usa ETc salvo no banco)
    if (mgmt?.cta && mgmt?.ctda != null && mgmt?.etc_mm) {
      const cta = mgmt.cta
      const etcMm = mgmt.etc_mm
      const threshold = pivot.alert_threshold_percent ?? 70
      const target = pivot.irrigation_target_percent ?? 100
      const thresholdMm = (threshold / 100) * cta
      const targetMm = (target / 100) * cta
      const speedFloor = pivot.min_speed_percent ?? 10
      let adc = mgmt.ctda

      for (let i = 1; i <= 7; i++) {
        adc = Math.max(0, adc - etcMm)
        if (adc <= thresholdMm) {
          const speed = findRecommendedSpeed(pivot, Math.max(0, targetMm - adc))
            ?? (Math.ceil(speedFloor / 10) * 10)
          pivotRecs.push({
            pivotId: pivot.id,
            pivotName: pivot.name,
            pct,
            needsIrrigationToday: false,
            laminaToday: null,
            speedToday: null,
            daysAway: i,
            laminaProjected: Math.max(0, targetMm - adc),
            speedProjected: speed,
          })
          break
        }
      }
    }
  }

  pivotRecs.sort((a, b) => {
    if (a.needsIrrigationToday && !b.needsIrrigationToday) return -1
    if (!a.needsIrrigationToday && b.needsIrrigationToday) return 1
    return (a.daysAway ?? 99) - (b.daysAway ?? 99)
  })

  const totalPivots  = summary.totalPivots
  const activePivots = summary.activePivots

  return (
    <div className="mx-auto w-full flex flex-col gap-6 sm:gap-10 pb-16" style={{ maxWidth: 1400, animation: 'fadeIn 0.4s ease-in-out' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}} />

      {/* ① Título */}
      <div style={{ minWidth: 0 }}>
        <h1 className="text-2xl sm:text-3xl" style={{ fontWeight: 900, color: 'var(--color-text)', letterSpacing: '-0.03em', margin: 0 }}>Central de Controle</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 5, fontWeight: 500 }}>
          {totalPivots} {totalPivots === 1 ? 'pivô' : 'pivôs'} · {activePivots} com safra ativa
        </p>
      </div>

      {/* ② Bloco principal de decisão — protagonista */}
      <DecisionCard
        pivotRecs={pivotRecs}
        activePivots={summary.activePivots}
        handledToday={summary.handledToday}
      />

      {/* ③ KPIs resumidos */}
      {(() => {
        // Água hoje: soma lâmina recomendada dos pivôs que precisam irrigar hoje
        const aguaHojeMm = Object.values(lastManagementByPivot)
          .reduce((sum, m) => sum + (m.needs_irrigation ? (m.recommended_depth_mm ?? 0) : 0), 0)

        // Alertas: pivôs com FC% abaixo do threshold (urgência operacional, não de configuração)
        const pivotsWithAlerts = pivots.filter(pivot => {
          if (!activePivotIds.has(pivot.id)) return false
          const pct = lastManagementByPivot[pivot.id]?.field_capacity_percent ?? null
          const threshold = pivot.alert_threshold_percent ?? 70
          return pct !== null && pct < threshold
        }).length

        return (
          <KpiCards
            summary={{ ...summary, aguaHojeMm, pivotsWithAlerts }}
            lastManagementBySeason={lastManagementBySeason}
          />
        )
      })()}

      {/* ④ Recomendações Operacionais — usa pivotRecs já calculado */}
      {(() => {
        const recs = pivotRecs

        const urgentCount = recs.filter(r => r.needsIrrigationToday).length
        const soonCount = recs.filter(r => !r.needsIrrigationToday && (r.daysAway ?? 99) <= 2).length
        const hasAnything = recs.length > 0

        const borderColor = urgentCount > 0
          ? 'rgba(239,68,68,0.35)'
          : soonCount > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'
        const headerColor = urgentCount > 0 ? '#ef4444' : soonCount > 0 ? '#f59e0b' : '#22c55e'
        const headerBg = urgentCount > 0
          ? 'rgba(239,68,68,0.08)' : soonCount > 0 ? 'rgba(245,158,11,0.06)' : 'rgba(34,197,94,0.06)'

        return (
          <div style={{
            background: 'linear-gradient(145deg, rgba(16,21,28,0.97), rgba(12,17,23,0.98))',
            border: `1px solid ${borderColor}`,
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow: urgentCount > 0
              ? '0 0 30px rgba(239,68,68,0.1), 0 8px 32px rgba(0,0,0,0.4)'
              : '0 8px 32px rgba(0,0,0,0.35)',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', background: headerBg,
              borderBottom: `1px solid ${borderColor}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CalendarClock size={15} style={{ color: headerColor }} />
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#c8d4e0' }}>
                  Recomendações de Irrigação
                </span>
                {urgentCount > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: '#ef4444',
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 99, padding: '3px 9px', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {urgentCount} irrigar hoje
                  </span>
                )}
              </div>
              {summary.pivotsWithClimateFallback > 0 && (
                <Link href="/diagnostico-pivo" style={{
                  fontSize: 11, color: 'var(--color-text-muted)', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Info size={11} /> {summary.pivotsWithClimateFallback} sem dado climático
                </Link>
              )}
            </div>

            {/* Linhas */}
            {!hasAnything ? (
              <div style={{ padding: '20px 22px' }}>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>Nenhum pivô ativo com dados de balanço.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recs.map((rec, i) => {
                  const isUrgent = rec.needsIrrigationToday
                  const isSoon = !isUrgent && (rec.daysAway ?? 99) <= 2
                  // Cor baseada no pct real, alinhada à paleta unificada
                  const pctVal = rec.pct ?? null
                  const color = isUrgent ? '#ef4444'
                    : pctVal !== null ? (pctVal >= 75 ? '#22c55e' : pctVal >= 60 ? '#f59e0b' : '#ef4444')
                    : isSoon ? '#f59e0b' : '#22c55e'
                  const Icon = isUrgent ? AlertCircle : isSoon ? AlertTriangle : CheckCircle2

                  return (
                    <div key={rec.pivotId} style={{
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      padding: '13px 20px',
                      borderBottom: i < recs.length - 1 ? '1px solid var(--color-surface-border2)' : 'none',
                      background: isUrgent ? 'rgba(239,68,68,0.05)' : 'transparent',
                    }}>
                      <Icon size={15} style={{ color, flexShrink: 0 }} />

                      {/* Nome do pivô */}
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#d8e4f0', flex: '0 0 auto', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rec.pivotName}
                      </span>

                      {/* CC% */}
                      {rec.pct != null && (
                        <span style={{
                          fontSize: 11, fontFamily: 'var(--font-mono)', color: color,
                          background: `${color}12`, border: `1px solid ${color}28`,
                          borderRadius: 6, padding: '2px 7px', flexShrink: 0, fontWeight: 700,
                        }}>
                          {Math.round(rec.pct)}%
                        </span>
                      )}

                      {/* Recomendação */}
                      <span style={{ fontSize: 12, color: isUrgent ? '#c8d4e0' : 'var(--color-text-muted)', flex: 1, fontWeight: isUrgent ? 600 : 400 }}>
                        {isUrgent
                          ? 'Irrigar hoje'
                          : rec.daysAway === 1 ? 'Irrigar amanhã'
                          : `Irrigar em ${rec.daysAway} dias`}
                      </span>

                      {/* Lâmina */}
                      {(rec.laminaToday ?? rec.laminaProjected ?? 0) > 0 && (
                        <span style={{ fontSize: 12, color: '#c8d4e0', fontFamily: 'var(--font-mono)', flexShrink: 0, fontWeight: 600 }}>
                          {(rec.laminaToday ?? rec.laminaProjected ?? 0).toFixed(1)} mm
                        </span>
                      )}

                      {/* Velocidade */}
                      {(rec.speedToday ?? rec.speedProjected) != null && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: '#0093D0',
                          fontFamily: 'var(--font-mono)',
                          background: 'rgba(0,147,208,0.1)', border: '1px solid rgba(0,147,208,0.22)',
                          borderRadius: 6, padding: '3px 8px', flexShrink: 0,
                        }}>
                          {rec.speedToday ?? rec.speedProjected}%
                        </span>
                      )}

                      <Link href="/manejo" style={{
                        fontSize: 11, color: 'var(--color-text-muted)', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                        padding: '4px 8px', borderRadius: 6,
                        background: 'var(--color-surface-border2)',
                        border: '1px solid var(--color-surface-border2)',
                      }}>
                        Ver Manejo <ArrowRight size={11} />
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ⑤ Mapa + Situação por Pivô */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        {/* Mapa do Parque */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-text-muted)' }}>
              Planta da Fazenda
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>·</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Localização dos pivôs</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 4 }}>·</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)' }}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <PivotMap onPivotClick={setSelectedPivotPlotId} pivots={pivots.map(p => ({
            id:               p.id,
            name:             p.name,
            farm_name:        p.farms?.name ?? '',
            latitude:         p.latitude,
            longitude:        p.longitude,
            status:           resolveStatus(lastManagementByPivot[p.id] ?? null, activePivotIds.has(p.id)),
            lastManagement:   lastManagementByPivot[p.id] ?? null,
            length_m:         p.length_m,
            sector_start_deg: p.sector_start_deg,
            sector_end_deg:   p.sector_end_deg,
          }))} />
        </div>

        {/* Situação por Pivô */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-text-muted)' }}>
              Situação por Pivô
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>·</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Prioridade operacional</span>
          </div>
          <CriticalPivots
            pivots={pivots}
            lastManagementByPivot={lastManagementByPivot}
            activePivotIds={activePivotIds}
            diagnosticsByPivot={diagnosticsByPivot}
          />
        </div>
      </div>

      {/* ⑥ Recomendações Secundárias */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 28 }}>
        <RecommendationsMatrix
          contexts={contexts}
          lastMgmtBySeasonId={lastManagementBySeason}
          currentAdcBySeasonId={currentAdcBySeasonId}
          today={today}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
          <SoilGaugesBlock
            pivots={pivots}
            lastManagementByPivot={lastManagementByPivot}
            activePivotIds={activePivotIds}
          />
          <HistoryBlock
            historyBySeason={historyBySeason}
            activeSeasons={activeSeasons}
            pivots={pivots}
            lastManagementByPivot={lastManagementByPivot}
            activePivotIds={activePivotIds}
          />
        </div>

        <EnergyBlock energyBills={energyBills} />
      </div>

      {/* ⑦ Modal — Umidade do Solo (últimos dias) */}
      {selectedPivotPlotId && (() => {
        const pivot = pivots.find(p => p.id === selectedPivotPlotId)
        const ctx = contexts.find(c => c.season.pivot_id === selectedPivotPlotId)
        if (!pivot) return null

        const history = ctx ? (historyBySeason[ctx.season.id] ?? []) : []
        const threshold = pivot.alert_threshold_percent ?? 70

        // f_factor do estágio atual (para calcular umidade de segurança)
        const lastDas = history.length > 0 ? (history[history.length - 1].das ?? 1) : 1
        const fFactor = ctx?.crop ? getFFactorForDas(ctx.crop, lastDas) : null

        const trendData = history.filter((d: DailyManagement) => d.field_capacity_percent != null)

        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setSelectedPivotPlotId(null)}
          >
            <style>{`
              @keyframes waterWave { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
              @keyframes tankWave  { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
            `}</style>
            <div
              style={{ width: '92%', maxWidth: 780, background: 'var(--color-surface-card)', borderRadius: 24, padding: '28px 32px 24px', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', border: '1px solid var(--color-surface-border2)', position: 'relative' }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setSelectedPivotPlotId(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', lineHeight: 0 }}>
                <X size={18} />
              </button>

              {/* Header com mini tank */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
                {/* Mini tank — igual ao Radar Tático */}
                {(() => {
                  const currentPct = lastManagementByPivot[pivot.id]?.field_capacity_percent ?? null
                  const tc = currentPct === null ? '#334155'
                    : currentPct >= 80 ? '#38bdf8'
                    : currentPct >= 70 ? '#f59e0b'
                    : '#ef4444'
                  return (
                    <div style={{
                      width: 64, height: 70, borderRadius: 12,
                      border: `1px solid ${tc}40`,
                      background: 'rgba(5,10,18,0.85)',
                      position: 'relative', overflow: 'hidden', flexShrink: 0,
                      boxShadow: `0 0 18px ${tc}30, 0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)`,
                    }}>
                      {[75, 50, 25].map(mark => (
                        <div key={mark} style={{ position: 'absolute', left: 0, right: 0, bottom: `${mark}%`, height: 1, background: 'rgba(255,255,255,0.05)', zIndex: 1 }} />
                      ))}
                      {currentPct !== null && (
                        <div style={{
                          position: 'absolute', left: 0, right: 0, bottom: 0,
                          height: `${Math.min(100, Math.max(0, currentPct))}%`,
                          transition: 'height 1s cubic-bezier(0.4,0,0.2,1)',
                          overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 2,
                        }}>
                          <div style={{ width: '200%', display: 'flex', animation: 'tankWave 2.5s linear infinite', flexShrink: 0, height: 12 }}>
                            <svg viewBox="0 0 200 20" preserveAspectRatio="none" style={{ width: '50%', height: 12, display: 'block' }}>
                              <path d="M0,20 L0,10 C40,18 60,2 100,10 C140,18 160,2 200,10 L200,20 Z" fill={tc} opacity="0.95"/>
                            </svg>
                            <svg viewBox="0 0 200 20" preserveAspectRatio="none" style={{ width: '50%', height: 12, display: 'block' }}>
                              <path d="M0,20 L0,10 C40,18 60,2 100,10 C140,18 160,2 200,10 L200,20 Z" fill={tc} opacity="0.95"/>
                            </svg>
                          </div>
                          <div style={{ flex: 1, background: `linear-gradient(to bottom, ${tc}55, ${tc}28)` }} />
                        </div>
                      )}
                      <div style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', fontFamily: 'var(--font-mono)', textShadow: '0 1px 6px rgba(0,0,0,0.9)', lineHeight: 1, letterSpacing: '-0.02em' }}>
                          {currentPct !== null ? `${Math.round(currentPct)}%` : '—'}
                        </span>
                        <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>campo</span>
                      </div>
                    </div>
                  )
                })()}
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{pivot.name}</h3>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>Balanço Hídrico — Últimos {trendData.length} dias</p>
                  {pivot.farms?.name && <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: '3px 0 0' }}>{pivot.farms.name}</p>}
                </div>
              </div>

              {/* Gráfico */}
              {trendData.length > 1 ? (
                <WaterBalanceChart
                  history={trendData}
                  threshold={threshold}
                  fFactor={fFactor}
                  fieldCapacity={pivot.field_capacity ?? null}
                  wiltingPoint={pivot.wilting_point ?? null}
                  pivotName={pivot.name}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--color-text-muted)', fontSize: 13 }}>
                  Nenhum dado de umidade registrado para este pivô.
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

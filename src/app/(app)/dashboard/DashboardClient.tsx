'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import type { PivotDiagnostic } from '@/services/pivot-diagnostics'
import type { ManagementSeasonContext } from '@/services/management'
import type { Pivot, Season, DailyManagement, EnergyBill } from '@/types/database'
import { DecisionCard } from './DecisionCard'
import { EnergyBlock } from './EnergyBlock'
import { CriticalPivots } from './CriticalPivots'
import { RecommendationsMatrix } from './RecommendationsMatrix'
import { SoilGaugesBlock } from './SoilGaugesBlock'
import { HistoryBlock } from './HistoryBlock'
import {
  Plus, ArrowRight,
  Droplets, AlertTriangle, AlertCircle, Info,
  CheckCircle2, X, CalendarClock
} from 'lucide-react'
import { findRecommendedSpeed } from '@/lib/water-balance'
import { ResponsiveContainer, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Area, ReferenceLine } from 'recharts'

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
// Zona amarela: threshold × 1,15 (alinhado ao getIrrigationStatus de water-balance.ts)
function resolveStatus(lastM: DailyManagement | null, hasActiveSeason: boolean, threshold = 70): IrrigationStatus {
  if (!hasActiveSeason) return 'sem_safra'
  if (!lastM) return 'verde'
  const pct = lastM.field_capacity_percent ?? null
  if (pct === null) return 'verde'
  const warningPct = threshold * 1.15
  if (pct >= warningPct) return 'verde'
  if (pct >= threshold) return 'amarelo'
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

  const totalPivots  = summary.totalPivots
  const activePivots = summary.activePivots

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 60, animation: 'fadeIn 0.4s ease-in-out' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}} />

      {/* ① Título simples e Ação Primária */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#e2e8f0', letterSpacing: '-0.02em', margin: 0 }}>Command Center</h1>
          <p style={{ fontSize: 13, color: '#8899aa', marginTop: 4 }}>
            {totalPivots} {totalPivots === 1 ? 'pivô' : 'pivôs'} · {activePivots} com safra ativa
          </p>
        </div>
        <Link href="/manejo" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 700,
          background: 'linear-gradient(135deg, #005A8C, #0093D0)',
          color: '#fff', textDecoration: 'none', flexShrink: 0,
          boxShadow: '0 4px 16px rgba(0,147,208,0.4)',
        }}>
          <Droplets size={14} /> Manejo Diário
        </Link>
      </div>

      {/* ② Recomendações Operacionais — sempre visível */}
      {(() => {
        // Calcula projeção para cada pivô ativo usando dados do banco (sem fetch externo)
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

        const recs: PivotRec[] = []

        for (const pivot of pivots) {
          if (!activePivotIds.has(pivot.id)) continue
          const mgmt = lastManagementByPivot[pivot.id]
          const pct = mgmt?.field_capacity_percent ?? null

          if (mgmt?.needs_irrigation) {
            recs.push({
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
                const deficit = Math.max(targetMm - adc, thresholdMm * 0.1)
                const speed = findRecommendedSpeed(pivot, Math.max(0, targetMm - adc))
                  ?? (Math.ceil(speedFloor / 10) * 10)
                recs.push({
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

        // Ordena: irrigar hoje primeiro, depois por dias
        recs.sort((a, b) => {
          if (a.needsIrrigationToday && !b.needsIrrigationToday) return -1
          if (!a.needsIrrigationToday && b.needsIrrigationToday) return 1
          return (a.daysAway ?? 99) - (b.daysAway ?? 99)
        })

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
            background: '#0f1923', border: `1px solid ${borderColor}`, borderRadius: 16,
            overflow: 'hidden', boxShadow: urgentCount > 0 ? '0 0 20px rgba(239,68,68,0.08)' : '0 4px 20px rgba(0,0,0,0.2)',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 18px', background: headerBg,
              borderBottom: `1px solid ${borderColor}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarClock size={14} style={{ color: headerColor }} />
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#e2e8f0' }}>
                  Recomendações de Irrigação
                </span>
                {urgentCount > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, color: '#ef4444',
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 6, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {urgentCount} irrigar hoje
                  </span>
                )}
              </div>
              {summary.pivotsWithClimateFallback > 0 && (
                <Link href="/diagnostico-pivo" style={{
                  fontSize: 10, color: '#556677', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Info size={10} /> {summary.pivotsWithClimateFallback} fallback climático
                </Link>
              )}
            </div>

            {/* Linhas */}
            {!hasAnything ? (
              <div style={{ padding: '16px 18px' }}>
                <p style={{ fontSize: 12, color: '#556677' }}>Nenhum pivô ativo com dados de balanço.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recs.map((rec, i) => {
                  const isUrgent = rec.needsIrrigationToday
                  const isSoon = !isUrgent && (rec.daysAway ?? 99) <= 2
                  const color = isUrgent ? '#ef4444' : isSoon ? '#f59e0b' : '#22c55e'
                  const Icon = isUrgent ? AlertCircle : isSoon ? AlertTriangle : CheckCircle2

                  return (
                    <div key={rec.pivotId} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 18px',
                      borderBottom: i < recs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      background: isUrgent ? 'rgba(239,68,68,0.04)' : 'transparent',
                    }}>
                      <Icon size={14} style={{ color, flexShrink: 0 }} />

                      {/* Nome do pivô */}
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', minWidth: 110 }}>
                        {rec.pivotName}
                      </span>

                      {/* CC% */}
                      {rec.pct != null && (
                        <span style={{
                          fontSize: 11, fontFamily: 'var(--font-mono)', color: color,
                          background: `${color}15`, border: `1px solid ${color}30`,
                          borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                        }}>
                          {Math.round(rec.pct)}%
                        </span>
                      )}

                      {/* Recomendação */}
                      <span style={{ fontSize: 12, color: isUrgent ? '#e2e8f0' : '#8899aa', flex: 1 }}>
                        {isUrgent
                          ? 'Irrigar hoje'
                          : rec.daysAway === 1 ? 'Irrigar amanhã'
                          : `Irrigar em ${rec.daysAway} dias`}
                      </span>

                      {/* Lâmina */}
                      {(rec.laminaToday ?? rec.laminaProjected ?? 0) > 0 && (
                        <span style={{ fontSize: 11, color: '#e2e8f0', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                          {(rec.laminaToday ?? rec.laminaProjected ?? 0).toFixed(1)} mm
                        </span>
                      )}

                      {/* Velocidade */}
                      {(rec.speedToday ?? rec.speedProjected) != null && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: '#0093D0',
                          fontFamily: 'var(--font-mono)',
                          background: 'rgba(0,147,208,0.1)', border: '1px solid rgba(0,147,208,0.2)',
                          borderRadius: 4, padding: '2px 7px', flexShrink: 0,
                        }}>
                          {rec.speedToday ?? rec.speedProjected}%
                        </span>
                      )}

                      <Link href="/manejo" style={{
                        fontSize: 10, color: '#556677', textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                      }}>
                        Manejo <ArrowRight size={10} />
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ③ Hero Section: Mapa + Radar Tático */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 2fr) minmax(320px, 1fr)', gap: 20 }}>
        {/* Mapa do Parque */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#e2e8f0' }}>
              Planta da Fazenda
            </span>
            <span style={{ fontSize: 12, color: '#8899aa' }}>Visão espacial instantânea</span>
            <span style={{ fontSize: 11, color: '#445566', marginLeft: 4 }}>·</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#445566' }}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <PivotMap onPivotClick={setSelectedPivotPlotId} pivots={pivots.map(p => ({
            id:               p.id,
            name:             p.name,
            farm_name:        p.farms?.name ?? '',
            latitude:         p.latitude,
            longitude:        p.longitude,
            status:           resolveStatus(lastManagementByPivot[p.id] ?? null, activePivotIds.has(p.id), p.alert_threshold_percent ?? 70),
            lastManagement:   lastManagementByPivot[p.id] ?? null,
            length_m:         p.length_m,
            sector_start_deg: p.sector_start_deg,
            sector_end_deg:   p.sector_end_deg,
          }))} />
        </div>

        {/* Radar Tático: Lista de Pivôs por prioridade */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#e2e8f0' }}>
              Radar Tático
            </span>
          </div>
          <CriticalPivots
            pivots={pivots}
            lastManagementByPivot={lastManagementByPivot}
            activePivotIds={activePivotIds}
            diagnosticsByPivot={diagnosticsByPivot}
          />
        </div>
      </div>

      {/* ④ Recomendações Secundárias */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, marginTop: 20 }}>
        <RecommendationsMatrix
          contexts={contexts}
          lastMgmtBySeasonId={lastManagementBySeason}
          currentAdcBySeasonId={currentAdcBySeasonId}
          today={(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}` })()}
        />
        
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(400px, 2fr)', gap: 16 }}>
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

        <EnergyBlock energyBills={energyBills} />
      </div>

      {/* ⑤ Modal Top Gráfico de Projeção */}
      {selectedPivotPlotId && (() => {
         const pivot = pivots.find(p => p.id === selectedPivotPlotId)
         const ctx = contexts.find(c => c.season.pivot_id === selectedPivotPlotId)
         if (!pivot) return null
         
         let trendData: Array<{ name: string; moisture: number }> = []
         if (ctx) {
           const history = historyBySeason[ctx.season.id] || []
           trendData = history.slice(0, 10).reverse().map((d: any) => {
              return {
                name: d.date.slice(8, 10) + '/' + d.date.slice(5, 7),
                moisture: d.field_capacity_percent != null ? parseFloat(d.field_capacity_percent.toFixed(1)) : 100
              }
           })
         }
         const threshold = pivot.alert_threshold_percent ?? 50

         return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectedPivotPlotId(null)}>
               <div style={{ width: '90%', maxWidth: 700, background: '#1c1c1e', borderRadius: 24, padding: '30px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', border: '1px solid #2A2A2E', position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setSelectedPivotPlotId(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: '#8899aa', cursor: 'pointer' }}>
                    <X size={20} />
                  </button>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#8899AA', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{pivot.name}</h3>
                  <p style={{ fontSize: 11, color: '#556677', marginBottom: 24 }}>Cockpit de Análise de Ponto de Murcha e Stress Hídrico (Últimos dias)</p>
                  
                  <div style={{ height: 320, width: '100%', position: 'relative' }}>
                    {trendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorMoistureModal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#CCFF00" stopOpacity={0.6}/>
                            <stop offset="70%" stopColor="#00E5FF" stopOpacity={0.1}/>
                            <stop offset="100%" stopColor="#0f1923" stopOpacity={0}/>
                          </linearGradient>
                          <filter id="glowModal" height="200%">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                            <feMerge>
                              <feMergeNode in="coloredBlur"/>
                              <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                          </filter>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2A2A2E" />
                        <XAxis dataKey="name" tick={{ fill: '#8899aa', fontSize: 11 }} axisLine={false} tickLine={false} dy={10} />
                        <YAxis tick={{ fill: '#8899aa', fontSize: 11 }} axisLine={false} tickLine={false} domain={[-10, 110]} />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#10151C', border: '1px solid #2A2A2E', borderRadius: 8, color: '#fff', fontSize: 13 }} 
                          itemStyle={{ color: '#CCFF00' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="moisture" 
                          stroke="#00E5FF" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorMoistureModal)" 
                          style={{ filter: 'url(#glowModal)' }}
                          activeDot={{ r: 6, fill: '#CCFF00', stroke: '#10151C', strokeWidth: 2 }}
                        />
                        <ReferenceLine y={100} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} label={{ position: 'insideTopLeft', value: 'CAPACIDADE DE CAMPO (CC)', fill: '#22c55e', fontSize: 10, offset: 4 }} />
                        <ReferenceLine y={threshold} stroke="#FF3366" strokeDasharray="4 4" strokeWidth={1} label={{ position: 'insideTopLeft', value: 'ALVO MÍNIMO / SEGURANÇA (%)', fill: '#FF3366', fontSize: 10, offset: 4 }} />
                        <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} label={{ position: 'insideBottomLeft', value: 'PONTO DE MURCHA (PM) / Zero Hídrico', fill: '#ef4444', fontSize: 10, offset: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#556677', fontSize: 13 }}>
                        Nenhum dado consolidadado de umidade para gerar a projeção deste pivô.
                      </div>
                    )}
                  </div>
               </div>
            </div>
         )
      })()}
    </div>
  )
}

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
  CheckCircle2, X
} from 'lucide-react'
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

      {/* ② Alertas Globais (se houver) */}
      {(summary.pivotsWithAlerts > 0 || summary.pivotsWithClimateFallback > 0) && (
        <div style={{
          background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16,
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'rgb(245 158 11 / 0.1)', border: '1px solid rgb(245 158 11 / 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Info size={16} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Alertas do Sistema</p>
            <p style={{ fontSize: 12, color: '#556677', marginTop: 2 }}>
              {summary.pivotsWithAlerts} pivô(s) com alertas pendentes · {summary.pivotsWithClimateFallback} usando fallback climático
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

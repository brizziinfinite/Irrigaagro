'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { PivotDiagnostic } from '@/services/pivot-diagnostics'
import type { ManagementSeasonContext } from '@/services/management'
import type { Pivot, Season, DailyManagement, EnergyBill } from '@/types/database'
import { DecisionCard } from './DecisionCard'
import { EnergyBlock } from './EnergyBlock'
import { CriticalPivots } from './CriticalPivots'
import { RecommendationsMatrix } from './RecommendationsMatrix'
import { CompactKpis } from './CompactKpis'
import { SoilGaugesBlock } from './SoilGaugesBlock'
import { HistoryBlock } from './HistoryBlock'
import {
  Plus, ArrowRight,
  Droplets, AlertTriangle, AlertCircle, Info,
  CheckCircle2,
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
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0', marginBottom: 10 }}>Bem-vindo ao Gotejo</h1>
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
  diagnosticsByPivot,
  energyBills,
  summary,
}: Props) {
  if (!hasPivots) return <Onboarding />

  const activePivotIds = new Set(activeSeasons.map(s => s.pivot_id).filter((id): id is string => id !== null))

  const lastManagementByPivot: Record<string, DailyManagement> = {}
  for (const season of activeSeasons) {
    if (season.pivot_id && lastManagementBySeason[season.id]) {
      const rawRecord = lastManagementBySeason[season.id]
      // Substitui o field_capacity_percent pelo valor projetado para hoje
      // (descontando ETc dos dias sem registro desde o último manejo)
      const currentPct = currentFieldCapacityBySeasonId[season.id] ?? rawRecord.field_capacity_percent
      lastManagementByPivot[season.pivot_id] = { ...rawRecord, field_capacity_percent: currentPct }
    }
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

      {/* ④ Pivôs Críticos */}
      <CriticalPivots
        pivots={pivots}
        lastManagementByPivot={lastManagementByPivot}
        activePivotIds={activePivotIds}
        diagnosticsByPivot={diagnosticsByPivot}
      />

      {/* ④b Matriz de Recomendações 7 dias */}
      <RecommendationsMatrix
        contexts={contexts}
        lastMgmtBySeasonId={lastManagementBySeason}
        today={(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}` })()}
      />

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

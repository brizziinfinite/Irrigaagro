'use client'

import Link from 'next/link'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from 'recharts'
import { Satellite, CloudRain } from 'lucide-react'
import type { DailyManagement, Farm, Pivot } from '@/types/database'
import type { ManagementSeasonContext } from '@/services/management'
import { calcDAS } from '@/lib/calculations/management-balance'
import { getStageInfoForDas, calcCTA, calcCAD } from '@/lib/water-balance'

interface Props {
  pivot: Pivot
  farm: Farm | null
  context: ManagementSeasonContext | null
  history: DailyManagement[]
  today: string
}

// ─── Soil Diagram — idêntico ao do manejo ────────────────────

type PivotIrrigationStatus = 'azul' | 'verde' | 'amarelo' | 'vermelho'

const PIVOT_STATUS_CONFIG: Record<PivotIrrigationStatus, { label: string; color: string; bg: string; border: string }> = {
  azul:     { label: 'Irrigando',   color: '#0093D0', bg: 'rgb(0 147 208 / 0.12)',   border: 'rgb(0 147 208 / 0.25)'  },
  verde:    { label: 'Confortável', color: '#22c55e', bg: 'rgb(34 197 94 / 0.12)',   border: 'rgb(34 197 94 / 0.25)'  },
  amarelo:  { label: 'Atenção',     color: '#f59e0b', bg: 'rgb(245 158 11 / 0.12)',  border: 'rgb(245 158 11 / 0.25)' },
  vermelho: { label: 'Crítico',     color: '#ef4444', bg: 'rgb(239 68 68 / 0.12)',   border: 'rgb(239 68 68 / 0.25)'  },
}

function resolvePivotStatus(adcMm: number, _cadMm: number, ctaMm: number, _threshold: number | null): PivotIrrigationStatus {
  // Paleta unificada: Verde ≥75% | Âmbar 60–75% | Vermelho <60%
  const pct = ctaMm > 0 ? (adcMm / ctaMm) * 100 : 100
  if (pct >= 75) return 'verde'
  if (pct >= 60) return 'amarelo'
  return 'vermelho'
}

function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(decimals)
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

interface SoilDiagramRichProps {
  ctaMm: number
  cadMm: number
  adcMm: number
  recommendedDepthMm: number
  eto: number | null
  etc: number | null
  kc: number | null
  das: number
  cropStage: number
  rootDepthCm: number
  cropName: string | null
  farmName: string
  pivotName: string
  date: string
  areaHa: number | null
  alertThresholdPct: number | null
}

function SoilDiagramRich({
  ctaMm, cadMm, adcMm, recommendedDepthMm,
  eto, etc, kc, das, cropStage, rootDepthCm,
  cropName, farmName, pivotName, date, areaHa, alertThresholdPct,
}: SoilDiagramRichProps) {
  const status = resolvePivotStatus(adcMm, cadMm, ctaMm, alertThresholdPct)
  const cfg = PIVOT_STATUS_CONFIG[status]
  const stageLabels = ['', 'Inicial', 'Desenv.', 'Médio', 'Final']
  const cropEmojis: Record<string, string> = {
    milho: '🌽', soja: '🌱', trigo: '🌾', algodao: '🪴', algodão: '🪴', feijao: '🫘', feijão: '🫘',
  }
  const cropEmoji = Object.entries(cropEmojis).find(([k]) => cropName?.toLowerCase().includes(k))?.[1] ?? '🌱'

  const USABLE = 75
  const mmToPct = ctaMm > 0 ? USABLE / ctaMm : 1
  const adcTopPct     = adcMm * mmToPct
  const cadLinePct    = cadMm * mmToPct
  const ctaTopPct     = USABLE
  const deficitMm     = Math.max(0, ctaMm - adcMm)
  const deficitTopPct = ctaTopPct
  const deficitBotPct = adcTopPct
  const fieldCapacityPercent = ctaMm > 0 ? (adcMm / ctaMm) * 100 : 0
  const H = 240

  return (
    <div style={{ background: '#0f1923', border: `1px solid ${cfg.border}`, borderRadius: 14, overflow: 'hidden' }}>

      {/* ── Header: info da safra ── */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0', lineHeight: 1.3 }}>{pivotName}</p>
          <p style={{ fontSize: 12, color: '#556677', marginTop: 2 }}>
            <span style={{ color: '#8899aa' }}>{farmName}</span>
            {cropName && <> · <span style={{ color: '#0093D0' }}>{cropName}</span></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {recommendedDepthMm > 0 && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Irrigar Hoje</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: cfg.color, fontFamily: 'var(--font-mono)' }}>{fmtNum(recommendedDepthMm)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span></p>
            </div>
          )}
          {areaHa != null && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Área</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{areaHa.toFixed(1)} <span style={{ fontSize: 11, color: '#8899aa' }}>ha</span></p>
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ETo</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>{fmtNum(eto)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span></p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ETc</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{fmtNum(etc)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span></p>
          </div>
        </div>
      </div>

      {/* ── Linha secundária: Cultura / Fase / Data ── */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Cultura', value: cropName ?? '—' },
          { label: 'Fase', value: `${cropStage}ª (${das} dias)` },
          { label: 'Data', value: fmtDate(date) },
          { label: 'DAS', value: `${das}` },
        ].map(({ label, value }) => (
          <div key={label}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#445566', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ fontSize: 13, color: '#e2e8f0', marginTop: 1 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Bloco ETc + emoji Pill Premium ── */}
      <div style={{ margin: '14px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#8899aa' }}>ETc</p>
            <span style={{ fontSize: 10, color: '#8899aa', letterSpacing: 2 }}>↑↑↑</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{fmtNum(etc)} <span style={{ fontSize: 12, fontWeight: 400, color: '#8899aa' }}>mm</span></p>
            <span style={{ fontSize: 14, color: '#556677', lineHeight: 1 }}>≋</span>
          </div>
        </div>
        
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 30, lineHeight: 1 }}>{cropEmoji}</span>
          </div>
        </div>
        
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 64, flex: '1 1 auto', alignItems: 'flex-end' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#8899aa', paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{stageLabels[cropStage] ?? `Fase ${cropStage}`}</p>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{das} <span style={{ fontSize: 12, fontWeight: 400, color: '#8899aa' }}>dias</span></p>
        </div>
      </div>

      {/* ── Diagrama de solo (Wavy Premium) ── */}
      <div style={{ margin: '0 20px 20px', position: 'relative', borderRadius: 12, overflow: 'hidden', height: H, background: '#0a1016' /* Cyber-Agro Dark Soil */ }}>
        
        {/* Sonda vertical (Central Pipeline) */}
        <div style={{
          position: 'absolute', left: '50%', top: `${100 - ctaTopPct}%`, bottom: '6%',
          width: 8, background: 'linear-gradient(to right, #445566, #8899aa, #445566)',
          borderRadius: 2, transform: 'translateX(-50%)', zIndex: 1,
        }}>
          {/* Cap da Sonda (Superficie) */}
          <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 14, height: 6, borderRadius: 2, background: '#8899aa' }} />
        </div>

        {/* Camada de Água Disponível com Efeito Wavy */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: `${adcTopPct}%`,
          transition: 'height 0.8s ease',
          zIndex: 2,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <style>{`
            @keyframes waterWaveX {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `}</style>
          {/* A onda SVG duplicada para scroll contínuo sem solavancos */}
          <div style={{ width: '200%', display: 'flex', animation: 'waterWaveX 14s linear infinite', flexShrink: 0 }}>
            <svg viewBox="0 0 1000 60" preserveAspectRatio="none" style={{ width: '50%', height: 20, display: 'block', transform: 'translateY(1px)' }}>
              <path d="M0,60 L0,30 C 250,55 250,5 500,30 C 750,55 750,5 1000,30 L1000,60 Z" fill="#06b6d4" opacity="0.8" />
              <path d="M0,60 L0,40 C 300,60 300,10 600,40 C 850,60 850,20 1000,40 L1000,60 Z" fill="#0284c7" opacity="0.5" />
              <path d="M0,60 L0,45 C 200,65 200,25 500,45 C 800,65 800,25 1000,45 L1000,60 Z" fill="#0891b2" />
            </svg>
            <svg viewBox="0 0 1000 60" preserveAspectRatio="none" style={{ width: '50%', height: 20, display: 'block', transform: 'translateY(1px)' }}>
              <path d="M0,60 L0,30 C 250,55 250,5 500,30 C 750,55 750,5 1000,30 L1000,60 Z" fill="#06b6d4" opacity="0.8" />
              <path d="M0,60 L0,40 C 300,60 300,10 600,40 C 850,60 850,20 1000,40 L1000,60 Z" fill="#0284c7" opacity="0.5" />
              <path d="M0,60 L0,45 C 200,65 200,25 500,45 C 800,65 800,25 1000,45 L1000,60 Z" fill="#0891b2" />
            </svg>
          </div>
          {/* Corpo da Água */}
          <div style={{ flex: 1, background: '#0891b2' /* Darker Cyan para profundidade */ }} />
        </div>

        {/* Linha verde — CC */}
        <div style={{ position: 'absolute', bottom: `${ctaTopPct}%`, left: 0, right: 0, height: 3, background: '#22c55e', zIndex: 3 }} />

        {/* Linha amarela — Limite CAD */}
        <div style={{ position: 'absolute', bottom: `${cadLinePct}%`, left: 0, right: 0, height: 2, background: '#f59e0b', zIndex: 3, opacity: 0.9 }} />

        {/* Linha vermelha — Ponto de Murcha */}
        <div style={{ position: 'absolute', bottom: '1%', left: 0, right: 0, height: 2, background: '#ef4444', zIndex: 3 }} />

        {/* ── Badges Ancorados ── */}

        {/* Badge: Déficit Previsto (Ancorado à direita, junto à linha Verde) */}
        {deficitMm > 0 && (
          <div style={{ position: 'absolute', bottom: `calc(${ctaTopPct}% - 4px)`, right: 12, transform: 'translateY(100%)', zIndex: 5 }}>
            <div style={{ background: 'rgba(20, 30, 45, 0.85)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
              <p style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600 }}>Déficit Previsto</p>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>{fmtNum(deficitMm)} mm</p>
            </div>
          </div>
        )}

        {/* Badge: Disponível (Ancorado à esquerda, LOGO ABAIXO da onda de água) */}
        <div style={{ position: 'absolute', bottom: `calc(${Math.max(2, adcTopPct)}% - 24px)`, left: 12, transform: 'translateY(0%)', zIndex: 5 }}>
          <div style={{ background: 'rgba(6, 40, 60, 0.85)', backdropFilter: 'blur(4px)', border: '1px solid rgba(6, 182, 212, 0.4)', borderRadius: 8, padding: '6px 12px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
            <p style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600 }}>Disponível</p>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>{fmtNum(adcMm)} mm</p>
          </div>
        </div>

        {/* Badge Prof. de Manejo — centralizado no diagrama, junto à sonda */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 6 }}>
          <div style={{
            background: 'rgba(8, 16, 28, 0.75)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 14,
            padding: '10px 20px',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>Prof. de Manejo</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0', fontFamily: 'var(--font-mono)', margin: 0, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {fmtNum(rootDepthCm, 0)}
              <span style={{ fontSize: 12, fontWeight: 400, color: '#8899aa', marginLeft: 4 }}>cm</span>
            </p>
          </div>
        </div>

        {/* CC% e Status — Canto Superior Esquerdo */}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5 }}>
          <div style={{
            background: cfg.bg,
            border: `1px solid ${cfg.border}`,
            borderRadius: 20,
            padding: '5px 12px',
            backdropFilter: 'blur(6px)',
            boxShadow: `0 0 12px ${cfg.color}30`,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }} />
            <p style={{ fontSize: 11, fontWeight: 800, color: cfg.color, margin: 0 }}>{fmtNum(fieldCapacityPercent, 0)}% · {cfg.label}</p>
          </div>
        </div>
      </div>

      {/* ── Legenda ── */}
      <div style={{ padding: '0 20px 14px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { color: '#22c55e', label: 'Cap. de Campo (CC)' },
          { color: '#06b6d4', label: 'Umidade Atual' },
          { color: '#f59e0b', label: 'Limite CAD' },
          { color: '#ef4444', label: 'Ponto de Murcha' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 3, background: color, borderRadius: 2 }} />
            <span style={{ fontSize: 10, color: '#445566' }}>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Satellite size={9} style={{ color: '#445566' }} />
          <span style={{ fontSize: 10, color: '#334455' }}>ETo via cálculo local · média</span>
        </div>
      </div>
    </div>
  )
}

// ─── Metric chip ──────────────────────────────────────────────

function Chip({ label, value, sub, color = '#e2e8f0' }: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      padding: '14px 16px',
      minWidth: 0,
    }}>
      <p style={{ fontSize: 10, color: '#445566', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
        {label}
      </p>
      <p style={{ fontSize: 20, fontWeight: 800, margin: '5px 0 0', color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 10, color: '#445566', margin: '3px 0 0' }}>{sub}</p>
      )}
    </div>
  )
}

// ─── Evolution Chart ──────────────────────────────────────────

function AccumItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{label}:</p>
      <p style={{ fontSize: 13, color: '#8899aa', margin: '2px 0 0' }}>{value}</p>
    </div>
  )
}

function EvolutionChart({ history, pivotName, seasonName, fFactor, CC, PM }: {
  history: DailyManagement[]
  pivotName: string
  seasonName: string
  fFactor: number
  CC: number   // Capacidade de campo (% volumétrica, ex: 30.49)
  PM: number   // Ponto de murcha (% volumétrica, ex: 16.1)
}) {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))

  const stageDates = new Set<string>()
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].crop_stage !== sorted[i - 1].crop_stage) stageDates.add(sorted[i].date)
  }

  const chartData = sorted.map(m => {
    // Converte field_capacity_percent (0-100 normalizado) → % volumétrica real
    // Solo nunca passa da CC — excesso de chuva percola, não é representado acima da CC
    const pct = m.field_capacity_percent
    const vol = pct == null ? null : PM + (CC - PM) * (Math.min(pct, 100) / 100)
    return {
      date: new Date(m.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      irrigation: m.actual_depth_mm ?? 0,
      rainfall: m.rainfall_mm ?? 0,
      excess: m.irn_mm ?? 0,
      moisture: vol,
      stageChange: stageDates.has(m.date) ? vol : null,
    }
  })

  // Linhas de referência em % volumétrica real
  const safetyVol = PM + (CC - PM) * (1 - fFactor)  // limite de estresse

  // Domínio do eixo: PM-margem até CC+margem (curva nunca passa da CC)
  const margin = (CC - PM) * 0.1
  const yMin  = Math.max(0, Math.floor((PM - margin) * 10) / 10)
  const yMax  = Math.ceil((CC + margin) * 10) / 10

  // Gradiente: vermelho abaixo da segurança, azul acima
  // Normalizado para o domínio [yMin, yMax]
  const safetyFraction = Math.round(((safetyVol - yMin) / (yMax - yMin)) * 100)

  // ── Acumulados ──
  const totalIrrigation = sorted.reduce((s, m) => s + (m.actual_depth_mm ?? 0), 0)
  const totalRainfall   = sorted.reduce((s, m) => s + (m.rainfall_mm ?? 0), 0)

  // ETCp = ETo × Kc (sem estresse), ETC = etc_mm (com Ks)
  const totalEtcp = sorted.reduce((s, m) => {
    const etcp = (m.eto_mm != null && m.kc != null) ? m.eto_mm * m.kc : (m.etc_mm ?? 0)
    return s + etcp
  }, 0)
  const totalEtc = sorted.reduce((s, m) => s + (m.etc_mm ?? 0), 0)

  // Excesso total = soma dos dias onde ADc ultrapassou CTA (irn_mm registra isso)
  const excessTotal = sorted.reduce((s, m) => s + (m.irn_mm ?? 0), 0)

  // Excesso de irrigação = irrigação aplicada acima do necessário
  const excessIrrigation = sorted.reduce((s, m) => {
    const applied  = m.actual_depth_mm ?? 0
    const needed   = m.recommended_depth_mm ?? 0
    return s + Math.max(0, applied - needed)
  }, 0)

  // Reduções: (ETCp - ETC) / ETCp
  const reducaoEtcp = totalEtcp > 0 ? ((totalEtcp - totalEtc) / totalEtcp) * 100 : 0

  // Excesso de irrigação %: excesso / irrigação total
  const excessIrrigationPct = totalIrrigation > 0 ? (excessIrrigation / totalIrrigation) * 100 : 0

  const lastDate = sorted.length > 0
    ? new Date(sorted[sorted.length - 1].date + 'T12:00:00').toLocaleDateString('pt-BR')
    : '—'

  if (chartData.length === 0) {
    return (
      <p style={{ color: '#445566', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
        Nenhum registro de manejo ainda.
      </p>
    )
  }

  return (
    <div>
      {/* Chart */}
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 50, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#445566', fontSize: 10 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            tickLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
          />
          <YAxis
            yAxisId="mm"
            tick={{ fill: '#445566', fontSize: 10 }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            yAxisId="vol" orientation="right"
            domain={[yMin, yMax]}
            tick={{ fill: '#445566', fontSize: 10 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#e2e8f0', fontSize: 12 }}
            labelStyle={{ color: '#8899aa', marginBottom: 4 }}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            formatter={(value, name) => {
              const v = typeof value === 'number' ? value.toFixed(1) : value
              const labels: Record<string, string> = {
                irrigation: 'Irrigação (mm)',
                rainfall: 'Precipitação (mm)',
                excess: 'Excesso (mm)',
                moisture: 'Umidade (%)',
                stageChange: 'Mudança de fase',
              }
              return [v, labels[String(name)] ?? name]
            }}
          />
          <defs>
            <linearGradient id="moistureGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset={`${safetyFraction}%`} stopColor="#ef4444" />
              <stop offset={`${safetyFraction}%`} stopColor="#0093D0" />
              <stop offset="100%" stopColor="#0093D0" />
            </linearGradient>
          </defs>

          <ReferenceArea yAxisId="vol" y1={safetyVol} y2={yMax} fill="rgba(34, 197, 94, 0.04)" />
          <ReferenceArea yAxisId="vol" y1={yMin} y2={safetyVol} fill="rgba(239, 68, 68, 0.04)" />

          <ReferenceLine yAxisId="vol" y={CC}         stroke="#22c55e" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `CC ${CC}%`, fill: '#22c55e', fontSize: 9, position: 'insideTopRight' }} />
          <ReferenceLine yAxisId="vol" y={safetyVol}  stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `Seg. ${safetyVol.toFixed(1)}%`, fill: '#f59e0b', fontSize: 9, position: 'insideTopRight' }} />
          <ReferenceLine yAxisId="vol" y={PM}         stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `PM ${PM}%`, fill: '#ef4444', fontSize: 9, position: 'insideBottomRight' }} />

          <Bar yAxisId="mm" dataKey="irrigation" name="Irrigação (mm)"    fill="#22d3ee" radius={[3,3,0,0]} maxBarSize={14} />
          <Bar yAxisId="mm" dataKey="rainfall"   name="Precipitação (mm)" fill="rgba(255,255,255,0.85)" radius={[3,3,0,0]} maxBarSize={14} />
          <Bar yAxisId="mm" dataKey="excess"     name="Excesso Irrigação (mm)" fill="#f97316" radius={[3,3,0,0]} maxBarSize={14} />

          <Line yAxisId="vol" type="monotone" dataKey="moisture"    name="Umidade (%)"   stroke="url(#moistureGradient)" strokeWidth={3} dot={false} connectNulls />
          <Line yAxisId="vol" type="monotone" dataKey="stageChange" name="Fase"          stroke="transparent" strokeWidth={0}
            dot={{ fill: '#f59e0b', r: 6, strokeWidth: 2, stroke: '#0d1520' }}
            activeDot={false} connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, paddingLeft: 4 }}>
        {[
          { color: '#22c55e', label: `CC (${CC}%)` },
          { color: '#f59e0b', label: `Lim. Estresse (${safetyVol.toFixed(1)}%)` },
          { color: '#ef4444', label: `PM (${PM}%)` },
          { color: '#0093D0', label: 'Umidade (%)' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
            <span style={{ fontSize: 10, color: '#556677' }}>{label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#22d3ee' }} />
          <span style={{ fontSize: 10, color: '#556677' }}>Irrigação (mm)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.85)' }} />
          <span style={{ fontSize: 10, color: '#556677' }}>Precipitação (mm)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f97316' }} />
          <span style={{ fontSize: 10, color: '#556677' }}>Excesso Irrigação (mm)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', border: '2px solid #0d1520' }} />
          <span style={{ fontSize: 10, color: '#556677' }}>Fase</span>
        </div>
      </div>

      {/* ── Valores Acumulados (estilo concorrente) ── */}
      <div style={{
        marginTop: 28,
        paddingTop: 20,
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0', margin: '0 0 16px' }}>
          Valores Acumulados
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <AccumItem label="Equipamento"         value={pivotName} />
          <AccumItem label="Parcela"             value={seasonName} />
          <AccumItem label="Irrigação"           value={`${totalIrrigation.toFixed(0)} mm`} />
          <AccumItem label="ETCp"                value={`${totalEtcp.toFixed(2)} mm`} />
          <AccumItem label="Precipitação"        value={`${totalRainfall.toFixed(0)} mm`} />
          <AccumItem label="ETC"                 value={`${totalEtc.toFixed(2)} mm`} />
          <AccumItem label="Excesso Total"       value={`${excessTotal.toFixed(2)} mm`} />
          <AccumItem label="Excesso de Irrigação" value={`${excessIrrigation.toFixed(2)} mm`} />
          <AccumItem label="Redução de ETCp"    value={`${reducaoEtcp.toFixed(2)} %`} />
          <AccumItem label="Excesso Irrigação %" value={`${excessIrrigationPct.toFixed(2)} %`} />
          <AccumItem label="Dias Registrados"    value={String(sorted.length)} />
          <AccumItem label="Último Registro"     value={lastDate} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

export function PivotDetailClient({ pivot, farm, context, history, today }: Props) {
  const { season, crop } = context ?? {}

  const das       = season?.planting_date ? calcDAS(season.planting_date, today) : 0
  const stageInfo = crop ? getStageInfoForDas(crop, das) : null

  const CC      = pivot.field_capacity ?? season?.field_capacity ?? 0
  const PM      = pivot.wilting_point  ?? season?.wilting_point  ?? 0
  const Ds      = pivot.bulk_density   ?? season?.bulk_density   ?? 1.0
  const fFactor = stageInfo?.fFactor ?? season?.f_factor ?? 0.5

  const ctaMm = stageInfo ? calcCTA(CC, PM, Ds, stageInfo.rootDepthCm) : 0
  const cadMm = calcCAD(ctaMm, fFactor)

  const lastMgmt  = history.length > 0 ? history[0] : null   // DESC order
  const adcMm     = lastMgmt?.ctda ?? (ctaMm * ((season?.initial_adc_percent ?? 100) / 100))
  const adcPct    = ctaMm > 0 ? (adcMm / ctaMm) * 100 : 0
  const deficitMm = Math.max(0, cadMm - adcMm)

  const statusColor = deficitMm > 0 ? '#ef4444' : adcPct < 80 ? '#f59e0b' : '#22c55e'
  const statusLabel = deficitMm > 0 ? 'Irrigar' : adcPct < 80 ? 'Atenção' : 'OK'

  const areaHa = pivot.length_m ? (Math.PI * pivot.length_m ** 2) / 10000 : null

  return (
    <div style={{ padding: '0 0 48px', maxWidth: 1040, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: '#445566', textDecoration: 'none', marginBottom: 10,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Dashboard
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#e2e8f0', margin: 0, letterSpacing: '-0.02em' }}>
              {pivot.name}
            </h1>
            <p style={{ fontSize: 13, color: '#445566', margin: '3px 0 0' }}>
              {farm?.name ?? ''}{season ? ` · ${season.name}` : ''}
            </p>
          </div>

          <div style={{
            marginLeft: 'auto',
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 16px', borderRadius: 99,
            background: `${statusColor}18`,
            border: `1px solid ${statusColor}45`,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>
              {statusLabel} · {Math.round(adcPct)}% campo
            </span>
          </div>
        </div>
      </div>

      {!season ? (
        <div style={{
          background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: 48, textAlign: 'center',
        }}>
          <p style={{ color: '#445566', fontSize: 14, marginBottom: 16 }}>
            Nenhuma safra ativa para este pivô.
          </p>
          <Link href="/safras" style={{
            display: 'inline-block', padding: '9px 22px', borderRadius: 10,
            background: '#0093D0', color: '#fff', textDecoration: 'none',
            fontSize: 13, fontWeight: 700,
          }}>
            Criar safra
          </Link>
        </div>
      ) : (
        <>
          {/* ── Row 1: diagrama completo ── */}
          <div style={{ marginBottom: 16 }}>
            {ctaMm > 0 ? (
              <SoilDiagramRich
                ctaMm={ctaMm}
                cadMm={cadMm}
                adcMm={adcMm}
                recommendedDepthMm={deficitMm}
                eto={lastMgmt?.eto_mm ?? null}
                etc={lastMgmt?.etc_mm ?? null}
                kc={stageInfo?.kc ?? lastMgmt?.kc ?? null}
                das={das}
                cropStage={stageInfo?.stage ?? 1}
                rootDepthCm={stageInfo?.rootDepthCm ?? 25}
                cropName={crop?.name ?? null}
                farmName={farm?.name ?? ''}
                pivotName={pivot.name}
                date={lastMgmt?.date ?? today}
                areaHa={areaHa}
                alertThresholdPct={pivot.alert_threshold_percent ?? null}
              />
            ) : (
              <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 48, textAlign: 'center' }}>
                <p style={{ color: '#445566', fontSize: 14 }}>Configure CC, PM e densidade do solo na safra.</p>
              </div>
            )}
          </div>

          {/* ── Row 2: Gráfico evolução (largura total) ── */}
          <div style={{
            background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, padding: 20,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#445566', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Evolução — Histórico Completo
            </span>
            <div style={{ marginTop: 16 }}>
              <EvolutionChart
                history={history}
                pivotName={pivot.name}
                seasonName={season.name}
                fFactor={fFactor}
                CC={CC}
                PM={PM}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

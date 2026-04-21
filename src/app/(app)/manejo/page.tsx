'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { Season, Crop, Pivot, DailyManagement, Farm, DailyManagementInsert } from '@/types/database'
import {
  getStageInfoForDas, calcCTA, calcProjection, calcRa, calcDepthForSpeed,
  type ProjectionDay,
  type RecommendationStatus,
} from '@/lib/water-balance'
import {
  calcDAS,
  computeResolvedManagementBalance,
} from '@/lib/calculations/management-balance'
import {
  getManagementExternalData,
  listDailyManagementBySeason,
  listManagementSeasonContexts,
  upsertDailyManagementRecord,
  type ManagementExternalData,
} from '@/services/management'
import { upsertRainfallRecord, deleteRainfallRecord, listRainfallByPivotIdAndSector } from '@/services/rainfall'
import {
  type EToSource,
  type EToConfidence,
  getEToSourceLabel,
  getEToConfidenceLabel,
} from '@/lib/calculations/eto-resolution'
import {
  Loader2, ChevronDown, Droplets, Sun, CloudRain,
  Wind, Thermometer, CheckCircle2, AlertTriangle, AlertCircle,
  Save, Calendar, FlaskConical, Sprout, Clock,
  Satellite, Sheet, TrendingDown, Zap, Orbit,
  Edit2, Trash2, X, Plus
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ComposedChart, Line, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, Cell, AreaChart, BarChart } from 'recharts'
import WaterBalanceChart from './WaterBalanceChart'

// ─── Status semáforo ─────────────────────────────────────────

type IrrigationStatus = 'azul' | 'verde' | 'amarelo' | 'vermelho'

const STATUS_CONFIG: Record<IrrigationStatus, { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2; desc: string }> = {
  azul:     { label: 'Irrigando',     color: '#06b6d4', bg: 'rgb(6 182 212 / 0.12)',   border: 'rgb(6 182 212 / 0.25)',   icon: Droplets,      desc: 'Irrigação em andamento' },
  verde:    { label: 'OK',            color: '#22c55e', bg: 'rgb(34 197 94 / 0.12)',    border: 'rgb(34 197 94 / 0.25)',   icon: CheckCircle2,  desc: 'Sem necessidade de irrigação' },
  amarelo:  { label: 'Atenção',       color: '#f59e0b', bg: 'rgb(245 158 11 / 0.12)',   border: 'rgb(245 158 11 / 0.25)', icon: AlertTriangle, desc: 'Irrigação recomendada em breve' },
  vermelho: { label: 'Irrigar Agora', color: '#ef4444', bg: 'rgb(239 68 68 / 0.12)',    border: 'rgb(239 68 68 / 0.25)',  icon: AlertCircle,   desc: 'Solo abaixo do nível crítico' },
}

// ─── Helpers ─────────────────────────────────────────────────

function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return '—'
  return n.toFixed(decimals)
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

// ─── Tipos ───────────────────────────────────────────────────

interface SeasonFull extends Season {
  crops: Crop | null
  pivots: Pivot | null
  farms: Farm
}

function getClimateSourceInfo(source: ManagementExternalData['climateSource'] | null): {
  label: string; icon: typeof Satellite; color: string; border: string; bg: string
} | null {
  if (source === 'pivot_station')    return { label: 'Estação do pivô',    icon: Satellite, color: '#0093D0', border: '1px solid rgb(0 147 208/0.20)', bg: 'rgba(0,147,208,0.06)' }
  if (source === 'farm_station')     return { label: 'Estação da fazenda',  icon: Sheet,     color: '#06b6d4', border: '1px solid rgb(6 182 212/0.20)', bg: 'rgb(6 182 212/0.06)' }
  if (source === 'pivot_geolocation') return { label: 'Open-Meteo (geo)',   icon: Orbit,     color: '#f59e0b', border: '1px solid rgb(245 158 11/0.15)', bg: 'rgb(245 158 11/0.06)' }
  return null
}

function resolvePreviousAdc(
  season: SeasonFull | null,
  history: DailyManagement[],
  date: string,
  das: number | null
): number {
  const prevRecord = history.find((record) => record.date < date)
  if (prevRecord?.ctda != null) return prevRecord.ctda

  if (!season || !season.crops || !das) return 0

  const fc = season.pivots?.field_capacity ?? season.field_capacity
  const wp = season.pivots?.wilting_point  ?? season.wilting_point
  const bd = season.pivots?.bulk_density   ?? season.bulk_density
  if (!fc || !wp || !bd) return 0

  const initialPct = season.initial_adc_percent ?? 100
  const { rootDepthCm } = getStageInfoForDas(season.crops, das)
  const cta = calcCTA(Number(fc), Number(wp), Number(bd), rootDepthCm)

  return (initialPct / 100) * cta
}

// ─── Input simples ───────────────────────────────────────────

function InputField({ label, value, onChange, unit, placeholder, type = 'number' }: {
  label: string; value: string; onChange: (v: string) => void
  unit?: string; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={type} step={type === 'number' ? 'any' : undefined}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: unit ? '11px 44px 11px 14px' : '11px 14px',
            borderRadius: 8, fontSize: 15,
            background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e2e8f0', outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = '#0093D0'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
        {unit && (
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#445566', pointerEvents: 'none' }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}


// ─── Diagrama visual do solo (Estilo Tablet Radial Gauge) ─────────────

interface SoilDiagramProps {
  status: IrrigationStatus
  fieldCapacityPercent: number
  adcNew: number
  cad: number
  cta: number
  recommendedDepthMm: number
  das: number
  cropStage: number
  eto: number
  etc: number
  kc: number
  rootDepthCm: number
  etoSource: EToSource
  etoConfidence: EToConfidence | null
  alertThresholdPct: number | null
  cropName: string | null
  farmName: string
  pivotName: string | null
  seasonName: string
  date: string
  pivotAreaHa: number | null
}

function SoilDiagram({
  status, fieldCapacityPercent, adcNew, cad, cta,
  recommendedDepthMm, das, cropStage, eto, etc, kc, rootDepthCm,
  etoSource, etoConfidence, alertThresholdPct,
  cropName, farmName, pivotName, seasonName, date, pivotAreaHa,
}: SoilDiagramProps) {
  const cfg = STATUS_CONFIG[status]
  
  // Radial Gauge Calculations
  const radius = 100
  const strokeWidth = 14
  const circumference = 2 * Math.PI * radius
  
  // Clamping progress and calculating dash offset
  const progressPercent = Math.max(0, Math.min(100, fieldCapacityPercent))
  const offset = circumference - (progressPercent / 100) * circumference
  
  // Dynamic glow and colors
  const trackColor = '#1A2433'
  let gaugeColorPrimary = '#00E5FF' // Cyan
  let gaugeColorSecondary = '#39FF14' // Neon Green
  if (status === 'amarelo') {
    gaugeColorPrimary = '#FFEA00'
    gaugeColorSecondary = '#FF9900'
  } else if (status === 'vermelho') {
    gaugeColorPrimary = '#FF3366'
    gaugeColorSecondary = '#E60039'
  }

  return (
    <div style={{
      background: 'linear-gradient(160deg, #10151C, #18202A)',
      border: `1px solid rgba(255,255,255,0.04)`,
      borderRadius: 24,
      padding: '30px',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      height: '100%',
    }}>
      {/* ── Header: Info Principal da Célula ── */}
      <div style={{ zIndex: 2, marginBottom: 20 }}>
        <p style={{ fontSize: 24, fontWeight: 900, color: '#F1F5F9', letterSpacing: '-0.02em', textShadow: '0 0 10px rgba(255,255,255,0.1)' }}>
          {pivotName ?? seasonName}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 13, color: '#8899aa' }}>Status:</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color, display: 'flex', alignItems: 'center', gap: 4 }}>
            {status === 'verde' || status === 'azul' ? 'Ativo' : status === 'amarelo' ? 'Aviso' : 'Crítico'} 
            ({fieldCapacityPercent.toFixed(0)}% Umidade)
          </span>
        </div>
      </div>

      {/* ── Center: O Gauge Radial SVG ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '20px 0', minHeight: 280
      }}>
        <svg width="260" height="260" viewBox="0 0 240 240" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
          <defs>
            <linearGradient id="gaugeGradient" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gaugeColorPrimary} />
              <stop offset="100%" stopColor={gaugeColorSecondary} />
            </linearGradient>
            <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Track */}
          <circle cx="120" cy="120" r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
          
          {/* Progress Arc */}
          <circle
            cx="120" cy="120" r={radius}
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            filter="url(#gaugeGlow)"
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />

          {/* Limit Threshold Mark */}
          {alertThresholdPct && (
            <circle
              cx="120" cy="120" r={radius - strokeWidth/2 + 2}
              fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeDasharray={'2 6'}
              style={{ opacity: 0.5 }}
            />
          )}
        </svg>

        {/* Text inside Gauge */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none'
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#8899aa', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Umidade (C.C.)
          </span>
          <span style={{ 
            fontSize: 54, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.1,
            textShadow: `0 0 20px ${gaugeColorPrimary}60`, fontFamily: 'var(--font-mono)'
          }}>
            {fieldCapacityPercent.toFixed(0)}<span style={{ fontSize: 30 }}>%</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
          </div>
        </div>
      </div>

      {/* ── Stats Grid (Analytics Premium Agro) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 'auto' }}>
        
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 16 }}>
          <p style={{ fontSize: 10, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Situação da Cultura</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cropName ?? 'Não inf.'}</span>
            <span style={{ fontSize: 11, color: '#00E5FF', fontWeight: 700 }}>D{das}</span>
          </div>
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 8 }}>Prof. de Raiz: <span style={{ color: '#fff' }}>{Math.round(rootDepthCm)} cm</span></p>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 16 }}>
          <p style={{ fontSize: 10, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Armazenamento</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }} title="Capacidade de Água Disponível: Água estocada que a raiz da cultura consegue extrair sem sofrer estresse severo."><span style={{cursor: 'help', borderBottom: '1px dotted #8899aa'}}>CAD:</span> {cad.toFixed(1)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span></p>
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 8 }} title="Capacidade Total de Água: Quantidade máxima de água em milímetros que a atual profundidade de raiz consegue processar antes de escorrer (percolação profunda)."><span style={{cursor: 'help', borderBottom: '1px dotted #8899aa'}}>CTA Total:</span> <span style={{ color: '#fff' }}>{cta.toFixed(1)} mm</span></p>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 16 }}>
          <p style={{ fontSize: 10, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hídrico Solos</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#00E5FF', fontFamily: 'var(--font-mono)' }} title="Conteúdo de Umidade Atual (ADc): Volume real de água disponível no solo hoje."><span style={{cursor: 'help', borderBottom: '1px dotted #00E5FF'}}>Atual:</span> {adcNew.toFixed(1)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span></p>
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 8 }}>Falta p/ CC: <span style={{ color: '#ef4444' }}>{Math.max(0, cta - adcNew).toFixed(1)} mm</span></p>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 16 }}>
          <p style={{ fontSize: 10, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Limiar de Segurança</span>
            {alertThresholdPct && <span style={{ color: '#f59e0b' }}>({alertThresholdPct}%)</span>}
          </p>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
            Mín: {(cta * ((alertThresholdPct ?? 50)/100)).toFixed(1)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span>
          </p>
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 8 }}>
            Déficit Aceitável: <span style={{ color: '#fff' }}>{(cta - (cta * ((alertThresholdPct ?? 50)/100))).toFixed(1)} mm</span>
          </p>
        </div>

      </div>
    </div>
  )
}



// ─── Projeção 7 dias (simulação interativa) ─────────────────

interface ProjectionForecastProps {
  days: ProjectionDay[]
  baseDays: ProjectionDay[]  // projeção sem irrigação (para comparação)
  avgEto: number | null
  pivot: Pivot | null
  simulatedIrrigation: number[]
  onSimulate: (irrigationByDay: number[]) => void
}

function ProjectionForecast({ days, baseDays, avgEto, pivot, simulatedIrrigation, onSimulate }: ProjectionForecastProps) {
  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null)
  const [selectedSpeed, setSelectedSpeed] = useState<string>('')
  const [manualDepth, setManualDepth] = useState<string>('')

  if (days.length === 0) return null

  const hasSimulation = simulatedIrrigation.some(v => v > 0)
  const firstIrrigIdx = days.findIndex(d => d.isIrrigationDay)

  const hasMechanicalData = !!(pivot?.time_360_h && pivot?.flow_rate_m3h && pivot?.length_m)

  function handleApply(dayIdx: number) {
    const depth = manualDepth ? parseFloat(manualDepth) : 0
    if (depth <= 0) return
    const newArr = [...simulatedIrrigation]
    newArr[dayIdx] = depth
    onSimulate(newArr)
    setEditingDayIdx(null)
    setSelectedSpeed('')
    setManualDepth('')
  }

  function handleRemove(dayIdx: number) {
    const newArr = [...simulatedIrrigation]
    newArr[dayIdx] = 0
    onSimulate(newArr)
    setEditingDayIdx(null)
    setSelectedSpeed('')
    setManualDepth('')
  }

  function handleSpeedChange(speedStr: string) {
    setSelectedSpeed(speedStr)
    if (!speedStr || !pivot) { setManualDepth(''); return }
    const depth = calcDepthForSpeed(pivot, parseInt(speedStr))
    if (depth !== null) setManualDepth(depth.toFixed(1))
    else setManualDepth('')
  }

  function handleClearAll() {
    onSimulate([0, 0, 0, 0, 0, 0, 0])
    setEditingDayIdx(null)
    setSelectedSpeed('')
    setManualDepth('')
  }

  return (
    <div style={{ background: '#0f1923', border: hasSimulation ? '1px solid rgba(0,147,208,0.25)' : '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <TrendingDown size={14} style={{ color: hasSimulation ? '#0093D0' : '#0093D0' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
          {hasSimulation ? 'Projeção — Simulação Ativa' : 'Projeção — próximos 7 dias'}
        </span>
        {avgEto !== null && (
          <span style={{ fontSize: 11, color: '#556677', marginLeft: 'auto' }}>
            ETo base: <span style={{ color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>{avgEto.toFixed(1)} mm/d</span>
          </span>
        )}
        {hasSimulation ? (
          <button onClick={handleClearAll} style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 20,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#ef4444', cursor: 'pointer',
          }}>
            Limpar simulação
          </button>
        ) : (
          <span style={{ fontSize: 10, color: '#445566', padding: '3px 8px', borderRadius: 20, background: '#0d1520' }}>sem chuva prevista</span>
        )}
      </div>

      {/* Alerta */}
      {firstIrrigIdx >= 0 && (
        <div style={{
          margin: '12px 20px 0', padding: '10px 14px', borderRadius: 10,
          background: firstIrrigIdx <= 1 ? 'rgb(239 68 68/0.1)' : firstIrrigIdx <= 3 ? 'rgb(245 158 11/0.1)' : 'rgba(0,147,208,0.08)',
          border: firstIrrigIdx <= 1 ? '1px solid rgb(239 68 68/0.3)' : firstIrrigIdx <= 3 ? '1px solid rgb(245 158 11/0.3)' : '1px solid rgb(0 147 208/0.20)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Zap size={13} style={{ color: firstIrrigIdx <= 1 ? '#ef4444' : firstIrrigIdx <= 3 ? '#f59e0b' : '#0093D0', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: firstIrrigIdx <= 1 ? '#ef4444' : firstIrrigIdx <= 3 ? '#f59e0b' : '#0093D0' }}>
              {firstIrrigIdx === 0 ? 'Iniciar irrigação amanhã!'
                : firstIrrigIdx === 1 ? 'Iniciar irrigação em 2 dias'
                : `Irrigar em ${firstIrrigIdx + 1} dias (${fmtDate(days[firstIrrigIdx].date)})`}
            </p>
            <p style={{ fontSize: 10, color: '#556677' }}>
              Lâmina prevista para o dia: {fmtNum(days[firstIrrigIdx].recommendedDepthMm)} mm
              {days[firstIrrigIdx].recommendedSpeedPercent !== null ? ` · Velocidade: ${days[firstIrrigIdx].recommendedSpeedPercent}%` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Linhas — scroll horizontal no mobile */}
      <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 420, padding: '14px 20px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {days.map((day, i) => {
          const cfg = STATUS_CONFIG[day.status]
          const StatusIcon = cfg.icon
          const pct = Math.max(0, Math.min(100, day.fieldCapacityPercent))
          const cadPct = day.cta > 0 ? (day.cad / day.cta) * 100 : 0
          const isAlert = day.isIrrigationDay
          const hasIrrigHere = simulatedIrrigation[i] > 0
          const baseDay = baseDays[i]
          const basePct = baseDay ? Math.max(0, Math.min(100, baseDay.fieldCapacityPercent)) : null
          const showComparison = hasSimulation && basePct !== null && Math.abs(pct - basePct) > 0.5

          return (
            <div key={day.date}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '80px 30px 1fr 60px 46px 90px 32px',
                alignItems: 'center', gap: 8,
                padding: isAlert ? '8px 10px' : '5px 10px',
                borderRadius: 9,
                background: hasIrrigHere ? 'rgba(0,147,208,0.08)' : isAlert ? cfg.bg : i % 2 ? '#080e14' : 'transparent',
                border: hasIrrigHere ? '1px solid rgba(0,147,208,0.25)' : isAlert ? `1px solid ${cfg.border}` : '1px solid transparent',
              }}>
                <span style={{ fontSize: 11, color: isAlert ? cfg.color : '#8899aa', fontWeight: isAlert ? 700 : 400 }}>
                  {i === 0 ? 'Amanhã' : fmtDate(day.date)}
                </span>
                <span style={{ fontSize: 10, color: '#445566' }}>D{day.das}</span>
                <div style={{ position: 'relative', height: 12, background: '#080e14', borderRadius: 99, overflow: 'visible' }}>
                  <div style={{ position: 'absolute', left: `${cadPct}%`, top: -2, bottom: -2, width: 2, background: '#f59e0b', opacity: 0.6, borderRadius: 1, zIndex: 2 }} />
                  {showComparison && basePct !== null && (
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${basePct}%`, background: cfg.color, borderRadius: 99, opacity: 0.2 }} />
                  )}
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: cfg.color, borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                  {showComparison && basePct !== null ? (
                    <>
                      <span style={{ color: '#556677', textDecoration: 'line-through', fontSize: 10 }}>{fmtNum(basePct, 0)}%</span>
                      <span style={{ color: cfg.color, fontWeight: 700 }}> {fmtNum(day.fieldCapacityPercent, 0)}%</span>
                    </>
                  ) : (
                    <span style={{ color: cfg.color, fontWeight: 700 }}>{fmtNum(day.fieldCapacityPercent, 0)}%</span>
                  )}
                </span>
                <span style={{ fontSize: 10, textAlign: 'right' }} title={day.recommendedDepthMm > 0 ? `Déficit previsto D+${i+1}: ${fmtNum(day.recommendedDepthMm)} mm` : `ETc prevista: ${fmtNum(day.etcAvg)} mm/dia`}>
                  {hasIrrigHere ? (
                    <span style={{ color: '#0093D0', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10 }}>+{fmtNum(simulatedIrrigation[i])}</span>
                  ) : day.recommendedDepthMm > 0 ? (
                    <><span style={{ color: cfg.color, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtNum(day.recommendedDepthMm)}</span><span style={{ color: '#556677' }}> mm</span></>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>NI</span>
                  )}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                  <StatusIcon size={10} style={{ color: cfg.color }} />
                  <span style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                </div>
                {/* Botão + / editar irrigação simulada */}
                <button
                  onClick={() => { setEditingDayIdx(editingDayIdx === i ? null : i); setSelectedSpeed(''); setManualDepth(simulatedIrrigation[i] > 0 ? simulatedIrrigation[i].toFixed(1) : '') }}
                  style={{
                    width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: hasIrrigHere ? 'rgba(0,147,208,0.15)' : 'rgba(255,255,255,0.04)',
                    color: hasIrrigHere ? '#0093D0' : '#556677',
                    fontSize: 14, fontWeight: 700, lineHeight: 1,
                  }}
                  title={hasIrrigHere ? 'Editar irrigação simulada' : 'Simular irrigação neste dia'}
                >
                  {hasIrrigHere ? <Droplets size={12} /> : '+'}
                </button>
              </div>

              {/* Mini-form inline de simulação */}
              {editingDayIdx === i && (
                <div style={{
                  margin: '4px 0 2px 110px', padding: '10px 14px', borderRadius: 9,
                  background: 'rgba(0,147,208,0.06)', border: '1px solid rgba(0,147,208,0.15)',
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  {hasMechanicalData && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: 11, color: '#8899aa' }}>Velocidade:</label>
                      <select
                        value={selectedSpeed}
                        onChange={e => handleSpeedChange(e.target.value)}
                        style={{
                          padding: '5px 8px', borderRadius: 6, fontSize: 12,
                          background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)',
                          color: '#e2e8f0', cursor: 'pointer',
                        }}
                      >
                        <option value="">—</option>
                        {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(s => (
                          <option key={s} value={s}>{s}%</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: 11, color: '#8899aa' }}>Lâmina:</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={manualDepth}
                      onChange={e => { setManualDepth(e.target.value); setSelectedSpeed('') }}
                      placeholder="mm"
                      style={{
                        width: 70, padding: '5px 8px', borderRadius: 6, fontSize: 12,
                        background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)',
                        color: '#e2e8f0', outline: 'none',
                      }}
                      onFocus={e => e.target.style.borderColor = '#0093D0'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />
                    <span style={{ fontSize: 10, color: '#556677' }}>mm</span>
                  </div>
                  <button
                    onClick={() => handleApply(i)}
                    disabled={!manualDepth || parseFloat(manualDepth) <= 0}
                    style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: manualDepth && parseFloat(manualDepth) > 0 ? '#0093D0' : '#0d1520',
                      border: 'none', color: manualDepth && parseFloat(manualDepth) > 0 ? '#fff' : '#445566',
                      cursor: manualDepth && parseFloat(manualDepth) > 0 ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Aplicar
                  </button>
                  {hasIrrigHere && (
                    <button
                      onClick={() => handleRemove(i)}
                      style={{
                        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        color: '#ef4444', cursor: 'pointer',
                      }}
                    >
                      Remover
                    </button>
                  )}
                  <button
                    onClick={() => setEditingDayIdx(null)}
                    style={{
                      padding: '5px 8px', borderRadius: 6, fontSize: 11,
                      background: 'none', border: 'none', color: '#556677', cursor: 'pointer',
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      </div>{/* fim overflowX:auto */}

      <div style={{ padding: '8px 20px 10px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 2, height: 10, background: '#f59e0b', opacity: 0.7 }} />
            <span style={{ fontSize: 10, color: '#445566' }}>Limiar irrigação</span>
          </div>
          <span style={{ fontSize: 10, color: '#445566' }}>· Clique no <strong>+</strong> para simular irrigação</span>
        </div>
        {hasSimulation && (
          <span style={{ fontSize: 10, color: '#0093D0', fontStyle: 'italic' }}>
            Valores riscados mostram a projeção sem irrigação para comparação.
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Tabela histórico ─────────────────────────────────────────

function HistoryTable({ records, onEdit, onDelete, threshold = 70 }: {
  records: DailyManagement[]
  threshold?: number
  onEdit: (record: DailyManagement) => void
  onDelete: (record: DailyManagement) => void
}) {
  if (records.length === 0) {
    return (
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '28px 24px', textAlign: 'center' }}>
        <Calendar size={22} style={{ color: '#445566', margin: '0 auto 8px' }} />
        <p style={{ fontSize: 13, color: '#445566' }}>Nenhum registro ainda.</p>
      </div>
    )
  }

  const COLS = '88px 38px 54px 54px 54px 60px 52px 54px 80px 56px'

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 600, display: 'grid', gridTemplateColumns: COLS, gap: 4, padding: '9px 16px', background: '#0d1520', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['Data', 'DAS', 'ETo', 'ETc', 'Chuva', 'Lâmina', 'ADc (Umidade)', 'CC%', 'Status', ''].map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#445566', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>
      {records.map((r, i) => {
        const pct = r.field_capacity_percent ?? null
        const warningPct = threshold * 1.15
        const status: IrrigationStatus = pct === null ? 'verde' : pct >= warningPct ? 'verde' : pct >= threshold ? 'amarelo' : 'vermelho'
        const cfg = STATUS_CONFIG[status as IrrigationStatus]
        const StatusIcon = cfg.icon
        const lamina = r.actual_depth_mm ?? null
        return (
          <div key={r.id} style={{ minWidth: 600, display: 'grid', gridTemplateColumns: COLS, gap: 4, padding: '9px 16px', borderBottom: i < records.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 ? '#080e14' : 'transparent', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#8899aa' }}>{fmtDate(r.date)}</span>
            <span style={{ fontSize: 12, color: '#445566' }}>{r.das ?? '—'}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.eto_mm)}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.etc_mm)}</span>
            <span style={{ fontSize: 12, color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.rainfall_mm)}</span>
            <span style={{ fontSize: 12, color: lamina !== null && lamina > 0 ? '#00E5FF' : '#334455', fontFamily: 'var(--font-mono)', fontWeight: lamina !== null && lamina > 0 ? 700 : 400 }}>
              {lamina !== null && lamina > 0 ? `${fmtNum(lamina)} mm` : '—'}
            </span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.ctda)}</span>
            <span style={{ fontSize: 12, color: cfg.color, fontFamily: 'var(--font-mono)' }}>{pct !== null ? `${fmtNum(pct, 0)}%` : '—'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <StatusIcon size={10} style={{ color: cfg.color }} />
              <span style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => onEdit(r)}
                title="Editar registro"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', borderRadius: 5, color: '#445566', lineHeight: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#0093D0')}
                onMouseLeave={e => (e.currentTarget.style.color = '#445566')}
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => onDelete(r)}
                title="Excluir registro"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', borderRadius: 5, color: '#445566', lineHeight: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#445566')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────

export default function ManejoPage() {
  const { company, loading: authLoading } = useAuth()
  const [seasons, setSeasons]     = useState<SeasonFull[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [history, setHistory]     = useState<DailyManagement[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [externalData, setExternalData]     = useState<ManagementExternalData | null>(null)
  const [projection, setProjection]         = useState<ProjectionDay[]>([])
  const [baseProjection, setBaseProjection] = useState<ProjectionDay[]>([])
  const [avgEto, setAvgEto]                 = useState<number | null>(null)
  const [simulatedIrrigation, setSimulatedIrrigation] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])

  const [date, setDate]           = useState(todayISO())
  const [tmax, setTmax]           = useState('')
  const [tmin, setTmin]           = useState('')
  
  // ── UI States para Modo Premium (Clean) ──
  const [showForm, setShowForm]   = useState(false)
  const [showHistoryTab, setShowHistoryTab] = useState(false)
  const [humidity, setHumidity]   = useState('')
  const [wind, setWind]           = useState('')
  const [radiation, setRadiation] = useState('')
  const [rainfall, setRainfall]   = useState('')
  const [actualSpeed, setActualSpeed] = useState('')
  const [actualDepth, setActualDepth] = useState('')
  const [irrigStart, setIrrigStart]   = useState('')
  const [irrigEnd, setIrrigEnd]       = useState('')
  const [depthAutoFilled, setDepthAutoFilled] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DailyManagement | null>(null)

  // ─── Carregar safras ────────────────────────────────────────
  const loadSeasons = useCallback(async () => {
    if (!company?.id) { setSeasons([]); setSelectedSeasonId(''); setLoading(false); return }
    setLoading(true)
    try {
      const contexts = await listManagementSeasonContexts(company.id)
      const list: SeasonFull[] = contexts.map(c => ({ ...c.season, crops: c.crop, pivots: c.pivot, farms: c.farm }))
      setSeasons(list)
      setSelectedSeasonId(cur => {
        if (cur && list.some(s => s.id === cur)) return cur
        return list.find(s => s.is_active)?.id ?? list[0]?.id ?? ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar safras.')
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => { if (!authLoading) loadSeasons() }, [authLoading, loadSeasons])

  const loadHistory = useCallback(async (seasonId: string) => {
    if (!seasonId) return
    try {
      const data = await listDailyManagementBySeason(seasonId)
      setHistory(data.slice(0, 30))
    } catch {
      setHistory([])
    }
  }, [])

  useEffect(() => { if (selectedSeasonId) loadHistory(selectedSeasonId) }, [selectedSeasonId, loadHistory])

  // Recarrega histórico quando o usuário volta para a aba (ex: após editar precipitações)
  useEffect(() => {
    if (!selectedSeasonId) return
    const handleFocus = () => loadHistory(selectedSeasonId)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [selectedSeasonId, loadHistory])

  const selectedSeason = useMemo(
    () => seasons.find(s => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId]
  )

  // ─── Busca automática de clima ──────────────────────────────
  // Não busca quando em modo edição (campos já foram preenchidos com os dados do registro)
  useEffect(() => {
    if (!selectedSeason || !date) { setExternalData(null); return }
    if (editingRecord) return  // em modo edição, não sobrescreve os campos
    const season = selectedSeason
    let cancelled = false

    async function fetchClimate() {
      setWeatherLoading(true)
      try {
        const snapshot = await getManagementExternalData(season.farms.id, season.pivots?.id ?? null, date, season.pivots)
        if (cancelled) return
        setExternalData(snapshot)
        const cs = snapshot.weather ?? snapshot.geolocationWeather
        setTmax(cs?.temp_max != null ? cs.temp_max.toFixed(1) : '')
        setTmin(cs?.temp_min != null ? cs.temp_min.toFixed(1) : '')
        setHumidity(cs?.humidity_percent != null ? cs.humidity_percent.toFixed(0) : '')
        setWind(cs?.wind_speed_ms != null ? cs.wind_speed_ms.toFixed(1) : '')
        setRadiation(cs?.solar_radiation_wm2 != null ? cs.solar_radiation_wm2.toFixed(0) : '')
        // Chuva SOMENTE de rainfall_records (entrada manual/importação)
        // Não usar Open-Meteo/weather_data como fonte de chuva — dados imprecisos
        setRainfall(snapshot.rainfall?.rainfall_mm != null
          ? snapshot.rainfall.rainfall_mm.toFixed(1)
          : '')
      } catch {
        if (!cancelled) setExternalData(null)
      } finally {
        if (!cancelled) setWeatherLoading(false)
      }
    }

    fetchClimate()
    return () => { cancelled = true }
  }, [selectedSeason, date, editingRecord])

  const das = useMemo(() => {
    if (!selectedSeason?.planting_date || !date) return null
    return calcDAS(selectedSeason.planting_date, date)
  }, [selectedSeason, date])

  const adcPrev = useMemo(
    () => resolvePreviousAdc(selectedSeason, history, date, das),
    [selectedSeason, history, date, das]
  )

  const calcResult = useMemo(() => {
    if (!selectedSeason) return null
    return computeResolvedManagementBalance({
      context: { season: selectedSeason, farm: selectedSeason.farms, pivot: selectedSeason.pivots, crop: selectedSeason.crops },
      history, date, tmax, tmin, humidity, wind, radiation, rainfall, actualDepth, actualSpeed, externalData,
    })
  }, [selectedSeason, history, date, tmax, tmin, humidity, wind, radiation, rainfall, actualDepth, actualSpeed, externalData])

  // ─── Projeção 7 dias ─────────────────────────────────────────
  // ETo base = valor do dia atual calculado (mesmo que aparece no diagrama)
  useEffect(() => {
    if (!calcResult || !selectedSeason?.crops || !das || !date) { setProjection([]); setBaseProjection([]); setAvgEto(null); return }
    const baseEto = calcResult.eto
    setAvgEto(baseEto)
    const pvt = selectedSeason.pivots
    const baseParams = {
      crop: selectedSeason.crops!,
      startDate: date, startDas: das,
      startAdc: calcResult.adcNew,
      fieldCapacity: Number(pvt?.field_capacity ?? selectedSeason.field_capacity ?? 32),
      wiltingPoint: Number(pvt?.wilting_point ?? selectedSeason.wilting_point ?? 14),
      bulkDensity: Number(pvt?.bulk_density ?? selectedSeason.bulk_density ?? 1.4),
      avgEto: baseEto,
      pivot: pvt ?? null,
      days: 7,
    }
    const base = calcProjection(baseParams)
    setBaseProjection(base)
    const hasIrrig = simulatedIrrigation.some(v => v > 0)
    setProjection(hasIrrig ? calcProjection({ ...baseParams, irrigationByDay: simulatedIrrigation }) : base)
  }, [calcResult, selectedSeason, das, date, history, simulatedIrrigation])

  // ─── Editar registro do histórico ────────────────────────────
  function loadRecordIntoForm(record: DailyManagement) {
    setDate(record.date)
    setTmax(record.temp_max?.toFixed(1) ?? '')
    setTmin(record.temp_min?.toFixed(1) ?? '')
    setHumidity(record.humidity_percent?.toFixed(0) ?? '')
    setWind(record.wind_speed_ms?.toFixed(1) ?? '')
    setRadiation(record.solar_radiation_wm2?.toFixed(0) ?? '')
    setRainfall((record.rainfall_mm ?? 0) > 0 ? (record.rainfall_mm ?? 0).toFixed(1) : '')
    setActualSpeed(record.actual_speed_percent?.toFixed(0) ?? '')
    setActualDepth(record.actual_depth_mm?.toFixed(1) ?? '')
    setIrrigStart(record.irrigation_start ?? '')
    setIrrigEnd(record.irrigation_end ?? '')
    setDepthAutoFilled(false)
    setEditingRecord(record)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingRecord(null)
    setDate(todayISO())
    setTmax(''); setTmin(''); setHumidity(''); setWind(''); setRadiation('')
    setRainfall(''); setActualSpeed(''); setActualDepth(''); setDepthAutoFilled(false)
    setIrrigStart(''); setIrrigEnd('')
    setSaveMsg(null)
  }

  async function handleDelete(record: DailyManagement) {
    if (!selectedSeason) return
    if (!confirm(`Excluir o registro de ${fmtDate(record.date)}? Esta ação não pode ser desfeita.`)) return
    setSaving(true); setSaveMsg(null); setError(null)
    try {
      const supabase = createClient()
      await supabase.from('daily_management').delete()
        .eq('season_id', selectedSeason.id).eq('date', record.date)
      await loadHistory(selectedSeason.id)
      setSaveMsg(`Registro de ${fmtDate(record.date)} excluído.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir registro.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Auto-fill lâmina a partir da velocidade ─────────────────
  // Só preenche automaticamente se: campo vazio OU preenchido automaticamente antes
  // Se o usuário digitou manualmente (depthAutoFilled=false, actualDepth!=''), não sobrescreve
  useEffect(() => {
    if (!depthAutoFilled && actualDepth !== '') return
    const speed = parseOptionalNumber(actualSpeed)
    const pivot = selectedSeason?.pivots ?? null
    if (!speed || !pivot) {
      if (depthAutoFilled) { setActualDepth(''); setDepthAutoFilled(false) }
      return
    }
    const depth = calcDepthForSpeed(pivot, speed)
    if (depth !== null) {
      setActualDepth(depth.toFixed(1))
      setDepthAutoFilled(true)
    }
  }, [actualSpeed, selectedSeason?.pivots?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Salvar ──────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedSeason || !calcResult || !date) return
    setSaving(true); setSaveMsg(null); setError(null)
    const cs = externalData?.weather ?? externalData?.geolocationWeather ?? null
    const payload: DailyManagementInsert = {
      season_id: selectedSeason.id, date, das: calcResult.das, crop_stage: calcResult.cropStage,
      temp_max: parseOptionalNumber(tmax) ?? cs?.temp_max ?? null,
      temp_min: parseOptionalNumber(tmin) ?? cs?.temp_min ?? null,
      humidity_percent: parseOptionalNumber(humidity) ?? cs?.humidity_percent ?? null,
      wind_speed_ms: parseOptionalNumber(wind) ?? cs?.wind_speed_ms ?? null,
      solar_radiation_wm2: parseOptionalNumber(radiation) ?? cs?.solar_radiation_wm2 ?? null,
      eto_mm: calcResult.eto, etc_mm: calcResult.etc,
      // Em modo edição, usa só o valor do campo (não sobrescreve com externalData)
      // Fora de edição, fallback para rainfall_records (nunca Open-Meteo)
      rainfall_mm: editingRecord
        ? (parseOptionalNumber(rainfall) ?? 0)
        : (parseOptionalNumber(rainfall) ?? externalData?.rainfall?.rainfall_mm ?? 0),
      kc: calcResult.kc, ks: calcResult.ks, ctda: calcResult.adcNew, cta: calcResult.cta,
      recommended_depth_mm: calcResult.recommendedDepthMm,
      recommended_speed_percent: calcResult.recommendedSpeedPercent,
      field_capacity_percent: calcResult.fieldCapacityPercent,
      needs_irrigation: calcResult.recommendedDepthMm > 0,
      actual_speed_percent: parseOptionalNumber(actualSpeed),
      actual_depth_mm: parseOptionalNumber(actualDepth),
      irrigation_start: irrigStart || null,
      irrigation_end: irrigEnd || null,
      soil_moisture_calculated: calcResult.fieldCapacityPercent,
    }
    try {
      await upsertDailyManagementRecord(payload)

      // Sincroniza chuva com rainfall_records (fonte autoritativa)
      // Se chuva > 0 → upsert com source='manual'. Se chuva = 0 → remove registro existente.
      const pivotId = selectedSeason.pivots?.id
      const rainfallMm = payload.rainfall_mm ?? 0
      if (pivotId) {
        if (rainfallMm > 0) {
          await upsertRainfallRecord({
            pivot_id: pivotId,
            date,
            rainfall_mm: rainfallMm,
            source: 'manual',
            sector_id: null,
          })
        } else {
          // Se zerou a chuva, remove o registro de rainfall_records (se existir)
          const existing = await listRainfallByPivotIdAndSector(pivotId, null)
          const rec = existing.find(r => r.date === date)
          if (rec) await deleteRainfallRecord(rec.id)
        }
      }

      setSaveMsg('Registro salvo com sucesso!')
      setEditingRecord(null)
      await loadHistory(selectedSeason.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar registro.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Loading / sem safra ─────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: '#0093D0' }} />
      </div>
    )
  }

  if (seasons.length === 0) {
    return (
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <Sprout size={32} style={{ color: '#0093D0', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Nenhuma safra ativa</h2>
        <p style={{ fontSize: 13, color: '#556677' }}>Cadastre uma safra em <strong style={{ color: '#8899aa' }}>Safras</strong> para iniciar o manejo.</p>
      </div>
    )
  }

  const climateInfo = getClimateSourceInfo(externalData?.climateSource ?? null)

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Título ── */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0' }}>Manejo Diário</h1>
        <p style={{ fontSize: 12, color: '#556677', marginTop: 2 }}>Balanço Hídrico FAO-56 Penman-Monteith</p>
      </div>

      {/* ── Seletor de safra ── */}
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Safra</label>
        <div style={{ position: 'relative' }}>
          <select value={selectedSeasonId} onChange={e => setSelectedSeasonId(e.target.value)}
            style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: 9, fontSize: 14, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none', appearance: 'none', cursor: 'pointer' }}
            onFocus={e => e.target.style.borderColor = '#0093D0'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          >
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name} — {s.farms.name}{s.pivots ? ` / ${s.pivots.name}` : ''}</option>
            ))}
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: '#445566', pointerEvents: 'none' }} />
        </div>

        {/* Badges da safra */}
        {selectedSeason && das !== null && selectedSeason.crops && (() => {
          const info = getStageInfoForDas(selectedSeason.crops!, das)
          const doy = Math.floor((new Date(date + 'T12:00:00').getTime() - new Date(new Date(date).getFullYear(), 0, 0).getTime()) / 86400000)
          const ra = selectedSeason.pivots?.latitude ? calcRa(selectedSeason.pivots.latitude!, doy) : null
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedSeason.crops && (
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgb(0 147 208/0.10)', border: '1px solid rgb(0 147 208/0.20)', color: '#0093D0', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Sprout size={9} /> {selectedSeason.crops.name}
                </span>
              )}
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#0d1520', color: '#8899aa' }}>DAS {das}</span>
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#0d1520', color: '#8899aa' }}>
                Fase {info.stage}
              </span>
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#0d1520', color: '#8899aa', display: 'flex', alignItems: 'center', gap: 3 }}>
                <FlaskConical size={9} /> f = {info.fFactor.toFixed(2)}
              </span>
              {ra !== null && (
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgb(245 158 11/0.08)', border: '1px solid rgb(245 158 11/0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Sun size={9} /> Ra {ra.toFixed(1)} MJ/m²·d
                </span>
              )}
              {selectedSeason.planting_date && (
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#0d1520', color: '#445566', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Calendar size={9} /> Plantio {fmtDate(selectedSeason.planting_date)}
                </span>
              )}
            </div>
          )
        })()}
      </div>

      {/* ── Banner modo edição ── */}
      {editingRecord && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, background: 'rgb(245 158 11/0.08)', border: '1px solid rgb(245 158 11/0.25)' }}>
          <Edit2 size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#f59e0b', flex: 1 }}>
            Editando registro de <strong>{fmtDate(editingRecord.date)}</strong> — salvar sobrescreverá apenas este dia
          </span>
          <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', borderRadius: 6 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgb(245 158 11/0.12)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <X size={12} /> Cancelar
          </button>
        </div>
      )}

      {/* ── MANEJO MAIN LAYOUT: GAUGE + TRENDS (TABLET VIEW) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.8fr] gap-6 items-stretch">
        
        {/* Lado Esquerdo - Gauge Radial */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
          {calcResult && selectedSeason ? (
            <SoilDiagram
              status={calcResult.status as IrrigationStatus}
              fieldCapacityPercent={calcResult.fieldCapacityPercent}
              adcNew={calcResult.adcNew}
              cad={calcResult.cad}
              cta={calcResult.cta}
              recommendedDepthMm={calcResult.recommendedDepthMm}
              das={calcResult.das}
              cropStage={calcResult.cropStage}
              eto={calcResult.eto}
              etc={calcResult.etc}
              kc={calcResult.kc}
              rootDepthCm={calcResult.rootDepthCm}
              etoSource={calcResult.etoSource as EToSource}
              etoConfidence={calcResult.etoConfidence as EToConfidence | null}
              alertThresholdPct={selectedSeason.pivots?.alert_threshold_percent ?? null}
              cropName={selectedSeason.crops?.name ?? null}
              farmName={selectedSeason.farms.name}
              pivotName={selectedSeason.pivots?.name ?? null}
              seasonName={selectedSeason.name}
              date={date}
              pivotAreaHa={
                selectedSeason.pivots?.length_m
                  ? Math.PI * Math.pow(selectedSeason.pivots.length_m, 2) / 10000
                  : null
              }
            />
          ) : (
            !loading && (
              <div style={{ background: '#0f1923', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 24, padding: '32px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                <Thermometer size={34} style={{ color: '#556677' }} />
                <p style={{ fontSize: 13, color: '#556677' }}>Preencha Tmax e Tmin para projetar o solo</p>
              </div>
            )
          )}
        </div>

        {/* Lado Direito - VISUALIZAÇÃO PREMIUM MOCKUP */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%', minWidth: 0 }}>
          {calcResult?.recommendation ? (
            (() => {
              const isConjugated = selectedSeason?.pivots?.operation_mode === 'conjugated'
              const rec = calcResult.recommendation
              const statusStyles: Record<RecommendationStatus, { color: string; label: string }> = {
                  ok:               { color: '#39FF14', label: 'SEM NECESSIDADE' },
                  queue:            { color: '#FFEA00', label: 'FILA (PENDENTE)' },
                  irrigate_today:   { color: '#00E5FF', label: 'IRRIGAR HOJE' },
                  operational_risk: { color: '#E60039', label: 'ALERTA (T < 0%)' },
              }
              const st = statusStyles[rec.status] || statusStyles.ok

              // 1. DATA PREP: Gráfico de Área (7-DAY TREND)
              const trendData = projection.slice(0, 7).map((d) => {
                 return {
                    name: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(d.date + 'T12:00:00').getDay()],
                    moisture: parseFloat(d.fieldCapacityPercent.toFixed(1))
                 }
              })

              // 2. DATA PREP: Gráfico de Uso de Água (últimos 7 dias)
              const waterUsageData = history.slice(0, 7).reverse().map((h: any) => {
                 return {
                   name: h.date.slice(8, 10), // dia
                   usage: parseFloat(String((h.actual_depth_mm || 0) + (h.rainfall_mm || 0)))
                 }
              })
              const totalWater7d = waterUsageData.reduce((acc, curr) => acc + curr.usage, 0)
              // ETc acumulada dos últimos 7 dias = demanda real da cultura
              const totalEtc7d = history.slice(0, 7).reduce((acc: number, h: any) => acc + (h.etc_mm ?? 0), 0)

              // 3. ANÁLISE PREDITIVA PARA O AGRICULTOR (Dias até próxima rega & Limites)
              const progReal = projection.find(p => p.isIrrigationDay)
              let previsaoTexto = 'Hoje'
              if (!rec.shouldIrrigateToday) {
                if (progReal) {
                   const diasFaltam = progReal.das - calcResult.das
                   if (diasFaltam === 1) previsaoTexto = `Amanhã (${progReal.recommendedDepthMm.toFixed(1)} mm)`
                   else previsaoTexto = `Em ${diasFaltam} dias (${progReal.recommendedDepthMm.toFixed(1)} mm)`
                } else {
                   previsaoTexto = 'Seguro (>7 dias)'
                }
              }
              const etcDiariaStr = calcResult.etc.toFixed(1)
              const capMaxPivotStr = rec.maxDepthMm != null ? rec.maxDepthMm.toFixed(1) : '—'
              const capWarning = (rec.maxDepthMm != null && calcResult.etc > rec.maxDepthMm)
              const targetThresholdLine = selectedSeason?.pivots?.alert_threshold_percent ?? 70

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%', minWidth: 0 }}>
                  
                  {/* === PAINEL 1: TENDÊNCIA DE UMIDADE === */}
                  <div style={{ background: '#1c1c1e', borderRadius: 16, padding: '24px 24px 14px 24px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.4)', flex: 1, minHeight: 280, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3 style={{ fontSize: 12, fontWeight: 700, color: '#8899AA', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Projeção 7 dias — sem irrigação
                      </h3>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[
                          { color: '#22c55e', label: `Seguro >${Math.round(targetThresholdLine * 1.15)}%` },
                          { color: '#f59e0b', label: `Atenção ${targetThresholdLine}–${Math.round(targetThresholdLine * 1.15)}%` },
                          { color: '#ef4444', label: `Crítico <${targetThresholdLine}%` },
                        ].map(z => (
                          <span key={z.label} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${z.color}15`, border: `1px solid ${z.color}30`, color: z.color, fontWeight: 600 }}>
                            {z.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorMoisture" x1="0" y1="1" x2="0" y2="0">
                              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25}/>
                              <stop offset={`${targetThresholdLine}%`} stopColor="#ef4444" stopOpacity={0.15}/>
                              <stop offset={`${targetThresholdLine}%`} stopColor="#22c55e" stopOpacity={0.12}/>
                              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.08}/>
                            </linearGradient>
                            <linearGradient id="strokeMoisture" x1="0" y1="1" x2="0" y2="0">
                              <stop offset="0%" stopColor="#ef4444"/>
                              <stop offset={`${targetThresholdLine}%`} stopColor="#ef4444"/>
                              <stop offset={`${targetThresholdLine}%`} stopColor="#22c55e"/>
                              <stop offset="100%" stopColor="#22c55e"/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="name" tick={{ fill: '#556677', fontSize: 11 }} axisLine={false} tickLine={false} dy={8} />
                          <YAxis tick={{ fill: '#556677', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 110]} tickFormatter={(v: number) => `${v}%`} />

                          {/* Zonas de solo */}
                          <ReferenceArea y1={Math.round(targetThresholdLine * 1.15)} y2={110} fill="rgba(34,197,94,0.04)" />
                          <ReferenceArea y1={targetThresholdLine} y2={Math.round(targetThresholdLine * 1.15)} fill="rgba(245,158,11,0.04)" />
                          <ReferenceArea y1={0} y2={targetThresholdLine} fill="rgba(239,68,68,0.06)" />

                          {/* Linhas de referência */}
                          <ReferenceLine y={100} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} opacity={0.3} label={{ position: 'insideTopRight', value: 'CC 100%', fill: '#22c55e', fontSize: 9 }} />
                          <ReferenceLine y={Math.round(targetThresholdLine * 1.15)} stroke="#22c55e" strokeDasharray="2 6" strokeWidth={1} opacity={0.25} />
                          <ReferenceLine y={targetThresholdLine} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} label={{ position: 'insideBottomLeft', value: `Segurança ${targetThresholdLine}%`, fill: '#f59e0b', fontSize: 9, fontWeight: 700 }} />

                          <Tooltip
                            contentStyle={{ backgroundColor: '#10151C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#e2e8f0', fontSize: 12 }}
                            formatter={(value: unknown) => {
                              const v = Number(value)
                              const zone = v >= targetThresholdLine * 1.15 ? 'Seguro' : v >= targetThresholdLine ? 'Atenção' : 'Crítico'
                              const zoneColor = v >= targetThresholdLine * 1.15 ? '#22c55e' : v >= targetThresholdLine ? '#f59e0b' : '#ef4444'
                              return [`${v}% — ${zone}`, 'Umidade']
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="moisture"
                            name="Umidade"
                            stroke="url(#strokeMoisture)"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorMoisture)"
                            dot={{ r: 4, fill: '#0f1923', strokeWidth: 2 }}
                            activeDot={{ r: 6, fill: '#CCFF00', stroke: '#0f1923', strokeWidth: 2 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* === PAINÉIS 2 & 3: SCHEDULE + WATER USAGE === */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Bloco Schedule */}
                    <div style={{ background: '#1c1c1e', borderRadius: 16, padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.4)', minWidth: 0 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#8899AA', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Agenda de Irrigação</h3>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#A0AAB4' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Status:</span>
                          <span style={{ color: st.color, fontWeight: 800, textTransform: 'uppercase', background: `${st.color}20`, padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>{st.label}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Próximo Passo:</span>
                          <span style={{ color: '#fff', fontWeight: 600 }}>{previsaoTexto}</span>
                        </div>
                        <div style={{ height: 1, background: '#2A2A2E', margin: '4px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Demanda de Cultura:</span>
                          <span style={{ color: capWarning ? '#FF3366' : '#fff' }}>{etcDiariaStr} mm/dia</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Estágio Fenológico:</span>
                          <span style={{ color: '#00E5FF', fontWeight: 700 }}>{calcResult.cropStage ?? 1}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
                        <button style={{
                          flex: 1, background: '#CCFF00', padding: '16px',
                          borderRadius: 12, border: 'none', color: '#10151c', fontWeight: 900, 
                          fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em',
                          boxShadow: '0 4px 20px rgba(204,255,0,0.25)', cursor: 'pointer', transition: 'all 0.2s',
                          whiteSpace: 'nowrap'
                        }}
                        onClick={() => { setShowForm(true); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                        >
                          REGISTRAR<br/>MANEJO
                        </button>
                        <button style={{
                          flex: 1, background: '#00E5FF', padding: '16px',
                          borderRadius: 12, border: 'none', color: '#10151c', fontWeight: 900, 
                          fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em',
                          boxShadow: '0 4px 20px rgba(0,229,255,0.25)', cursor: 'pointer', transition: 'all 0.2s',
                          textAlign: 'center', lineHeight: 1.2
                        }}
                        onClick={() => {
                          setShowForm(true)
                          // Pré-preenche com a lâmina recomendada pelo cálculo, não um valor fixo
                          const recDepth = calcResult?.recommendedDepthMm
                          if (recDepth && recDepth > 0) setActualDepth(recDepth.toFixed(1))
                          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                        >
                          LANÇAR<br/>IRRIGAÇÃO
                        </button>
                      </div>
                    </div>

                    {/* Bloco Water Usage */}
                    <div style={{ background: '#1c1c1e', borderRadius: 16, padding: '24px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 8px 30px rgba(0,0,0,0.4)', minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#8899AA', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Consumo de Água (7D)</h3>
                        <div style={{ fontSize: 11, color: '#A0AAB4', textTransform: 'uppercase', textAlign: 'right' }}>
                          <div>Total Aplicado: <strong style={{ color: '#fff' }}>{totalWater7d.toFixed(1)} mm</strong></div>
                          <div style={{ marginTop: 2 }}>Demanda ETc: <span style={{ color: '#8899aa'}}>{totalEtc7d.toFixed(1)} mm</span></div>
                        </div>
                      </div>

                      <div style={{ flex: 1, minHeight: 120, width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={waterUsageData} margin={{ top: 10, right: 0, left: -20, bottom: -10 }}>
                             <defs>
                                <filter id="barGlow" x="-50%" y="-50%" width="200%" height="200%">
                                   <feGaussianBlur stdDeviation="3" result="blur" />
                                   <feMerge>
                                     <feMergeNode in="blur"/>
                                     <feMergeNode in="SourceGraphic"/>
                                   </feMerge>
                                </filter>
                             </defs>
                             <Tooltip
                               contentStyle={{ backgroundColor: '#10151C', border: '1px solid #2A2A2E', borderRadius: 8, color: '#fff', fontSize: 12 }}
                               itemStyle={{ color: '#00E5FF' }}
                               cursor={{ fill: 'rgba(0, 229, 255, 0.05)' }}
                               formatter={(value: unknown) => [`${Number(value).toFixed(1)} mm`, 'Água aplicada']}
                               labelFormatter={(label: unknown) => `Dia ${label}`}
                             />
                             <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fill: '#556677', fontSize: 10}} dy={5} />
                             <Bar dataKey="usage" radius={[4, 4, 0, 0]} maxBarSize={28} style={{ filter: 'url(#barGlow)' }}>
                               {waterUsageData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.usage > 0 ? '#00E5FF' : '#2A2A2E'} />
                               ))}
                             </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 1fr', gap: 12, marginTop: 'auto' }}>
                        <Link href="/pivos" style={{ textDecoration: 'none' }}>
                          <button style={{
                            width: '100%', background: '#323236', color: '#D0D0D4', border: '1px solid #444448', padding: '14px 4px', 
                            borderRadius: 12, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', letterSpacing: '0.02em', textAlign: 'center', transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '56px'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#3c3c40'}
                          onMouseLeave={e => e.currentTarget.style.background = '#323236'}
                          >
                             CONFIGURAR<br/>PIVÔ
                          </button>
                        </Link>
                        <Link href="/precipitacoes" style={{ textDecoration: 'none' }}>
                          <button style={{
                            width: '100%', background: '#323236', color: '#D0D0D4', border: '1px solid #444448', padding: '14px 4px', 
                            borderRadius: 12, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', letterSpacing: '0.02em', textAlign: 'center', transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '56px'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#3c3c40'}
                          onMouseLeave={e => e.currentTarget.style.background = '#323236'}
                          >
                             REGISTRAR<br/>CHUVAS
                          </button>
                        </Link>
                      </div>
                    </div>

                  </div>
                </div>
              )
            })()
          ) : (
             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#1c1c1e', borderRadius: 16 }}>
                <span style={{ color: '#556677', fontSize: 13 }}>Carregando métricas e predições...</span>
             </div>
          )}
        </div>
      </div>

      {/* ── Formulário de entrada (Oculto em Accordion Premium) ── */}
      <div style={{ marginTop: 12 }}>
        <button 
          onClick={() => setShowForm(!showForm)}
          style={{
            width: '100%', padding: '16px 24px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: showForm ? '#0d1520' : 'linear-gradient(90deg, #10151C, #161e27)', border: '1px solid rgba(255,255,255,0.06)',
            color: '#00E5FF', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer',
            transition: 'all 0.2s', boxShadow: showForm ? 'none' : '0 4px 12px rgba(0,0,0,0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showForm ? <ChevronDown size={18} /> : <Plus size={18} />}
            {showForm ? 'Ocultar Lançamento Manual' : 'Lançar Dados Manuais (Clima / Irrigação)'}
          </div>
          {!showForm && <div style={{ fontSize: 11, color: '#445566', fontWeight: 500, textTransform: 'none' }}>Opcional se auto-integrado</div>}
        </button>

        {showForm && (
          <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0 0 14px 14px', borderTop: 'none', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Fonte climática + data — empilhado no mobile, lado a lado no desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4 items-start">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Dados Climáticos</label>
                {weatherLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Loader2 size={12} className="animate-spin" style={{ color: '#00E5FF' }} />
                    <span style={{ fontSize: 13, color: '#445566' }}>Buscando dados climáticos...</span>
                  </div>
                )}
                {!weatherLoading && climateInfo && (() => {
                  const Icon = climateInfo.icon
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: climateInfo.bg, border: climateInfo.border }}>
                      <Icon size={13} style={{ color: climateInfo.color }} />
                      <span style={{ fontSize: 13, color: climateInfo.color }}>{climateInfo.label}</span>
                    </div>
                  )
                })()}
                {!weatherLoading && !climateInfo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Thermometer size={13} style={{ color: '#445566' }} />
                    <span style={{ fontSize: 13, color: '#445566' }}>Preencha os dados manualmente</span>
                  </div>
                )}
              </div>
              <InputField label="Data do registro" type="date" value={date} onChange={setDate} />
            </div>

            {/* Campos climáticos — grid 3 colunas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
              <InputField label="Tmax" value={tmax} onChange={setTmax} unit="°C" placeholder="35" />
              <InputField label="Tmin" value={tmin} onChange={setTmin} unit="°C" placeholder="18" />
              <InputField label="UR Média" value={humidity} onChange={setHumidity} unit="%" placeholder="65" />
              <InputField label="Vento" value={wind} onChange={setWind} unit="m/s" placeholder="2.5" />
              <InputField label="Radiação Solar" value={radiation} onChange={setRadiation} unit="W/m²" placeholder="220" />
              <InputField label="Chuva (fazenda)" value={rainfall} onChange={setRainfall} unit="mm" placeholder="0" />
            </div>

            {/* ADc anterior — compacto */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Droplets size={14} style={{ color: '#00E5FF', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#445566' }}>ADc (Umidade) anterior:</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#00E5FF', fontFamily: 'var(--font-mono)' }}>{fmtNum(adcPrev)} mm</span>
              <span style={{ fontSize: 12, color: '#334455', marginLeft: 2 }}>{history.length > 0 ? '(último registro)' : '(ADc inicial da safra)'}</span>
            </div>

            {/* Irrigação realizada */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Irrigação Realizada <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
                <InputField label="Velocidade real" value={actualSpeed} onChange={setActualSpeed} unit="%" placeholder="60" />
                <InputField label="Lâmina real" value={actualDepth} onChange={v => { setActualDepth(v); setDepthAutoFilled(false) }} unit="mm" placeholder="12" />
                <InputField label="Início" type="time" value={irrigStart} onChange={setIrrigStart} />
                <InputField label="Fim" type="time" value={irrigEnd} onChange={setIrrigEnd} />
              </div>
            </div>

            {/* Erros / sucesso */}
            {error && (
              <div style={{ padding: '11px 16px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#FF3366', fontSize: 13 }}>
                {error}
              </div>
            )}
            {saveMsg && (
              <div style={{ padding: '11px 16px', borderRadius: 8, background: 'rgba(57, 255, 20, 0.1)', border: '1px solid rgba(57, 255, 20, 0.25)', color: '#39FF14', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={14} /> {saveMsg}
              </div>
            )}

            {/* Botão salvar */}
            <button onClick={handleSave} disabled={saving || !calcResult}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '16px 0', borderRadius: 10, fontSize: 15, fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                background: calcResult ? 'linear-gradient(135deg, #00B4D8, #00E5FF)' : '#0d1520',
                border: 'none', color: calcResult ? '#0F1923' : '#445566',
                cursor: calcResult ? 'pointer' : 'not-allowed',
                opacity: saving ? 0.7 : 1,
                boxShadow: calcResult ? '0 6px 20px rgba(0, 229, 255, 0.3)' : 'none',
              }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Registrando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        )}
      </div>

      {/* ── Seção de Histórico e Timeline (Oculta em Accordion Premium) ── */}
      <div style={{ marginTop: 8 }}>
        <button 
          onClick={() => setShowHistoryTab(!showHistoryTab)}
          style={{
            width: '100%', padding: '14px 24px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
            color: '#8899aa', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} /> Data Explorer — Histórico & Timeline
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: '#556677', background: '#0d1520', padding: '2px 8px', borderRadius: 10 }}>
              {history.length} Registros Salvos
            </span>
            {selectedSeasonId && (
              <span
                role="button"
                title="Recalcular histórico completo (use após corrigir precipitações)"
                onClick={async (e) => {
                  e.stopPropagation()
                  if (!selectedSeasonId) return
                  const btn = e.currentTarget
                  btn.style.color = '#f59e0b'
                  btn.textContent = '...'
                  await fetch('/api/seasons/recalculate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ season_id: selectedSeasonId }),
                  })
                  await loadHistory(selectedSeasonId)
                  btn.style.color = '#22c55e'
                  btn.textContent = '✓'
                  setTimeout(() => { btn.style.color = '#556677'; btn.textContent = '↻' }, 2000)
                }}
                style={{ fontSize: 14, color: '#556677', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              >↻</span>
            )}
            {showHistoryTab ? <ChevronDown size={14} /> : <TrendingDown size={14} />}
          </div>
        </button>

        {showHistoryTab && (
          <div style={{ marginTop: 16 }}>
            <HistoryTable records={history} onEdit={loadRecordIntoForm} onDelete={handleDelete} threshold={selectedSeason?.pivots?.alert_threshold_percent ?? 70} />
          </div>
        )}
      </div>

      {/* ── Timeline Balanço Hídrico — sempre visível se há histórico ── */}
      {history.length >= 2 && (
        <WaterBalanceChart
          history={history}
          threshold={selectedSeason?.pivots?.alert_threshold_percent ?? 70}
        />
      )}

    </div>
  )
}

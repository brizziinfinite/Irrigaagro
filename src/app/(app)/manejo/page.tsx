'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { Season, Crop, Pivot, DailyManagement, Farm, DailyManagementInsert } from '@/types/database'
import {
  getStageInfoForDas, calcCTA, calcProjection, calcRa, calcDepthForSpeed, getFFactorForDas,
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
} from '@/lib/calculations/eto-resolution'
import {
  Loader2, ChevronDown, Droplets, Sun,
  Thermometer, CheckCircle2, AlertTriangle, AlertCircle,
  Save, Calendar, FlaskConical, Sprout, Clock,
  Satellite, Sheet, TrendingDown, Zap, Orbit,
  Edit2, Trash2, X, Plus, ArrowRight
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, Cell, AreaChart, BarChart } from 'recharts'
import WaterBalanceChart from './WaterBalanceChart'

// ─── Status semáforo ─────────────────────────────────────────

type IrrigationStatus = 'azul' | 'verde' | 'amarelo' | 'vermelho'

const STATUS_CONFIG: Record<IrrigationStatus, { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2; desc: string }> = {
  azul:     { label: 'Irrigando',    color: '#0093D0', bg: 'rgb(0 147 208 / 0.12)',   border: 'rgb(0 147 208 / 0.25)',  icon: Droplets,      desc: 'Irrigação em andamento' },
  verde:    { label: 'Confortável',  color: '#22c55e', bg: 'rgb(34 197 94 / 0.12)',   border: 'rgb(34 197 94 / 0.25)',  icon: CheckCircle2,  desc: 'Solo bem abastecido — ≥75%' },
  amarelo:  { label: 'Atenção',      color: '#f59e0b', bg: 'rgb(245 158 11 / 0.12)',  border: 'rgb(245 158 11 / 0.25)', icon: AlertTriangle, desc: 'Irrigar nos próximos 2 dias — 60–75%' },
  vermelho: { label: 'Crítico',      color: '#ef4444', bg: 'rgb(239 68 68 / 0.12)',   border: 'rgb(239 68 68 / 0.25)', icon: AlertCircle,   desc: 'Irrigar hoje — solo abaixo de 60%' },
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
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#667788', pointerEvents: 'none' }}>
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

  const progressPercent = Math.max(0, Math.min(100, fieldCapacityPercent))
  const offset = circumference - (progressPercent / 100) * circumference

  // Mature color palette (no neon)
  const trackColor = '#1A2433'
  let gaugeColorPrimary = '#0093D0'   // azul brand
  let gaugeColorSecondary = '#22c55e' // verde
  if (status === 'amarelo') {
    gaugeColorPrimary = '#d97706'
    gaugeColorSecondary = '#f59e0b'
  } else if (status === 'vermelho') {
    gaugeColorPrimary = '#dc2626'
    gaugeColorSecondary = '#ef4444'
  } else if (status === 'azul') {
    gaugeColorPrimary = '#0891b2'
    gaugeColorSecondary = '#06b6d4'
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
      {/* ── Header ── */}
      <div style={{ zIndex: 2, marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Análise do Solo
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
          <span style={{ fontSize: 13, color: '#667788' }}>— {fieldCapacityPercent.toFixed(0)}% C.C.</span>
        </div>
      </div>

      {/* ── Center: Gauge Radial SVG ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '20px 0', minHeight: 260
      }}>
        <svg width="260" height="260" viewBox="0 0 240 240" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
          <defs>
            <linearGradient id="gaugeGradient" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gaugeColorPrimary} />
              <stop offset="100%" stopColor={gaugeColorSecondary} />
            </linearGradient>
            <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" result="blur" />
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
        </svg>

        {/* Text inside Gauge */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none'
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#8899aa', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Umidade C.C.
          </span>
          <span style={{
            fontSize: 52, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.1,
            fontFamily: 'var(--font-mono)'
          }}>
            {fieldCapacityPercent.toFixed(0)}<span style={{ fontSize: 28 }}>%</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
          </div>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 'auto' }}>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: 14 }}>
          <p style={{ fontSize: 10, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cultura</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cropName ?? 'Não inf.'}</span>
            <span style={{ fontSize: 11, color: '#0093D0', fontWeight: 700 }}>D{das}</span>
          </div>
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 6 }}>Raiz: <span style={{ color: '#e2e8f0' }}>{Math.round(rootDepthCm)} cm</span></p>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: 14 }}>
          <p style={{ fontSize: 10, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Armazenamento</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
            <span style={{cursor: 'help', borderBottom: '1px dotted #8899aa'}} title="Capacidade de Água Disponível">CAD:</span> {cad.toFixed(1)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span>
          </p>
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 6 }}>
            <span style={{cursor: 'help', borderBottom: '1px dotted #8899aa'}} title="Capacidade Total de Água">CTA:</span> <span style={{ color: '#e2e8f0' }}>{cta.toFixed(1)} mm</span>
          </p>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: 14 }}>
          <p style={{ fontSize: 10, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hídrico Atual</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>
            ADc: {adcNew.toFixed(1)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span>
          </p>
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 6 }}>Falta p/ CC: <span style={{ color: '#ef4444' }}>{Math.max(0, cta - adcNew).toFixed(1)} mm</span></p>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: 14 }}>
          <p style={{ fontSize: 10, color: '#687b8d', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Limiar de Segurança</span>
            {alertThresholdPct && <span style={{ color: '#f59e0b' }}>({alertThresholdPct}%)</span>}
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
            Mín: {(cta * ((alertThresholdPct ?? 50)/100)).toFixed(1)} <span style={{ fontSize: 11, color: '#8899aa' }}>mm</span>
          </p>
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 6 }}>
            Déficit aceito: <span style={{ color: '#e2e8f0' }}>{(cta - (cta * ((alertThresholdPct ?? 50)/100))).toFixed(1)} mm</span>
          </p>
        </div>

      </div>
    </div>
  )
}



// ─── Projeção 7 dias (simulação interativa) ─────────────────

interface ProjectionForecastProps {
  days: ProjectionDay[]
  baseDays: ProjectionDay[]
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
        <TrendingDown size={14} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
          {hasSimulation ? 'Projeção — Simulação Ativa' : 'Se não irrigar, o que acontece?'}
        </span>
        {avgEto !== null && (
          <span style={{ fontSize: 11, color: '#778899', marginLeft: 'auto' }}>
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
          <span style={{ fontSize: 10, color: '#667788', padding: '3px 8px', borderRadius: 20, background: '#0d1520' }}>sem chuva prevista</span>
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
            <p style={{ fontSize: 10, color: '#778899' }}>
              Lâmina prevista para o dia: {fmtNum(days[firstIrrigIdx].recommendedDepthMm)} mm
              {days[firstIrrigIdx].recommendedSpeedPercent !== null ? ` · Velocidade: ${days[firstIrrigIdx].recommendedSpeedPercent}%` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Linhas — scroll horizontal no mobile */}
      <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 420, padding: '14px 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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

          // Hierarquia temporal: amanhã (i=0) > depois de amanhã (i=1) > resto
          const isAmanha = i === 0
          const isDepoisAmanha = i === 1
          const isFuturo = i >= 2
          // Cor do dia: amanhã vermelho se alerta, âmbar se i=1, resto suavizado
          const dayLabelColor = isAmanha
            ? (isAlert ? cfg.color : '#8899aa')
            : isDepoisAmanha
              ? (isAlert ? '#d97706' : '#778899')
              : '#778899'
          const dayFontWeight = isAmanha ? 700 : isDepoisAmanha ? 600 : 400
          // Barra: amanhã mais intensa, resto com opacidade menor
          const barOpacity = isAmanha ? 1 : isDepoisAmanha ? 0.7 : 0.45
          // Background row
          const rowBg = hasIrrigHere
            ? 'rgba(0,147,208,0.08)'
            : isAmanha && isAlert
              ? (day.status === 'vermelho' ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.06)')
              : isAmanha
                ? '#0d1520'
                : i % 2 ? '#080e14' : 'transparent'
          const rowBorder = hasIrrigHere
            ? '1px solid rgba(0,147,208,0.25)'
            : isAmanha && isAlert
              ? `1px solid ${cfg.color}30`
              : '1px solid transparent'
          // Cor status: amanhã cor real, depois âmbar se alerta, resto neutro
          const statusColor = isAmanha ? cfg.color : isDepoisAmanha && isAlert ? '#d97706' : '#778899'

          return (
            <div key={day.date}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '80px 30px 1fr 60px 46px 90px 32px',
                alignItems: 'center', gap: 8,
                padding: isAmanha ? '9px 10px' : '5px 10px',
                borderRadius: 9,
                background: rowBg,
                border: rowBorder,
                opacity: isFuturo && !isAlert ? 0.7 : 1,
              }}>
                <span style={{ fontSize: 11, color: dayLabelColor, fontWeight: dayFontWeight }}>
                  {i === 0 ? 'Amanhã' : fmtDate(day.date)}
                </span>
                <span style={{ fontSize: 10, color: '#778899' }}>D{day.das}</span>
                <div style={{ position: 'relative', height: isAmanha ? 10 : 8, background: '#080e14', borderRadius: 99, overflow: 'visible' }}>
                  <div style={{ position: 'absolute', left: `${cadPct}%`, top: -2, bottom: -2, width: 2, background: '#f59e0b', opacity: 0.5, borderRadius: 1, zIndex: 2 }} />
                  {showComparison && basePct !== null && (
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${basePct}%`, background: cfg.color, borderRadius: 99, opacity: 0.15 }} />
                  )}
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: isAmanha ? cfg.color : isDepoisAmanha ? (isAlert ? '#d97706' : cfg.color) : cfg.color, borderRadius: 99, transition: 'width 0.3s', opacity: barOpacity }} />
                </div>
                <span style={{ fontSize: isAmanha ? 12 : 11, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                  {showComparison && basePct !== null ? (
                    <>
                      <span style={{ color: '#778899', textDecoration: 'line-through', fontSize: 10 }}>{fmtNum(basePct, 0)}%</span>
                      <span style={{ color: statusColor, fontWeight: isAmanha ? 700 : 500 }}> {fmtNum(day.fieldCapacityPercent, 0)}%</span>
                    </>
                  ) : (
                    <span style={{ color: statusColor, fontWeight: isAmanha ? 700 : 500 }}>{fmtNum(day.fieldCapacityPercent, 0)}%</span>
                  )}
                </span>
                <span style={{ fontSize: 10, textAlign: 'right' }} title={day.recommendedDepthMm > 0 ? `Déficit previsto D+${i+1}: ${fmtNum(day.recommendedDepthMm)} mm` : `ETc prevista: ${fmtNum(day.etcAvg)} mm/dia`}>
                  {hasIrrigHere ? (
                    <span style={{ color: '#0093D0', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10 }}>+{fmtNum(simulatedIrrigation[i])}</span>
                  ) : day.recommendedDepthMm > 0 ? (
                    <><span style={{ color: isAmanha ? cfg.color : isDepoisAmanha ? '#d97706' : '#667788', fontFamily: 'var(--font-mono)', fontWeight: isAmanha ? 700 : 500 }}>{fmtNum(day.recommendedDepthMm)}</span><span style={{ color: '#778899' }}> mm</span></>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 600, color: isAmanha ? '#22c55e' : '#778899' }}>NI</span>
                  )}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                  <StatusIcon size={10} style={{ color: statusColor }} />
                  <span style={{ fontSize: 10, color: statusColor, fontWeight: isAmanha ? 600 : 400 }}>{cfg.label}</span>
                </div>
                {/* Botão + / editar irrigação simulada */}
                <button
                  onClick={() => { setEditingDayIdx(editingDayIdx === i ? null : i); setSelectedSpeed(''); setManualDepth(simulatedIrrigation[i] > 0 ? simulatedIrrigation[i].toFixed(1) : '') }}
                  style={{
                    width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: hasIrrigHere ? 'rgba(0,147,208,0.15)' : 'rgba(255,255,255,0.04)',
                    color: hasIrrigHere ? '#0093D0' : '#778899',
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
                    <span style={{ fontSize: 10, color: '#778899' }}>mm</span>
                  </div>
                  <button
                    onClick={() => handleApply(i)}
                    disabled={!manualDepth || parseFloat(manualDepth) <= 0}
                    style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: manualDepth && parseFloat(manualDepth) > 0 ? '#0093D0' : '#0d1520',
                      border: 'none', color: manualDepth && parseFloat(manualDepth) > 0 ? '#fff' : '#667788',
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
                      background: 'none', border: 'none', color: '#778899', cursor: 'pointer',
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
            <span style={{ fontSize: 10, color: '#667788' }}>Limiar irrigação</span>
          </div>
          <span style={{ fontSize: 10, color: '#667788' }}>· Clique no <strong>+</strong> para simular irrigação</span>
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
        <Calendar size={22} style={{ color: '#667788', margin: '0 auto 8px' }} />
        <p style={{ fontSize: 13, color: '#667788' }}>Nenhum registro ainda.</p>
      </div>
    )
  }

  const COLS = '88px 38px 54px 54px 54px 60px 52px 54px 80px 56px'

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 600, display: 'grid', gridTemplateColumns: COLS, gap: 4, padding: '9px 16px', background: '#0d1520', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['Data', 'DAS', 'ETo', 'ETc', 'Chuva', 'Lâmina', 'ADc (Umidade)', 'CC%', 'Status', ''].map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#667788', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
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
            <span style={{ fontSize: 12, color: '#667788' }}>{r.das ?? '—'}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.eto_mm)}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.etc_mm)}</span>
            <span style={{ fontSize: 12, color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.rainfall_mm)}</span>
            <span style={{ fontSize: 12, color: lamina !== null && lamina > 0 ? '#0093D0' : '#778899', fontFamily: 'var(--font-mono)', fontWeight: lamina !== null && lamina > 0 ? 700 : 400 }}>
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', borderRadius: 5, color: '#667788', lineHeight: 0, minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#0093D0')}
                onMouseLeave={e => (e.currentTarget.style.color = '#667788')}
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => onDelete(r)}
                title="Excluir registro"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', borderRadius: 5, color: '#667788', lineHeight: 0, minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#667788')}
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

  // ─── Modal lançamento rápido ──────────────────────────────────
  const [showQuickModal, setShowQuickModal]     = useState(false)
  const [quickDepth, setQuickDepth]             = useState('')
  const [quickObs, setQuickObs]                 = useState('')
  const [quickModalSaving, setQuickModalSaving] = useState(false)
  const [quickModalMsg, setQuickModalMsg]       = useState<{ type: 'success' | 'error'; text: string } | null>(null)
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
    } catch (err) {
      console.error('[manejo] loadHistory falhou:', err)
      setError('Falha ao carregar histórico. Tente recarregar a página.')
      setHistory([])
    }
  }, [])

  useEffect(() => { if (selectedSeasonId) loadHistory(selectedSeasonId) }, [selectedSeasonId, loadHistory])

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
  useEffect(() => {
    if (!selectedSeason || !date) { setExternalData(null); return }
    if (editingRecord) return
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

  // ─── Pré-preenche irrigação a partir de registro existente ──
  useEffect(() => {
    if (editingRecord) return
    const todayRecord = history.find(r => r.date === date)
    if (todayRecord) {
      if (todayRecord.actual_depth_mm != null && todayRecord.actual_depth_mm > 0) {
        setActualDepth(String(todayRecord.actual_depth_mm))
        setDepthAutoFilled(true)
      } else {
        setActualDepth('')
      }
      if (todayRecord.actual_speed_percent != null && todayRecord.actual_speed_percent > 0) {
        setActualSpeed(String(todayRecord.actual_speed_percent))
      } else {
        setActualSpeed('')
      }
    } else {
      setActualDepth('')
      setActualSpeed('')
    }
  }, [history, date, editingRecord])

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

  // ─── Lançamento rápido (modal) ───────────────────────────────
  async function handleQuickLaunch() {
    if (!selectedSeason || !calcResult || !date) return
    const mm = parseFloat(quickDepth.replace(',', '.'))
    if (!isFinite(mm) || mm < 0) {
      setQuickModalMsg({ type: 'error', text: 'Informe uma lâmina válida (≥ 0).' })
      return
    }
    setQuickModalSaving(true)
    setQuickModalMsg(null)
    const cs = externalData?.weather ?? externalData?.geolocationWeather ?? null
    const payload: DailyManagementInsert = {
      season_id: selectedSeason.id, date, das: calcResult.das, crop_stage: calcResult.cropStage,
      temp_max: parseOptionalNumber(tmax) ?? cs?.temp_max ?? null,
      temp_min: parseOptionalNumber(tmin) ?? cs?.temp_min ?? null,
      humidity_percent: parseOptionalNumber(humidity) ?? cs?.humidity_percent ?? null,
      wind_speed_ms: parseOptionalNumber(wind) ?? cs?.wind_speed_ms ?? null,
      solar_radiation_wm2: parseOptionalNumber(radiation) ?? cs?.solar_radiation_wm2 ?? null,
      eto_mm: calcResult.eto, etc_mm: calcResult.etc,
      rainfall_mm: parseOptionalNumber(rainfall) ?? externalData?.rainfall?.rainfall_mm ?? 0,
      kc: calcResult.kc, ks: calcResult.ks, ctda: calcResult.adcNew, cta: calcResult.cta,
      recommended_depth_mm: calcResult.recommendedDepthMm,
      recommended_speed_percent: calcResult.recommendedSpeedPercent,
      field_capacity_percent: calcResult.fieldCapacityPercent,
      needs_irrigation: calcResult.recommendedDepthMm > 0,
      actual_depth_mm: mm,
      soil_moisture_calculated: calcResult.fieldCapacityPercent,
    }
    try {
      await upsertDailyManagementRecord(payload)
      setQuickModalMsg({ type: 'success', text: `Irrigação de ${mm} mm registrada com sucesso!` })
      setTimeout(() => {
        setShowQuickModal(false)
        setQuickDepth('')
        setQuickObs('')
        setQuickModalMsg(null)
        loadHistory(selectedSeason.id)
      }, 1200)
    } catch (err) {
      setQuickModalMsg({ type: 'error', text: err instanceof Error ? err.message : 'Falha ao registrar. Tente novamente.' })
    } finally {
      setQuickModalSaving(false)
    }
  }

  function openQuickModal() {
    setQuickDepth(calcResult?.recommendedDepthMm ? calcResult.recommendedDepthMm.toFixed(1) : '')
    setQuickObs('')
    setQuickModalMsg(null)
    setShowQuickModal(true)
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
        <p style={{ fontSize: 13, color: '#778899' }}>Cadastre uma safra em <strong style={{ color: '#8899aa' }}>Safras</strong> para iniciar o manejo.</p>
      </div>
    )
  }

  const climateInfo = getClimateSourceInfo(externalData?.climateSource ?? null)

  // ─── Dados para o DecisionHero ──────────────────────────────
  const rec = calcResult?.recommendation ?? null
  const heroStatus = calcResult?.status as IrrigationStatus | undefined
  const heroCfg = heroStatus ? STATUS_CONFIG[heroStatus] : null
  const shouldIrrigate = rec?.shouldIrrigateToday ?? false
  const heroDepth = calcResult?.recommendedDepthMm ?? 0
  const heroSpeed = calcResult?.recommendedSpeedPercent ?? null
  const heroPct = calcResult?.fieldCapacityPercent ?? null
  const heroThreshold = selectedSeason?.pivots?.alert_threshold_percent ?? 70
  const heroMargin = heroPct !== null ? heroPct - heroThreshold : null
  const heroEtc = calcResult?.etc ?? null
  const heroMaxDepth = rec?.maxDepthMm ?? null

  // Próxima irrigação via projeção
  const nextIrrigDay = projection.find(p => p.isIrrigationDay)
  let nextIrrigText = 'Seguro — >7 dias'
  if (shouldIrrigate) {
    nextIrrigText = `Hoje — ${heroDepth.toFixed(1)} mm`
  } else if (nextIrrigDay) {
    const dias = nextIrrigDay.das - (calcResult?.das ?? 0)
    nextIrrigText = dias === 1
      ? `Amanhã — ${nextIrrigDay.recommendedDepthMm.toFixed(1)} mm`
      : `Em ${dias} dias — ${nextIrrigDay.recommendedDepthMm.toFixed(1)} mm`
  }

  const heroMainColor = shouldIrrigate
    ? (heroStatus === 'vermelho' ? '#ef4444' : '#d97706')
    : '#22c55e'
  const heroMainBg = shouldIrrigate
    ? (heroStatus === 'vermelho'
        ? 'linear-gradient(145deg, rgba(30,16,18,0.98), rgba(15,19,24,0.99))'
        : 'linear-gradient(145deg, rgba(28,20,10,0.98), rgba(15,19,24,0.99))')
    : 'linear-gradient(145deg, rgba(14,22,18,0.98), rgba(12,17,22,0.99))'
  const heroBorder = shouldIrrigate
    ? (heroStatus === 'vermelho' ? 'rgba(239,68,68,0.2)' : 'rgba(217,119,6,0.2)')
    : 'rgba(34,197,94,0.15)'

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Modal: Lançamento Rápido de Irrigação ─────────────── */}
      {showQuickModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowQuickModal(false) }}
        >
          <div style={{
            background: '#0f1923', border: '1px solid rgba(255,255,255,0.08)',
            borderTop: '2px solid #ef4444',
            borderRadius: 18, padding: 'clamp(16px, 4vw, 32px)', width: '100%', maxWidth: 440,
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            {/* Header do modal */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0', margin: 0, letterSpacing: '-0.02em' }}>
                  Lançar irrigação
                </h2>
                <p style={{ fontSize: 12, color: '#778899', margin: '4px 0 0' }}>
                  Confirme a lâmina aplicada para o pivô selecionado.
                </p>
              </div>
              <button
                onClick={() => setShowQuickModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#667788', cursor: 'pointer', padding: 4, minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Pivô + data (só leitura, informativo) */}
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10, marginBottom: 20 }}>
              <div style={{ background: '#0d1520', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#667788', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Pivô</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{selectedSeason?.pivots?.name ?? '—'}</div>
              </div>
              <div style={{ background: '#0d1520', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#667788', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Data</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                  {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
              </div>
            </div>

            {/* Lâmina recomendada (informativa) */}
            {calcResult?.recommendedDepthMm != null && calcResult.recommendedDepthMm > 0 && (
              <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 12, color: '#8899aa' }}>Lâmina recomendada</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#ef4444', fontFamily: 'monospace' }}>
                  {calcResult.recommendedDepthMm.toFixed(1)} mm
                </span>
              </div>
            )}

            {/* Campo: lâmina aplicada */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Lâmina aplicada (mm)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={quickDepth}
                  onChange={e => setQuickDepth(e.target.value)}
                  placeholder="Ex: 28.5"
                  autoFocus
                  style={{
                    width: '100%', padding: '14px 44px 14px 16px', borderRadius: 10,
                    background: '#0d1520', border: '1px solid rgba(0,147,208,0.3)',
                    color: '#e2e8f0', fontSize: 16, fontWeight: 700, fontFamily: 'monospace',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = '#0093D0'}
                  onBlur={e => e.target.style.borderColor = 'rgba(0,147,208,0.3)'}
                  onKeyDown={e => { if (e.key === 'Enter') handleQuickLaunch() }}
                />
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#667788', pointerEvents: 'none', fontWeight: 600 }}>
                  mm
                </span>
              </div>
            </div>

            {/* Campo: observação (opcional) */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#667788', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Observação <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
              </label>
              <input
                type="text"
                value={quickObs}
                onChange={e => setQuickObs(e.target.value)}
                placeholder="Ex: chuva durante a noite, parada por vento..."
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 10,
                  background: '#0d1520', border: '1px solid rgba(255,255,255,0.07)',
                  color: '#8899aa', fontSize: 13,
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'}
              />
            </div>

            {/* Feedback sucesso/erro */}
            {quickModalMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                background: quickModalMsg.type === 'success' ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
                border: `1px solid ${quickModalMsg.type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                color: quickModalMsg.type === 'success' ? '#22c55e' : '#ef4444',
                fontSize: 13, fontWeight: 600,
              }}>
                {quickModalMsg.type === 'success' ? '✓ ' : '⚠ '}{quickModalMsg.text}
              </div>
            )}

            {/* Ações */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowQuickModal(false)}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  minHeight: 48,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#778899', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleQuickLaunch}
                disabled={quickModalSaving}
                style={{
                  flex: 2, padding: '13px 0', borderRadius: 10, fontSize: 14, fontWeight: 800,
                  minHeight: 48,
                  background: quickModalSaving ? 'rgba(239,68,68,0.3)' : 'linear-gradient(135deg, #e02424, #c01a1a)',
                  border: 'none', color: '#fff', cursor: quickModalSaving ? 'not-allowed' : 'pointer',
                  boxShadow: quickModalSaving ? 'none' : '0 4px 20px rgba(200,30,30,0.35)',
                }}
              >
                {quickModalSaving ? 'Confirmando…' : 'Confirmar lançamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          SEÇÃO 1 — HERO DE DECISÃO
          ════════════════════════════════════════════════════════ */}
      {calcResult && heroCfg ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between" style={{
          background: heroMainBg,
          border: `1px solid ${heroBorder}`,
          borderTop: `2px solid ${heroMainColor}50`,
          borderRadius: 20,
          padding: 'clamp(18px, 4vw, 32px) clamp(18px, 4vw, 36px)',
          gap: 20,
          boxShadow: `0 8px 32px rgba(0,0,0,0.45)`,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Glow ambiental */}
          <div style={{
            position: 'absolute', top: -60, left: -40, width: 200, height: 200,
            borderRadius: '50%', pointerEvents: 'none',
            background: `radial-gradient(circle, ${heroMainColor}10 0%, transparent 70%)`,
          }} />

          {/* Left: decisão principal — hierarquia em 4 linhas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0, position: 'relative' }}>
            {/* Ícone discreto */}
            <div className="hidden sm:flex" style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              background: `${heroMainColor}0e`,
              border: `1px solid ${heroMainColor}25`,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {shouldIrrigate
                ? <AlertCircle size={24} style={{ color: heroMainColor, opacity: 0.9 }} />
                : <CheckCircle2 size={24} style={{ color: heroMainColor, opacity: 0.9 }} />
              }
            </div>

            {/* Hierarquia tipográfica em 4 linhas */}
            <div style={{ minWidth: 0 }}>
              {/* Linha 1 — título: levemente maior, semibold, 90% opacidade */}
              <p style={{
                fontSize: 12, fontWeight: 600, color: 'rgba(85,102,119,0.9)',
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, lineHeight: 1,
              }}>
                {shouldIrrigate
                  ? (heroStatus === 'vermelho' ? 'Irrigar hoje' : 'Irrigar em breve')
                  : 'Manejo diário'}
              </p>

              {/* Linha 2 — número dominante: MAIOR elemento da tela */}
              {shouldIrrigate && heroDepth > 0 ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 56, fontWeight: 800, color: '#ffffff',
                    fontFamily: 'var(--font-mono)', lineHeight: 0.95,
                    letterSpacing: '-0.04em',
                  }}>
                    {heroDepth.toFixed(1)}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 18, fontWeight: 600, color: heroMainColor, lineHeight: 1 }}>mm</span>
                    {heroSpeed && (
                      <span style={{ fontSize: 11, color: '#667788', lineHeight: 1 }}>{heroSpeed}%</span>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 48, fontWeight: 800, color: '#22c55e',
                    fontFamily: 'var(--font-mono)', lineHeight: 0.95, letterSpacing: '-0.04em',
                  }}>
                    {heroPct !== null ? `${heroPct.toFixed(0)}%` : '—'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#667788' }}>umidade</span>
                </div>
              )}

              {/* Linha 3 — máximo 2 itens, contraste reduzido */}
              <p style={{ fontSize: 11, color: 'rgba(68,85,102,0.85)', lineHeight: 1.4, marginBottom: 5 }}>
                {heroMargin !== null && (
                  <span>Déficit: <span style={{
                    color: heroMargin >= 0
                      ? 'rgba(34,197,94,0.75)'
                      : 'rgba(239,68,68,0.75)',
                    fontWeight: 600,
                  }}>{heroMargin >= 0 ? '+' : ''}{heroMargin.toFixed(0)}%</span></span>
                )}
                <span style={{ marginLeft: heroMargin !== null ? 8 : 0 }}>
                  Revisão: <span style={{ color: 'rgba(136,153,170,0.8)' }}>
                    {shouldIrrigate ? 'hoje' : nextIrrigText.split(' — ')[0].toLowerCase()}
                  </span>
                </span>
              </p>

              {/* Linha 4 — pivô em texto mínimo */}
              <p style={{ fontSize: 11, color: '#667788', letterSpacing: '0.01em' }}>
                {selectedSeason?.pivots?.name ?? selectedSeason?.farms?.name ?? ''}
              </p>
            </div>
          </div>

          {/* Right: CTAs — primário dominante, secundário discreto */}
          <div className="flex flex-col sm:flex-shrink-0 w-full sm:w-auto" style={{ gap: 8 }}>
            {/* CTA primário: abre modal rápido se deve irrigar, senão vai para formulário */}
            <button
              onClick={() => {
                if (shouldIrrigate) {
                  openQuickModal()
                } else {
                  setShowForm(true)
                  const recDepth = calcResult?.recommendedDepthMm
                  if (recDepth && recDepth > 0) setActualDepth(recDepth.toFixed(1))
                  setTimeout(() => {
                    const el = document.getElementById('manejo-form-section')
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }, 50)
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '17px 32px', borderRadius: 14, fontSize: 14, fontWeight: 700,
                minHeight: 52, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
                background: shouldIrrigate
                  ? 'linear-gradient(135deg, #e02424, #c01a1a)'
                  : 'linear-gradient(135deg, #0093D0, #0277b5)',
                color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: shouldIrrigate
                  ? '0 8px 24px rgba(200,30,30,0.4)'
                  : '0 8px 24px rgba(0,147,208,0.35)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'scale(1.02)'
                e.currentTarget.style.boxShadow = shouldIrrigate
                  ? '0 10px 28px rgba(200,30,30,0.5)'
                  : '0 10px 28px rgba(0,147,208,0.45)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = shouldIrrigate
                  ? '0 8px 24px rgba(200,30,30,0.4)'
                  : '0 8px 24px rgba(0,147,208,0.35)'
              }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)' }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.02)' }}
            >
              <Droplets size={16} strokeWidth={2.5} />
              {shouldIrrigate ? 'Lançar Irrigação' : 'Registrar Manejo'}
              <ArrowRight size={16} strokeWidth={2.5} />
            </button>
            {/* CTA secundário: detalhe ou clima */}
            <button
              onClick={() => {
                setShowForm(true)
                setTimeout(() => {
                  const el = document.getElementById('manejo-form-section')
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 50)
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                minHeight: 44, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
                color: '#778899', cursor: 'pointer',
                transition: 'color 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#778899'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = '#778899'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
              }}
            >
              <Save size={12} />
              {shouldIrrigate ? 'Só registrar dados' : 'Só lançar clima'}
            </button>
            {/* Link terciário: programação avançada */}
            <Link
              href="/lancamentos"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 400,
                color: '#667788', textDecoration: 'none',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#667788' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#667788' }}
            >
              <Calendar size={11} />
              Ver programação avançada
            </Link>
          </div>
        </div>
      ) : (
        /* Hero skeleton enquanto carrega */
        <div style={{
          background: 'linear-gradient(145deg, rgba(18,24,32,0.95), rgba(13,18,26,0.98))',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 20, padding: '28px 32px',
          display: 'flex', alignItems: 'center', gap: 20,
        }}>
          <Loader2 size={20} className="animate-spin" style={{ color: '#0093D0' }} />
          <span style={{ fontSize: 14, color: '#667788' }}>Calculando balanço hídrico...</span>
        </div>
      )}

      {/* ── Seletor de safra ── */}
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#778899', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Safra</label>
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
          <ChevronDown size={13} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: '#667788', pointerEvents: 'none' }} />
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
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#0d1520', color: '#667788', display: 'flex', alignItems: 'center', gap: 3 }}>
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

      {/* ════════════════════════════════════════════════════════
          SEÇÃO 2 — CONTEXTO: Tira compacta de confirmação
          ════════════════════════════════════════════════════════ */}
      {calcResult && (
        <div style={{
          background: '#0f1923', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 14, padding: '20px 24px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 20,
        }}>
          {[
            {
              label: 'Umidade',
              value: calcResult.fieldCapacityPercent.toFixed(0) + '%',
              color: heroCfg?.color ?? '#8899aa',
              sub: `Limiar: ${heroThreshold}%`,
            },
            {
              label: 'Margem',
              value: heroMargin !== null ? (heroMargin >= 0 ? `+${heroMargin.toFixed(0)}%` : `${heroMargin.toFixed(0)}%`) : '—',
              color: heroMargin !== null && heroMargin >= 0 ? '#22c55e' : '#e05252',
              sub: heroMargin !== null && heroMargin >= 0 ? 'Acima do limiar' : 'Abaixo do limiar',
            },
            {
              label: 'Lâmina rec.',
              value: heroDepth > 0 ? `${heroDepth.toFixed(1)} mm` : 'Não irrigar',
              color: heroDepth > 0 ? '#0093D0' : '#22c55e',
              sub: heroSpeed ? `Velocidade: ${heroSpeed}%` : 'Sem irrigação hoje',
            },
            {
              label: 'ETc',
              value: heroEtc !== null ? `${heroEtc.toFixed(1)} mm/d` : '—',
              color: '#22c55e',
              sub: `ETo: ${calcResult.eto.toFixed(1)} mm/d`,
            },
          ].map(({ label, value, color, sub }) => (
            <div key={label}>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#778899', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{label}</p>
              <p style={{ fontSize: 17, fontWeight: 700, color, fontFamily: 'var(--font-mono)', lineHeight: 1.15 }}>{value}</p>
              <p style={{ fontSize: 10, color: '#778899', marginTop: 4, lineHeight: 1.3 }}>{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          SEÇÃO 3 — PROJEÇÃO 7 DIAS + GRÁFICO
          ════════════════════════════════════════════════════════ */}
      {calcResult?.recommendation && (() => {
        const targetThresholdLine = selectedSeason?.pivots?.alert_threshold_percent ?? 70
        const trendData = projection.slice(0, 7).map((d) => ({
          name: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(d.date + 'T12:00:00').getDay()],
          moisture: parseFloat(d.fieldCapacityPercent.toFixed(1))
        }))

        return (
          <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingDown size={13} style={{ color: '#0093D0' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Se não irrigar, o que acontece?
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
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

            {/* Gráfico de área */}
            <div style={{ padding: '0 20px 4px', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMoisture2" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25}/>
                      <stop offset={`${targetThresholdLine}%`} stopColor="#ef4444" stopOpacity={0.15}/>
                      <stop offset={`${targetThresholdLine}%`} stopColor="#22c55e" stopOpacity={0.12}/>
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.08}/>
                    </linearGradient>
                    <linearGradient id="strokeMoisture2" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#ef4444"/>
                      <stop offset={`${targetThresholdLine}%`} stopColor="#ef4444"/>
                      <stop offset={`${targetThresholdLine}%`} stopColor="#22c55e"/>
                      <stop offset="100%" stopColor="#22c55e"/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" tick={{ fill: '#778899', fontSize: 11 }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis tick={{ fill: '#778899', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 110]} tickFormatter={(v: number) => `${v}%`} />
                  <ReferenceArea y1={Math.round(targetThresholdLine * 1.15)} y2={110} fill="rgba(34,197,94,0.02)" />
                  <ReferenceArea y1={targetThresholdLine} y2={Math.round(targetThresholdLine * 1.15)} fill="rgba(245,158,11,0.03)" />
                  <ReferenceArea y1={0} y2={targetThresholdLine} fill="rgba(239,68,68,0.03)" />
                  <ReferenceLine y={100} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} opacity={0.25} label={{ position: 'insideTopRight', value: 'CC 100%', fill: '#22c55e', fontSize: 9 }} />
                  <ReferenceLine y={targetThresholdLine} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} label={{ position: 'insideBottomLeft', value: `Limiar ${targetThresholdLine}%`, fill: '#f59e0b', fontSize: 9, fontWeight: 700 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#10151C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#e2e8f0', fontSize: 12 }}
                    formatter={(value: unknown) => {
                      const v = Number(value)
                      const zone = v >= targetThresholdLine * 1.15 ? 'Seguro' : v >= targetThresholdLine ? 'Atenção' : 'Crítico'
                      return [`${v}% — ${zone}`, 'Umidade']
                    }}
                  />
                  <Area
                    type="monotone" dataKey="moisture" name="Umidade"
                    stroke="url(#strokeMoisture2)" strokeWidth={2.5}
                    fillOpacity={1} fill="url(#colorMoisture2)"
                    dot={{ r: 4, fill: '#0f1923', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#0093D0', stroke: '#0f1923', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Lista de dias interativa */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <ProjectionForecast
                days={projection}
                baseDays={baseProjection}
                avgEto={avgEto}
                pivot={selectedSeason?.pivots ?? null}
                simulatedIrrigation={simulatedIrrigation}
                onSimulate={setSimulatedIrrigation}
              />
            </div>
          </div>
        )
      })()}

      {/* ════════════════════════════════════════════════════════
          SEÇÃO 4 — AGENDA + CONSUMO (ações secundárias)
          ════════════════════════════════════════════════════════ */}
      {calcResult?.recommendation && (() => {
        const rec2 = calcResult.recommendation
        const statusStyles: Record<RecommendationStatus, { color: string; label: string }> = {
          ok:               { color: '#22c55e',  label: 'SEM NECESSIDADE' },
          queue:            { color: '#d97706',  label: 'FILA (PENDENTE)' },
          irrigate_today:   { color: '#0093D0',  label: 'IRRIGAR HOJE' },
          operational_risk: { color: '#ef4444',  label: 'ALERTA (T < 0%)' },
        }
        const st = statusStyles[rec2.status] || statusStyles.ok

        const progReal = projection.find(p => p.isIrrigationDay)
        let previsaoTexto = 'Hoje'
        if (!rec2.shouldIrrigateToday) {
          if (progReal) {
            const diasFaltam = progReal.das - calcResult.das
            previsaoTexto = diasFaltam === 1
              ? `Amanhã (${progReal.recommendedDepthMm.toFixed(1)} mm)`
              : `Em ${diasFaltam} dias (${progReal.recommendedDepthMm.toFixed(1)} mm)`
          } else {
            previsaoTexto = 'Seguro (>7 dias)'
          }
        }
        const etcDiariaStr = calcResult.etc.toFixed(1)
        const capMaxPivotStr = rec2.maxDepthMm != null ? rec2.maxDepthMm.toFixed(1) : '—'
        const capWarning = rec2.maxDepthMm != null && calcResult.etc > rec2.maxDepthMm

        const waterUsageData = history.slice(0, 7).reverse().map((h: DailyManagement) => ({
          name: h.date.slice(8, 10),
          usage: parseFloat(String((h.actual_depth_mm || 0) + (h.rainfall_mm || 0)))
        }))
        const totalWater7d = waterUsageData.reduce((acc, curr) => acc + curr.usage, 0)
        const totalEtc7d = history.slice(0, 7).reduce((acc: number, h: DailyManagement) => acc + (h.etc_mm ?? 0), 0)

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Agenda de Irrigação */}
            <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ fontSize: 10, fontWeight: 600, color: '#778899', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Agenda de Irrigação</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12, color: '#778899' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Status</span>
                  <span style={{ color: st.color, fontWeight: 700, background: `${st.color}15`, padding: '2px 8px', borderRadius: 6, fontSize: 10, letterSpacing: '0.04em' }}>{st.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Próximo passo</span>
                  <span style={{ color: '#8899aa', fontWeight: 600 }}>{previsaoTexto}</span>
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '1px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Demanda da cultura</span>
                  <span style={{ color: capWarning ? '#e05252' : '#8899aa' }}>{etcDiariaStr} mm/dia</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Estágio fenológico</span>
                  <span style={{ color: '#0093D0', fontWeight: 600 }}>{calcResult.cropStage ?? 1}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <Link href="/pivos" style={{ textDecoration: 'none', flex: 1 }}>
                  <button style={{
                    width: '100%', background: 'rgba(255,255,255,0.04)', color: '#8899aa',
                    border: '1px solid rgba(255,255,255,0.08)', padding: '12px 8px',
                    borderRadius: 10, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    cursor: 'pointer', letterSpacing: '0.02em', textAlign: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  >
                    Config. Pivô
                  </button>
                </Link>
                <Link href="/precipitacoes" style={{ textDecoration: 'none', flex: 1 }}>
                  <button style={{
                    width: '100%', background: 'rgba(255,255,255,0.04)', color: '#8899aa',
                    border: '1px solid rgba(255,255,255,0.08)', padding: '12px 8px',
                    borderRadius: 10, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    cursor: 'pointer', letterSpacing: '0.02em', textAlign: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  >
                    Reg. Chuvas
                  </button>
                </Link>
              </div>
            </div>

            {/* Consumo de Água 7D */}
            <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4 }}>
                <h3 style={{ fontSize: 10, fontWeight: 600, color: '#778899', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Consumo de Água (7D)</h3>
                <div style={{ fontSize: 10, color: '#667788', textAlign: 'right' }}>
                  <div>Aplicado: <strong style={{ color: '#8899aa' }}>{totalWater7d.toFixed(1)} mm</strong></div>
                  <div style={{ marginTop: 2 }}>ETc: <span style={{ color: '#667788'}}>{totalEtc7d.toFixed(1)} mm</span></div>
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 110 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waterUsageData} margin={{ top: 8, right: 0, left: -20, bottom: -10 }}>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#10151C', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, color: '#fff', fontSize: 12 }}
                      itemStyle={{ color: '#0093D0' }}
                      cursor={{ fill: 'rgba(0, 147, 208, 0.05)' }}
                      formatter={(value: unknown) => [`${Number(value).toFixed(1)} mm`, 'Água aplicada']}
                      labelFormatter={(label: unknown) => `Dia ${label}`}
                    />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fill: '#778899', fontSize: 10}} dy={5} />
                    <Bar dataKey="usage" radius={[4, 4, 0, 0]} maxBarSize={28}>
                      {waterUsageData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.usage > 0 ? '#0093D0' : '#1a2433'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )
      })()}

      {/* ════════════════════════════════════════════════════════
          SEÇÃO 5 — ANÁLISE DO SOLO (Gauge Radial)
          ════════════════════════════════════════════════════════ */}
      {calcResult && selectedSeason ? (
        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 20px 4px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#667788', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Análise Detalhada do Solo
          </p>
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
        </div>
      ) : (
        !loading && (
          <div style={{ background: '#0f1923', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 14, padding: '32px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Thermometer size={28} style={{ color: '#778899' }} />
            <p style={{ fontSize: 13, color: '#778899' }}>Preencha Tmax e Tmin para projetar o solo</p>
          </div>
        )
      )}

      {/* ════════════════════════════════════════════════════════
          SEÇÃO 6 — FORMULÁRIO DE LANÇAMENTO
          ════════════════════════════════════════════════════════ */}
      <div id="manejo-form-section" style={{ scrollMarginTop: 80 }}>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            width: '100%', padding: '14px 24px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            minHeight: 52,
            background: showForm ? '#0d1520' : 'linear-gradient(90deg, #0f1923, #121c26)',
            border: showForm ? '1px solid rgba(0,147,208,0.2)' : '1px solid rgba(255,255,255,0.06)',
            color: showForm ? '#0093D0' : '#8899aa',
            fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showForm ? <ChevronDown size={18} /> : <Plus size={18} />}
            {showForm ? 'Ocultar Lançamento Manual' : 'Lançar Dados Manuais (Clima / Irrigação)'}
          </div>
          {!showForm && <div style={{ fontSize: 11, color: '#667788', fontWeight: 500, textTransform: 'none' }}>Opcional se auto-integrado</div>}
        </button>

        {showForm && (
          <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0 0 14px 14px', borderTop: 'none', padding: 'clamp(16px, 4vw, 28px)', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Fonte climática + data */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4 items-start">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#778899', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Dados Climáticos</label>
                {weatherLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Loader2 size={12} className="animate-spin" style={{ color: '#0093D0' }} />
                    <span style={{ fontSize: 13, color: '#667788' }}>Buscando dados climáticos...</span>
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
                    <Thermometer size={13} style={{ color: '#667788' }} />
                    <span style={{ fontSize: 13, color: '#667788' }}>Preencha os dados manualmente</span>
                  </div>
                )}
              </div>
              <InputField label="Data do registro" type="date" value={date} onChange={setDate} />
            </div>

            {/* Campos climáticos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
              <InputField label="Tmax" value={tmax} onChange={setTmax} unit="°C" placeholder="35" />
              <InputField label="Tmin" value={tmin} onChange={setTmin} unit="°C" placeholder="18" />
              <InputField label="UR Média" value={humidity} onChange={setHumidity} unit="%" placeholder="65" />
              <InputField label="Vento" value={wind} onChange={setWind} unit="m/s" placeholder="2.5" />
              <InputField label="Radiação Solar" value={radiation} onChange={setRadiation} unit="W/m²" placeholder="220" />
              <InputField label="Chuva (fazenda)" value={rainfall} onChange={setRainfall} unit="mm" placeholder="0" />
            </div>

            {/* ADc anterior */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Droplets size={14} style={{ color: '#0093D0', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#667788' }}>ADc (Umidade) anterior:</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>{fmtNum(adcPrev)} mm</span>
              <span style={{ fontSize: 12, color: '#778899', marginLeft: 2 }}>{history.length > 0 ? '(último registro)' : '(ADc inicial da safra)'}</span>
            </div>

            {/* Irrigação realizada */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#778899', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Irrigação Realizada <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
                <InputField label="Velocidade real" value={actualSpeed} onChange={setActualSpeed} unit="%" placeholder="60" />
                <InputField label="Lâmina real" value={actualDepth} onChange={v => { setActualDepth(v); setDepthAutoFilled(false) }} unit="mm" placeholder="12" />
                <InputField label="Início" type="time" value={irrigStart} onChange={setIrrigStart} />
                <InputField label="Fim" type="time" value={irrigEnd} onChange={setIrrigEnd} />
              </div>
            </div>

            {/* Erros / sucesso */}
            {error && (
              <div style={{ padding: '11px 16px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444', fontSize: 13 }}>
                {error}
              </div>
            )}
            {saveMsg && (
              <div style={{ padding: '11px 16px', borderRadius: 8, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.25)', color: '#22c55e', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={14} /> {saveMsg}
              </div>
            )}

            {/* Botão salvar */}
            <button onClick={handleSave} disabled={saving || !calcResult}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                padding: '17px 0', borderRadius: 12, fontSize: 14, fontWeight: 700,
                minHeight: 52, textTransform: 'uppercase', letterSpacing: '0.06em',
                background: calcResult ? 'linear-gradient(135deg, #0093D0, #0277b5)' : '#0d1520',
                border: 'none', color: calcResult ? '#fff' : '#667788',
                cursor: calcResult ? 'pointer' : 'not-allowed',
                opacity: saving ? 0.7 : 1,
                boxShadow: calcResult ? '0 8px 24px rgba(0, 147, 208, 0.3)' : 'none',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={e => { if (calcResult && !saving) { e.currentTarget.style.transform = 'scale(1.01)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,147,208,0.4)' } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = calcResult ? '0 8px 24px rgba(0,147,208,0.3)' : 'none' }}
              onMouseDown={e => { if (calcResult && !saving) e.currentTarget.style.transform = 'scale(0.99)' }}
              onMouseUp={e => { if (calcResult && !saving) e.currentTarget.style.transform = 'scale(1.01)' }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Registrando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════
          SEÇÃO 7 — GRÁFICO DE BALANÇO HÍDRICO (análise avançada)
          ════════════════════════════════════════════════════════ */}
      {history.length >= 2 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#667788', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, paddingLeft: 4 }}>
            Balanço Hídrico — Histórico
          </p>
          <WaterBalanceChart
            history={history}
            threshold={selectedSeason?.pivots?.alert_threshold_percent ?? 70}
            fFactor={
              selectedSeason?.crops && history.length > 0
                ? getFFactorForDas(selectedSeason.crops, history[0].das ?? 1)
                : null
            }
            fieldCapacity={selectedSeason?.pivots?.field_capacity ?? null}
            wiltingPoint={selectedSeason?.pivots?.wilting_point ?? null}
            pivotName={selectedSeason?.pivots?.name ?? undefined}
          />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          SEÇÃO 8 — HISTÓRICO (Data Explorer)
          ════════════════════════════════════════════════════════ */}
      <div style={{ marginTop: 4 }}>
        <button
          onClick={() => setShowHistoryTab(!showHistoryTab)}
          style={{
            width: '100%', padding: '14px 24px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            minHeight: 52,
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
            <span style={{ fontSize: 10, color: '#778899', background: '#0d1520', padding: '2px 8px', borderRadius: 10 }}>
              {history.length} Registros
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
                  setTimeout(() => { btn.style.color = '#778899'; btn.textContent = '↻' }, 2000)
                }}
                style={{ fontSize: 14, color: '#778899', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
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

    </div>
  )
}

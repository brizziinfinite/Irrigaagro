'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { Season, Crop, Pivot, DailyManagement, Farm, DailyManagementInsert } from '@/types/database'
import {
  getStageInfoForDas, calcCTA, calcProjection, calcRa,
  type ProjectionDay,
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
import {
  type EToConfidence,
  getEToSourceLabel,
  getEToConfidenceLabel,
} from '@/lib/calculations/eto-resolution'
import {
  Loader2, ChevronDown, Droplets, Sun, CloudRain,
  Wind, Thermometer, CheckCircle2, AlertTriangle, AlertCircle,
  Info, Save, Calendar, FlaskConical, Sprout, Clock,
  Satellite, Sheet, TrendingDown, Zap, BarChart2, Orbit,
} from 'lucide-react'

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
  return new Date().toISOString().split('T')[0]
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

// ─── Tipos de dados relacionais ───────────────────────────────

interface SeasonFull extends Season {
  crops: Crop | null
  pivots: Pivot | null
  farms: Farm
}

function buildExternalDataMessage(
  externalData: ManagementExternalData,
  hasPivot: boolean
): string {
  const messages: string[] = []

  if (externalData.climateSource === 'pivot_station' && externalData.weather && externalData.station) {
    messages.push(`Clima preenchido via estação preferencial do pivô: "${externalData.station.name}"`)
  } else if (externalData.climateSource === 'farm_station' && externalData.weather && externalData.station) {
    messages.push(`Clima preenchido via estação da fazenda: "${externalData.station.name}"`)
  } else if (externalData.climateSource === 'pivot_geolocation' && externalData.geolocationWeather) {
    messages.push('Clima preenchido por geolocalização do pivô via Open-Meteo')
  } else if (externalData.station) {
    messages.push(`Estação "${externalData.station.name}" sem weather_data para a data`)
  } else {
    messages.push('Sem estação climática cadastrada para a fazenda')
  }

  if (externalData.rainfall) {
    messages.push('chuva carregada de rainfall_records')
  } else if (hasPivot) {
    messages.push('sem chuva registrada para o pivô/data; use valor manual ou weather_data')
  } else {
    messages.push('safra sem pivô vinculado; chuva por pivô indisponível')
  }

  if (externalData.weather?.eto_corrected_mm != null) {
    messages.push('ETo disponível via estação corrigida')
  } else if (externalData.weather?.eto_mm != null) {
    messages.push('ETo disponível via estação bruta')
  } else if (externalData.geolocationWeather) {
    messages.push('clima veio da geolocalização; ETo será calculada localmente')
  } else {
    messages.push('sem ETo da estação; cálculo local será usado se houver variáveis')
  }

  return messages.join(' · ')
}

function getClimateSourceBadge(source: ManagementExternalData['climateSource'] | null): {
  type: string | null
  label: string
  icon: typeof Satellite
  color: string
  border: string
  background: string
} | null {
  if (source === 'pivot_station') {
    return {
      type: 'pivot_station',
      label: 'Dados automáticos — Estação do pivô',
      icon: Satellite,
      color: '#0093D0',
      border: '1px solid rgb(0 147 208 / 0.20)',
      background: 'rgba(0,147,208,0.06)',
    }
  }

  if (source === 'farm_station') {
    return {
      type: 'farm_station',
      label: 'Dados automáticos — Estação da fazenda',
      icon: Sheet,
      color: '#06b6d4',
      border: '1px solid rgb(6 182 212 / 0.2)',
      background: 'rgb(6 182 212 / 0.06)',
    }
  }

  if (source === 'pivot_geolocation') {
    return {
      type: 'pivot_geolocation',
      label: 'Dados automáticos — Geolocalização do pivô',
      icon: Orbit,
      color: '#f59e0b',
      border: '1px solid rgb(245 158 11 / 0.15)',
      background: 'rgb(245 158 11 / 0.06)',
    }
  }

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

  if (!season || !season.crops || !season.field_capacity || !season.wilting_point || !season.bulk_density || !das) {
    return 0
  }

  const initialPct = season.initial_adc_percent ?? 100
  const { rootDepthCm } = getStageInfoForDas(season.crops, das)
  const cta = calcCTA(
    Number(season.field_capacity),
    Number(season.wilting_point),
    Number(season.bulk_density),
    rootDepthCm
  )

  return (initialPct / 100) * cta
}

// ─── Componentes de input ─────────────────────────────────────

function InputField({ label, value, onChange, unit, placeholder, type = 'number' }: {
  label: string; value: string; onChange: (v: string) => void
  unit?: string; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 5 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={type} step={type === 'number' ? 'any' : undefined}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: unit ? '9px 36px 9px 10px' : '9px 10px',
            borderRadius: 8, fontSize: 13,
            background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e2e8f0', outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = '#0093D0'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
        {unit && (
          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#556677', pointerEvents: 'none' }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 2px' }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#556677' }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
    </div>
  )
}

// ─── Card de resultado calculado ──────────────────────────────

interface CalcResultProps {
  eto: number; etc: number; kc: number; cta: number; cad: number
  adcNew: number; fieldCapacityPercent: number; status: IrrigationStatus
  recommendedDepthMm: number; recommendedSpeedPercent: number | null
  das: number; cropStage: number
}

function CalcResultCard({ eto, etc, kc, cta, cad, adcNew, fieldCapacityPercent, status, recommendedDepthMm, recommendedSpeedPercent, das, cropStage }: CalcResultProps) {
  const cfg = STATUS_CONFIG[status]
  const StatusIcon = cfg.icon
  const stageLabels = ['', 'Inicial', 'Desenv.', 'Médio', 'Final']

  return (
    <div style={{ background: '#0f1923', border: `1px solid ${cfg.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header semáforo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StatusIcon size={18} style={{ color: cfg.color }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: cfg.color }}>{cfg.label}</p>
          <p style={{ fontSize: 11, color: '#556677' }}>{cfg.desc}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, color: '#556677' }}>DAS {das} · Fase {cropStage}</p>
          <p style={{ fontSize: 11, color: '#8899aa' }}>{stageLabels[cropStage] ?? ''}</p>
        </div>
      </div>

      {/* Métricas principais */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { icon: Sun,      label: 'ETo',  value: fmtNum(eto), unit: 'mm/d', color: '#f59e0b' },
          { icon: Droplets, label: 'ETc',  value: fmtNum(etc), unit: 'mm/d', color: '#06b6d4' },
          { icon: Info,     label: 'Kc',   value: fmtNum(kc, 3), unit: '',   color: '#0093D0' },
        ].map(({ icon: Icon, label, value, unit, color }) => (
          <div key={label} style={{ background: '#0d1520', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <Icon size={13} style={{ color, margin: '0 auto 4px' }} />
            <p style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', lineHeight: 1 }}>{value}</p>
            <p style={{ fontSize: 10, color: '#556677', marginTop: 2 }}>{label}{unit ? ` (${unit})` : ''}</p>
          </div>
        ))}
      </div>

      {/* Balanço hídrico */}
      <div style={{ background: '#0d1520', borderRadius: 12, padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#556677' }}>ADc atual</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0' }}>{fmtNum(adcNew)} mm</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#556677' }}>CAD (limite)</span>
          <span style={{ fontSize: 11, color: '#8899aa' }}>{fmtNum(cad)} mm</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: '#556677' }}>CTA (máx)</span>
          <span style={{ fontSize: 11, color: '#556677' }}>{fmtNum(cta)} mm</span>
        </div>

        {/* Barra de umidade */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: '#556677' }}>Capacidade de Campo</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color }}>{fmtNum(fieldCapacityPercent, 0)}%</span>
          </div>
          <div style={{ height: 8, background: '#080e14', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
            {/* Linha CAD */}
            <div style={{
              position: 'absolute', left: `${clamp50((cad / cta) * 100)}%`,
              top: 0, bottom: 0, width: 2, background: '#f59e0b', opacity: 0.7,
            }} />
            {/* Barra de umidade */}
            <div style={{
              width: `${clamp50(fieldCapacityPercent)}%`,
              height: '100%', background: cfg.color, borderRadius: 99,
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.04)' }}>0</span>
            <span style={{ fontSize: 9, color: '#f59e0b' }}>CAD {fmtNum((cad / cta) * 100, 0)}%</span>
            <span style={{ fontSize: 9, color: '#556677' }}>100%</span>
          </div>
        </div>
      </div>

      {/* Recomendação */}
      {recommendedDepthMm > 0 && (
        <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 12, padding: '12px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: cfg.color, marginBottom: 6 }}>Recomendação de Irrigação</p>
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              <p style={{ fontSize: 10, color: '#556677' }}>Lâmina necessária</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: cfg.color, fontFamily: 'var(--font-mono)' }}>
                {fmtNum(recommendedDepthMm)} <span style={{ fontSize: 11, fontWeight: 400, color: '#556677' }}>mm</span>
              </p>
            </div>
            {recommendedSpeedPercent !== null && (
              <div>
                <p style={{ fontSize: 10, color: '#556677' }}>Velocidade sugerida</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>
                  {recommendedSpeedPercent}% <span style={{ fontSize: 11, fontWeight: 400, color: '#556677' }}>vel.</span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function clamp50(v: number): number {
  return Math.max(0, Math.min(100, v))
}

// ─── Histórico ───────────────────────────────────────────────

function HistoryTable({ records }: { records: DailyManagement[] }) {
  if (records.length === 0) {
    return (
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
        <Calendar size={24} style={{ color: '#556677', margin: '0 auto 10px' }} />
        <p style={{ fontSize: 13, color: '#556677' }}>Nenhum registro ainda.</p>
      </div>
    )
  }

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '90px 40px 55px 55px 55px 55px 55px 55px 60px',
        gap: 4, padding: '10px 16px',
        background: '#0d1520', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {['Data', 'DAS', 'ETo', 'ETc', 'Kc', 'Chuva', 'ADc', 'CC%', 'Status'].map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      {records.map((r, i) => {
        const status = (r.field_capacity_percent ?? 100) >= 50
          ? ((r.field_capacity_percent ?? 100) >= 80 ? 'verde' : 'amarelo')
          : 'vermelho'
        const cfg = STATUS_CONFIG[status as IrrigationStatus]
        const StatusIcon = cfg.icon

        return (
          <div key={r.id} style={{
            display: 'grid',
            gridTemplateColumns: '90px 40px 55px 55px 55px 55px 55px 55px 60px',
            gap: 4, padding: '10px 16px',
            borderBottom: i < records.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            background: i % 2 ? '#080e14' : 'transparent',
          }}>
            <span style={{ fontSize: 12, color: '#8899aa' }}>{fmtDate(r.date)}</span>
            <span style={{ fontSize: 12, color: '#556677' }}>{r.das ?? '—'}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.eto_mm)}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.etc_mm)}</span>
            <span style={{ fontSize: 12, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.kc, 3)}</span>
            <span style={{ fontSize: 12, color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.rainfall_mm)}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.ctda)}</span>
            <span style={{ fontSize: 12, color: cfg.color, fontFamily: 'var(--font-mono)' }}>{fmtNum(r.field_capacity_percent, 0)}%</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <StatusIcon size={11} style={{ color: cfg.color }} />
              <span style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Projeção 7 dias ─────────────────────────────────────────

function ProjectionForecast({ days, avgEto }: { days: ProjectionDay[]; avgEto: number | null }) {
  if (days.length === 0) return null

  const firstIrrigIdx = days.findIndex(d => d.isIrrigationDay)

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <TrendingDown size={14} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Projeção — próximos 7 dias</span>
        {avgEto !== null && (
          <span style={{ fontSize: 11, color: '#556677', marginLeft: 'auto' }}>
            ETo média: <span style={{ color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>{avgEto.toFixed(1)} mm/d</span>
          </span>
        )}
        <span style={{ fontSize: 10, color: '#556677', padding: '3px 8px', borderRadius: 20, background: '#0d1520' }}>sem chuva prevista</span>
      </div>

      {/* Alerta de início de irrigação */}
      {firstIrrigIdx >= 0 && (
        <div style={{
          margin: '12px 20px 0',
          padding: '10px 14px',
          borderRadius: 10,
          background: firstIrrigIdx <= 1
            ? 'rgb(239 68 68 / 0.1)'
            : firstIrrigIdx <= 3
              ? 'rgb(245 158 11 / 0.1)'
              : 'rgba(0,147,208,0.08)',
          border: firstIrrigIdx <= 1
            ? '1px solid rgb(239 68 68 / 0.3)'
            : firstIrrigIdx <= 3
              ? '1px solid rgb(245 158 11 / 0.3)'
              : '1px solid rgb(0 147 208 / 0.20)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Zap size={13} style={{ color: firstIrrigIdx <= 1 ? '#ef4444' : firstIrrigIdx <= 3 ? '#f59e0b' : '#0093D0', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: firstIrrigIdx <= 1 ? '#ef4444' : firstIrrigIdx <= 3 ? '#f59e0b' : '#0093D0' }}>
              {firstIrrigIdx === 0
                ? 'Iniciar irrigação hoje!'
                : firstIrrigIdx === 1
                  ? 'Iniciar irrigação amanhã'
                  : `Iniciar irrigação em ${firstIrrigIdx + 1} dias (${fmtDate(days[firstIrrigIdx].date)})`}
            </p>
            <p style={{ fontSize: 10, color: '#556677' }}>
              Lâmina necessária: {fmtNum(days[firstIrrigIdx].recommendedDepthMm)} mm
              {days[firstIrrigIdx].recommendedSpeedPercent !== null
                ? ` · Velocidade: ${days[firstIrrigIdx].recommendedSpeedPercent}%`
                : ''}
            </p>
          </div>
        </div>
      )}

      {/* Linha do tempo — barras */}
      <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {days.map((day, i) => {
          const cfg = STATUS_CONFIG[day.status]
          const StatusIcon = cfg.icon
          const pct = Math.max(0, Math.min(100, day.fieldCapacityPercent))
          const cadPct = day.cta > 0 ? (day.cad / day.cta) * 100 : 0
          const isAlert = day.isIrrigationDay

          return (
            <div
              key={day.date}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 36px 1fr 50px 50px 80px',
                alignItems: 'center', gap: 8,
                padding: isAlert ? '8px 10px' : '6px 10px',
                borderRadius: 10,
                background: isAlert ? cfg.bg : i % 2 ? '#080e14' : 'transparent',
                border: isAlert ? `1px solid ${cfg.border}` : '1px solid transparent',
              }}
            >
              {/* Data */}
              <span style={{ fontSize: 11, color: isAlert ? cfg.color : '#8899aa', fontWeight: isAlert ? 700 : 400 }}>
                {i === 0 ? 'Amanhã' : fmtDate(day.date)}
              </span>

              {/* DAS */}
              <span style={{ fontSize: 10, color: '#556677' }}>D{day.das}</span>

              {/* Barra de umidade */}
              <div style={{ position: 'relative', height: 14, background: '#080e14', borderRadius: 99, overflow: 'visible' }}>
                {/* Linha CAD */}
                <div style={{
                  position: 'absolute', left: `${cadPct}%`,
                  top: -2, bottom: -2, width: 2, background: '#f59e0b',
                  opacity: 0.6, borderRadius: 1, zIndex: 2,
                }} />
                {/* Barra */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`, background: cfg.color, borderRadius: 99,
                  transition: 'width 0.3s',
                }} />
              </div>

              {/* % CC */}
              <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                {fmtNum(day.fieldCapacityPercent, 0)}%
              </span>

              {/* ETc */}
              <span style={{ fontSize: 10, color: '#556677', textAlign: 'right' }}>
                <span style={{ color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{fmtNum(day.etcAvg)}</span> mm
              </span>

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                <StatusIcon size={11} style={{ color: cfg.color }} />
                <span style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legenda */}
      <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#556677' }}>Legenda:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 2, height: 10, background: '#f59e0b', opacity: 0.7 }} />
          <span style={{ fontSize: 10, color: '#556677' }}>Limite CAD</span>
        </div>
        <span style={{ fontSize: 10, color: '#556677' }}>ETc estimada sem chuva · Projeção conservadora</span>
      </div>
    </div>
  )
}

// ─── Timeline comparativa ─────────────────────────────────────

interface TimelinePoint {
  date: string
  eto: number | null
  etc: number | null
  rainfall: number | null
  fieldCapacityPercent: number | null
}

function TimelineChart({ records }: { records: DailyManagement[] }) {
  if (records.length < 2) return null

  // Inverte para ordem cronológica (mais antigo → mais recente)
  const data: TimelinePoint[] = [...records].reverse().map(r => ({
    date: r.date,
    eto: r.eto_mm ?? null,
    etc: r.etc_mm ?? null,
    rainfall: r.rainfall_mm ?? null,
    fieldCapacityPercent: r.field_capacity_percent ?? null,
  }))

  const W = 800
  const H = 220
  const PAD = { top: 16, right: 16, bottom: 36, left: 44 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  // Escalas
  const maxEto = Math.max(...data.map(d => d.eto ?? 0).filter(v => v > 0), 8)
  const maxRain = Math.max(...data.map(d => d.rainfall ?? 0).filter(v => v > 0), 1)
  // ADc% usa eixo 0–100 no lado direito

  function xPos(i: number) {
    return PAD.left + (i / Math.max(data.length - 1, 1)) * innerW
  }
  function yLeft(val: number) {
    // Eixo esquerdo: 0..maxEto (mm/dia)
    return PAD.top + innerH - (val / maxEto) * innerH
  }
  function yRight(val: number) {
    // Eixo direito: 0..100 (%)
    return PAD.top + innerH - (val / 100) * innerH
  }

  // Gera polyline path
  function makePath(getter: (d: TimelinePoint) => number | null, yFn: (v: number) => number) {
    const pts = data
      .map((d, i) => {
        const v = getter(d)
        if (v === null) return null
        return `${xPos(i).toFixed(1)},${yFn(v).toFixed(1)}`
      })
      .filter(Boolean)
    if (pts.length < 2) return ''
    // Quebra em segmentos contíguos (sem null no meio)
    const segments: string[][] = []
    let current: string[] = []
    data.forEach((d, i) => {
      const v = getter(d)
      if (v !== null) {
        current.push(`${xPos(i).toFixed(1)},${yFn(v).toFixed(1)}`)
      } else {
        if (current.length >= 2) segments.push(current)
        current = []
      }
    })
    if (current.length >= 2) segments.push(current)
    return segments.map(s => `M ${s.join(' L ')}`).join(' ')
  }

  const pathEto  = makePath(d => d.eto,   yLeft)
  const pathEtc  = makePath(d => d.etc,   yLeft)
  const pathAdc  = makePath(d => d.fieldCapacityPercent, yRight)

  // Ticks do eixo X: máximo 6 labels
  const tickStep = Math.ceil(data.length / 6)
  const xTicks = data
    .map((d, i) => ({ i, label: fmtDate(d.date) }))
    .filter((_, i) => i % tickStep === 0 || i === data.length - 1)

  // Ticks eixo Y esquerdo
  const yTicksLeft = [0, maxEto * 0.25, maxEto * 0.5, maxEto * 0.75, maxEto].map(v => ({
    v, y: yLeft(v), label: v.toFixed(1),
  }))

  // Ticks eixo Y direito
  const yTicksRight = [0, 25, 50, 75, 100].map(v => ({
    v, y: yRight(v), label: `${v}%`,
  }))

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <BarChart2 size={14} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Timeline — Histórico Comparativo</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8899aa' }}>
            <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#f59e0b" strokeWidth="2" /></svg>ETo
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8899aa' }}>
            <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#06b6d4" strokeWidth="2" /></svg>ETc
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8899aa' }}>
            <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#0093D0" strokeWidth="2" strokeDasharray="4 2" /></svg>ADc%
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8899aa' }}>
            <div style={{ width: 8, height: 14, background: 'rgb(6 182 212 / 0.4)', borderRadius: 2, border: '1px solid rgb(6 182 212 / 0.5)' }} />Chuva
          </span>
        </div>
      </div>

      {/* SVG */}
      <div style={{ padding: '8px 0 4px', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', minWidth: 340 }}
        >
          {/* Grade horizontal */}
          {yTicksLeft.map(({ v, y }) => (
            <line key={v} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          ))}

          {/* Linha CAD (50% do eixo direito) */}
          <line
            x1={PAD.left} y1={yRight(50)} x2={W - PAD.right} y2={yRight(50)}
            stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" opacity="0.4"
          />

          {/* Barras de chuva */}
          {data.map((d, i) => {
            if (!d.rainfall || d.rainfall <= 0) return null
            const barW = Math.max(4, innerW / data.length * 0.6)
            const barH = (d.rainfall / Math.max(maxRain, 1)) * innerH * 0.4
            const x = xPos(i) - barW / 2
            const y = PAD.top + innerH - barH
            return (
              <rect key={i} x={x} y={y} width={barW} height={barH}
                fill="rgb(6 182 212 / 0.35)" stroke="rgb(6 182 212 / 0.6)" strokeWidth="1" rx="2" />
            )
          })}

          {/* Linha ETo */}
          {pathEto && (
            <path d={pathEto} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
          )}

          {/* Linha ETc */}
          {pathEtc && (
            <path d={pathEtc} fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinejoin="round" />
          )}

          {/* Linha ADc% */}
          {pathAdc && (
            <path d={pathAdc} fill="none" stroke="#0093D0" strokeWidth="2"
              strokeDasharray="5 3" strokeLinejoin="round" />
          )}

          {/* Pontos ADc% */}
          {data.map((d, i) => {
            if (d.fieldCapacityPercent === null) return null
            const pct = d.fieldCapacityPercent
            const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
            return (
              <circle key={i} cx={xPos(i)} cy={yRight(pct)} r="3"
                fill={color} stroke="#0f1923" strokeWidth="1.5" />
            )
          })}

          {/* Eixo Y esquerdo — labels */}
          {yTicksLeft.map(({ v, y, label }) => (
            <text key={v} x={PAD.left - 6} y={y + 4}
              textAnchor="end" fontSize="9" fill="#556677">{label}</text>
          ))}

          {/* Eixo Y esquerdo — título */}
          <text
            x={10} y={PAD.top + innerH / 2}
            textAnchor="middle" fontSize="9" fill="#556677"
            transform={`rotate(-90, 10, ${PAD.top + innerH / 2})`}
          >mm/dia</text>

          {/* Eixo Y direito — labels */}
          {yTicksRight.map(({ v, y, label }) => (
            <text key={v} x={W - PAD.right + 6} y={y + 4}
              textAnchor="start" fontSize="9" fill="#556677">{label}</text>
          ))}

          {/* Eixo X — labels */}
          {xTicks.map(({ i, label }) => (
            <text key={i} x={xPos(i)} y={H - 6}
              textAnchor="middle" fontSize="9" fill="#556677">{label}</text>
          ))}

          {/* Eixo base */}
          <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        </svg>
      </div>

      {/* Rodapé */}
      <div style={{ padding: '8px 20px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#556677' }}>
          Linha tracejada âmbar = limite CAD (50% CC)
        </span>
        <span style={{ fontSize: 10, color: '#556677' }}>
          Pontos ADc% coloridos: <span style={{ color: '#22c55e' }}>verde ≥80%</span> · <span style={{ color: '#f59e0b' }}>amarelo ≥50%</span> · <span style={{ color: '#ef4444' }}>vermelho &lt;50%</span>
        </span>
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
  const [avgEto, setAvgEto]                 = useState<number | null>(null)

  // Formulário — dados climáticos
  const [date, setDate]           = useState(todayISO())
  const [tmax, setTmax]           = useState('')
  const [tmin, setTmin]           = useState('')
  const [humidity, setHumidity]   = useState('')
  const [wind, setWind]           = useState('')
  const [radiation, setRadiation] = useState('')
  const [rainfall, setRainfall]   = useState('')

  // Formulário — irrigação realizada
  const [actualSpeed, setActualSpeed]     = useState('')
  const [actualDepth, setActualDepth]     = useState('')
  const [irrigStart, setIrrigStart]       = useState('')
  const [irrigEnd, setIrrigEnd]           = useState('')

  // ─── Carregar safras ────────────────────────────────────────
  const loadSeasons = useCallback(async () => {
    if (!company?.id) {
      setSeasons([])
      setSelectedSeasonId('')
      setLoading(false)
      setError('Nenhuma empresa ativa encontrada')
      return
    }

    setLoading(true)
    try {
      setError(null)
      const contexts = await listManagementSeasonContexts(company.id)
      const list: SeasonFull[] = contexts.map((context) => ({
        ...context.season,
        crops: context.crop,
        pivots: context.pivot,
        farms: context.farm,
      }))
      setSeasons(list)
      setSelectedSeasonId((current) => {
        if (current && list.some((season) => season.id === current)) return current
        const active = list.find((season) => season.is_active)
        return active?.id ?? list[0]?.id ?? ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar safras. Verifique sua conexão e tente novamente.')
      setSeasons([])
      setSelectedSeasonId('')
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    if (authLoading) return
    loadSeasons()
  }, [authLoading, loadSeasons])

  // ─── Carregar histórico da safra selecionada ────────────────
  const loadHistory = useCallback(async (seasonId: string) => {
    if (!seasonId) return
    try {
      setError(null)
      const data = await listDailyManagementBySeason(seasonId)
      setHistory(data.slice(0, 30))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar histórico. Verifique se a safra está corretamente configurada.')
      setHistory([])
    }
  }, [])

  useEffect(() => {
    if (selectedSeasonId) loadHistory(selectedSeasonId)
  }, [selectedSeasonId, loadHistory])

  // ─── Safra selecionada ──────────────────────────────────────
  const selectedSeason = useMemo(
    () => seasons.find(s => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId]
  )

  // ─── Busca automática de dados climáticos ───────────────────
  useEffect(() => {
    if (!selectedSeason || !date) {
      setExternalData(null)
      return
    }

    const season = selectedSeason

    let cancelled = false

    async function fetchClimate() {
      try {
        setWeatherLoading(true)
        setError(null)
        const snapshot = await getManagementExternalData(
          season.farms.id,
          season.pivots?.id ?? null,
          date,
          season.pivots
        )

        if (cancelled) return

        setExternalData(snapshot)

        const climateSnapshot = snapshot.weather ?? snapshot.geolocationWeather
        setTmax(climateSnapshot?.temp_max != null ? climateSnapshot.temp_max.toFixed(1) : '')
        setTmin(climateSnapshot?.temp_min != null ? climateSnapshot.temp_min.toFixed(1) : '')
        setHumidity(climateSnapshot?.humidity_percent != null ? climateSnapshot.humidity_percent.toFixed(0) : '')
        setWind(climateSnapshot?.wind_speed_ms != null ? climateSnapshot.wind_speed_ms.toFixed(1) : '')
        setRadiation(climateSnapshot?.solar_radiation_wm2 != null ? climateSnapshot.solar_radiation_wm2.toFixed(0) : '')
        setRainfall(
          snapshot.rainfall?.rainfall_mm != null
            ? snapshot.rainfall.rainfall_mm.toFixed(1)
            : climateSnapshot?.rainfall_mm != null
              ? climateSnapshot.rainfall_mm.toFixed(1)
              : ''
        )
      } catch (err) {
        if (!cancelled) {
          setExternalData(null)
          setError(err instanceof Error ? err.message : 'Falha ao buscar dados climáticos. A estação pode estar indisponível.')
        }
      } finally {
        if (!cancelled) {
          setWeatherLoading(false)
        }
      }
    }

    fetchClimate()
    return () => { cancelled = true }
  }, [selectedSeason, date])

  // ─── DAS do dia selecionado ─────────────────────────────────
  const das = useMemo(() => {
    if (!selectedSeason?.planting_date || !date) return null
    return calcDAS(selectedSeason.planting_date, date)
  }, [selectedSeason, date])

  // ─── ADc do dia anterior (último registro da safra) ─────────
  const adcPrev = useMemo(
    () => resolvePreviousAdc(selectedSeason, history, date, das),
    [selectedSeason, history, date, das]
  )

  const externalInfo = useMemo(() => {
    if (!externalData) return null
    return buildExternalDataMessage(externalData, Boolean(selectedSeason?.pivots))
  }, [externalData, selectedSeason?.pivots])

  // ─── Cálculo ao vivo ─────────────────────────────────────────
  const calcResult = useMemo(() => {
    if (!selectedSeason) return null
    return computeResolvedManagementBalance({
      context: {
        season: selectedSeason,
        farm: selectedSeason.farms,
        pivot: selectedSeason.pivots,
        crop: selectedSeason.crops,
      },
      history,
      date,
      tmax,
      tmin,
      humidity,
      wind,
      radiation,
      rainfall,
      actualDepth,
      actualSpeed,
      externalData,
    })
  }, [selectedSeason, history, date, tmax, tmin, humidity, wind, radiation, rainfall, actualDepth, actualSpeed, externalData])

  // ─── Projeção 7 dias ─────────────────────────────────────────
  useEffect(() => {
    if (!calcResult || !selectedSeason?.crops || !das || !date) {
      setProjection([])
      setAvgEto(null)
      return
    }

    const season = selectedSeason
    const crop = season.crops!
    const pivot = season.pivots ?? null

    // ETo do dia atual como base (ou média do histórico se disponível)
    let baseEto = calcResult.eto

    // Tenta usar média do histórico recente (últimos 7 registros com ETo)
    const recentWithEto = history
      .filter(r => r.eto_mm !== null && r.eto_mm !== undefined)
      .slice(0, 7)

    if (recentWithEto.length >= 3) {
      baseEto = recentWithEto.reduce((sum, r) => sum + (r.eto_mm ?? 0), 0) / recentWithEto.length
    }

    setAvgEto(baseEto)

    const proj = calcProjection({
      crop,
      startDate: date,
      startDas: das,
      startAdc: calcResult.adcNew,
      fieldCapacity: Number(season.field_capacity ?? 32),
      wiltingPoint:  Number(season.wilting_point  ?? 14),
      bulkDensity:   Number(season.bulk_density   ?? 1.4),
      avgEto: baseEto,
      pivot,
      days: 7,
    })

    setProjection(proj)
  }, [calcResult, selectedSeason, das, date, history])

  // ─── Salvar registro ─────────────────────────────────────────
  async function handleSave() {
    if (!selectedSeason || !calcResult || !date) return
    setSaving(true)
    setError(null)
    setSaveMsg(null)

    const climateSnapshot = externalData?.weather ?? externalData?.geolocationWeather ?? null
    const payload: DailyManagementInsert = {
      season_id:      selectedSeason.id,
      date,
      das:            calcResult.das,
      crop_stage:     calcResult.cropStage,
      temp_max:       parseOptionalNumber(tmax) ?? climateSnapshot?.temp_max ?? null,
      temp_min:       parseOptionalNumber(tmin) ?? climateSnapshot?.temp_min ?? null,
      humidity_percent:    parseOptionalNumber(humidity) ?? climateSnapshot?.humidity_percent ?? null,
      wind_speed_ms:       parseOptionalNumber(wind) ?? climateSnapshot?.wind_speed_ms ?? null,
      solar_radiation_wm2: parseOptionalNumber(radiation) ?? climateSnapshot?.solar_radiation_wm2 ?? null,
      eto_mm:         calcResult.eto,
      eto_source:     calcResult.etoSource,
      eto_confidence: calcResult.etoConfidence,
      eto_notes:      calcResult.etoNotes,
      etc_mm:         calcResult.etc,
      rainfall_mm:    parseOptionalNumber(rainfall) ?? externalData?.rainfall?.rainfall_mm ?? climateSnapshot?.rainfall_mm ?? 0,
      kc:             calcResult.kc,
      ks:             calcResult.ks,
      ctda:           calcResult.adcNew,
      cta:            calcResult.cta,
      recommended_depth_mm:    calcResult.recommendedDepthMm,
      recommended_speed_percent: calcResult.recommendedSpeedPercent,
      field_capacity_percent:    calcResult.fieldCapacityPercent,
      needs_irrigation: calcResult.recommendedDepthMm > 0,
      actual_speed_percent: parseOptionalNumber(actualSpeed),
      actual_depth_mm:      parseOptionalNumber(actualDepth),
      irrigation_start: irrigStart || null,
      irrigation_end:   irrigEnd || null,
      soil_moisture_calculated: calcResult.fieldCapacityPercent,
    }

    try {
      await upsertDailyManagementRecord(payload)
      setSaveMsg('Registro salvo com sucesso!')
      await loadHistory(selectedSeason.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar registro. Verifique os dados e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: '#0093D0' }} />
      </div>
    )
  }

  if (seasons.length === 0) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
        <Sprout size={32} style={{ color: '#0093D0', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Nenhuma safra ativa</h2>
        <p style={{ fontSize: 13, color: '#556677' }}>
          Cadastre uma safra ativa em <strong style={{ color: '#8899aa' }}>Safras</strong> para iniciar o manejo diário.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }} className="flex flex-col gap-5">

      {/* Título */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0' }}>Manejo Diário</h1>
        <p style={{ fontSize: 13, color: '#8899aa', marginTop: 2 }}>Balanço Hídrico FAO-56 Penman-Monteith</p>
      </div>

      {/* Seletor de safra */}
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>Safra</label>
          <div style={{ position: 'relative' }}>
            <select
              value={selectedSeasonId}
              onChange={e => setSelectedSeasonId(e.target.value)}
              style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: 10, fontSize: 14, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none', appearance: 'none', cursor: 'pointer' }}
              onFocus={e => e.target.style.borderColor = '#0093D0'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            >
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.farms.name}{s.pivots ? ` / ${s.pivots.name}` : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#556677', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Resumo da safra */}
        {selectedSeason && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {selectedSeason.crops && (
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: 'rgb(0 147 208 / 0.10)', border: '1px solid rgb(0 147 208 / 0.20)', color: '#0093D0', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Sprout size={10} /> {selectedSeason.crops.name}
              </span>
            )}
            {das !== null && (
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#0d1520', color: '#8899aa' }}>
                DAS {das}
              </span>
            )}
            {das && selectedSeason.crops && (() => {
              const info = getStageInfoForDas(selectedSeason.crops!, das)
              return (
                <>
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#0d1520', color: '#8899aa' }}>
                    Fase {info.stage} — Kc {info.kc.toFixed(3)}
                  </span>
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#0d1520', color: '#8899aa', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FlaskConical size={10} /> f = {info.fFactor.toFixed(2)}
                  </span>
                </>
              )
            })()}
            {selectedSeason.planting_date && (
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#0d1520', color: '#556677', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={10} /> Plantio: {fmtDate(selectedSeason.planting_date)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Grid: formulário + resultado */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Coluna esquerda: formulário */}
        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          <SectionLabel text="Data" />
          <InputField
            label="Data do registro" type="date" value={date}
            onChange={setDate} placeholder={todayISO()}
          />

          <SectionLabel text="Dados Climáticos" />

          {/* Badge de fonte climática */}
          {weatherLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Loader2 size={12} className="animate-spin" style={{ color: '#0093D0' }} />
              <span style={{ fontSize: 11, color: '#556677' }}>Buscando dados climáticos...</span>
            </div>
          )}
          {!weatherLoading && (() => {
            const badge = getClimateSourceBadge(externalData?.climateSource ?? null)
            if (!badge) return null
            const Icon = badge.icon
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: badge.background, border: badge.border }}>
                <Icon size={12} style={{ color: badge.color }} />
                <span style={{ fontSize: 11, color: badge.color }}>{badge.label}</span>
              </div>
            )
          })()}
          {!weatherLoading && externalInfo && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 11, color: '#8899aa' }}>{externalInfo}</span>
            </div>
          )}

          {/* Badge Ra calculado pela latitude */}
          {selectedSeason?.pivots?.latitude && date && (() => {
            const doy = Math.floor((new Date(date + 'T12:00:00').getTime() - new Date(new Date(date).getFullYear(), 0, 0).getTime()) / 86400000)
            const ra = calcRa(selectedSeason.pivots!.latitude!, doy)
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: 'rgb(245 158 11 / 0.06)', border: '1px solid rgb(245 158 11 / 0.15)' }}>
                <Sun size={12} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: 11, color: '#f59e0b' }}>
                  Ra calculado pela latitude — {ra.toFixed(1)} MJ/m²·dia (FAO-56 Eq. 21)
                </span>
              </div>
            )
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <InputField label="Tmax" value={tmax} onChange={setTmax} unit="°C" placeholder="35" />
            <InputField label="Tmin" value={tmin} onChange={setTmin} unit="°C" placeholder="18" />
            <InputField label="UR Média" value={humidity} onChange={setHumidity} unit="%" placeholder="65" />
            <InputField label="Vento" value={wind} onChange={setWind} unit="m/s" placeholder="2.5" />
            <InputField label="Radiação Solar" value={radiation} onChange={setRadiation} unit="W/m²" placeholder="220" />
            <InputField label="Chuva" value={rainfall} onChange={setRainfall} unit="mm" placeholder="0" />
          </div>

          <SectionLabel text="Irrigação Realizada (opcional)" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <InputField label="Velocidade real" value={actualSpeed} onChange={setActualSpeed} unit="%" placeholder="60" />
            <InputField label="Lâmina real" value={actualDepth} onChange={setActualDepth} unit="mm" placeholder="12" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <InputField label="Início" type="time" value={irrigStart} onChange={setIrrigStart} />
            <InputField label="Fim" type="time" value={irrigEnd} onChange={setIrrigEnd} />
          </div>

          {/* ADc anterior */}
          <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>ADc anterior (automático)</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>
              {fmtNum(adcPrev)} mm
              <span style={{ fontSize: 11, fontWeight: 400, color: '#556677', marginLeft: 6 }}>
                {history.length > 0 ? 'do último registro' : 'ADc inicial da safra'}
              </span>
            </p>
          </div>

          {calcResult && (
            <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Rastreabilidade da ETo</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                {fmtNum(calcResult.eto)} mm/dia
                <span style={{ fontSize: 11, fontWeight: 400, color: '#8899aa', marginLeft: 6 }}>
                  via {getEToSourceLabel(calcResult.etoSource)} · confiança {getEToConfidenceLabel(calcResult.etoConfidence as EToConfidence | null)}
                </span>
              </p>
              {calcResult.etoNotes && (
                <p style={{ fontSize: 11, color: '#556677', marginTop: 4 }}>{calcResult.etoNotes}</p>
              )}
            </div>
          )}

          {/* Erros/sucesso */}
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgb(239 68 68 / 0.1)', border: '1px solid rgb(239 68 68 / 0.25)', color: '#ef4444', fontSize: 13 }}>
              {error}
            </div>
          )}
          {saveMsg && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgb(34 197 94 / 0.1)', border: '1px solid rgb(34 197 94 / 0.25)', color: '#22c55e', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} /> {saveMsg}
            </div>
          )}

          {/* Botão Salvar */}
          <button
            onClick={handleSave}
            disabled={saving || !calcResult}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: calcResult ? '#0093D0' : '#0d1520',
              border: 'none', color: calcResult ? '#fff' : '#556677',
              cursor: calcResult ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.7 : 1,
              boxShadow: calcResult ? '0 2px 8px rgb(0 147 208 / 0.25)' : 'none',
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Salvando...' : 'Salvar Registro'}
          </button>
        </div>

        {/* Coluna direita: resultado calculado */}
        <div>
          {calcResult ? (
            <CalcResultCard
              eto={calcResult.eto}
              etc={calcResult.etc}
              kc={calcResult.kc}
              cta={calcResult.cta}
              cad={calcResult.cad}
              adcNew={calcResult.adcNew}
              fieldCapacityPercent={calcResult.fieldCapacityPercent}
              status={calcResult.status as IrrigationStatus}
              recommendedDepthMm={calcResult.recommendedDepthMm}
              recommendedSpeedPercent={calcResult.recommendedSpeedPercent}
              das={calcResult.das}
              cropStage={calcResult.cropStage}
            />
          ) : (
            <div style={{
              height: '100%', minHeight: 300,
              background: '#0f1923', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 16,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, color: '#556677',
            }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <Thermometer size={28} style={{ color: '#556677' }} />
                <Sun size={28} style={{ color: '#556677' }} />
                <CloudRain size={28} style={{ color: '#556677' }} />
                <Wind size={28} style={{ color: '#556677' }} />
              </div>
              <p style={{ fontSize: 13, color: '#556677' }}>Preencha Tmax e Tmin para calcular</p>
              <p style={{ fontSize: 11, color: '#556677' }}>Os demais campos têm valores padrão</p>
            </div>
          )}
        </div>
      </div>

      {/* Projeção 7 dias */}
      {projection.length > 0 && (
        <div>
          <ProjectionForecast days={projection} avgEto={avgEto} />
        </div>
      )}

      {/* Timeline comparativa */}
      {history.length >= 2 && (
        <TimelineChart records={history} />
      )}

      {/* Histórico */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Clock size={13} style={{ color: '#556677' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#556677' }}>
            Histórico — últimos 30 dias
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
          <span style={{ fontSize: 11, color: '#556677' }}>{history.length} registros</span>
        </div>
        <HistoryTable records={history} />
      </div>

    </div>
  )
}

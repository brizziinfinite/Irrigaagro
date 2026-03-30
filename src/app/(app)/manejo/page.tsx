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
  type EToSource,
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

// ─── Input simples ───────────────────────────────────────────

function InputField({ label, value, onChange, unit, placeholder, type = 'number' }: {
  label: string; value: string; onChange: (v: string) => void
  unit?: string; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 4 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={type} step={type === 'number' ? 'any' : undefined}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: unit ? '8px 36px 8px 10px' : '8px 10px',
            borderRadius: 7, fontSize: 13,
            background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)',
            color: '#e2e8f0', outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = '#0093D0'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
        {unit && (
          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#445566', pointerEvents: 'none' }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Barra de umidade ────────────────────────────────────────

function MoistureBar({ pct, cad, cta, color }: { pct: number; cad: number; cta: number; color: string }) {
  const cadPct = cta > 0 ? (cad / cta) * 100 : 50
  return (
    <div>
      <div style={{ height: 10, background: '#080e14', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', left: `${cadPct}%`, top: 0, bottom: 0, width: 2, background: '#f59e0b', opacity: 0.8, zIndex: 2 }} />
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontSize: 9, color: '#334455' }}>0%</span>
        <span style={{ fontSize: 9, color: '#f59e0b' }}>CAD {fmtNum(cadPct, 0)}%</span>
        <span style={{ fontSize: 9, color: '#445566' }}>100%</span>
      </div>
    </div>
  )
}

// ─── Card de status (topo) ───────────────────────────────────

interface StatusBannerProps {
  status: IrrigationStatus
  fieldCapacityPercent: number
  cad: number; cta: number
  das: number; cropStage: number
  recommendedDepthMm: number
  recommendedSpeedPercent: number | null
  alertThresholdPct: number | null
}

function StatusBanner({ status, fieldCapacityPercent, cad, cta, das, cropStage, recommendedDepthMm, recommendedSpeedPercent, alertThresholdPct }: StatusBannerProps) {
  const cfg = STATUS_CONFIG[status]
  const StatusIcon = cfg.icon
  const stageLabels = ['', 'Inicial', 'Desenv.', 'Médio', 'Final']
  // Linha de referência na barra: threshold configurado ou CAD agronomico
  const refPct = alertThresholdPct ?? (cta > 0 ? (cad / cta) * 100 : 50)

  return (
    <div style={{ background: '#0f1923', border: `1px solid ${cfg.border}`, borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Linha superior: status + DAS/fase */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StatusIcon size={18} style={{ color: cfg.color }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: cfg.color, lineHeight: 1.2 }}>{cfg.label}</p>
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{cfg.desc}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>DAS {das}</p>
          <p style={{ fontSize: 11, color: '#556677' }}>Fase {cropStage} · {stageLabels[cropStage] ?? ''}</p>
        </div>
      </div>

      {/* Barra de umidade */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#8899aa' }}>Capacidade de Campo</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: cfg.color, fontFamily: 'var(--font-mono)' }}>{fmtNum(fieldCapacityPercent, 0)}%</span>
        </div>
        {/* Barra customizada com threshold correto */}
        <div>
          <div style={{ height: 10, background: '#080e14', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', left: `${refPct}%`, top: 0, bottom: 0, width: 2, background: '#f59e0b', opacity: 0.8, zIndex: 2 }} />
            <div style={{ width: `${Math.max(0, Math.min(100, fieldCapacityPercent))}%`, height: '100%', background: cfg.color, borderRadius: 99, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontSize: 9, color: '#334455' }}>0%</span>
            <span style={{ fontSize: 9, color: '#f59e0b' }}>
              {alertThresholdPct != null ? `Irrigar em ${alertThresholdPct}%` : `CAD ${fmtNum(refPct, 0)}%`}
            </span>
            <span style={{ fontSize: 9, color: '#445566' }}>100%</span>
          </div>
        </div>
      </div>

      {/* Resultado: NI ou Recomendação */}
      {recommendedDepthMm <= 0 ? (
        <div style={{ background: 'rgb(34 197 94/0.08)', border: '1px solid rgb(34 197 94/0.18)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgb(34 197 94/0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#22c55e' }}>NI</span>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>Não Irrigar</p>
            <p style={{ fontSize: 11, color: '#445566' }}>
              Solo acima do limiar de irrigação
              {alertThresholdPct != null ? ` (${alertThresholdPct}%)` : ''}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Lâmina recomendada</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: cfg.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {fmtNum(recommendedDepthMm)} <span style={{ fontSize: 12, fontWeight: 400, color: '#8899aa' }}>mm</span>
            </p>
          </div>
          {recommendedSpeedPercent !== null && (
            <div>
              <p style={{ fontSize: 10, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Velocidade sugerida</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#0093D0', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                {recommendedSpeedPercent}% <span style={{ fontSize: 12, fontWeight: 400, color: '#8899aa' }}>vel.</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── KPIs ETo / ETc / Kc ────────────────────────────────────

function EtoKpiRow({ eto, etc, kc, etoSource, etoConfidence, etoNotes }: {
  eto: number; etc: number; kc: number
  etoSource: EToSource; etoConfidence: EToConfidence | null; etoNotes: string | null
}) {
  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { icon: Sun,      label: 'ETo',  value: fmtNum(eto),    unit: 'mm/dia', color: '#f59e0b' },
          { icon: Droplets, label: 'ETc',  value: fmtNum(etc),    unit: 'mm/dia', color: '#06b6d4' },
          { icon: Info,     label: 'Kc',   value: fmtNum(kc, 3),  unit: '',       color: '#0093D0' },
        ].map(({ icon: Icon, label, value, unit, color }) => (
          <div key={label} style={{ background: '#0d1520', borderRadius: 9, padding: '10px 12px', textAlign: 'center' }}>
            <Icon size={12} style={{ color, margin: '0 auto 4px' }} />
            <p style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{value}</p>
            <p style={{ fontSize: 10, color: '#556677', marginTop: 2 }}>{label}{unit ? ` (${unit})` : ''}</p>
          </div>
        ))}
      </div>
      {/* Fonte ETo — uma linha discreta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, background: '#0d1520' }}>
        <Satellite size={10} style={{ color: '#445566', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: '#556677' }}>
          ETo via <span style={{ color: '#8899aa' }}>{getEToSourceLabel(etoSource)}</span>
          {' · '}confiança <span style={{ color: '#8899aa' }}>{getEToConfidenceLabel(etoConfidence)}</span>
          {etoNotes && <> · <span style={{ color: '#445566' }}>{etoNotes}</span></>}
        </span>
      </div>
    </div>
  )
}

// ─── Balanço hídrico simplificado ────────────────────────────

function WaterBalanceRow({ adcNew, cad, cta, color }: { adcNew: number; cad: number; cta: number; color: string }) {
  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 20px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#445566', marginBottom: 10 }}>Balanço Hídrico</p>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, color: '#556677', marginBottom: 3 }}>ADc atual</p>
          <p style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{fmtNum(adcNew)} <span style={{ fontSize: 11, color: '#556677' }}>mm</span></p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, color: '#556677', marginBottom: 3 }}>CAD (limite)</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>{fmtNum(cad)} <span style={{ fontSize: 11, color: '#556677' }}>mm</span></p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, color: '#556677', marginBottom: 3 }}>CTA (máx)</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#445566', fontFamily: 'var(--font-mono)' }}>{fmtNum(cta)} <span style={{ fontSize: 11, color: '#445566' }}>mm</span></p>
        </div>
      </div>
    </div>
  )
}

// ─── Projeção 7 dias ─────────────────────────────────────────

function ProjectionForecast({ days, avgEto }: { days: ProjectionDay[]; avgEto: number | null }) {
  if (days.length === 0) return null

  const firstIrrigIdx = days.findIndex(d => d.isIrrigationDay)

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <TrendingDown size={14} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Projeção — próximos 7 dias</span>
        {avgEto !== null && (
          <span style={{ fontSize: 11, color: '#556677', marginLeft: 'auto' }}>
            ETo base: <span style={{ color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>{avgEto.toFixed(1)} mm/d</span>
          </span>
        )}
        <span style={{ fontSize: 10, color: '#445566', padding: '3px 8px', borderRadius: 20, background: '#0d1520' }}>sem chuva prevista</span>
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
              Lâmina necessária: {fmtNum(days[firstIrrigIdx].recommendedDepthMm)} mm
              {days[firstIrrigIdx].recommendedSpeedPercent !== null ? ` · Velocidade: ${days[firstIrrigIdx].recommendedSpeedPercent}%` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Linhas */}
      <div style={{ padding: '14px 20px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {days.map((day, i) => {
          const cfg = STATUS_CONFIG[day.status]
          const StatusIcon = cfg.icon
          const pct = Math.max(0, Math.min(100, day.fieldCapacityPercent))
          const cadPct = day.cta > 0 ? (day.cad / day.cta) * 100 : 0
          const isAlert = day.isIrrigationDay

          return (
            <div key={day.date} style={{
              display: 'grid',
              gridTemplateColumns: '80px 30px 1fr 46px 46px 90px',
              alignItems: 'center', gap: 8,
              padding: isAlert ? '8px 10px' : '5px 10px',
              borderRadius: 9,
              background: isAlert ? cfg.bg : i % 2 ? '#080e14' : 'transparent',
              border: isAlert ? `1px solid ${cfg.border}` : '1px solid transparent',
            }}>
              <span style={{ fontSize: 11, color: isAlert ? cfg.color : '#8899aa', fontWeight: isAlert ? 700 : 400 }}>
                {i === 0 ? 'Amanhã' : fmtDate(day.date)}
              </span>
              <span style={{ fontSize: 10, color: '#445566' }}>D{day.das}</span>
              <div style={{ position: 'relative', height: 12, background: '#080e14', borderRadius: 99, overflow: 'visible' }}>
                <div style={{ position: 'absolute', left: `${cadPct}%`, top: -2, bottom: -2, width: 2, background: '#f59e0b', opacity: 0.6, borderRadius: 1, zIndex: 2 }} />
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: cfg.color, borderRadius: 99, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtNum(day.fieldCapacityPercent, 0)}%</span>
              <span style={{ fontSize: 10, color: '#556677', textAlign: 'right' }}>
                <span style={{ color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{fmtNum(day.etcAvg)}</span> mm
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                <StatusIcon size={10} style={{ color: cfg.color }} />
                <span style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '8px 20px 10px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 2, height: 10, background: '#f59e0b', opacity: 0.7 }} />
          <span style={{ fontSize: 10, color: '#445566' }}>Limite CAD</span>
        </div>
        <span style={{ fontSize: 10, color: '#445566' }}>· Projeção sem chuva (conservadora)</span>
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

  const data: TimelinePoint[] = [...records].reverse().map(r => ({
    date: r.date,
    eto: r.eto_mm ?? null,
    etc: r.etc_mm ?? null,
    rainfall: r.rainfall_mm ?? null,
    fieldCapacityPercent: r.field_capacity_percent ?? null,
  }))

  const W = 800; const H = 200
  const PAD = { top: 14, right: 30, bottom: 34, left: 40 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const maxEto = Math.max(...data.map(d => d.eto ?? 0).filter(v => v > 0), 8)
  const maxRain = Math.max(...data.map(d => d.rainfall ?? 0).filter(v => v > 0), 1)

  function xPos(i: number) { return PAD.left + (i / Math.max(data.length - 1, 1)) * innerW }
  function yLeft(val: number) { return PAD.top + innerH - (val / maxEto) * innerH }
  function yRight(val: number) { return PAD.top + innerH - (val / 100) * innerH }

  function makePath(getter: (d: TimelinePoint) => number | null, yFn: (v: number) => number) {
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

  const pathEto = makePath(d => d.eto, yLeft)
  const pathEtc = makePath(d => d.etc, yLeft)
  const pathAdc = makePath(d => d.fieldCapacityPercent, yRight)

  const tickStep = Math.ceil(data.length / 6)
  const xTicks = data.map((d, i) => ({ i, label: fmtDate(d.date) })).filter((_, i) => i % tickStep === 0 || i === data.length - 1)
  const yTicksLeft = [0, maxEto * 0.5, maxEto].map(v => ({ v, y: yLeft(v), label: v.toFixed(1) }))
  const yTicksRight = [0, 50, 100].map(v => ({ v, y: yRight(v), label: `${v}%` }))

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <BarChart2 size={14} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Timeline — Histórico Comparativo</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { color: '#f59e0b', label: 'ETo', dash: false },
            { color: '#06b6d4', label: 'ETc', dash: false },
            { color: '#0093D0', label: 'ADc%', dash: true },
          ].map(({ color, label, dash }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8899aa' }}>
              <svg width="18" height="4">
                <line x1="0" y1="2" x2="18" y2="2" stroke={color} strokeWidth="2" strokeDasharray={dash ? '4 2' : undefined} />
              </svg>{label}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8899aa' }}>
            <div style={{ width: 8, height: 12, background: 'rgb(6 182 212/0.4)', borderRadius: 2 }} />Chuva
          </span>
        </div>
      </div>

      <div style={{ padding: '6px 0 2px', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', minWidth: 300 }}>
          {yTicksLeft.map(({ v, y }) => (
            <line key={v} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          ))}
          <line x1={PAD.left} y1={yRight(50)} x2={W - PAD.right} y2={yRight(50)} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" opacity="0.35" />
          {data.map((d, i) => {
            if (!d.rainfall || d.rainfall <= 0) return null
            const barW = Math.max(4, innerW / data.length * 0.6)
            const barH = (d.rainfall / Math.max(maxRain, 1)) * innerH * 0.35
            return <rect key={i} x={xPos(i) - barW / 2} y={PAD.top + innerH - barH} width={barW} height={barH} fill="rgb(6 182 212/0.35)" stroke="rgb(6 182 212/0.5)" strokeWidth="1" rx="2" />
          })}
          {pathEto && <path d={pathEto} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />}
          {pathEtc && <path d={pathEtc} fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinejoin="round" />}
          {pathAdc && <path d={pathAdc} fill="none" stroke="#0093D0" strokeWidth="2" strokeDasharray="5 3" strokeLinejoin="round" />}
          {data.map((d, i) => {
            if (d.fieldCapacityPercent === null) return null
            const pct = d.fieldCapacityPercent
            const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
            return <circle key={i} cx={xPos(i)} cy={yRight(pct)} r="3" fill={color} stroke="#0f1923" strokeWidth="1.5" />
          })}
          {yTicksLeft.map(({ v, y, label }) => <text key={v} x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize="9" fill="#445566">{label}</text>)}
          {yTicksRight.map(({ v, y, label }) => <text key={v} x={W - PAD.right + 5} y={y + 4} textAnchor="start" fontSize="9" fill="#445566">{label}</text>)}
          {xTicks.map(({ i, label }) => <text key={i} x={xPos(i)} y={H - 5} textAnchor="middle" fontSize="9" fill="#445566">{label}</text>)}
          <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        </svg>
      </div>

      <div style={{ padding: '6px 20px 10px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#445566' }}>Linha tracejada âmbar = limite CAD</span>
        <span style={{ fontSize: 10, color: '#445566' }}>
          Pontos: <span style={{ color: '#22c55e' }}>verde ≥80%</span> · <span style={{ color: '#f59e0b' }}>âmbar ≥50%</span> · <span style={{ color: '#ef4444' }}>vermelho &lt;50%</span>
        </span>
      </div>
    </div>
  )
}

// ─── Tabela histórico ─────────────────────────────────────────

function HistoryTable({ records }: { records: DailyManagement[] }) {
  if (records.length === 0) {
    return (
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '28px 24px', textAlign: 'center' }}>
        <Calendar size={22} style={{ color: '#445566', margin: '0 auto 8px' }} />
        <p style={{ fontSize: 13, color: '#445566' }}>Nenhum registro ainda.</p>
      </div>
    )
  }

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '88px 38px 54px 54px 60px 54px 52px 54px 80px', gap: 4, padding: '9px 16px', background: '#0d1520', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['Data', 'DAS', 'ETo', 'ETc', 'Kc', 'Chuva', 'ADc', 'CC%', 'Status'].map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#445566', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>
      {records.map((r, i) => {
        const pct = r.field_capacity_percent ?? 100
        const status = pct >= 80 ? 'verde' : pct >= 50 ? 'amarelo' : 'vermelho'
        const cfg = STATUS_CONFIG[status as IrrigationStatus]
        const StatusIcon = cfg.icon
        return (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '88px 38px 54px 54px 60px 54px 52px 54px 80px', gap: 4, padding: '9px 16px', borderBottom: i < records.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 ? '#080e14' : 'transparent' }}>
            <span style={{ fontSize: 12, color: '#8899aa' }}>{fmtDate(r.date)}</span>
            <span style={{ fontSize: 12, color: '#445566' }}>{r.das ?? '—'}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.eto_mm)}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.etc_mm)}</span>
            <span style={{ fontSize: 12, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.kc, 3)}</span>
            <span style={{ fontSize: 12, color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.rainfall_mm)}</span>
            <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.ctda)}</span>
            <span style={{ fontSize: 12, color: cfg.color, fontFamily: 'var(--font-mono)' }}>{fmtNum(pct, 0)}%</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <StatusIcon size={10} style={{ color: cfg.color }} />
              <span style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
            </div>
          </div>
        )
      })}
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

  const [date, setDate]           = useState(todayISO())
  const [tmax, setTmax]           = useState('')
  const [tmin, setTmin]           = useState('')
  const [humidity, setHumidity]   = useState('')
  const [wind, setWind]           = useState('')
  const [radiation, setRadiation] = useState('')
  const [rainfall, setRainfall]   = useState('')
  const [actualSpeed, setActualSpeed] = useState('')
  const [actualDepth, setActualDepth] = useState('')
  const [irrigStart, setIrrigStart]   = useState('')
  const [irrigEnd, setIrrigEnd]       = useState('')

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

  const selectedSeason = useMemo(
    () => seasons.find(s => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId]
  )

  // ─── Busca automática de clima ──────────────────────────────
  useEffect(() => {
    if (!selectedSeason || !date) { setExternalData(null); return }
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
  }, [selectedSeason, date])

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
    if (!calcResult || !selectedSeason?.crops || !das || !date) { setProjection([]); setAvgEto(null); return }
    const recentWithEto = history.filter(r => r.eto_mm != null).slice(0, 7)
    const baseEto = recentWithEto.length >= 3
      ? recentWithEto.reduce((s, r) => s + (r.eto_mm ?? 0), 0) / recentWithEto.length
      : calcResult.eto
    setAvgEto(baseEto)
    setProjection(calcProjection({
      crop: selectedSeason.crops!,
      startDate: date, startDas: das,
      startAdc: calcResult.adcNew,
      fieldCapacity: Number(selectedSeason.field_capacity ?? 32),
      wiltingPoint: Number(selectedSeason.wilting_point ?? 14),
      bulkDensity: Number(selectedSeason.bulk_density ?? 1.4),
      avgEto: baseEto,
      pivot: selectedSeason.pivots ?? null,
      days: 7,
    }))
  }, [calcResult, selectedSeason, das, date, history])

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
      // Chuva só de entrada manual ou rainfall_records — nunca de Open-Meteo
      rainfall_mm: parseOptionalNumber(rainfall) ?? externalData?.rainfall?.rainfall_mm ?? 0,
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
      setSaveMsg('Registro salvo com sucesso!')
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
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

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
                Fase {info.stage} · Kc {info.kc.toFixed(3)}
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

      {/* ── Status do dia (resultado) — PRIMEIRO, destaque total ── */}
      {calcResult && (
        <StatusBanner
          status={calcResult.status as IrrigationStatus}
          fieldCapacityPercent={calcResult.fieldCapacityPercent}
          cad={calcResult.cad} cta={calcResult.cta}
          das={calcResult.das} cropStage={calcResult.cropStage}
          recommendedDepthMm={calcResult.recommendedDepthMm}
          recommendedSpeedPercent={calcResult.recommendedSpeedPercent}
          alertThresholdPct={selectedSeason?.pivots?.alert_threshold_percent ?? null}
        />
      )}

      {/* ── ETo / ETc / Kc ── */}
      {calcResult && (
        <EtoKpiRow
          eto={calcResult.eto} etc={calcResult.etc} kc={calcResult.kc}
          etoSource={calcResult.etoSource as EToSource} etoConfidence={calcResult.etoConfidence as EToConfidence | null}
          etoNotes={calcResult.etoNotes}
        />
      )}

      {/* ── Balanço hídrico ── */}
      {calcResult && (
        <WaterBalanceRow
          adcNew={calcResult.adcNew} cad={calcResult.cad} cta={calcResult.cta}
          color={STATUS_CONFIG[calcResult.status as IrrigationStatus].color}
        />
      )}

      {/* ── Formulário de entrada ── */}
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Fonte climática + data — linha única */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Dados Climáticos</label>
            {weatherLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 7, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Loader2 size={11} className="animate-spin" style={{ color: '#0093D0' }} />
                <span style={{ fontSize: 11, color: '#445566' }}>Buscando dados climáticos...</span>
              </div>
            )}
            {!weatherLoading && climateInfo && (() => {
              const Icon = climateInfo.icon
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 7, background: climateInfo.bg, border: climateInfo.border }}>
                  <Icon size={11} style={{ color: climateInfo.color }} />
                  <span style={{ fontSize: 11, color: climateInfo.color }}>{climateInfo.label}</span>
                </div>
              )
            })()}
            {!weatherLoading && !climateInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 7, background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Thermometer size={11} style={{ color: '#445566' }} />
                <span style={{ fontSize: 11, color: '#445566' }}>Preencha os dados manualmente</span>
              </div>
            )}
          </div>
          <InputField label="Data do registro" type="date" value={date} onChange={setDate} />
        </div>

        {/* Campos climáticos — grid 3 colunas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <InputField label="Tmax" value={tmax} onChange={setTmax} unit="°C" placeholder="35" />
          <InputField label="Tmin" value={tmin} onChange={setTmin} unit="°C" placeholder="18" />
          <InputField label="UR Média" value={humidity} onChange={setHumidity} unit="%" placeholder="65" />
          <InputField label="Vento" value={wind} onChange={setWind} unit="m/s" placeholder="2.5" />
          <InputField label="Radiação Solar" value={radiation} onChange={setRadiation} unit="W/m²" placeholder="220" />
          <InputField label="Chuva (registrar em Precipitações)" value={rainfall} onChange={setRainfall} unit="mm" placeholder="0" />
        </div>

        {/* ADc anterior — compacto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#0d1520', border: '1px solid rgba(255,255,255,0.05)' }}>
          <Droplets size={13} style={{ color: '#0093D0', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#445566' }}>ADc anterior:</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>{fmtNum(adcPrev)} mm</span>
          <span style={{ fontSize: 11, color: '#334455', marginLeft: 2 }}>{history.length > 0 ? '(último registro)' : '(ADc inicial da safra)'}</span>
        </div>

        {/* Irrigação realizada */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Irrigação Realizada <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <InputField label="Velocidade real" value={actualSpeed} onChange={setActualSpeed} unit="%" placeholder="60" />
            <InputField label="Lâmina real" value={actualDepth} onChange={setActualDepth} unit="mm" placeholder="12" />
            <InputField label="Início" type="time" value={irrigStart} onChange={setIrrigStart} />
            <InputField label="Fim" type="time" value={irrigEnd} onChange={setIrrigEnd} />
          </div>
        </div>

        {/* Erros / sucesso */}
        {error && (
          <div style={{ padding: '9px 13px', borderRadius: 8, background: 'rgb(239 68 68/0.1)', border: '1px solid rgb(239 68 68/0.25)', color: '#ef4444', fontSize: 12 }}>
            {error}
          </div>
        )}
        {saveMsg && (
          <div style={{ padding: '9px 13px', borderRadius: 8, background: 'rgb(34 197 94/0.1)', border: '1px solid rgb(34 197 94/0.25)', color: '#22c55e', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={13} /> {saveMsg}
          </div>
        )}

        {/* Botão salvar */}
        <button onClick={handleSave} disabled={saving || !calcResult}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '11px 0', borderRadius: 9, fontSize: 14, fontWeight: 700,
            background: calcResult ? '#0093D0' : '#0d1520',
            border: 'none', color: calcResult ? '#fff' : '#445566',
            cursor: calcResult ? 'pointer' : 'not-allowed',
            opacity: saving ? 0.7 : 1,
            boxShadow: calcResult ? '0 2px 10px rgb(0 147 208/0.25)' : 'none',
          }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Salvando...' : 'Salvar Registro'}
        </button>
      </div>

      {/* ── Placeholder quando sem dados climáticos ── */}
      {!calcResult && !loading && (
        <div style={{ background: '#0f1923', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 14, padding: '32px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 14, marginBottom: 4, opacity: 0.4 }}>
            <Thermometer size={26} style={{ color: '#556677' }} />
            <Sun size={26} style={{ color: '#556677' }} />
            <CloudRain size={26} style={{ color: '#556677' }} />
            <Wind size={26} style={{ color: '#556677' }} />
          </div>
          <p style={{ fontSize: 13, color: '#556677' }}>Preencha Tmax e Tmin para calcular</p>
          <p style={{ fontSize: 11, color: '#334455' }}>Os demais campos têm valores padrão</p>
        </div>
      )}

      {/* ── Projeção 7 dias ── */}
      {projection.length > 0 && <ProjectionForecast days={projection} avgEto={avgEto} />}

      {/* ── Timeline ── */}
      {history.length >= 2 && <TimelineChart records={history} />}

      {/* ── Histórico tabela ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Clock size={12} style={{ color: '#445566' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#445566' }}>Histórico — últimos 30 dias</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
          <span style={{ fontSize: 11, color: '#445566' }}>{history.length} registros</span>
        </div>
        <HistoryTable records={history} />
      </div>

    </div>
  )
}

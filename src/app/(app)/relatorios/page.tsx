'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import type { Season, Crop, Pivot, DailyManagement, EnergyBill } from '@/types/database'
import { getStageInfoForDas, calcCTA, calcCAD } from '@/lib/water-balance'
import {
  Loader2, ChevronDown, BarChart2, Droplets, Sun, CloudRain,
  Sprout, Calendar, TrendingDown, AlertTriangle, CheckCircle2,
  Download, Zap, Leaf, Upload, Bolt,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────

function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return n.toFixed(decimals)
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtDateLong(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── Tipos ───────────────────────────────────────────────────

interface SeasonFull extends Season {
  crops: Crop | null
  pivots: Pivot | null
  farms: { id: string; name: string }
}

// KPIs calculados de toda a safra
interface SeasonKPIs {
  totalDays: number
  totalIrrigationMm: number
  totalRainfallMm: number
  totalEtcMm: number
  totalEtoMm: number
  irrigationEvents: number
  stressIndex: number          // % de dias abaixo do CAD
  stressDays: number
  minFieldCapacity: number
  avgFieldCapacity: number
  // por fase
  byStage: StageStats[]
  // consumo por período
  last7: { consumption: number; irrigation: number; rainfall: number }
  last10: { consumption: number; irrigation: number; rainfall: number }
  last15: { consumption: number; irrigation: number; rainfall: number }
  // eventos comparativos
  irrigationComparison: IrrigComparison[]
}

interface StageStats {
  stage: number
  label: string
  days: number
  irrigationMm: number
  rainfallMm: number
  etcMm: number
  etpMm: number   // ETc sem estresse (ETp = ETo × Kc)
  stressIndex: number
}

interface IrrigComparison {
  date: string
  recommended: number
  applied: number | null
  delta: number | null
}

// ─── Cálculo dos KPIs ─────────────────────────────────────────

function calcKPIs(records: DailyManagement[], season: SeasonFull): SeasonKPIs {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const n = sorted.length
  if (n === 0) return emptyKPIs()

  let totalIrrig = 0, totalRain = 0, totalEtc = 0, totalEto = 0
  let stressDays = 0, irrigEvents = 0
  let minCC = 100, sumCC = 0, ccCount = 0
  const byStageMap: Record<number, StageStats> = {}
  const stageLabels = ['', 'Inicial', 'Desenvolvimento', 'Médio', 'Final']

  for (const r of sorted) {
    const irrig = r.actual_depth_mm ?? 0
    const rain = r.rainfall_mm ?? 0
    const etc = r.etc_mm ?? 0
    const eto = r.eto_mm ?? 0
    const cc = r.field_capacity_percent ?? null
    const stage = r.crop_stage ?? 1

    totalIrrig += irrig
    totalRain += rain
    totalEtc += etc
    totalEto += eto
    if (irrig > 0) irrigEvents++

    // Calcular CAD para este registro
    let cadPct = 50 // fallback
    if (season.crops && r.das) {
      const info = getStageInfoForDas(season.crops, r.das)
      const cta = calcCTA(
        Number(season.pivots?.field_capacity ?? season.field_capacity ?? 32),
        Number(season.pivots?.wilting_point ?? season.wilting_point ?? 14),
        Number(season.pivots?.bulk_density ?? season.bulk_density ?? 1.4),
        info.rootDepthCm
      )
      const cad = calcCAD(cta, info.fFactor)
      cadPct = cta > 0 ? (cad / cta) * 100 : 50
    }

    if (cc !== null && cc < cadPct) stressDays++

    if (cc !== null) {
      if (cc < minCC) minCC = cc
      sumCC += cc
      ccCount++
    }

    // Por fase
    if (!byStageMap[stage]) {
      byStageMap[stage] = { stage, label: stageLabels[stage] ?? `Fase ${stage}`, days: 0, irrigationMm: 0, rainfallMm: 0, etcMm: 0, etpMm: 0, stressIndex: 0 }
    }
    const s = byStageMap[stage]
    s.days++
    s.irrigationMm += irrig
    s.rainfallMm += rain
    s.etcMm += etc
    s.etpMm += eto * (r.kc ?? 1) // ETp = ETo × Kc (sem estresse)
    if (cc !== null && cc < 50) s.stressIndex++
  }

  // Finalizar índice de stress por fase
  for (const s of Object.values(byStageMap)) {
    s.stressIndex = s.days > 0 ? (s.stressIndex / s.days) * 100 : 0
  }

  // Consumo por período (últimos N dias)
  function periodStats(days: number) {
    const slice = sorted.slice(-days)
    return {
      consumption: slice.reduce((s, r) => s + (r.etc_mm ?? 0), 0),
      irrigation:  slice.reduce((s, r) => s + (r.actual_depth_mm ?? 0), 0),
      rainfall:    slice.reduce((s, r) => s + (r.rainfall_mm ?? 0), 0),
    }
  }

  // Comparativo irrigação recomendada vs aplicada (eventos com recomendação > 0)
  const irrigComparison: IrrigComparison[] = sorted
    .filter(r => (r.recommended_depth_mm ?? 0) > 0 || (r.actual_depth_mm ?? 0) > 0)
    .map(r => ({
      date: r.date,
      recommended: r.recommended_depth_mm ?? 0,
      applied: r.actual_depth_mm ?? null,
      delta: r.actual_depth_mm !== null && r.actual_depth_mm !== undefined
        ? r.actual_depth_mm - (r.recommended_depth_mm ?? 0)
        : null,
    }))

  return {
    totalDays: n,
    totalIrrigationMm: totalIrrig,
    totalRainfallMm: totalRain,
    totalEtcMm: totalEtc,
    totalEtoMm: totalEto,
    irrigationEvents: irrigEvents,
    stressIndex: n > 0 ? (stressDays / n) * 100 : 0,
    stressDays,
    minFieldCapacity: ccCount > 0 ? minCC : 0,
    avgFieldCapacity: ccCount > 0 ? sumCC / ccCount : 0,
    byStage: Object.values(byStageMap).sort((a, b) => a.stage - b.stage),
    last7: periodStats(7),
    last10: periodStats(10),
    last15: periodStats(15),
    irrigationComparison: irrigComparison,
  }
}

function emptyKPIs(): SeasonKPIs {
  const empty = { consumption: 0, irrigation: 0, rainfall: 0 }
  return {
    totalDays: 0, totalIrrigationMm: 0, totalRainfallMm: 0,
    totalEtcMm: 0, totalEtoMm: 0, irrigationEvents: 0,
    stressIndex: 0, stressDays: 0, minFieldCapacity: 0, avgFieldCapacity: 0,
    byStage: [], last7: empty, last10: empty, last15: empty,
    irrigationComparison: [],
  }
}

// ─── Interpretação & Score ─────────────────────────────────

function calcSeasonScore(kpis: SeasonKPIs): number {
  if (kpis.totalDays === 0) return 0
  const stressScore = Math.max(0, 100 - kpis.stressIndex * 4)
  const totalWater = kpis.totalIrrigationMm + kpis.totalRainfallMm
  const effRaw = totalWater > 0 ? (kpis.totalEtcMm / totalWater) * 100 : 50
  const effScore = Math.min(100, Math.max(0, effRaw))
  const ccRaw = kpis.avgFieldCapacity
  const ccScore = ccRaw >= 80 ? 100 : ccRaw >= 60 ? 80 : ccRaw >= 40 ? 50 : 20
  return Math.round(stressScore * 0.4 + effScore * 0.3 + ccScore * 0.3)
}

function getSeasonStatusFromScore(score: number): { label: string; color: string; bg: string } {
  if (score >= 75) return { label: 'Excelente', color: '#22c55e', bg: 'rgba(34,197,94,0.10)' }
  if (score >= 55) return { label: 'Bom', color: '#0093D0', bg: 'rgba(0,147,208,0.10)' }
  if (score >= 35) return { label: 'Atenção', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' }
  return { label: 'Crítico', color: '#ef4444', bg: 'rgba(239,68,68,0.10)' }
}

function getStressInterpretation(kpis: SeasonKPIs): string {
  if (kpis.totalDays === 0) return ''
  if (kpis.stressIndex < 5) return `Excelente controle hídrico: apenas ${kpis.stressDays} dia(s) abaixo do CAD — cultura sem limitação de água.`
  if (kpis.stressIndex < 10) return `Manejo adequado com ${kpis.stressDays} dia(s) em estresse (${fmtNum(kpis.stressIndex)}%) — impacto produtivo mínimo esperado.`
  if (kpis.stressIndex < 20) return `${kpis.stressDays} dia(s) em estresse hídrico (${fmtNum(kpis.stressIndex)}%): risco moderado de perda de produtividade — ajuste intervalos de irrigação.`
  return `${kpis.stressDays} dia(s) em estresse severo (${fmtNum(kpis.stressIndex)}%) — impacto significativo na produtividade provável. Revisar frequência e lâmina.`
}

function getEfficiencyInterpretation(kpis: SeasonKPIs): string {
  const totalWater = kpis.totalIrrigationMm + kpis.totalRainfallMm
  if (totalWater === 0) return ''
  const eff = (kpis.totalEtcMm / totalWater) * 100
  const rainContrib = kpis.totalEtcMm > 0 ? (kpis.totalRainfallMm / kpis.totalEtcMm) * 100 : 0
  if (eff >= 80) return `Alta eficiência: ${fmtNum(eff, 0)}% da água aplicada foi consumida pela cultura. Chuva contribuiu ${fmtNum(rainContrib, 0)}% do ETc.`
  if (eff >= 60) return `Eficiência adequada (${fmtNum(eff, 0)}%): há margem para reduzir perdas. Chuva cobriu ${fmtNum(rainContrib, 0)}% do ETc.`
  if (eff >= 40) return `Eficiência baixa (${fmtNum(eff, 0)}%): excesso de água aplicada ou perdas por percolação. Revise os turnos de rega.`
  return `Eficiência muito baixa (${fmtNum(eff, 0)}%): possivelmente lâminas excessivas ou descompasso entre irrigação e demanda.`
}

function getSeasonRecommendation(kpis: SeasonKPIs): string {
  if (kpis.totalDays === 0) return ''
  const totalWater = kpis.totalIrrigationMm + kpis.totalRainfallMm
  const eff = totalWater > 0 ? (kpis.totalEtcMm / totalWater) * 100 : 50
  if (kpis.stressIndex >= 20 && eff < 60) return 'Aumentar frequência de irrigação e reduzir lâmina por evento para melhorar eficiência e eliminar estresse.'
  if (kpis.stressIndex >= 20) return 'Aumentar frequência de irrigação — a cultura está sofrendo restrição hídrica recorrente.'
  if (eff < 40) return 'Reduzir lâmina por evento: a cultura está recebendo mais água do que consegue consumir.'
  if (kpis.stressIndex < 5 && eff >= 70) return 'Manejo otimizado — manter a estratégia atual de irrigação.'
  if (kpis.avgFieldCapacity > 90) return 'CC% consistentemente alto — verificar se há excesso de irrigação ou subdimensionamento do CAD.'
  return 'Monitorar o CC% diário e ajustar lâminas conforme a fase fenológica.'
}

function getEnergyInterpretation(bills: EnergyBill[]): string {
  if (bills.length === 0) return ''
  const sorted = [...bills].sort((a, b) => b.reference_month.localeCompare(a.reference_month))
  const latest = sorted[0]
  const reactivePct = latest.reactive_percent ?? null
  const costMmHa = latest.cost_per_mm_ha ?? null
  const reservedPct = latest.reserved_percent ?? null

  const parts: string[] = []
  if (reactivePct !== null) {
    if (reactivePct <= 2) parts.push(`energia reativa dentro da meta (${fmtNum(reactivePct)}%)`)
    else parts.push(`energia reativa elevada em ${fmtNum(reactivePct)}% — acima dos 2% recomendados, gerando cobrança adicional`)
  }
  if (costMmHa !== null) {
    if (costMmHa <= 1.5) parts.push(`custo R$${fmtNum(costMmHa, 2)}/mm/ha abaixo da meta de R$1,50`)
    else parts.push(`custo de R$${fmtNum(costMmHa, 2)}/mm/ha acima da referência de R$1,50`)
  }
  if (reservedPct !== null) {
    if (reservedPct < 30) parts.push(`apenas ${fmtNum(reservedPct)}% no horário reservado — aumentar irrigação noturna para reduzir custos`)
  }
  if (parts.length === 0) return `Conta de ${latest.reference_month} analisada — sem alertas críticos.`
  return `${latest.reference_month}: ${parts.join('; ')}.`
}

// ─── Sub-componentes ──────────────────────────────────────────

function KpiCard({ label, value, unit, color = '#e2e8f0', icon: Icon, sub, description }: {
  label: string; value: string; unit?: string; color?: string
  icon?: typeof Droplets; sub?: string; description?: string
}) {
  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '16px 18px' }}>
      {Icon && <Icon size={14} style={{ color, marginBottom: 8 }} />}
      <p style={{ fontSize: 28, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1, letterSpacing: '-0.025em' }}>
        {value} <span style={{ fontSize: 13, fontWeight: 400, color: '#778899' }}>{unit}</span>
      </p>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: '#778899', marginTop: 2 }}>{sub}</p>}
      {description && <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 5, lineHeight: 1.625 }}>{description}</p>}
    </div>
  )
}

function StressGauge({ value }: { value: number }) {
  // Verde < 10%, Amarelo 10-20%, Vermelho > 20%
  const color = value < 10 ? '#22c55e' : value < 20 ? '#f59e0b' : '#ef4444'
  const label = value < 10 ? 'Ótimo' : value < 20 ? 'Moderado' : 'Alto'
  const refMax = 12 // valor máximo recomendado pelos reports

  return (
    <div style={{ background: '#0f1923', border: `1px solid ${color}30`, borderRadius: 14, padding: '16px 18px', flex: 1, minWidth: 200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <AlertTriangle size={14} style={{ color }} />
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Índice de Stress Hídrico</span>
      </div>
      <p style={{ fontSize: 24, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {fmtNum(value)}%
      </p>
      <p style={{ fontSize: 10, color, marginTop: 4, fontWeight: 600 }}>{label}</p>

      {/* Barra */}
      <div style={{ marginTop: 10, height: 6, background: '#0d1520', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
        {/* Linha de referência 10-12% */}
        <div style={{ position: 'absolute', left: `${(refMax / 40) * 100}%`, top: 0, bottom: 0, width: 2, background: '#f59e0b', opacity: 0.6 }} />
        <div style={{ width: `${Math.min(100, (value / 40) * 100)}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <p style={{ fontSize: 9, color: '#778899', marginTop: 3 }}>Ref: máx. 10–12%</p>
    </div>
  )
}

function GaugeCard({ title, value, unit, color, desc }: {
  title: string; value: number | null; unit: string; color: string; desc: string;
}) {
  if (value === null) return null
  const percent = Math.min(100, Math.max(0, value))
  return (
    <div style={{ background: '#0f1923', border: `1px solid ${color}30`, borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', flex: 1, minWidth: 200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{title}</span>
      </div>
      <p style={{ fontSize: 24, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {fmtNum(value, 1)}{unit}
      </p>
      
      {/* Barra */}
      <div style={{ marginTop: 22, height: 6, background: '#0d1520', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <p style={{ fontSize: 9, color: '#778899', marginTop: 6, lineHeight: 1.4 }}>{desc}</p>
    </div>
  )
}

function HealthGauges({ kpis }: { kpis: SeasonKPIs }) {
  const etaEtoRaw = kpis.totalEtoMm > 0 ? (kpis.totalEtcMm / kpis.totalEtoMm) * 100 : null
  const chuvEfRaw = kpis.totalRainfallMm > 0 ? (Math.min(kpis.totalEtcMm, kpis.totalRainfallMm) / kpis.totalRainfallMm) * 100 : null

  return (
    <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
      <StressGauge value={kpis.stressIndex} />
      <GaugeCard 
        title="ETA / ETO Ratio" 
        value={etaEtoRaw} unit="%" color={etaEtoRaw && etaEtoRaw >= 80 ? '#22c55e' : (etaEtoRaw && etaEtoRaw > 50 ? '#f59e0b' : '#ef4444')} 
        desc={etaEtoRaw && etaEtoRaw >= 80 ? 'Saúde transpiratória excelente' : 'Atenção ao déficit (etaEto baixo indica estresse severo).'} 
      />
      <GaugeCard 
        title="Índice Efetivo de Chuva" 
        value={chuvEfRaw} unit="%" color={chuvEfRaw && chuvEfRaw >= 60 ? '#0093D0' : '#8899aa'} 
        desc="Fração da chuva que pôde ser convertida em transpiração pela cultura." 
      />
    </div>
  )
}

function PeriodTable({ last7, last10, last15 }: { last7: SeasonKPIs['last7']; last10: SeasonKPIs['last10']; last15: SeasonKPIs['last15'] }) {
  const rows = [
    { label: '7 dias', ...last7 },
    { label: '10 dias', ...last10 },
    { label: '15 dias', ...last15 },
  ]
  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Consumo por Período (Últimos)</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr', gap: 0, minWidth: 280 }}>
        {/* Header */}
        {['', 'ETc (mm)', 'Irrig. (mm)', 'Chuva (mm)'].map((h, i) => (
          <div key={i} style={{ padding: '8px 14px', background: '#0d1520', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#778899', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          </div>
        ))}
        {rows.map((r, i) => (
          <React.Fragment key={r.label}>
            <div style={{ padding: '10px 14px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 ? '#080e14' : 'transparent' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#8899aa' }}>{r.label}</span>
            </div>
            <div style={{ padding: '10px 14px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 ? '#080e14' : 'transparent' }}>
              <span style={{ fontSize: 13, color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.consumption)}</span>
            </div>
            <div style={{ padding: '10px 14px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 ? '#080e14' : 'transparent' }}>
              <span style={{ fontSize: 13, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.irrigation)}</span>
            </div>
            <div style={{ padding: '10px 14px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 ? '#080e14' : 'transparent' }}>
              <span style={{ fontSize: 13, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{fmtNum(r.rainfall)}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
      </div>
    </div>
  )
}

function StageTable({ stages }: { stages: StageStats[] }) {
  if (stages.length === 0) return null
  const stageColors = ['', '#06b6d4', '#0093D0', '#f59e0b', '#ec4899']

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Leaf size={13} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Histórico por Fase Fenológica</span>
        <span style={{ fontSize: 10, color: '#778899', marginLeft: 'auto' }}>como Irriger</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0d1520' }}>
              {['Fase', 'Dias', 'Irrigação (mm)', 'Precipitação (mm)', 'ETc (mm)', 'ETp (mm)', 'Stress (%)'].map(h => (
                <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, color: '#778899', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stages.map((s, i) => {
              const stressColor = s.stressIndex < 10 ? '#22c55e' : s.stressIndex < 20 ? '#f59e0b' : '#ef4444'
              return (
                <tr key={s.stage} style={{ background: i % 2 ? '#080e14' : 'transparent', borderBottom: i < stages.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: stageColors[s.stage] ?? '#e2e8f0' }}>
                      Fase {s.stage} — {s.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#8899aa', fontFamily: 'var(--font-mono)' }}>{s.days}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#0093D0', fontFamily: 'var(--font-mono)' }}>{fmtNum(s.irrigationMm)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{fmtNum(s.rainfallMm)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{fmtNum(s.etcMm)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#8899aa', fontFamily: 'var(--font-mono)' }}>{fmtNum(s.etpMm)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: stressColor, fontFamily: 'var(--font-mono)' }}>
                      {fmtNum(s.stressIndex)}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WeeklySummaryTable({ records }: { records: DailyManagement[] }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  if (records.length === 0) return null

  // Sort and group by Week (each week is 7 days from the start)
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const startDate = new Date(sorted[0].date)
  
  const weeks: { weekNum: number; startDate: string; endDate: string; records: DailyManagement[]; eto: number; etc: number; rain: number; irrig: number; days: number }[] = []
  
  for (const r of sorted) {
    const d = new Date(r.date)
    const diffTime = Math.abs(d.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const weekNum = Math.floor(diffDays / 7) + 1
    
    let w = weeks.find(x => x.weekNum === weekNum)
    if (!w) {
      w = { weekNum, startDate: r.date, endDate: r.date, records: [], eto: 0, etc: 0, rain: 0, irrig: 0, days: 0 }
      weeks.push(w)
    }
    w.endDate = r.date // mantem a data mais nova devido ao sort cronológico
    w.records.push(r)
    w.eto += r.eto_mm ?? 0
    w.etc += r.etc_mm ?? 0
    w.rain += r.rainfall_mm ?? 0
    w.irrig += r.actual_depth_mm ?? 0
    w.days++
  }

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Calendar size={13} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Consumo Hídrico — Resumo Semanal</span>
        <span style={{ fontSize: 10, color: '#778899', marginLeft: 'auto' }}>clique na semana para expandir detahles dia a dia</span>
      </div>

      {weeks.map((w, i) => {
        const isExp = expanded === w.weekNum
        return (
          <div key={w.weekNum}>
            {/* Cabecalho da semana */}
            <div 
              onClick={() => setExpanded(isExp ? null : w.weekNum)}
              style={{ padding: '10px 18px', background: isExp ? 'rgba(0,147,208,0.05)' : (i % 2 ? '#080e14' : 'transparent'), borderBottom: i < weeks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                 <div style={{ width: 24, height: 24, borderRadius: 6, background: '#0e1720', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 11, color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {w.weekNum}
                 </div>
                 <span style={{ fontSize: 11, fontWeight: 700, color: '#8899aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                   Semana {w.weekNum} <span style={{ color: '#778899', fontWeight: 400, textTransform: 'none' }}>· {fmtDate(w.startDate)} – {fmtDate(w.endDate)}</span>
                 </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                 <span style={{ color: '#8899aa' }} title="ETo">ETo: <span style={{ color: '#e2e8f0' }}>{fmtNum(w.eto)}</span></span>
                 <span style={{ color: '#8899aa' }} title="ETc">ETc: <span style={{ color: '#06b6d4' }}>{fmtNum(w.etc)}</span></span>
                 <span style={{ color: '#8899aa' }} title="Precipitação">Chuva: <span style={{ color: '#38bdf8' }}>{fmtNum(w.rain)}</span></span>
                 <span style={{ color: '#8899aa' }} title="Irrigação">Irrig: <span style={{ color: '#0093D0', fontWeight: 700 }}>{fmtNum(w.irrig)}</span></span>
                 <ChevronDown size={14} style={{ color: '#778899', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </div>
            </div>

            {/* Expansivo: dias */}
            {isExp && (
              <div style={{ padding: '0px 18px', background: '#060a0f', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {w.records.map((e, idx) => (
                  <div key={e.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: 11 }}>
                    <span style={{ color: '#778899', flex: 1, minWidth: 60 }}>{fmtDate(e.date)}</span>
                    <div style={{ display: 'flex', gap: 16, flex: 3, justifyContent: 'flex-end', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: '#8899aa', width: 50, textAlign: 'right' }}>{fmtNum(e.eto_mm)}</span>
                      <span style={{ color: '#06b6d4', width: 50, textAlign: 'right' }}>{fmtNum(e.etc_mm)}</span>
                      <span style={{ color: '#38bdf8', width: 50, textAlign: 'right' }}>{fmtNum(e.rainfall_mm)}</span>
                      <span style={{ color: '#0093D0', width: 50, textAlign: 'right', fontWeight: e.actual_depth_mm ? 700 : 400 }}>{fmtNum(e.actual_depth_mm)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BalanceChartSVG({ records, season }: { records: DailyManagement[]; season: SeasonFull }) {
  if (records.length < 2) return null

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))

  const W = 800, H = 200
  const PAD = { top: 14, right: 16, bottom: 36, left: 44 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  function xPos(i: number) { return PAD.left + (i / Math.max(sorted.length - 1, 1)) * innerW }
  function yRight(val: number) { return PAD.top + innerH - (Math.max(0, Math.min(125, val)) / 125) * innerH }

  // CAD médio (50% para simplificar)
  const cadPct = 50

  // Calcular CAD real por fase se possível
  const cadPercents = sorted.map(r => {
    if (!season.crops || !r.das) return 50
    const info = getStageInfoForDas(season.crops, r.das)
    const cta = calcCTA(Number(season.pivots?.field_capacity ?? season.field_capacity ?? 32), Number(season.pivots?.wilting_point ?? season.wilting_point ?? 14), Number(season.pivots?.bulk_density ?? season.bulk_density ?? 1.4), info.rootDepthCm)
    const cad = calcCAD(cta, info.fFactor)
    return cta > 0 ? (cad / cta) * 100 : 50
  })

  const avgCad = cadPercents.length > 0 ? cadPercents.reduce((a, b) => a + b, 0) / cadPercents.length : 50
  const avgCadOffset = `${(avgCad / 125) * 100}%`

  // Fases — regiões coloridas
  const stageColors: Record<number, string> = {
    1: 'rgb(6 182 212 / 0.06)',
    2: 'rgba(0,147,208,0.06)',
    3: 'rgb(245 158 11 / 0.06)',
    4: 'rgb(236 72 153 / 0.06)',
  }

  // Detectar transições de fase
  const phaseRegions: { stage: number; startI: number; endI: number }[] = []
  let curStage = sorted[0]?.crop_stage ?? 1
  let curStart = 0
  for (let i = 1; i < sorted.length; i++) {
    const st = sorted[i].crop_stage ?? 1
    if (st !== curStage) {
      phaseRegions.push({ stage: curStage, startI: curStart, endI: i - 1 })
      curStage = st; curStart = i
    }
  }
  phaseRegions.push({ stage: curStage, startI: curStart, endI: sorted.length - 1 })

  // Linha ADc%
  function makePath() {
    const segs: string[][] = []
    let cur: string[] = []
    sorted.forEach((d, i) => {
      const v = d.field_capacity_percent
      if (v !== null && v !== undefined) {
        cur.push(`${xPos(i).toFixed(1)},${yRight(v).toFixed(1)}`)
      } else {
        if (cur.length >= 2) segs.push(cur)
        cur = []
      }
    })
    if (cur.length >= 2) segs.push(cur)
    return segs.map(s => `M ${s.join(' L ')}`).join(' ')
  }

  const pathAdc = makePath()

  // Ticks X
  const tickStep = Math.ceil(sorted.length / 6)
  const xTicks = sorted.map((d, i) => ({ i, label: fmtDate(d.date) })).filter((_, i) => i % tickStep === 0 || i === sorted.length - 1)
  const yTicks = [0, 25, 50, 75, 100, 125].map(v => ({ v, y: yRight(v) }))

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TrendingDown size={13} style={{ color: '#0093D0' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>ADc% (Água Disponível no Solo) ao Longo da Safra</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[1,2,3,4].map(s => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#778899' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: stageColors[s]?.replace('0.06', '0.5') ?? '#333' }} />
              Fase {s}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#778899' }}>
            <div style={{ width: 2, height: 10, background: '#f59e0b', opacity: 0.6 }} />CAD
          </span>
        </div>
      </div>
      <div style={{ padding: '8px 0 4px', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', minWidth: 340 }}>
          {/* Regiões de fase */}
          {phaseRegions.map((p, i) => (
            <rect
              key={i}
              x={xPos(p.startI)} y={PAD.top}
              width={xPos(p.endI) - xPos(p.startI) + (p.endI === sorted.length - 1 ? 0 : 0)}
              height={innerH}
              fill={stageColors[p.stage] ?? 'transparent'}
            />
          ))}

          {/* Grade */}
          {yTicks.map(({ v, y }) => (
            <line key={v} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          ))}

          {/* Linha CAD dinâmica (um segmento por registro) */}
          {sorted.map((_, i) => {
            if (i >= sorted.length - 1) return null
            const y1 = yRight(cadPercents[i])
            const y2 = yRight(cadPercents[i + 1])
            return (
              <line key={i}
                x1={xPos(i)} y1={y1} x2={xPos(i + 1)} y2={y2}
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.6"
              />
            )
          })}

          {/* Barras de irrigação */}
          {sorted.map((d, i) => {
            const v = d.actual_depth_mm ?? 0
            if (v <= 0) return null
            const barH = Math.min((v / 30) * innerH * 0.5, innerH * 0.4)
            const barW = Math.max(3, innerW / sorted.length * 0.5)
            return (
              <rect key={i} x={xPos(i) - barW / 2} y={PAD.top + innerH - barH} width={barW} height={barH}
                fill="rgba(0,147,208,0.5)" stroke="rgba(0,147,208,0.8)" strokeWidth="1" rx="2" />
            )
          })}

          {/* Barras de chuva */}
          {sorted.map((d, i) => {
            const v = d.rainfall_mm ?? 0
            if (v <= 0) return null
            const barH = Math.min((v / 50) * innerH * 0.4, innerH * 0.35)
            const barW = Math.max(3, innerW / sorted.length * 0.5)
            return (
              <rect key={i} x={xPos(i) - barW / 2} y={PAD.top + innerH - barH} width={barW} height={barH}
                fill="rgb(56 189 248 / 0.4)" stroke="rgb(56 189 248 / 0.6)" strokeWidth="1" rx="2" />
            )
          })}

          <defs>
            <linearGradient id="adcGradient" x1="0" y1={yRight(0)} x2="0" y2={yRight(125)} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset={avgCadOffset} stopColor="#ef4444" />
              <stop offset={avgCadOffset} stopColor="#0093D0" />
              <stop offset="100%" stopColor="#0093D0" />
            </linearGradient>
          </defs>

          {/* Curva ADc% */}
          {pathAdc && (
            <path d={pathAdc} fill="none" stroke="url(#adcGradient)" strokeWidth="3" strokeLinejoin="round" />
          )}

          {/* Pontos coloridos por status */}
          {sorted.map((d, i) => {
            const v = d.field_capacity_percent
            if (v === null || v === undefined) return null
            const cad = cadPercents[i]
            const color = v >= 80 ? '#22c55e' : v >= cad ? '#f59e0b' : '#ef4444'
            return <circle key={i} cx={xPos(i)} cy={yRight(v)} r="3" fill={color} stroke="#0f1923" strokeWidth="1.5" />
          })}

          {/* Eixo Y */}
          {yTicks.map(({ v, y }) => (
            <text key={v} x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#778899">{v}%</text>
          ))}

          {/* Eixo X */}
          {xTicks.map(({ i, label }) => (
            <text key={i} x={xPos(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#778899">{label}</text>
          ))}

          <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        </svg>
      </div>
      <div style={{ padding: '8px 18px 10px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#778899' }}>
          <div style={{ width: 8, height: 12, background: 'rgba(0,147,208,0.5)', borderRadius: 1 }} /> Irrigação aplicada
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#778899' }}>
          <div style={{ width: 8, height: 12, background: 'rgb(56 189 248 / 0.4)', borderRadius: 1 }} /> Chuva
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#778899' }}>
          <div style={{ width: 16, height: 3, background: '#0093D0', borderRadius: 99 }} /> ADc (%) Umidade Atual
        </span>
      </div>
    </div>
  )
}

// ─── Hero Summary ────────────────────────────────────────────

function HeroSummary({ kpis, season, lastRecordDate }: { kpis: SeasonKPIs; season: SeasonFull; lastRecordDate: string | null }) {
  const score = calcSeasonScore(kpis)
  const status = getSeasonStatusFromScore(score)

  const totalWater = kpis.totalIrrigationMm + kpis.totalRainfallMm
  const efficiency = totalWater > 0 ? Math.round((kpis.totalEtcMm / totalWater) * 100) : null

  const effColor = efficiency !== null && efficiency >= 60 ? '#22c55e' : efficiency !== null && efficiency >= 40 ? '#f59e0b' : '#ef4444'
  const stressColor = kpis.stressIndex < 10 ? '#22c55e' : kpis.stressIndex < 20 ? '#f59e0b' : '#ef4444'

  const stressInterpretation = getStressInterpretation(kpis)
  const recommendation = getSeasonRecommendation(kpis)

  // Score arc (semi-círculo visual simples)
  const scoreColor = status.color

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f1923 0%, #0d1520 100%)',
      border: `1px solid ${scoreColor}30`,
      borderRadius: 16,
      padding: '20px 24px',
    }}>
      {/* Linha principal: score + métricas */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        {/* Score + badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
            <svg viewBox="0 0 64 64" width="64" height="64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
              <circle cx="32" cy="32" r="28" fill="none" stroke={scoreColor} strokeWidth="6"
                strokeDasharray={`${(score / 100) * 175.9} 175.9`}
                strokeLinecap="round"
                transform="rotate(-90 32 32)"
                style={{ transition: 'stroke-dasharray 0.6s ease-out' }}
              />
              <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="800" fill={scoreColor} fontFamily="var(--font-mono)">{score}</text>
            </svg>
          </div>
          <div>
            <span style={{
              display: 'inline-block', fontSize: 13, fontWeight: 700, padding: '4px 12px',
              borderRadius: 20, background: status.bg, color: status.color,
              border: `1px solid ${status.color}40`, marginBottom: 4,
            }}>{status.label}</span>
            <p style={{ fontSize: 11, color: '#8899aa', lineHeight: 1.4, maxWidth: 160 }}>score composto: stress (40%) + eficiência (30%) + CC% (30%)</p>
          </div>
        </div>

        {/* Métricas rápidas */}
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Eficiência Hídrica
            </p>
            <p style={{ fontSize: 28, fontWeight: 800, color: effColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {efficiency !== null ? `${efficiency}%` : '—'}
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>ETc / (Irrig+Chuva)</p>
          </div>

          <div>
            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Stress Hídrico
            </p>
            <p style={{ fontSize: 28, fontWeight: 800, color: stressColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {fmtNum(kpis.stressIndex)}%
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{kpis.stressDays} dia(s) abaixo do CAD</p>
          </div>

          <div>
            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              CC% Média
            </p>
            <p style={{ fontSize: 28, fontWeight: 800, color: kpis.avgFieldCapacity >= 70 ? '#22c55e' : kpis.avgFieldCapacity >= 50 ? '#f59e0b' : '#ef4444', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {kpis.avgFieldCapacity > 0 ? `${Math.round(kpis.avgFieldCapacity)}%` : '—'}
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>umidade média na safra</p>
          </div>
        </div>
      </div>

      {/* Interpretação */}
      {stressInterpretation && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.025)', borderRadius: 10, borderLeft: `3px solid ${stressColor}` }}>
          <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.625 }}>{stressInterpretation}</p>
        </div>
      )}

      {/* Recomendação */}
      {recommendation && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#0093D0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginTop: 2 }}>Recomendação</span>
          <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.625 }}>{recommendation}</p>
        </div>
      )}

      {/* Rodapé: sumário + última atualização */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <p style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.5 }}>
          {kpis.totalDays} dias monitorados
          {kpis.irrigationEvents > 0 && ` · ${kpis.irrigationEvents} irrigações`}
          {kpis.totalRainfallMm > 0 && ` · ${fmtNum(kpis.totalRainfallMm)} mm de chuva`}
          {season.crops && ` · ${season.crops.name}`}
        </p>
        {lastRecordDate && (
          <span style={{ fontSize: 12, color: '#8899aa' }}>
            Última atualização: {fmtDate(lastRecordDate)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Accordion Section ────────────────────────────────────────

function AccordionSection({ id, title, icon: Icon, isOpen, onToggle, children, badge }: {
  id: string
  title: string
  icon: typeof BarChart2
  isOpen: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
  badge?: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <button
        onClick={() => onToggle(id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 18px', background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          transition: 'background 0.15s',
        }}
      >
        <Icon size={13} style={{ color: '#0093D0', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#cbd5e1', flex: 1 }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(0,147,208,0.12)', color: '#0093D0', fontWeight: 600 }}>{badge}</span>
        )}
        <ChevronDown size={14} style={{ color: '#778899', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease', flexShrink: 0 }} />
      </button>
      {/* CSS grid animation */}
      <div style={{
        display: 'grid',
        gridTemplateRows: isOpen ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.25s ease-out',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ paddingTop: 16 }}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CSV Export ──────────────────────────────────────────────

function exportCSV(records: DailyManagement[], seasonName: string) {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const header = ['Data', 'DAS', 'Fase', 'Tmax', 'Tmin', 'UR%', 'Vento(m/s)', 'Rad(W/m²)', 'ETo(mm)', 'ETc(mm)', 'Kc', 'Chuva(mm)', 'Irrig.Recom(mm)', 'Irrig.Aplic(mm)', 'ADc(mm)', 'CC%', 'Stress'].join(';')
  const rows = sorted.map(r => [
    r.date, r.das ?? '', r.crop_stage ?? '',
    r.temp_max ?? '', r.temp_min ?? '', r.humidity_percent ?? '',
    r.wind_speed_ms ?? '', r.solar_radiation_wm2 ?? '',
    r.eto_mm ?? '', r.etc_mm ?? '', r.kc ?? '',
    r.rainfall_mm ?? '', r.recommended_depth_mm ?? '',
    r.actual_depth_mm ?? '', r.ctda ?? '', r.field_capacity_percent ?? '',
    (r.field_capacity_percent ?? 100) < 50 ? 'Sim' : 'Não',
  ].join(';')).join('\n')

  const csv = '\uFEFF' + header + '\n' + rows // BOM para Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `irrigaagro-${seasonName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Componentes de Energia ───────────────────────────────────

type SemColor = 'green' | 'yellow' | 'red'

function semColor(status: SemColor | string | undefined): string {
  if (status === 'green') return '#22c55e'
  if (status === 'yellow') return '#f59e0b'
  return '#ef4444'
}

function EnergyKpiCard({ label, value, unit, status, meta }: {
  label: string; value: string; unit?: string
  status?: SemColor | string; meta?: string
}) {
  const color = status ? semColor(status) : '#e2e8f0'
  return (
    <div style={{ background: '#0f1923', border: `1px solid ${color}30`, borderRadius: 14, padding: '14px 16px' }}>
      <p style={{ fontSize: 20, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {value} <span style={{ fontSize: 11, fontWeight: 400, color: '#778899' }}>{unit}</span>
      </p>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{label}</p>
      {meta && <p style={{ fontSize: 11, color: '#778899', marginTop: 2 }}>{meta}</p>}
    </div>
  )
}

function EnergyBarChart({ bills }: { bills: EnergyBill[] }) {
  if (bills.length === 0) return null
  const sorted = [...bills].sort((a, b) => a.reference_month.localeCompare(b.reference_month))
  const W = 760, H = 180
  const PAD = { top: 12, right: 16, bottom: 36, left: 48 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const n = sorted.length
  const barW = Math.max(12, innerW / n * 0.55)
  const maxReactive = Math.max(...sorted.map(b => b.reactive_percent ?? 0), 8)
  const maxCost = Math.max(...sorted.map(b => b.cost_per_mm_ha ?? 0), 2.5)

  function xPos(i: number) { return PAD.left + (i + 0.5) * (innerW / n) }
  function yBar(pct: number) { return PAD.top + innerH - (Math.min(pct, maxReactive) / maxReactive) * innerH }
  function yLine(val: number) { return PAD.top + innerH - (Math.min(val, maxCost) / maxCost) * innerH }

  const monthLabel = (m: string) => {
    const names: Record<string, string> = {
      '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
      '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
      '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
    }
    const [, mo] = m.split('-')
    return names[mo] ?? mo
  }

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Bolt size={13} style={{ color: '#f59e0b' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Histórico de Energia — Reativa % e Custo/mm/ha</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          <span style={{ fontSize: 10, color: '#778899', display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, background: 'rgb(239 68 68 / 0.5)', borderRadius: 2 }} /> Reativa %
          </span>
          <span style={{ fontSize: 10, color: '#778899', display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 16, height: 3, background: '#0093D0', borderRadius: 99 }} /> R$/mm/ha
          </span>
          <span style={{ fontSize: 10, color: '#778899', display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 2, background: '#f59e0b', borderRadius: 99, opacity: 0.6 }} /> Meta
          </span>
        </div>
      </div>
      <div style={{ padding: '8px 0 4px', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', minWidth: 300 }}>
          {/* Grade */}
          {[0, 25, 50, 75, 100].map(pct => {
            const y = PAD.top + innerH - (pct / 100) * innerH
            return <line key={pct} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          })}

          {/* Meta reativa 2% */}
          <line
            x1={PAD.left} y1={yBar(2)} x2={W - PAD.right} y2={yBar(2)}
            stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5"
          />
          {/* Meta custo 1.50 */}
          <line
            x1={PAD.left} y1={yLine(1.5)} x2={W - PAD.right} y2={yLine(1.5)}
            stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5"
          />

          {/* Barras reativa */}
          {sorted.map((b, i) => {
            const pct = b.reactive_percent ?? 0
            const barH = Math.max(2, (pct / maxReactive) * innerH)
            const barColor = pct <= 2 ? '#22c55e' : pct <= 5 ? '#f59e0b' : '#ef4444'
            return (
              <rect key={i}
                x={xPos(i) - barW / 2} y={PAD.top + innerH - barH}
                width={barW} height={barH}
                fill={`${barColor}55`} stroke={barColor} strokeWidth="1" rx="3"
              />
            )
          })}

          {/* Linha custo/mm/ha */}
          {sorted.length >= 2 && (
            <polyline
              points={sorted.map((b, i) => {
                const v = b.cost_per_mm_ha ?? 0
                return `${xPos(i)},${yLine(v)}`
              }).join(' ')}
              fill="none" stroke="#0093D0" strokeWidth="2" strokeLinejoin="round"
            />
          )}
          {sorted.map((b, i) => {
            const v = b.cost_per_mm_ha ?? 0
            if (!b.cost_per_mm_ha) return null
            const dotColor = v <= 1.5 ? '#22c55e' : v <= 2 ? '#f59e0b' : '#ef4444'
            return <circle key={i} cx={xPos(i)} cy={yLine(v)} r="4" fill={dotColor} stroke="#0f1923" strokeWidth="2" />
          })}

          {/* Eixo X */}
          {sorted.map((b, i) => (
            <text key={i} x={xPos(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#778899">
              {monthLabel(b.reference_month)}
            </text>
          ))}

          {/* Eixo Y (reativa %) */}
          {[0, 2, 5, 10].map(v => (
            <text key={v} x={PAD.left - 4} y={yBar(v) + 4} textAnchor="end" fontSize="8" fill="#778899">{v}%</text>
          ))}

          <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        </svg>
      </div>
    </div>
  )
}

function EnergyTable({ bills }: { bills: EnergyBill[] }) {
  const sorted = [...bills].sort((a, b) => b.reference_month.localeCompare(a.reference_month))
  if (sorted.length === 0) return null

  return (
    <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Bolt size={13} style={{ color: '#f59e0b' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Histórico de Contas</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0d1520' }}>
              {['Mês', 'kWh', 'Custo Total', 'Reativa %', 'HR %', 'Custo/mm/ha', 'Ponta (R$)', 'Status'].map(h => (
                <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, color: '#778899', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((b, i) => {
              const reactivePct = b.reactive_percent ?? null
              const reservedPct = b.reserved_percent ?? null
              const costMmHa = b.cost_per_mm_ha ?? null

              const reactiveStatus = reactivePct === null ? 'unknown' : reactivePct <= 2 ? 'green' : reactivePct <= 5 ? 'yellow' : 'red'
              const reservedStatus = reservedPct === null ? 'unknown' : reservedPct >= 50 ? 'green' : reservedPct >= 30 ? 'yellow' : 'red'
              const costStatus = costMmHa === null ? 'unknown' : costMmHa <= 1.5 ? 'green' : costMmHa <= 2 ? 'yellow' : 'red'

              const overallStatus = [reactiveStatus, reservedStatus, costStatus].some(s => s === 'red') ? 'red'
                : [reactiveStatus, reservedStatus, costStatus].some(s => s === 'yellow') ? 'yellow' : 'green'

              return (
                <tr key={b.id} style={{ background: i % 2 ? '#080e14' : 'transparent', borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#8899aa' }}>{b.reference_month}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#8899aa', fontFamily: 'var(--font-mono)' }}>{b.kwh_total ? fmtNum(b.kwh_total, 0) : '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>{b.cost_total_brl ? `R$ ${fmtNum(b.cost_total_brl, 2)}` : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: semColor(reactiveStatus), fontFamily: 'var(--font-mono)' }}>
                      {reactivePct !== null ? `${fmtNum(reactivePct)}%` : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: semColor(reservedStatus), fontFamily: 'var(--font-mono)' }}>
                      {reservedPct !== null ? `${fmtNum(reservedPct)}%` : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: semColor(costStatus), fontFamily: 'var(--font-mono)' }}>
                      {costMmHa !== null ? `R$ ${fmtNum(costMmHa, 2)}` : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#8899aa', fontFamily: 'var(--font-mono)' }}>
                    {b.cost_peak_brl ? `R$ ${fmtNum(b.cost_peak_brl, 2)}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: semColor(overallStatus) }}>
                      {overallStatus === 'green' ? '✓ Ótimo' : overallStatus === 'yellow' ? '⚠ Atenção' : '✕ Crítico'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────

export default function RelatoriosPage() {
  const { company } = useAuth()
  const [seasons, setSeasons] = useState<SeasonFull[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [records, setRecords] = useState<DailyManagement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)

  // ── Estado energia ──
  const [pivots, setPivots] = useState<{ id: string; name: string; farm_name: string }[]>([])
  const [selectedPivotId, setSelectedPivotId] = useState<string>('')
  const [energyBills, setEnergyBills] = useState<EnergyBill[]>([])
  const [loadingBills, setLoadingBills] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)
  const [irrigatedMmHa, setIrrigatedMmHa] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadSeasons = useCallback(async () => {
    if (!company) return
    setLoading(true)
    const supabase = createClient()

    // Buscar farms da empresa para filtrar seasons
    const { data: farms } = await supabase
      .from('farms')
      .select('id')
      .eq('company_id', company.id)

    const farmIds = (farms ?? []).map((f: { id: string }) => f.id)
    if (farmIds.length === 0) {
      setSeasons([])
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('seasons')
      .select('*, crops(*), pivots(*), farms(id, name)')
      .in('farm_id', farmIds)
      .order('created_at', { ascending: false })

    const list = (data as SeasonFull[]) ?? []
    setSeasons(list)
    if (list.length > 0) setSelectedSeasonId(list[0].id)
    setLoading(false)
  }, [company])

  useEffect(() => { loadSeasons() }, [loadSeasons])

  // Carregar pivôs para seletor de energia (filtrado por empresa)
  useEffect(() => {
    if (!company) return
    const supabase = createClient()
    supabase
      .from('farms')
      .select('id')
      .eq('company_id', company.id)
      .then(({ data: farms }) => {
        const farmIds = (farms ?? []).map((f: { id: string }) => f.id)
        if (farmIds.length === 0) { setPivots([]); return }
        return supabase
          .from('pivots')
          .select('id, name, farms(name)')
          .in('farm_id', farmIds)
      })
      .then((res) => {
        const data = res?.data
        if (!data) return
        type PivotRow = { id: string; name: string; farms: { name: string }[] | { name: string } | null }
        const list = (data as unknown as PivotRow[]).map(p => ({
          id: p.id,
          name: p.name,
          farm_name: Array.isArray(p.farms) ? (p.farms[0]?.name ?? '') : (p.farms?.name ?? ''),
        }))
        setPivots(list)
        if (list.length > 0) setSelectedPivotId(list[0].id)
      })
  }, [company])

  const loadEnergyBills = useCallback(async (pivotId: string) => {
    if (!pivotId) return
    setLoadingBills(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('energy_bills')
      .select('*')
      .eq('pivot_id', pivotId)
      .order('reference_month', { ascending: false })
      .limit(24)
    setEnergyBills((data as EnergyBill[]) ?? [])
    setLoadingBills(false)
  }, [])

  useEffect(() => {
    if (selectedPivotId) loadEnergyBills(selectedPivotId)
  }, [selectedPivotId, loadEnergyBills])

  const handleEnergyUpload = useCallback(async () => {
    if (!uploadFile || !selectedPivotId) return
    setUploading(true)
    setUploadResult(null)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      fd.append('pivot_id', selectedPivotId)
      if (irrigatedMmHa) fd.append('irrigated_mm_ha', irrigatedMmHa)

      const res = await fetch('/api/extract-energy-bill', { method: 'POST', body: fd })
      const json = await res.json() as { success: boolean; bill?: { reference_month?: string }; kpis?: { reactivePct?: number | null; reservedPct?: number | null; costPerMmHa?: number | null }; error?: string }

      if (res.ok && json.success) {
        setUploadResult({ success: true, message: `Conta de ${json.bill?.reference_month ?? '?'} salva! Reativa: ${json.kpis?.reactivePct?.toFixed(1) ?? '—'}%` })
        setUploadFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        loadEnergyBills(selectedPivotId)
      } else {
        setUploadResult({ success: false, message: json.error ?? 'Erro na extração' })
      }
    } catch (err) {
      setUploadResult({ success: false, message: err instanceof Error ? err.message : 'Erro de rede' })
    }
    setUploading(false)
  }, [uploadFile, selectedPivotId, irrigatedMmHa, loadEnergyBills])

  const loadRecords = useCallback(async (seasonId: string) => {
    if (!seasonId) return
    setLoadingRecords(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('daily_management')
      .select('*')
      .eq('season_id', seasonId)
      .order('date', { ascending: true })

    setRecords((data as DailyManagement[]) ?? [])
    setLoadingRecords(false)
  }, [])

  useEffect(() => {
    if (selectedSeasonId) loadRecords(selectedSeasonId)
  }, [selectedSeasonId, loadRecords])

  const selectedSeason = useMemo(
    () => seasons.find(s => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId]
  )

  const kpis = useMemo(
    () => selectedSeason ? calcKPIs(records, selectedSeason) : emptyKPIs(),
    [records, selectedSeason]
  )

  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(['kpis'])
  )

  const toggleSection = useCallback((id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ─── Loading ────────────────────────────────────────────────

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
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Nenhuma safra cadastrada</h2>
        <p style={{ fontSize: 13, color: '#778899' }}>Cadastre uma safra para gerar relatórios.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }} className="flex flex-col gap-4">

      {/* Título + botão CSV */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#e2e8f0', letterSpacing: '-0.025em' }}>Relatórios de Safra</h1>
          {selectedSeason ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0093D0' }}>{selectedSeason.name}</span>
              <span style={{ fontSize: 13, color: '#64748b' }}>·</span>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{selectedSeason.farms.name}</span>
              {selectedSeason.pivots && (
                <>
                  <span style={{ fontSize: 13, color: '#64748b' }}>·</span>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>{selectedSeason.pivots.name}</span>
                </>
              )}
              {selectedSeason.is_active && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600 }}>ativa</span>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>Visão integrada de irrigação, estresse e consumo hídrico</p>
          )}
        </div>
        {records.length > 0 && (
          <button
            onClick={() => selectedSeason && exportCSV(records, selectedSeason.name)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: '#0093D0', border: 'none', color: '#fff',
              cursor: 'pointer', minHeight: 44, boxShadow: '0 2px 8px rgba(0,147,208,0.3)',
            }}
          >
            <Download size={14} /> Exportar CSV
          </button>
        )}
      </div>

      {/* Seletor de safra */}
      <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '16px 20px' }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8899aa', marginBottom: 6 }}>Safra</label>
        <div style={{ position: 'relative', maxWidth: 480 }}>
          <select
            value={selectedSeasonId}
            onChange={e => setSelectedSeasonId(e.target.value)}
            style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: 10, fontSize: 14, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none', appearance: 'none', cursor: 'pointer' }}
          >
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.farms.name}{s.pivots ? ` / ${s.pivots.name}` : ''}
                {s.is_active ? ' ✓ ativa' : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#778899', pointerEvents: 'none' }} />
        </div>

        {selectedSeason && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {selectedSeason.crops && (
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: 'rgb(0 147 208 / 0.10)', border: '1px solid rgb(0 147 208 / 0.20)', color: '#0093D0', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Sprout size={10} /> {selectedSeason.crops.name}
              </span>
            )}
            {selectedSeason.planting_date && (
              <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#0d1520', color: '#778899', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={10} /> Plantio: {fmtDateLong(selectedSeason.planting_date)}
              </span>
            )}
            <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#0d1520', color: '#778899', display: 'flex', alignItems: 'center', gap: 4 }}>
              <BarChart2 size={10} /> {kpis.totalDays} dias com registros
            </span>
          </div>
        )}
      </div>

      {/* Loading de registros */}
      {loadingRecords && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#778899', fontSize: 13 }}>
          <Loader2 size={14} className="animate-spin" style={{ color: '#0093D0' }} />
          Carregando dados da safra...
        </div>
      )}

      {/* Sem dados */}
      {!loadingRecords && records.length === 0 && (
        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
          <BarChart2 size={28} style={{ color: '#778899', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, color: '#778899' }}>Nenhum registro de manejo diário para esta safra.</p>
          <p style={{ fontSize: 12, color: '#778899', marginTop: 4 }}>Registre dados no Manejo Diário para gerar relatórios.</p>
        </div>
      )}

      {!loadingRecords && records.length > 0 && (
        <>
          {/* ── Hero: status em 5 segundos ── */}
          <HeroSummary
            kpis={kpis}
            season={selectedSeason!}
            lastRecordDate={records.length > 0 ? records[records.length - 1].date : null}
          />

          {/* ── SEÇÃO 1: KPIs (aberto por padrão) ── */}
          <AccordionSection
            id="kpis"
            title="Resumo da Safra"
            icon={BarChart2}
            isOpen={openSections.has('kpis')}
            onToggle={toggleSection}
            badge={`${kpis.totalDays} dias`}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              <KpiCard label="Total Irrigado" value={fmtNum(kpis.totalIrrigationMm)} unit="mm" color="#0093D0" icon={Droplets}
                description="Soma de toda lâmina aplicada via pivô na safra." />
              <KpiCard label="Precipitação Total" value={fmtNum(kpis.totalRainfallMm)} unit="mm" color="#38bdf8" icon={CloudRain}
                description="Chuva registrada — complementa a irrigação na reposição hídrica." />
              <KpiCard label="ETc Acumulada" value={fmtNum(kpis.totalEtcMm)} unit="mm" color="#06b6d4" icon={Droplets}
                sub={`ETo: ${fmtNum(kpis.totalEtoMm)} mm`}
                description="Evapotranspiração real da cultura — demanda hídrica total." />
              <KpiCard label="Eventos de Irrigação" value={String(kpis.irrigationEvents)} color="#8899aa" icon={Zap}
                description="Número de dias com lâmina aplicada registrada." />
              <KpiCard label="CC% Mínimo" value={fmtNum(kpis.minFieldCapacity, 0)} unit="%" color="#f59e0b" icon={TrendingDown}
                sub={`média: ${fmtNum(kpis.avgFieldCapacity, 0)}%`}
                description="Menor umidade registrada. Valores baixos indicam stress pontual." />
              <KpiCard label="Dias em Estresse" value={String(kpis.stressDays)} color="#ef4444" icon={AlertTriangle}
                sub={`de ${kpis.totalDays} dias`}
                description="Dias com CC% abaixo do CAD — cultura sob restrição hídrica." />
            </div>
            <HealthGauges kpis={kpis} />
          </AccordionSection>

          {/* ── SEÇÃO 2: Balanço Hídrico (fechado) ── */}
          <AccordionSection
            id="balance"
            title="Balanço Hídrico — Visão Geral da Safra"
            icon={TrendingDown}
            isOpen={openSections.has('balance')}
            onToggle={toggleSection}
          >
            <BalanceChartSVG records={records} season={selectedSeason!} />
          </AccordionSection>

          {/* ── SEÇÃO 3: Consumo e Eficiência (fechado) ── */}
          <AccordionSection
            id="consumo"
            title="Consumo e Eficiência Hídrica"
            icon={Sun}
            isOpen={openSections.has('consumo')}
            onToggle={toggleSection}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PeriodTable last7={kpis.last7} last10={kpis.last10} last15={kpis.last15} />
              <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Eficiência Hídrica</span>
                {[
                  {
                    label: 'ETc / (Irrig + Chuva)',
                    value: (kpis.totalIrrigationMm + kpis.totalRainfallMm) > 0
                      ? (kpis.totalEtcMm / (kpis.totalIrrigationMm + kpis.totalRainfallMm)) * 100
                      : null,
                    desc: 'Quanto da água entrou foi consumida',
                    good: (v: number) => v >= 60 && v <= 100,
                  },
                  {
                    label: 'Chuva / ETc',
                    value: kpis.totalEtcMm > 0 ? (kpis.totalRainfallMm / kpis.totalEtcMm) * 100 : null,
                    desc: 'Contribuição da chuva no consumo',
                    good: (v: number) => v >= 30,
                  },
                  {
                    label: 'Irrigação / ETc',
                    value: kpis.totalEtcMm > 0 ? (kpis.totalIrrigationMm / kpis.totalEtcMm) * 100 : null,
                    desc: 'Dependência hídrica da irrigação',
                    good: (v: number) => v <= 70,
                  },
                ].map(item => {
                  const v = item.value
                  const color = v === null ? '#778899' : item.good(v) ? '#22c55e' : '#f59e0b'
                  return (
                    <div key={item.label} style={{ background: '#0f1923', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 11, color: '#8899aa' }}>{item.label}</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>
                          {v !== null ? fmtNum(v, 0) + '%' : '—'}
                        </span>
                      </div>
                      <p style={{ fontSize: 10, color: '#778899', marginTop: 2 }}>{item.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </AccordionSection>

          {/* ── SEÇÃO 4: Fase Fenológica (fechado) ── */}
          <AccordionSection
            id="fenologia"
            title="Análise por Fase Fenológica"
            icon={Leaf}
            isOpen={openSections.has('fenologia')}
            onToggle={toggleSection}
            badge={`${kpis.byStage.length} fases`}
          >
            <StageTable stages={kpis.byStage} />
          </AccordionSection>

          {/* ── SEÇÃO 5: Consumo Semanal (fechado) ── */}
          <AccordionSection
            id="semanal"
            title="Consumo Hídrico Semanal"
            icon={CheckCircle2}
            isOpen={openSections.has('semanal')}
            onToggle={toggleSection}
          >
            <WeeklySummaryTable records={records} />
          </AccordionSection>
        </>
      )}

      {/* ── SEÇÃO 6: Análise Inteligente de Energia (fechado) ── */}
      <AccordionSection
        id="energia"
        title="Análise Inteligente de Energia"
        icon={Bolt}
        isOpen={openSections.has('energia')}
        onToggle={toggleSection}
        badge={energyBills.length > 0 ? `${energyBills.length} meses` : undefined}
      >
        {/* Seletor de Pivô */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#8899aa', marginBottom: 5 }}>Pivô</label>
            <div style={{ position: 'relative' }}>
              <select
                value={selectedPivotId}
                onChange={e => setSelectedPivotId(e.target.value)}
                style={{ width: '100%', padding: '9px 32px 9px 12px', borderRadius: 10, fontSize: 13, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none', appearance: 'none', cursor: 'pointer' }}
              >
                {pivots.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.farm_name}</option>
                ))}
              </select>
              <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#778899', pointerEvents: 'none' }} />
            </div>
          </div>
        </div>

        {/* Loading */}
        {loadingBills && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#778899', fontSize: 12, marginBottom: 12 }}>
            <Loader2 size={13} className="animate-spin" style={{ color: '#0093D0' }} />
            Carregando contas...
          </div>
        )}

        {/* KPIs do último mês */}
        {energyBills.length > 0 && (() => {
          const latest = energyBills[0]
          const reactivePct = latest.reactive_percent ?? null
          const reservedPct = latest.reserved_percent ?? null
          const costMmHa = latest.cost_per_mm_ha ?? null
          const costStatus = costMmHa === null ? 'unknown' : costMmHa <= 1.5 ? 'green' : costMmHa <= 2 ? 'yellow' : 'red'
          return (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 10, color: '#778899', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Último mês: {latest.reference_month}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                <EnergyKpiCard
                  label="Custo/mm/ha"
                  value={costMmHa !== null ? `R$ ${fmtNum(costMmHa, 2)}` : '—'}
                  status={costStatus}
                  meta="ótimo ≤1,50 | tolerável ≤2,00"
                />
                <EnergyKpiCard
                  label="Energia Reativa"
                  value={reactivePct !== null ? `${fmtNum(reactivePct)}%` : '—'}
                  status={reactivePct === null ? undefined : reactivePct <= 2 ? 'green' : reactivePct <= 5 ? 'yellow' : 'red'}
                  meta="meta < 2% (Irriger)"
                />
                <EnergyKpiCard
                  label="Horário Reservado"
                  value={reservedPct !== null ? `${fmtNum(reservedPct)}%` : '—'}
                  status={reservedPct === null ? undefined : reservedPct >= 50 ? 'green' : reservedPct >= 30 ? 'yellow' : 'red'}
                  meta="meta > 50%"
                />
                <EnergyKpiCard
                  label="Custo Ponta"
                  value={latest.cost_peak_brl !== null ? `R$ ${fmtNum(latest.cost_peak_brl, 2)}` : '—'}
                  status={latest.cost_peak_brl !== null ? (latest.cost_peak_brl <= 100 ? 'green' : 'yellow') : undefined}
                  meta="meta < R$100"
                />
                <EnergyKpiCard
                  label="Ultrapassagem Demanda"
                  value={latest.demand_exceeded_brl !== null ? `R$ ${fmtNum(latest.demand_exceeded_brl, 2)}` : '—'}
                  status={latest.demand_exceeded_brl !== null ? (latest.demand_exceeded_brl === 0 ? 'green' : 'red') : undefined}
                  meta="meta R$0"
                />
                <EnergyKpiCard
                  label="kWh Total"
                  value={latest.kwh_total !== null ? fmtNum(latest.kwh_total, 0) : '—'}
                  unit="kWh"
                />
              </div>
            </div>
          )
        })()}

        {/* Interpretação do último mês */}
        {energyBills.length > 0 && (() => {
          const phrase = getEnergyInterpretation(energyBills)
          if (!phrase) return null
          const hasAlert = phrase.includes('elevada') || phrase.includes('acima') || phrase.includes('apenas')
          return (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.025)', borderRadius: 10, borderLeft: `3px solid ${hasAlert ? '#f59e0b' : '#22c55e'}` }}>
              <p style={{ fontSize: 12, color: '#aabbcc', lineHeight: 1.5 }}>{phrase}</p>
            </div>
          )
        })()}

        {/* Gráfico histórico */}
        {energyBills.length >= 2 && (
          <div style={{ marginBottom: 14 }}>
            <EnergyBarChart bills={energyBills} />
          </div>
        )}

        {/* Tabela histórico */}
        {energyBills.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <EnergyTable bills={energyBills} />
          </div>
        )}

        {/* Sem dados */}
        {!loadingBills && energyBills.length === 0 && (
          <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '24px', textAlign: 'center', marginBottom: 16 }}>
            <Bolt size={22} style={{ color: '#778899', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, color: '#778899' }}>Nenhuma conta de energia para este pivô.</p>
            <p style={{ fontSize: 11, color: '#778899', marginTop: 4 }}>Faça upload de uma conta abaixo para começar a análise.</p>
          </div>
        )}

        {/* Upload — sempre ao final */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#8899aa', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Adicionar nova conta de energia
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Lâmina irrigada */}
            <div style={{ width: 200 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#8899aa', marginBottom: 5 }}>Lâmina irrigada no mês (mm/ha)</label>
              <input
                type="number"
                value={irrigatedMmHa}
                onChange={e => setIrrigatedMmHa(e.target.value)}
                placeholder="ex: 45"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 13, background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
              />
            </div>

            {/* Dropzone */}
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#8899aa', marginBottom: 5 }}>Arquivo da conta (PDF, JPG, PNG)</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) setUploadFile(f)
                }}
                style={{
                  border: `2px dashed ${uploadFile ? '#0093D0' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 12, padding: '20px 16px', textAlign: 'center',
                  cursor: 'pointer', transition: 'border-color 0.2s',
                  background: uploadFile ? 'rgba(0,147,208,0.05)' : 'transparent',
                }}
              >
                <Upload size={18} style={{ color: uploadFile ? '#0093D0' : '#778899', margin: '0 auto 6px' }} />
                <p style={{ fontSize: 12, color: uploadFile ? '#0093D0' : '#778899' }}>
                  {uploadFile ? uploadFile.name : 'Clique ou arraste o arquivo aqui'}
                </p>
                {!uploadFile && <p style={{ fontSize: 10, color: '#778899', marginTop: 2 }}>PDF, JPG ou PNG</p>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) setUploadFile(f)
                }}
              />
            </div>

            {/* Botão extrair */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleEnergyUpload}
                disabled={!uploadFile || !selectedPivotId || uploading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: (!uploadFile || !selectedPivotId || uploading) ? '#0d1520' : '#0093D0',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: (!uploadFile || !selectedPivotId || uploading) ? '#778899' : '#fff',
                  cursor: (!uploadFile || !selectedPivotId || uploading) ? 'not-allowed' : 'pointer',
                  minHeight: 44,
                }}
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Bolt size={14} />}
                {uploading ? 'Extraindo com IA...' : 'Extrair com IA'}
              </button>

              {uploadResult && (
                <span style={{ fontSize: 12, color: uploadResult.success ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {uploadResult.success ? '✓ ' : '✕ '}{uploadResult.message}
                </span>
              )}
            </div>
          </div>
        </div>
      </AccordionSection>

    </div>
  )
}


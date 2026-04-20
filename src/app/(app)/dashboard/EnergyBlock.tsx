'use client'

import Link from 'next/link'
import type { EnergyBill } from '@/types/database'

interface EnergyBlockProps {
  energyBills: EnergyBill[]
}

export function EnergyBlock({ energyBills }: EnergyBlockProps) {
  // Últimos 6 meses
  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    .toISOString().slice(0, 7)
  const currentBills = energyBills.filter(b => b.reference_month >= sixMonthsAgo)

  if (currentBills.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(145deg, rgba(22, 27, 33, 0.9), rgba(15, 19, 24, 0.95))',
        border: '1px solid rgba(255,255,255,0.03)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
        borderRadius: 20,
        padding: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 24, filter: 'drop-shadow(0 0 10px rgba(0, 229, 255, 0.8))' }}>⚡</span>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>Energia & Custos</p>
            <p style={{ fontSize: 13, color: '#556677', marginTop: 4 }}>
              Nenhuma conta de energia registrada.
            </p>
          </div>
        </div>
        <Link href="/relatorios" style={{
          fontSize: 12, fontWeight: 800, color: '#00E5FF',
          background: 'rgba(0, 229, 255, 0.1)', border: '1px solid rgba(0, 229, 255, 0.3)',
          boxShadow: '0 0 12px rgba(0, 229, 255, 0.2)',
          borderRadius: 10, padding: '8px 16px', textDecoration: 'none',
          textTransform: 'uppercase', letterSpacing: '0.04em'
        }}>
          Importar →
        </Link>
      </div>
    )
  }

  // KPIs
  const gastoTotal = currentBills.reduce((sum, b) => sum + (b.cost_total_brl ?? 0), 0)
  const kwhTotal = currentBills.reduce((sum, b) => sum + (b.kwh_total ?? 0), 0)
  const kwhOffpeak = currentBills.reduce((sum, b) => sum + (b.kwh_offpeak ?? 0), 0)
  const kwhPeak = kwhTotal - kwhOffpeak
  const horarioPercent = kwhTotal > 0 ? Math.round((kwhOffpeak / kwhTotal) * 100) : null

  const billsWithCost = currentBills.filter(b => b.cost_per_mm_ha != null)
  const custoMmHa = billsWithCost.length > 0
    ? billsWithCost.reduce((sum, b) => sum + b.cost_per_mm_ha!, 0) / billsWithCost.length
    : null

  const reativaTotal = currentBills.reduce((sum, b) => sum + (b.cost_reactive_brl ?? 0), 0)
  const reativaPercent = gastoTotal > 0 ? (reativaTotal / gastoTotal) * 100 : 0

  // Evolução mensal
  const byMonth = new Map<string, number>()
  for (const b of currentBills) {
    const existing = byMonth.get(b.reference_month) ?? 0
    byMonth.set(b.reference_month, existing + (b.cost_total_brl ?? 0))
  }
  const meses = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, custo]) => ({
      mes: new Date(month + '-15').toLocaleDateString('pt-BR', { month: 'short' }),
      custo,
    }))
  const maxCusto = Math.max(...meses.map(m => m.custo), 1)

  // Demanda
  const latestBill = currentBills[0]
  const demandaContratada = latestBill?.contracted_demand_kw ?? null
  const demandaMedida = latestBill?.measured_demand_kw ?? null
  const fatorPotencia = latestBill?.power_factor ?? null

  // Período label
  const oldest = currentBills[currentBills.length - 1]
  const newest = currentBills[0]
  const periodoLabel = oldest && newest
    ? `${new Date(oldest.reference_month + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })} — ${new Date(newest.reference_month + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}`
    : ''

  function fmtBrl(v: number): string {
    if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`
    return `R$ ${v.toFixed(0)}`
  }

  const kpiCards = [
    {
      label: 'Gasto Total',
      value: fmtBrl(gastoTotal),
      sub: `${kwhTotal.toLocaleString('pt-BR')} kWh`,
      color: '#e2e8f0',
    },
    {
      label: 'Fora Ponta',
      value: horarioPercent !== null ? `${horarioPercent}%` : '—',
      sub: horarioPercent !== null && horarioPercent >= 80 ? 'Ideal' : horarioPercent !== null ? 'Baixo' : '',
      color: horarioPercent !== null && horarioPercent >= 80 ? '#22c55e' : '#ef4444',
    },
    {
      label: 'R$/mm/ha',
      value: custoMmHa !== null ? `R$ ${custoMmHa.toFixed(2)}` : '—',
      sub: 'Eficiência',
      color: '#f59e0b',
    },
    {
      label: 'Reativa',
      value: fmtBrl(reativaTotal),
      sub: `${reativaPercent.toFixed(1)}% do total`,
      color: reativaPercent > 10 ? '#ef4444' : '#22c55e',
    },
  ]

  const fpPercent = kwhTotal > 0 ? Math.round((kwhOffpeak / kwhTotal) * 100) : 0

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(22, 27, 33, 0.9), rgba(15, 19, 24, 0.95))',
      border: '1px solid rgba(255,255,255,0.03)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(12px)',
      borderRadius: 20,
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, filter: 'drop-shadow(0 0 8px #CCFF00)' }}>⚡</span>
          <span style={{
            fontSize: 12, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#e2e8f0',
          }}>
            Energia & Custos da Safra
          </span>
        </div>
        <span style={{ fontSize: 10, color: '#556677' }}>{periodoLabel}</span>
      </div>

      {/* KPI Cards — 2 colunas no mobile, 4 no desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {kpiCards.map(({ label, value, sub, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 14,
            padding: '16px 18px',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: '#687b8d',
            }}>
              {label}
            </span>
            <div style={{ marginTop: 8 }}>
              <span style={{
                fontSize: 22, fontWeight: 900, fontFamily: 'var(--font-mono)',
                color, lineHeight: 1, textShadow: `0 0 10px ${color}50`
              }}>
                {value}
              </span>
            </div>
            {sub && (
              <span style={{ fontSize: 10, color: '#556677', marginTop: 4, display: 'block' }}>
                {sub}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Distribuição + Evolução — empilhado no mobile, lado a lado no desktop */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-3.5">
        {/* Distribuição */}
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#8899aa',
          }}>
            Distribuição
          </span>
          {/* Stacked bar */}
          <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex', background: '#0d1520' }}>
            <div style={{ width: `${fpPercent}%`, background: '#22c55e', transition: 'width 0.4s' }} />
            <div style={{ width: `${100 - fpPercent}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#22c55e' }} />
              <span style={{ fontSize: 10, color: '#556677' }}>{fpPercent}% FP</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} />
              <span style={{ fontSize: 10, color: '#556677' }}>{100 - fpPercent}% P</span>
            </div>
          </div>
          {/* Fator de potência */}
          {fatorPotencia !== null && (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#556677' }}>Fator Potência: </span>
              <span style={{
                fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                color: fatorPotencia >= 0.92 ? '#22c55e' : '#ef4444',
              }}>
                {fatorPotencia.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Evolução Mensal */}
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#8899aa',
          }}>
            Evolução Mensal
          </span>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 6, flex: 1, minHeight: 60,
          }}>
            {meses.map(({ mes, custo }) => {
              const h = Math.max(8, (custo / maxCusto) * 60)
              return (
                <div key={mes} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    color: '#8899aa',
                  }}>
                    {fmtBrl(custo)}
                  </span>
                  <div style={{
                    width: '100%', maxWidth: 36, height: h, borderRadius: 6,
                    background: 'linear-gradient(to top, rgba(0, 229, 255, 0.2), rgba(0, 229, 255, 0.7))',
                    boxShadow: '0 0 10px rgba(0,229,255,0.2)'
                  }} />
                  <span style={{ fontSize: 9, color: '#556677', textTransform: 'capitalize' }}>{mes}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Alertas */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {demandaContratada !== null && demandaMedida !== null && (
          <div style={{
            flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10,
            background: demandaMedida <= demandaContratada
              ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
            border: `1px solid ${demandaMedida <= demandaContratada
              ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 12 }}>
              {demandaMedida <= demandaContratada ? '✅' : '🚨'}
            </span>
            <span style={{ fontSize: 11, color: '#8899aa' }}>
              Demanda: <strong style={{
                color: demandaMedida <= demandaContratada ? '#22c55e' : '#ef4444',
                fontFamily: 'var(--font-mono)',
              }}>{demandaMedida}kW</strong> de {demandaContratada}kW
              {demandaMedida <= demandaContratada ? ' — dentro do limite' : ' — EXCEDEU'}
            </span>
          </div>
        )}
        {reativaPercent > 10 && (
          <div style={{
            flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.15)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 12 }}>⚠️</span>
            <span style={{ fontSize: 11, color: '#8899aa' }}>
              Reativa: <strong style={{ color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
                {fmtBrl(reativaTotal)}
              </strong> ({reativaPercent.toFixed(1)}%) — verificar fator de potência
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

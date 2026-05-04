'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { FAO_SOIL_TEXTURES, SOIL_TEXTURE_KEYS, type SoilTextureKey } from '@/lib/soil-textures'
import { calculateSoilProperties } from '@/lib/soil/saxton-rawls'
import { FlaskConical, TableProperties, CheckCircle2, AlertCircle, Sliders } from 'lucide-react'

type Mode = 'granulometric' | 'direct' | 'texture_table'

export interface SoilParamValues {
  soil_input_method: 'granulometric' | 'direct' | 'texture_table'
  // Granulométrico
  soil_sand_pct: number | null
  soil_silt_pct: number | null
  soil_clay_pct: number | null
  soil_organic_matter_pct: number | null
  soil_texture_class: string | null
  // Resultado / override manual
  field_capacity: number | null   // % volumétrico
  wilting_point: number | null    // % volumétrico
  bulk_density: number | null     // g/cm³
  // Textura FAO-56 (fallback)
  soil_texture: string | null
}

interface Props {
  value: SoilParamValues
  onChange: (v: SoilParamValues) => void
}

// Input numérico com suporte a vírgula
function NumInput({
  label, value, onChange, placeholder, unit, hint, error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  unit?: string
  hint?: string
  error?: string
}) {
  const handleChange = (raw: string) => {
    // Aceita vírgula como separador decimal
    onChange(raw.replace(',', '.'))
  }
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 5, fontWeight: 500 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => handleChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: unit ? '9px 40px 9px 12px' : '9px 12px',
            borderRadius: 8,
            fontSize: 14,
            background: '#0d1520',
            border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
            color: '#e2e8f0',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => { if (!error) e.target.style.borderColor = '#0093D0' }}
          onBlur={e => { e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)' }}
        />
        {unit && (
          <span style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 11, color: '#64748b', pointerEvents: 'none',
          }}>
            {unit}
          </span>
        )}
      </div>
      {hint && !error && (
        <p style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{hint}</p>
      )}
      {error && (
        <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{error}</p>
      )}
    </div>
  )
}

function GranulometricInput({ value, onChange }: Props) {
  const [sand, setSand] = useState(value.soil_sand_pct?.toString() ?? '')
  const [silt, setSilt] = useState(value.soil_silt_pct?.toString() ?? '')
  const [clay, setClay] = useState(value.soil_clay_pct?.toString() ?? '')
  const [om, setOm] = useState(value.soil_organic_matter_pct?.toString() ?? '')
  const [manualOverride, setManualOverride] = useState(false)
  const [manualCC, setManualCC] = useState(value.field_capacity?.toString() ?? '')
  const [manualPM, setManualPM] = useState(value.wilting_point?.toString() ?? '')
  const [manualDs, setManualDs] = useState(value.bulk_density?.toString() ?? '')

  const sandN  = parseFloat(sand)  || 0
  const siltN  = parseFloat(silt)  || 0
  const clayN  = parseFloat(clay)  || 0
  const omN    = parseFloat(om)

  const total = sandN + siltN + clayN
  const hasAll = sand !== '' && silt !== '' && clay !== ''
  const sumOk = hasAll && Math.abs(total - 100) <= 1

  // Validações individuais
  const omError = om !== '' && (!isNaN(omN) && (omN < 0 || omN > 15))
    ? 'MO entre 0 e 15%' : ''

  const properties = useMemo(() => {
    if (!sumOk) return null
    try {
      return calculateSoilProperties({
        sand: sandN, silt: siltN, clay: clayN,
        organicMatter: !isNaN(omN) && omN > 0 ? omN : undefined,
      })
    } catch { return null }
  }, [sandN, siltN, clayN, omN, sumOk])

  // Propaga ao parent quando calcula ou override muda
  const propagate = useCallback(() => {
    if (!properties) return
    if (manualOverride) {
      onChange({
        ...value,
        soil_input_method: 'granulometric',
        soil_sand_pct: sandN,
        soil_silt_pct: siltN,
        soil_clay_pct: clayN,
        soil_organic_matter_pct: !isNaN(omN) && omN > 0 ? omN : null,
        soil_texture_class: properties.textureClass,
        field_capacity: parseFloat(manualCC) || properties.fieldCapacityPct,
        wilting_point:  parseFloat(manualPM) || properties.wiltingPointPct,
        bulk_density:   parseFloat(manualDs) || properties.bulkDensity,
        soil_texture: null,
      })
    } else {
      onChange({
        ...value,
        soil_input_method: 'granulometric',
        soil_sand_pct: sandN,
        soil_silt_pct: siltN,
        soil_clay_pct: clayN,
        soil_organic_matter_pct: !isNaN(omN) && omN > 0 ? omN : null,
        soil_texture_class: properties.textureClass,
        field_capacity: properties.fieldCapacityPct,
        wilting_point:  properties.wiltingPointPct,
        bulk_density:   properties.bulkDensity,
        soil_texture: null,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, manualOverride, manualCC, manualPM, manualDs, sandN, siltN, clayN, omN])

  useEffect(() => { propagate() }, [propagate])

  // Pré-preenche campos manuais quando calcula
  useEffect(() => {
    if (properties && !manualOverride) {
      setManualCC(properties.fieldCapacityPct.toString())
      setManualPM(properties.wiltingPointPct.toString())
      setManualDs(properties.bulkDensity.toString())
    }
  }, [properties, manualOverride])

  const sumColor = !hasAll ? '#64748b' : sumOk ? '#22c55e' : '#f59e0b'
  const sumIcon = !hasAll ? null : sumOk
    ? <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
    : <AlertCircle  size={13} style={{ color: '#f59e0b' }} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
        Informe os percentuais da análise física do solo (laudo granulométrico):
      </p>

      {/* Grid Areia / Silte / Argila */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <NumInput label="Areia (%)" value={sand} onChange={setSand} placeholder="10.9" unit="%" />
        <NumInput label="Silte (%)" value={silt} onChange={setSilt} placeholder="28.2" unit="%" />
        <NumInput label="Argila (%)" value={clay} onChange={setClay} placeholder="60.9" unit="%" />
      </div>

      {/* Indicador de soma */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderRadius: 8,
        background: !hasAll ? 'rgba(255,255,255,0.02)' : sumOk ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
        border: `1px solid ${!hasAll ? 'rgba(255,255,255,0.06)' : sumOk ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
      }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Soma Areia+Silte+Argila</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {sumIcon}
          <span style={{ fontSize: 13, fontWeight: 600, color: sumColor, fontVariantNumeric: 'tabular-nums' }}>
            {hasAll ? `${total.toFixed(1)}%` : '—'}
          </span>
        </div>
      </div>

      {/* Matéria Orgânica */}
      <NumInput
        label="Matéria Orgânica (%) — opcional, melhora precisão"
        value={om}
        onChange={setOm}
        placeholder="2.5"
        unit="%"
        hint="Padrão: 2.5%. Entre 0 e 15%."
        error={omError}
      />

      {/* Card de classificação — aparece quando válido */}
      {properties && (
        <div style={{
          borderRadius: 12,
          border: '1px solid rgba(34,211,238,0.25)',
          background: 'rgba(34,211,238,0.04)',
          padding: '18px 20px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d3ee', flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#22d3ee', textTransform: 'uppercase' }}>
              Classificação Automática
            </span>
          </div>

          {/* Classe textural */}
          <p style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: '0 0 2px', letterSpacing: '-0.02em' }}>
            {properties.textureClass}
          </p>
          <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 16px' }}>
            Classificação automática pelo triângulo textural
          </p>

          {/* Métricas calculadas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, paddingTop: 14, borderTop: '1px solid rgba(34,211,238,0.12)' }}>
            {[
              { label: 'CC', value: `${properties.fieldCapacityPct.toFixed(1)}%`, sub: 'Cap. de Campo' },
              { label: 'PMP', value: `${properties.wiltingPointPct.toFixed(1)}%`, sub: 'Pto. de Murcha' },
              { label: 'Ds', value: `${properties.bulkDensity} g/cm³`, sub: 'Dens. do Solo' },
            ].map(m => (
              <div key={m.label}>
                <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: '0 0 1px', fontVariantNumeric: 'tabular-nums' }}>{m.value}</p>
                <p style={{ fontSize: 10, color: '#475569', margin: 0 }}>{m.sub}</p>
              </div>
            ))}
          </div>

          {/* CAD */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(34,211,238,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>CAD (água disponível = CC − PMP)</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#22d3ee', fontVariantNumeric: 'tabular-nums' }}>
              {(properties.availableWater * 100).toFixed(1)}%
            </span>
          </div>

          {/* Toggle override manual */}
          <button
            type="button"
            onClick={() => setManualOverride(v => !v)}
            style={{
              marginTop: 14, width: '100%', padding: '8px 0',
              borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.06)',
              background: manualOverride ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
              color: manualOverride ? '#f59e0b' : '#64748b',
            }}
          >
            {manualOverride ? '✓ Ajuste manual ativo' : 'Ajustar CC / PMP / Ds manualmente'}
          </button>

          {/* Campos de override */}
          {manualOverride && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <NumInput label="CC (%)" value={manualCC} onChange={setManualCC} placeholder={properties.fieldCapacityPct.toFixed(1)} unit="%" hint="Cap. de Campo" />
              <NumInput label="PMP (%)" value={manualPM} onChange={setManualPM} placeholder={properties.wiltingPointPct.toFixed(1)} unit="%" hint="Pto. de Murcha" />
              <NumInput label="Ds (g/cm³)" value={manualDs} onChange={setManualDs} placeholder={properties.bulkDensity.toString()} unit="g/cm³" hint="Dens. do Solo" />
            </div>
          )}
        </div>
      )}

      {/* Dica enquanto soma não fecha */}
      {hasAll && !sumOk && (
        <p style={{ fontSize: 12, color: '#f59e0b', lineHeight: 1.5, margin: 0 }}>
          ⚠️ A soma deve ser 100% (± 1%). Verifique os valores do laudo.
        </p>
      )}
    </div>
  )
}

function DirectInput({ value, onChange }: Props) {
  const [cc, setCc] = useState(value.field_capacity?.toString() ?? '')
  const [pm, setPm] = useState(value.wilting_point?.toString() ?? '')
  const [ds, setDs] = useState(value.bulk_density?.toString() ?? '')

  const ccN = parseFloat(cc)
  const pmN = parseFloat(pm)
  const dsN = parseFloat(ds)

  const ccErr = cc !== '' && (isNaN(ccN) || ccN <= 0 || ccN > 100) ? 'Entre 1 e 100%' : ''
  const pmErr = pm !== '' && (isNaN(pmN) || pmN <= 0 || pmN > 100) ? 'Entre 1 e 100%' : ''
  const dsErr = ds !== '' && (isNaN(dsN) || dsN < 0.5 || dsN > 2.5) ? 'Entre 0.5 e 2.5 g/cm³' : ''
  const orderErr = !ccErr && !pmErr && cc !== '' && pm !== '' && ccN <= pmN
    ? 'CC deve ser maior que PMP' : ''

  useEffect(() => {
    const valid = cc !== '' && pm !== '' && !ccErr && !pmErr && !orderErr
    onChange({
      ...value,
      soil_input_method: 'direct',
      field_capacity: valid ? ccN : null,
      wilting_point:  valid ? pmN : null,
      bulk_density:   ds !== '' && !dsErr ? dsN : null,
      soil_texture_class: null,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cc, pm, ds])

  const cad = !ccErr && !pmErr && !orderErr && cc !== '' && pm !== ''
    ? ccN - pmN : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
        Informe diretamente os valores do laudo de solo ou de tabelas de referência:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <NumInput label="Cap. Campo — CC (%)" value={cc} onChange={setCc} placeholder="30.5" unit="%" hint="% volumétrico" error={ccErr} />
        <NumInput label="Pto. Murcha — PMP (%)" value={pm} onChange={setPm} placeholder="16.1" unit="%" hint="% volumétrico" error={pmErr || orderErr} />
        <NumInput label="Dens. Solo — Ds (g/cm³)" value={ds} onChange={setDs} placeholder="1.2" unit="g/cm³" hint="Opcional" error={dsErr} />
      </div>

      {cad !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(34,197,94,0.05)',
          border: '1px solid rgba(34,197,94,0.18)',
        }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>CAD (água disponível = CC − PMP)</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>
            {cad.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}

function TextureTableInput({ value, onChange }: Props) {
  const soilTexture = (value.soil_texture ?? '') as SoilTextureKey | ''

  const handleSelect = (key: SoilTextureKey) => {
    const isDeselect = soilTexture === key
    if (isDeselect) {
      onChange({ ...value, soil_texture: null, soil_input_method: 'texture_table' })
    } else {
      const t = FAO_SOIL_TEXTURES[key]
      onChange({
        ...value,
        soil_texture: key,
        soil_input_method: 'texture_table',
        field_capacity: t.cc,
        wilting_point:  t.pm,
        bulk_density:   t.ds,
        soil_texture_class: t.label,
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
        Selecione a textura do solo para preencher automaticamente os valores de balanço hídrico:
      </p>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
        {SOIL_TEXTURE_KEYS.map(key => {
          const tex = FAO_SOIL_TEXTURES[key]
          const isSelected = soilTexture === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              style={{
                flexShrink: 0, width: 120,
                padding: '10px 10px 8px',
                borderRadius: 10,
                border: isSelected ? '1.5px solid #0093D0' : '1px solid rgba(255,255,255,0.08)',
                background: isSelected ? 'rgba(0,147,208,0.12)' : 'rgba(255,255,255,0.03)',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', outline: 'none',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: isSelected ? '#0093D0' : '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>
                {tex.label}
              </div>
              <div style={{ fontSize: 11, color: isSelected ? '#e2e8f0' : '#64748b', lineHeight: 1.4 }}>
                CC {tex.cc}% · PM {tex.pm}%
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                Ds {tex.ds} g/cm³
              </div>
              {isSelected && (
                <div style={{ marginTop: 5, fontSize: 9, color: '#0093D0', fontWeight: 600 }}>✓ SELECIONADO</div>
              )}
            </button>
          )
        })}
      </div>

      {soilTexture && (
        <p style={{ fontSize: 11, color: '#64748b', margin: 0, fontStyle: 'italic' }}>
          {FAO_SOIL_TEXTURES[soilTexture].hint} — valores preenchidos automaticamente.
        </p>
      )}
    </div>
  )
}

export function SoilParametersInput({ value, onChange }: Props) {
  const [mode, setMode] = useState<Mode>(value.soil_input_method ?? 'texture_table' as Mode)

  const handleModeChange = (m: Mode) => {
    setMode(m)
    onChange({ ...value, soil_input_method: m })
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 14px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#cbd5e1' }}>
          Parâmetros de Solo
        </span>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(0,229,255,0.3) 0%, rgba(255,255,255,0.02) 100%)' }} />
      </div>

      {/* Toggle de modo */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {([
          { m: 'texture_table' as Mode, icon: <TableProperties size={13} />, label: 'Não tenho análise',        activeColor: '#0093D0', activeBg: 'rgba(0,147,208,0.1)',  activeBorder: 'rgba(0,147,208,0.35)'  },
          { m: 'granulometric' as Mode, icon: <FlaskConical size={13} />,    label: 'Análise granulométrica',   activeColor: '#22d3ee', activeBg: 'rgba(34,211,238,0.1)', activeBorder: 'rgba(34,211,238,0.35)' },
          { m: 'direct'        as Mode, icon: <Sliders size={13} />,         label: 'Tenho CC / PMP / Ds',      activeColor: '#22c55e', activeBg: 'rgba(34,197,94,0.1)',  activeBorder: 'rgba(34,197,94,0.35)'  },
        ] as const).map(({ m, icon, label, activeColor, activeBg, activeBorder }) => (
          <button
            key={m}
            type="button"
            onClick={() => handleModeChange(m)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              background: mode === m ? activeBg : 'rgba(255,255,255,0.03)',
              border: `1px solid ${mode === m ? activeBorder : 'rgba(255,255,255,0.07)'}`,
              color: mode === m ? activeColor : '#64748b',
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo por modo */}
      {mode === 'granulometric' && <GranulometricInput value={value} onChange={onChange} />}
      {mode === 'direct'        && <DirectInput        value={value} onChange={onChange} />}
      {mode === 'texture_table' && <TextureTableInput  value={value} onChange={onChange} />}
    </div>
  )
}

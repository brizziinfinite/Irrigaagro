'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { listFarmsByCompany } from '@/services/farms'
import { listPivotsByFarmIds } from '@/services/pivots'
import { deleteRainfallRecord, listRainfallByPivotIds, upsertRainfallRecord, upsertRainfallRecords } from '@/services/rainfall'
import type { RainfallRecord } from '@/types/database'
import {
  ChevronLeft, ChevronRight, CloudRain, Upload, X,
  Calendar,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PivotOption {
  id: string
  name: string
  farm_name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseFlexDate(raw: string): string | null {
  const s = raw.trim()
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY or DD/MM/YY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

function rainfallColor(mm: number): { text: string; bg: string } {
  if (mm <= 0)    return { text: '#8899aa', bg: 'transparent' }
  if (mm < 10)   return { text: '#06b6d4', bg: 'rgb(6 182 212 / 0.08)' }
  if (mm < 30)   return { text: '#3b82f6', bg: 'rgb(59 130 246 / 0.12)' }
  return { text: '#1d4ed8', bg: 'rgb(29 78 216 / 0.18)' }
}

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAY_LABELS  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

// ─── Sub-components ───────────────────────────────────────────────────────────

function RainfallChips({
  records,
  selectedDate,
}: {
  records: RainfallRecord[]
  selectedDate: string
}) {
  const chips = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of records) map[r.date] = (map[r.date] ?? 0) + r.rainfall_mm

    const selD = new Date(selectedDate + 'T00:00:00')

    // Day
    const day = map[selectedDate] ?? 0

    // Week (Sun–Sat)
    const dow = selD.getDay()
    const weekDates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(selD)
      d.setDate(selD.getDate() - dow + i)
      weekDates.push(toYMD(d))
    }
    const week = weekDates.reduce((s, k) => s + (map[k] ?? 0), 0)

    // Month
    const prefix = selectedDate.slice(0, 7)
    const month = Object.entries(map).reduce((s, [k, v]) => k.startsWith(prefix) ? s + v : s, 0)

    // Year
    const yearPrefix = selectedDate.slice(0, 4)
    const year = Object.entries(map).reduce((s, [k, v]) => k.startsWith(yearPrefix) ? s + v : s, 0)

    return [
      { label: 'Dia',  value: day },
      { label: 'Semana', value: week },
      { label: 'Mês',  value: month },
      { label: 'Ano',  value: year },
    ]
  }, [records, selectedDate])

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {chips.map(c => (
        <div
          key={c.label}
          style={{
            padding: '6px 14px', borderRadius: 20,
            background: c.value > 0 ? 'rgb(6 182 212 / 0.1)' : '#0d1520',
            border: `1px solid ${c.value > 0 ? 'rgb(6 182 212 / 0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: c.value > 0 ? '#06b6d4' : '#556677',
            fontSize: 12, fontWeight: 600,
          }}
        >
          {c.label}: {c.value.toFixed(1)} mm
        </div>
      ))}
    </div>
  )
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function RainfallBarChart({ records, year, month }: { records: RainfallRecord[]; year: number; month: number }) {
  const [hovered, setHovered] = useState<number | null>(null)

  const data = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const map: Record<string, number> = {}
    for (const r of records) {
      const d = new Date(r.date + 'T00:00:00')
      if (d.getFullYear() === year && d.getMonth() === month) {
        map[d.getDate()] = (map[d.getDate()] ?? 0) + r.rainfall_mm
      }
    }
    return Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, mm: map[i + 1] ?? 0 }))
  }, [records, year, month])

  const maxMm = useMemo(() => Math.max(...data.map(d => d.mm), 1), [data])
  const avgMm = useMemo(() => data.reduce((s, d) => s + d.mm, 0) / data.length, [data])

  const H = 120
  const barW = 100 / data.length
  const avgY = H - (avgMm / maxMm) * (H - 10) - 4

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        {data.map((d, i) => {
          const barH = (d.mm / maxMm) * (H - 10)
          const x = i * barW
          return (
            <rect
              key={d.day}
              x={x + barW * 0.15}
              y={H - barH}
              width={barW * 0.7}
              height={barH}
              fill="url(#barGrad)"
              opacity={hovered === d.day ? 1 : 0.7}
              rx={1}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(d.day)}
              onMouseLeave={() => setHovered(null)}
            />
          )
        })}

        {/* Average line */}
        {avgMm > 0 && (
          <line
            x1={0} y1={avgY}
            x2={100} y2={avgY}
            stroke="#f59e0b"
            strokeWidth={0.4}
            strokeDasharray="2 1"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hovered !== null && (() => {
        const d = data.find(x => x.day === hovered)
        if (!d) return null
        const left = `${((hovered - 1) / data.length) * 100 + 50 / data.length}%`
        return (
          <div style={{
            position: 'absolute', top: 4, left,
            transform: 'translateX(-50%)',
            background: '#080e14', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 6, padding: '4px 8px',
            fontSize: 11, color: '#e2e8f0', whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 10,
          }}>
            Dia {d.day}: {d.mm.toFixed(1)} mm
          </div>
        )
      })()}
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  date: string
  pivotId: string
  existing: RainfallRecord | null
  onClose: () => void
  onSaved: () => Promise<void>
  onDeleted: () => Promise<void>
}

function EditModal({ date, pivotId, existing, onClose, onSaved, onDeleted }: EditModalProps) {
  const [value, setValue] = useState(existing ? String(existing.rainfall_mm) : '0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const displayDate = (() => {
    const [y, m, d] = date.split('-').map(Number)
    return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`
  })()

  async function handleSave() {
    try {
      setSaving(true)
      setError('')
      const mm = Number.parseFloat(value)

      if (!Number.isFinite(mm) || mm < 0) {
        setError('Informe uma precipitacao valida em mm.')
        setSaving(false)
        return
      }

      await upsertRainfallRecord({
        pivot_id: pivotId,
        date,
        rainfall_mm: mm,
        source: existing?.source ?? 'manual',
        updated_at: new Date().toISOString(),
      })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar precipitação')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!existing) { onClose(); return }
    try {
      setSaving(true)
      setError('')
      await deleteRainfallRecord(existing.id)
      await onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir precipitação')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgb(0 0 0 / 0.6)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 320, background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700 }}>
            Precipitação — {displayDate}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#556677', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {existing && (
          <div style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 20,
            background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', color: '#556677',
            alignSelf: 'flex-start',
          }}>
            Fonte: {existing.source === 'manual' ? 'Manual' : existing.source === 'import' ? 'Importação' : 'Estação'}
          </div>
        )}

        {error && (
          <div style={{
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgb(239 68 68 / 0.08)',
            border: '1px solid rgb(239 68 68 / 0.2)',
            color: '#fca5a5',
          }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ fontSize: 12, color: '#8899aa', display: 'block', marginBottom: 6 }}>
            Chuva (mm)
          </label>
          <input
            ref={inputRef}
            type="number"
            step="0.1"
            min="0"
            max="999"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)',
              color: '#e2e8f0', fontSize: 24, fontWeight: 700,
              outline: 'none', boxSizing: 'border-box',
              textAlign: 'center',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#0093D0',
              color: '#fff', fontWeight: 600, fontSize: 13,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          {existing && (
            <button
              onClick={handleClear}
              disabled={saving}
              style={{
                padding: '10px 14px', borderRadius: 8,
                background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)',
                color: '#8899aa', cursor: 'pointer', fontSize: 13,
              }}
            >
              Limpar
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
              color: '#556677', cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

interface ImportModalProps {
  pivotId: string
  allPivots: PivotOption[]
  onClose: () => void
  onImported: () => Promise<void>
}

interface SheetTab {
  name: string
  gid: string
}

/** Parseia CSV respeitando campos entre aspas e vírgula decimal */
function parseCsvLinePrecip(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  cols.push(cur.trim())
  return cols
}

/** Detecta índice de coluna pelo nome do cabeçalho (case-insensitive, parcial) */
function detectCol(headers: string[], keywords: string[]): string {
  for (const kw of keywords) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(kw.toLowerCase()))
    if (idx >= 0) return String(idx)
  }
  return '0'
}

function ImportModal({ pivotId, allPivots, onClose, onImported }: ImportModalProps) {
  const [url, setUrl]           = useState('')
  const [gid, setGid]           = useState('0')
  const [tabs, setTabs]         = useState<SheetTab[]>([])
  const [loadingTabs, setLoadingTabs] = useState(false)
  const [dateCol, setDateCol]   = useState('0')
  const [mmCol, setMmCol]       = useState('1')
  const [preview, setPreview]   = useState<string[][] | null>(null)
  const [headers, setHeaders]   = useState<string[]>([])
  const [loading, setLoading]   = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError]       = useState('')
  // Pivôs selecionados para importação (começa com o pivô atual)
  const [selectedPivotIds, setSelectedPivotIds] = useState<string[]>([pivotId])

  function extractSpreadsheetId(raw: string): string | null {
    const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return m ? m[1] : null
  }

  // Extrai GID da URL se presente (ex: #gid=123456)
  function extractGidFromUrl(raw: string): string | null {
    const m = raw.match(/[#&?]gid=(\d+)/)
    return m ? m[1] : null
  }

  // Busca abas da planilha via HTML público
  async function fetchTabs(sid: string) {
    setLoadingTabs(true)
    setTabs([])
    try {
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${sid}/edit`)
      if (!res.ok) { setLoadingTabs(false); return }
      const html = await res.text()
      // Google Sheets embeds sheet metadata as JSON in the HTML
      // Pattern: "name":"Sheet1","index":0,"sheetId":0
      const matches = [...html.matchAll(/"name":"([^"]+)","index":\d+,"sheetId":(\d+)/g)]
      if (matches.length > 0) {
        const found: SheetTab[] = matches.map(m => ({ name: m[1], gid: m[2] }))
        setTabs(found)
        setGid(found[0].gid)
      }
    } catch {
      // silently ignore — user can type GID manually
    }
    setLoadingTabs(false)
  }

  // Quando URL muda, tenta extrair GID e buscar abas
  function handleUrlChange(raw: string) {
    setUrl(raw)
    setPreview(null)
    setHeaders([])
    setTabs([])
    const sid = extractSpreadsheetId(raw)
    if (!sid) return
    const gidFromUrl = extractGidFromUrl(raw)
    if (gidFromUrl) setGid(gidFromUrl)
    fetchTabs(sid)
  }

  async function handleFetch() {
    setError('')
    const sid = extractSpreadsheetId(url)
    if (!sid) { setError('URL inválida. Cole a URL completa do Google Sheets.'); return }
    setLoading(true)
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sid}/export?format=csv&gid=${gid}`
      const res = await fetch(csvUrl)
      if (!res.ok) throw new Error(`Planilha não acessível (erro ${res.status}). Certifique-se de que está pública: Arquivo → Compartilhar → Qualquer pessoa com o link → Leitor.`)
      const text = await res.text()
      const rows = text.trim().split('\n').map(r => parseCsvLinePrecip(r))
      if (rows.length < 2) throw new Error('Planilha vazia ou sem dados.')
      const hdrs = rows[0]
      setHeaders(hdrs)
      setPreview(rows.slice(1, 6))
      // Auto-detectar colunas pelo cabeçalho
      setDateCol(detectCol(hdrs, ['data', 'date']))
      setMmCol(detectCol(hdrs, ['precipita', 'chuva', 'mm', 'rain']))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar planilha.')
    }
    setLoading(false)
  }

  const abortRef = useRef<AbortController | null>(null)

  async function handleImport() {
    const sid = extractSpreadsheetId(url)
    if (!sid) return
    setImporting(true)
    setProgress(0)
    setError('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sid}/export?format=csv&gid=${gid}`
      const res = await fetch(csvUrl, { signal: controller.signal })
      if (!res.ok) throw new Error(`Planilha não acessível (erro ${res.status}). Certifique-se de que está pública: Arquivo → Compartilhar → Qualquer pessoa com o link → Leitor.`)
      const text = await res.text()
      const rows = text.trim().split('\n').map(r => parseCsvLinePrecip(r))
      const dataRows = rows.slice(1).filter(r => r.length > Math.max(Number(dateCol), Number(mmCol)))

      if (selectedPivotIds.length === 0) throw new Error('Selecione ao menos um pivô para importar.')

      // Parseia datas e mm uma vez, replica para cada pivô selecionado
      const validRows: { date: string; rainfall_mm: number }[] = []
      let skippedRows = 0
      for (const row of dataRows) {
        const dateStr = parseFlexDate(row[Number(dateCol)])
        const mmRaw = row[Number(mmCol)].replace(',', '.')  // vírgula decimal → ponto
        const mm = parseFloat(mmRaw)
        if (!dateStr || isNaN(mm) || mm < 0) { skippedRows++; continue }
        validRows.push({ date: dateStr, rainfall_mm: mm })
      }

      if (validRows.length === 0) {
        throw new Error(`Nenhum registro válido encontrado. ${skippedRows} linha(s) com data ou valor inválido.`)
      }

      // Gera registros para todos os pivôs selecionados
      const parsed = validRows.flatMap(r =>
        selectedPivotIds.map(pid => ({ pivot_id: pid, date: r.date, rainfall_mm: r.rainfall_mm, source: 'import' as const }))
      )

      const chunkSize = 50
      for (let i = 0; i < parsed.length; i += chunkSize) {
        if (controller.signal.aborted) throw new Error('Importação cancelada.')
        await upsertRainfallRecords(parsed.slice(i, i + chunkSize))
        setProgress(Math.round(((i + chunkSize) / parsed.length) * 100))
      }

      const msg = `${validRows.length} registros importados para ${selectedPivotIds.length} pivô(s).` +
        (skippedRows > 0 ? ` ${skippedRows} linha(s) ignorada(s).` : '')
      setError(msg)

      await onImported()
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Erro durante importação.')
    } finally {
      abortRef.current = null
      setImporting(false)
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
    setImporting(false)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgb(0 0 0 / 0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700 }}>Importar Google Sheets</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#556677', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: '#8899aa' }}>
          A planilha deve ser pública (Arquivo → Compartilhar → Qualquer pessoa com o link).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#8899aa' }}>URL da Planilha</label>
          <input
            type="text"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={url}
            onChange={e => handleUrlChange(e.target.value)}
            style={{
              padding: '9px 12px', borderRadius: 8, background: '#0d1520',
              border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none',
            }}
          />
        </div>

        {/* Seletor de aba — auto-detectado ou manual */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#8899aa' }}>Aba</label>
            {loadingTabs && <span style={{ fontSize: 11, color: '#556677' }}>detectando abas…</span>}
            {tabs.length > 0 && <span style={{ fontSize: 11, color: '#0093D0' }}>{tabs.length} aba{tabs.length > 1 ? 's' : ''} encontrada{tabs.length > 1 ? 's' : ''}</span>}
          </div>
          {tabs.length > 0 ? (
            <select
              value={gid}
              onChange={e => { setGid(e.target.value); setPreview(null); setHeaders([]) }}
              style={{
                padding: '9px 12px', borderRadius: 8, background: '#0d1520',
                border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer',
              }}
            >
              {tabs.map(t => (
                <option key={t.gid} value={t.gid}>{t.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="GID da aba (padrão: 0)"
              value={gid}
              onChange={e => setGid(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: 8, background: '#0d1520',
                border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none',
              }}
            />
          )}
        </div>

        {/* Seletor de pivôs — múltipla seleção */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#8899aa' }}>Importar para os pivôs</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allPivots.map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#e2e8f0' }}>
                <input
                  type="checkbox"
                  checked={selectedPivotIds.includes(p.id)}
                  onChange={e => setSelectedPivotIds(prev =>
                    e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                  )}
                  style={{ accentColor: '#0093D0', width: 14, height: 14 }}
                />
                {p.farm_name} · {p.name}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#8899aa' }}>Coluna da Data (índice)</label>
            <select
              value={dateCol}
              onChange={e => setDateCol(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: 8, background: '#0d1520',
                border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none',
              }}
            >
              {headers.length > 0
                ? headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i}`}</option>)
                : [0,1,2,3,4].map(i => <option key={i} value={i}>Coluna {i}</option>)
              }
            </select>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#8899aa' }}>Coluna de mm (índice)</label>
            <select
              value={mmCol}
              onChange={e => setMmCol(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: 8, background: '#0d1520',
                border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none',
              }}
            >
              {headers.length > 0
                ? headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i}`}</option>)
                : [0,1,2,3,4].map(i => <option key={i} value={i}>Coluna {i}</option>)
              }
            </select>
          </div>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: 'rgb(239 68 68 / 0.08)', borderRadius: 8 }}>
            {error}
          </p>
        )}

        <button
          onClick={handleFetch}
          disabled={loading || !url}
          style={{
            padding: '10px', borderRadius: 8, cursor: 'pointer',
            background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)',
            color: '#e2e8f0', fontWeight: 600, fontSize: 13,
            opacity: loading || !url ? 0.5 : 1,
          }}
        >
          {loading ? 'Buscando…' : 'Pré-visualizar'}
        </button>

        {preview && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} style={{ padding: '6px 10px', background: '#0d1520', color: '#8899aa', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {h || `Col ${i}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: '5px 10px', color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importing && (
              <div>
                <div style={{ height: 6, borderRadius: 3, background: '#0d1520', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#003d5c,#3b82f6)', borderRadius: 3, transition: 'width 0.2s' }} />
                </div>
                <p style={{ fontSize: 11, color: '#556677', marginTop: 4 }}>{progress}%</p>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importing}
              style={{
                padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#0093D0',
                color: '#fff', fontWeight: 600, fontSize: 13,
                opacity: importing ? 0.7 : 1,
              }}
            >
              {importing ? `Importando… ${progress}%` : `Importar registros`}
            </button>
            {importing && (
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgb(239 68 68 / 0.3)',
                  color: '#ef4444', fontWeight: 600, fontSize: 13,
                }}
              >
                Cancelar
              </button>
            )}
          </>
        )}

        <p style={{ fontSize: 11, color: '#556677' }}>
          Formatos de data aceitos: YYYY-MM-DD · DD/MM/YYYY · DD/MM/YY
        </p>
      </div>
    </div>
  )
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

interface CalendarProps {
  year: number
  month: number
  records: RainfallRecord[]
  selectedDate: string
  onSelectDate: (date: string) => void
}

function MonthCalendar({ year, month, records, selectedDate, onSelectDate }: CalendarProps) {
  const today = toYMD(new Date())

  const recordMap = useMemo(() => {
    const m: Record<string, RainfallRecord> = {}
    for (const r of records) m[r.date] = r
    return m
  }, [records])

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevDays = new Date(year, month, 0).getDate()
    const result: { date: string; day: number; inMonth: boolean }[] = []
    // prev month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevDays - i
      const mo = month === 0 ? 12 : month
      const y2 = month === 0 ? year - 1 : year
      result.push({ date: `${y2}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, day: d, inMonth: false })
    }
    // current month
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ date: `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, day: d, inMonth: true })
    }
    // next month padding to complete grid
    const rem = 7 - (result.length % 7)
    if (rem < 7) {
      const nextMo = month === 11 ? 1 : month + 2
      const nextY  = month === 11 ? year + 1 : year
      for (let d = 1; d <= rem; d++) {
        result.push({ date: `${nextY}-${String(nextMo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, day: d, inMonth: false })
      }
    }
    return result
  }, [year, month])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#556677', padding: '4px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map(cell => {
          const rec = recordMap[cell.date]
          const mm = rec?.rainfall_mm ?? 0
          const col = rainfallColor(mm)
          const isToday = cell.date === today
          const isSelected = cell.date === selectedDate

          return (
            <div
              key={cell.date}
              onClick={() => cell.inMonth && onSelectDate(cell.date)}
              style={{
                minHeight: 64,
                borderRadius: 8,
                padding: '6px 8px',
                background: isSelected ? 'rgb(0 147 208 / 0.10)' : col.bg,
                border: `1px solid ${isToday ? '#0093D0' : isSelected ? 'rgb(0 147 208 / 0.35)' : 'rgba(255,255,255,0.06)'}`,
                cursor: cell.inMonth ? 'pointer' : 'default',
                opacity: cell.inMonth ? 1 : 0.25,
                display: 'flex', flexDirection: 'column', gap: 2,
                transition: 'background 0.1s',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: 11, fontWeight: isToday ? 700 : 500,
                  color: isToday ? '#0093D0' : '#8899aa',
                }}>
                  {cell.day}
                </span>
                {mm > 0 && <CloudRain size={10} color={col.text} />}
              </div>

              {mm > 0 && (
                <div style={{ textAlign: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: col.text, lineHeight: 1 }}>
                    {mm % 1 === 0 ? mm : mm.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 9, color: col.text, marginLeft: 2 }}>mm</span>
                </div>
              )}

              {mm >= 30 && (
                <div style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 10,
                  background: 'rgb(29 78 216 / 0.2)', color: '#3b82f6',
                  alignSelf: 'center', fontWeight: 600,
                }}>
                  forte
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PrecipitacoesPage() {
  const { company, loading: authLoading } = useAuth()
  const today = new Date()
  const [pivots, setPivots] = useState<PivotOption[]>([])
  const [pivotId, setPivotId] = useState<string>('')
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [records, setRecords] = useState<RainfallRecord[]>([])
  const [selectedDate, setSelectedDate] = useState(toYMD(today))
  const [editModal, setEditModal] = useState<{ date: string } | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [loadingPivots, setLoadingPivots] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')

  // Load pivots
  useEffect(() => {
    if (authLoading) return

    if (!company?.id) {
      setPivots([])
      setPivotId('')
      setRecords([])
      setEditModal(null)
      setShowImport(false)
      setLoadingPivots(false)
      setLoadError('Nenhuma empresa ativa encontrada.')
      return
    }

    let cancelled = false

    const loadPivots = async () => {
      try {
        setLoadingPivots(true)
        setLoadError('')
        const farms = await listFarmsByCompany(company.id)
        const pivotRows = await listPivotsByFarmIds(farms.map((farm) => farm.id))
        const farmMap = new Map(farms.map((farm) => [farm.id, farm.name]))
        const options: PivotOption[] = pivotRows.map((pivot) => ({
          id: pivot.id,
          name: pivot.name,
          farm_name: pivot.farms?.name ?? farmMap.get(pivot.farm_id) ?? '',
        }))

        if (cancelled) return

        setPivots(options)
        setPivotId((current) => {
          if (current && options.some((pivot) => pivot.id === current)) return current
          return options[0]?.id ?? ''
        })
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Falha ao carregar pivôs')
          setPivots([])
          setPivotId('')
          setRecords([])
          setEditModal(null)
          setShowImport(false)
        }
      } finally {
        if (!cancelled) {
          setLoadingPivots(false)
        }
      }
    }

    loadPivots()

    return () => {
      cancelled = true
    }
  }, [authLoading, company?.id])

  // Load records for visible range (year)
  const loadRecords = useCallback(async (pid: string, y: number) => {
    if (!pid) {
      setRecords([])
      return
    }
    try {
      setLoadingRecords(true)
      setLoadError('')
      setActionError('')
      const data = await listRainfallByPivotIds([pid])
      setRecords(
        data
          .filter((record) => record.date >= `${y}-01-01` && record.date <= `${y}-12-31`)
          .sort((a, b) => a.date.localeCompare(b.date))
      )
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao carregar precipitações')
      setRecords([])
    } finally {
      setLoadingRecords(false)
    }
  }, [])

  useEffect(() => {
    if (pivotId) {
      loadRecords(pivotId, year)
      return
    }

    setRecords([])
    setEditModal(null)
    setShowImport(false)
  }, [pivotId, year, loadRecords])

  const editingRecord = useMemo(() => {
    if (!editModal) return null
    return records.find(r => r.date === editModal.date) ?? null
  }, [editModal, records])

  async function handleSaved() {
    if (!pivotId) return
    try {
      await loadRecords(pivotId, year)
      setEditModal(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao recarregar precipitações')
    }
  }

  async function handleDeleted() {
    if (!pivotId) return
    try {
      await loadRecords(pivotId, year)
      setEditModal(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao recarregar precipitações')
    }
  }

  async function handleImported() {
    if (!pivotId) return
    try {
      await loadRecords(pivotId, year)
      setShowImport(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao recarregar precipitações')
    }
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelectedDate(toYMD(today))
  }

  const monthRecords = useMemo(
    () => records.filter(r => r.date.startsWith(`${year}-${String(month + 1).padStart(2,'0')}`)),
    [records, year, month]
  )

  const selectedPivot = pivots.find(p => p.id === pivotId)

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0c4a6e, #0284c7)',
            boxShadow: '0 2px 8px rgb(2 132 199 / 0.3)',
          }}>
            <CloudRain size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>Precipitações</h1>
            {selectedPivot && (
              <p style={{ fontSize: 12, color: '#556677' }}>{selectedPivot.farm_name} · {selectedPivot.name}</p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Pivot selector */}
          <select
            value={pivotId}
            onChange={e => setPivotId(e.target.value)}
            disabled={loadingPivots || pivots.length === 0}
            style={{
              padding: '8px 12px', borderRadius: 8,
              background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)',
              color: '#e2e8f0', fontSize: 13, outline: 'none', cursor: 'pointer',
            }}
          >
            {pivots.map(p => (
              <option key={p.id} value={p.id}>{p.farm_name} · {p.name}</option>
            ))}
          </select>

          {/* Import button */}
          <button
            onClick={() => setShowImport(true)}
            disabled={!pivotId}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)',
              color: '#8899aa', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            }}
          >
            <Upload size={14} />
            Importar
          </button>
        </div>
        </div>

      {loadError && (
        <div style={{
          padding: '14px 16px',
          background: 'rgb(239 68 68 / 0.08)',
          border: '1px solid rgb(239 68 68 / 0.2)',
          borderRadius: 12,
          color: '#fca5a5',
          fontSize: 13,
        }}>
          {loadError}
        </div>
      )}

      {actionError && (
        <div style={{
          padding: '14px 16px',
          background: 'rgb(245 158 11 / 0.08)',
          border: '1px solid rgb(245 158 11 / 0.2)',
          borderRadius: 12,
          color: '#fcd34d',
          fontSize: 13,
        }}>
          {actionError}
        </div>
      )}

      {!loadingPivots && pivots.length === 0 && (
        <div style={{
          padding: '40px 24px', textAlign: 'center',
          background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
          color: '#556677', fontSize: 14,
        }}>
          <Calendar size={32} color="rgba(255,255,255,0.06)" style={{ margin: '0 auto 12px' }} />
          Nenhum pivô cadastrado. Cadastre um pivô para registrar precipitações.
        </div>
      )}

      {pivotId && (
        <>
          {/* Totals chips */}
          <RainfallChips records={records} selectedDate={selectedDate} />

          {/* Month navigation */}
          <div style={{
            background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <button
                onClick={prevMonth}
                style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#8899aa' }}
              >
                <ChevronLeft size={16} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                  {MONTH_NAMES[month]} {year}
                </h2>
                {loadingRecords && <span style={{ fontSize: 11, color: '#556677' }}>carregando…</span>}
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={goToday}
                  style={{
                    background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
                    padding: '6px 12px', cursor: 'pointer', color: '#8899aa', fontSize: 12,
                  }}
                >
                  Hoje
                </button>
                <button
                  onClick={nextMonth}
                  style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#8899aa' }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <MonthCalendar
              year={year}
              month={month}
              records={monthRecords}
              selectedDate={selectedDate}
              onSelectDate={date => {
                setSelectedDate(date)
                setEditModal({ date })
              }}
            />
          </div>

          {/* Bar chart */}
          <div style={{
            background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#8899aa' }}>Distribuição diária — {MONTH_NAMES[month]}</span>
              <div style={{ width: 10, height: 2, background: '#f59e0b', borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: '#556677' }}>média mensal</span>
            </div>
            <RainfallBarChart records={monthRecords} year={year} month={month} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#556677' }}>1</span>
              <span style={{ fontSize: 10, color: '#556677' }}>{new Date(year, month + 1, 0).getDate()}</span>
            </div>
          </div>
        </>
      )}

      {/* Edit modal — only render if pivotId belongs to loaded (company-filtered) pivots */}
      {editModal && pivotId && pivots.some(p => p.id === pivotId) && (
        <EditModal
          date={editModal.date}
          pivotId={pivotId}
          existing={editingRecord}
          onClose={() => setEditModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {/* Import modal — only render if pivotId belongs to loaded (company-filtered) pivots */}
      {showImport && pivotId && pivots.some(p => p.id === pivotId) && (
        <ImportModal
          pivotId={pivotId}
          allPivots={pivots}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}
    </div>
  )
}

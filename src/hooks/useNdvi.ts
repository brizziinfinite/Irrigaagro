'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface NdviRegistro {
  id: string
  pivot_id: string
  data_imagem: string
  ndvi_medio: number | null
  ndvi_min: number | null
  ndvi_max: number | null
  imagem_url: string | null
  cobertura_nuvens_pct: number | null
  fonte: string
  created_at: string
}

export interface NdviTalhaoResponse {
  pivot_id?: string
  talhao_id?: string
  pivot_name: string
  entity_name?: string
  historico: NdviRegistro[]
  alertas: string[]
  error?: string
  message?: string
}

export interface NdviComparativoItem {
  pivot_id: string
  atual: NdviRegistro | null
  anterior: NdviRegistro | null
  tendencia: 'subindo' | 'caindo' | 'estavel' | null
  variacaoPct: number | null
}

export function classificarNdvi(ndvi: number | null) {
  if (ndvi === null) return { label: 'Sem dado', cor: '#9ca3af', corFundo: '#f3f4f6' }
  if (ndvi >= 0.7) return { label: 'Excelente', cor: '#15803d', corFundo: '#dcfce7' }
  if (ndvi >= 0.5) return { label: 'Bom', cor: '#16a34a', corFundo: '#f0fdf4' }
  if (ndvi >= 0.35) return { label: 'Moderado', cor: '#ca8a04', corFundo: '#fefce8' }
  if (ndvi >= 0.2) return { label: 'Estressado', cor: '#ea580c', corFundo: '#fff7ed' }
  return { label: 'Crítico', cor: '#dc2626', corFundo: '#fef2f2' }
}

// ── NDVI de múltiplos pivôs (leitura direta no banco) ─────────────────────
export function useNdviMultiplos(pivotIds: string[]) {
  const [data, setData] = useState<NdviRegistro[]>([])
  const pivotKey = pivotIds.join(',')

  useEffect(() => {
    if (!pivotKey) return
    const supabase = createClient()
    supabase
      .from('ndvi_cache')
      .select('pivot_id, data_imagem, ndvi_medio, ndvi_min, ndvi_max, cobertura_nuvens_pct, id, imagem_url, fonte, created_at')
      .in('pivot_id', pivotIds)
      .order('data_imagem', { ascending: false })
      .then(({ data: rows }) => {
        const porPivot = new Map<string, NdviRegistro>()
        for (const r of rows ?? []) {
          if (!porPivot.has(r.pivot_id)) porPivot.set(r.pivot_id, r as NdviRegistro)
        }
        setData(Array.from(porPivot.values()))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotKey])

  return data
}

// ── Comparativo: 2 últimas leituras por pivô ──────────────────────────────
export function useNdviComparativo(pivotIds: string[]) {
  const [data, setData] = useState<NdviComparativoItem[]>([])
  const pivotKey = pivotIds.join(',')

  useEffect(() => {
    if (!pivotKey) return
    const supabase = createClient()
    supabase
      .from('ndvi_cache')
      .select('*')
      .in('pivot_id', pivotIds)
      .order('data_imagem', { ascending: false })
      .then(({ data: rows }) => {
        const porPivot = new Map<string, NdviRegistro[]>()
        for (const r of rows ?? []) {
          const lista = porPivot.get(r.pivot_id) ?? []
          if (lista.length < 2) {
            lista.push(r as NdviRegistro)
            porPivot.set(r.pivot_id, lista)
          }
        }
        const result = pivotIds.map((id): NdviComparativoItem => {
          const lista = porPivot.get(id) ?? []
          const atual = lista[0] ?? null
          const anterior = lista[1] ?? null
          let tendencia: 'subindo' | 'caindo' | 'estavel' | null = null
          let variacaoPct: number | null = null
          if (atual?.ndvi_medio != null && anterior?.ndvi_medio != null && anterior.ndvi_medio > 0) {
            const diff = atual.ndvi_medio - anterior.ndvi_medio
            variacaoPct = (diff / anterior.ndvi_medio) * 100
            if (variacaoPct > 2) tendencia = 'subindo'
            else if (variacaoPct < -2) tendencia = 'caindo'
            else tendencia = 'estavel'
          }
          return { pivot_id: id, atual, anterior, tendencia, variacaoPct }
        })
        setData(result)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotKey])

  return data
}

// ── Detalhe de um pivô via edge function ──────────────────────────────────
export function useNdvi(pivotId: string | null) {
  const [data, setData] = useState<NdviTalhaoResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const prevPivot = useRef<string | null>(null)

  useEffect(() => {
    if (!pivotId || pivotId === prevPivot.current) return
    prevPivot.current = pivotId
    setLoading(true)
    const supabase = createClient()
    supabase
      .from('ndvi_cache')
      .select('*')
      .eq('pivot_id', pivotId)
      .order('data_imagem', { ascending: true })
      .then(({ data: rows }) => {
        setData({
          pivot_id: pivotId,
          pivot_name: '',
          historico: (rows ?? []) as NdviRegistro[],
          alertas: [],
        })
        setLoading(false)
      })
  }, [pivotId])

  return { data, loading }
}

// ── Refresh via edge function ─────────────────────────────────────────────
export function useRefreshNdvi() {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<NdviTalhaoResponse | null>(null)

  const mutate = useCallback(async (pivotId: string, onSuccess?: (data: NdviTalhaoResponse) => void) => {
    setPending(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke('ndvi-fetch', {
        body: { pivot_id: pivotId, forcar_refresh: true },
      })
      if (error) throw new Error(error.message)
      const res = data as NdviTalhaoResponse
      setResult(res)
      onSuccess?.(res)
    } finally {
      setPending(false)
    }
  }, [])

  return { mutate, pending, result }
}

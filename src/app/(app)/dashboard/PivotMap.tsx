'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { DailyManagement } from '@/types/database'
import { buildSectorPolygon, calcIrrigatedAreaHa } from '@/lib/map-utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type IrrigationStatus = 'azul' | 'verde' | 'amarelo' | 'vermelho' | 'sem_safra'

interface MapPivot {
  id: string
  name: string
  farm_name: string
  latitude: number | null
  longitude: number | null
  status: IrrigationStatus
  lastManagement: DailyManagement | null
  length_m: number | null
  sector_start_deg: number | null
  sector_end_deg: number | null
}

interface PivotMapProps {
  pivots: MapPivot[]
  onPivotClick?: (pivotId: string) => void
}

// ─── Status colors ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<IrrigationStatus, { fill: string; stroke: string; label: string }> = {
  azul:      { fill: '#06b6d4', stroke: '#0891b2', label: 'Irrigando' },
  verde:     { fill: '#22c55e', stroke: '#16a34a', label: 'OK' },
  amarelo:   { fill: '#f59e0b', stroke: '#d97706', label: 'Atenção' },
  vermelho:  { fill: '#ef4444', stroke: '#dc2626', label: 'Irrigar Agora' },
  sem_safra: { fill: '#556677', stroke: 'rgba(255,255,255,0.06)', label: 'Sem safra' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PivotMap({ pivots, onPivotClick }: PivotMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)

  const pivotsWithCoords = pivots.filter(p => p.latitude !== null && p.longitude !== null)

  useEffect(() => {
    if (!mapRef.current || pivotsWithCoords.length === 0) return

    // Destroy previous instance before async import
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    let cancelled = false

    // Dynamic import to avoid SSR
    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return

      // Fix default icon paths for Next.js
      // @ts-expect-error leaflet icon workaround
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const lats = pivotsWithCoords.map(p => p.latitude as number)
      const lngs = pivotsWithCoords.map(p => p.longitude as number)
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2

      const map = L.map(mapRef.current!, {
        center: [centerLat, centerLng],
        zoom: 12,
        zoomControl: true,
        attributionControl: false,
      })

      mapInstanceRef.current = map

      // Dark satellite-style tile
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri',
        maxZoom: 19,
      }).addTo(map)

      // Overlay: labels
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.6,
      }).addTo(map)

      // Markers per pivot
      for (const pivot of pivotsWithCoords) {
        const col = STATUS_COLORS[pivot.status]
        const m = pivot.lastManagement
        const lat = pivot.latitude as number
        const lng = pivot.longitude as number

        const pct = m?.field_capacity_percent ?? null

        // ── Real geometry layer (behind markers) ──
        if (pivot.length_m && pivot.length_m > 0) {
          const isFullCircle = pivot.sector_start_deg === null || pivot.sector_end_deg === null
          if (isFullCircle) {
            L.circle([lat, lng], {
              radius: pivot.length_m,
              color: col.stroke,
              weight: 1.5,
              fillColor: col.fill,
              fillOpacity: 0.12,
              interactive: false,
            }).addTo(map)
          } else {
            const coords = buildSectorPolygon(lat, lng, pivot.length_m, pivot.sector_start_deg, pivot.sector_end_deg)
            L.polygon(coords, {
              color: col.stroke,
              weight: 1.5,
              fillColor: col.fill,
              fillOpacity: 0.12,
              interactive: false,
            }).addTo(map)
          }
        }

        // ── Area calculation for popup ──
        const areaHa = pivot.length_m
          ? calcIrrigatedAreaHa(pivot.length_m, pivot.sector_start_deg, pivot.sector_end_deg)
          : null

        // Build popup HTML
        const barWidth = pct !== null ? Math.min(100, Math.max(0, pct)) : 0
        const barColor = col.fill

        const popupHtml = `
          <div style="
            font-family: system-ui, sans-serif;
            background: #0f1923;
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            padding: 14px 16px;
            min-width: 200px;
            color: #e2e8f0;
          ">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <div style="
                width:8px;height:8px;border-radius:50%;
                background:${col.fill};
                box-shadow:0 0 6px ${col.fill};
              "></div>
              <strong style="font-size:14px;">${pivot.name}</strong>
            </div>
            <p style="font-size:11px;color:#556677;margin:0 0 10px;">${pivot.farm_name}</p>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
              <div style="background:#0d1520;border-radius:8px;padding:8px;text-align:center;">
                <div style="font-size:15px;font-weight:700;color:#e2e8f0;">${m?.eto_mm != null ? m.eto_mm.toFixed(1) : '—'}</div>
                <div style="font-size:10px;color:#556677;">ETo (mm)</div>
              </div>
              <div style="background:#0d1520;border-radius:8px;padding:8px;text-align:center;">
                <div style="font-size:15px;font-weight:700;color:#e2e8f0;">${m?.etc_mm != null ? m.etc_mm.toFixed(1) : '—'}</div>
                <div style="font-size:10px;color:#556677;">ETc (mm)</div>
              </div>
              <div style="background:#0d1520;border-radius:8px;padding:8px;text-align:center;">
                <div style="font-size:15px;font-weight:700;color:#e2e8f0;">${m?.rainfall_mm != null ? m.rainfall_mm.toFixed(1) : '—'}</div>
                <div style="font-size:10px;color:#556677;">Chuva</div>
              </div>
            </div>

            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="font-size:10px;color:#556677;">Cap. Campo</span>
                <span style="font-size:10px;font-weight:600;color:${barColor};">${pct !== null ? pct.toFixed(0) + '%' : '—'}</span>
              </div>
              <div style="height:5px;background:#0d1520;border-radius:99px;overflow:hidden;">
                <div style="width:${barWidth}%;height:100%;background:${barColor};border-radius:99px;"></div>
              </div>
            </div>

            ${areaHa !== null ? `
            <div style="margin-top:8px;font-size:11px;color:#556677;">
              Área: <strong style="color:#8899aa;">${areaHa.toFixed(1)} ha</strong>
            </div>
            ` : ''}

            <div style="
              margin-top:10px;padding:4px 10px;border-radius:20px;
              background:${col.fill}20;border:1px solid ${col.fill}40;
              display:inline-flex;align-items:center;gap:5px;
            ">
              <span style="width:6px;height:6px;border-radius:50%;background:${col.fill};display:inline-block;"></span>
              <span style="font-size:11px;font-weight:600;color:${col.fill};">${col.label}</span>
            </div>
          </div>
        `

        // Custom circle marker
        const circleMarker = L.circleMarker([lat, lng], {
          radius: 14,
          fillColor: col.fill,
          fillOpacity: 0.85,
          color: col.stroke,
          weight: 2,
        })

        // Pulse ring effect via SVG overlay
        const pulseIcon = L.divIcon({
          className: '',
          html: `
            <div style="position:relative;width:40px;height:40px;transform:translate(-50%,-50%);">
              <div style="
                position:absolute;inset:0;
                border-radius:50%;
                background:${col.fill};
                opacity:0.2;
                animation:irrigaPulse 2s ease-out infinite;
              "></div>
              <div style="
                position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                width:22px;height:22px;border-radius:50%;
                background:${col.fill};
                border:2.5px solid ${col.stroke};
                box-shadow:0 2px 8px ${col.fill}80;
                display:flex;align-items:center;justify-content:center;
              ">
                <span style="font-size:9px;font-weight:800;color:#fff;">
                  ${pct !== null ? Math.round(pct) : '?'}
                </span>
              </div>
            </div>
          `,
          iconAnchor: [0, 0],
        })

        const marker = L.marker([lat, lng], {
          icon: pulseIcon,
          zIndexOffset: pivot.status === 'vermelho' ? 100 : 0,
        })

        marker.bindTooltip(popupHtml, {
          direction: 'top',
          className: 'irrigaagro-popup',
          opacity: 1
        })
        
        marker.on('click', () => {
          if (onPivotClick) onPivotClick(pivot.id)
        })

        marker.addTo(map)
        circleMarker.addTo(map)
      }

      // Fit bounds — include geometry extents
      const allPoints: [number, number][] = pivotsWithCoords.map(p => [p.latitude as number, p.longitude as number])
      if (pivotsWithCoords.length === 1) {
        const p = pivotsWithCoords[0]
        if (p.length_m && p.length_m > 0) {
          const coords = buildSectorPolygon(p.latitude as number, p.longitude as number, p.length_m, p.sector_start_deg, p.sector_end_deg)
          allPoints.push(...coords)
        }
      }
      if (allPoints.length > 1) {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [90, 90] })
      }
    })

    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      // Clear Leaflet's internal ID so the container can be reused
      if (mapRef.current) {
        delete (mapRef.current as HTMLDivElement & { _leaflet_id?: number })._leaflet_id
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotsWithCoords.length])

  if (pivotsWithCoords.length === 0) {
    return (
      <div style={{
        background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16,
        padding: '20px 24px', color: '#556677', fontSize: 13, textAlign: 'center',
      }}>
        Nenhum pivô com coordenadas cadastradas.{' '}
        <a href="/pivos" style={{ color: '#0093D0', textDecoration: 'none' }}>
          Adicione latitude/longitude nos pivôs
        </a>{' '}
        para ver o mapa.
      </div>
    )
  }

  // Unique farm names for header
  const farmNames = [...new Set(pivots.map(p => p.farm_name).filter(Boolean))]
  const farmLabel = farmNames.length === 1 ? farmNames[0] : farmNames.length > 1 ? `${farmNames.length} fazendas` : ''

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: '#0f1923' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 18px',
        background: '#0d1520',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: '#556677',
        }}>
          Mapa dos Pivôs
        </span>
        {farmLabel && (
          <span style={{ fontSize: 11, color: '#8899aa' }}>— {farmLabel}</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 4px #22c55e' }} />
          <span style={{ fontSize: 10, color: '#556677' }}>{pivotsWithCoords.length} pivô{pivotsWithCoords.length !== 1 ? 's' : ''} no mapa</span>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
      {/* CSS: pulse animation + popup style */}
      <style>{`
        @keyframes irrigaPulse {
          0%   { transform: scale(0.8); opacity: 0.4; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        .irrigaagro-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .irrigaagro-popup .leaflet-popup-content {
          margin: 0 !important;
        }
        .irrigaagro-popup .leaflet-popup-tip-container {
          display: none !important;
        }
        .leaflet-container {
          background: #080e14 !important;
          font-family: system-ui, sans-serif !important;
        }
        .leaflet-control-zoom a {
          background: #0f1923 !important;
          border-color: rgba(255,255,255,0.06) !important;
          color: #8899aa !important;
        }
        .leaflet-control-zoom a:hover {
          background: #0d1520 !important;
          color: #e2e8f0 !important;
        }
      `}</style>

      <div ref={mapRef} style={{ height: 340, width: '100%' }} />

      {/* Legend overlay */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 1000,
        background: 'rgba(8,14,20,0.88)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10, padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 5,
        backdropFilter: 'blur(4px)',
      }}>
        {(Object.entries(STATUS_COLORS) as [IrrigationStatus, typeof STATUS_COLORS[IrrigationStatus]][]).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: val.fill,
              boxShadow: `0 0 4px ${val.fill}`,
            }} />
            <span style={{ fontSize: 11, color: '#8899aa' }}>{val.label}</span>
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}

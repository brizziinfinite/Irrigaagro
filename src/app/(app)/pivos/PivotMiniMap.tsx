'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { buildSectorPolygon } from '@/lib/map-utils'

export interface PivotMiniMapProps {
  latitude: number | null
  longitude: number | null
  lengthM: number | null
  sectorStart: number | null
  sectorEnd: number | null
  onLocationChange: (lat: number, lng: number) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletModule = typeof import('leaflet') & { [key: string]: any }

export function PivotMiniMap({
  latitude,
  longitude,
  lengthM,
  sectorStart,
  sectorEnd,
  onLocationChange,
}: PivotMiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geometryRef = useRef<any>(null)
  const leafletRef = useRef<LeafletModule | null>(null)

  // ── Effect 1: mount map once ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return

      leafletRef.current = L as LeafletModule

      // Fix default icon for Next.js
      // @ts-expect-error leaflet icon workaround
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const defaultLat = latitude ?? -22.879060
      const defaultLng = longitude ?? -50.362105

      const map = L.map(mapRef.current!, {
        center: [defaultLat, defaultLng],
        zoom: latitude ? 14 : 12,
        zoomControl: true,
        attributionControl: false,
      })

      mapInstanceRef.current = map

      // Satellite tiles
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri',
        maxZoom: 19,
      }).addTo(map)

      // Label overlay
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.6,
      }).addTo(map)

      // Click to set location
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        onLocationChange(e.latlng.lat, e.latlng.lng)
      })

      // Initial marker if coords exist
      if (latitude !== null && longitude !== null) {
        markerRef.current = L.marker([latitude, longitude], { draggable: true })
          .addTo(map)
          .on('dragend', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
            const latlng = e.target.getLatLng()
            onLocationChange(latlng.lat, latlng.lng)
          })
      }
    })

    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      if (mapRef.current) {
        delete (mapRef.current as HTMLDivElement & { _leaflet_id?: number })._leaflet_id
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Effect 2: update marker + geometry on prop changes ───────────────────
  useEffect(() => {
    const L = leafletRef.current
    const map = mapInstanceRef.current
    if (!L || !map) return

    // Update marker
    if (latitude !== null && longitude !== null) {
      if (markerRef.current) {
        markerRef.current.setLatLng([latitude, longitude])
      } else {
        markerRef.current = L.marker([latitude, longitude], { draggable: true })
          .addTo(map)
          .on('dragend', (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
            const latlng = e.target.getLatLng()
            onLocationChange(latlng.lat, latlng.lng)
          })
      }
    } else if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }

    // Remove old geometry layer
    if (geometryRef.current) {
      geometryRef.current.remove()
      geometryRef.current = null
    }

    // Draw new geometry
    if (latitude !== null && longitude !== null && lengthM && lengthM > 0) {
      const isFullCircle = sectorStart === null || sectorEnd === null
      if (isFullCircle) {
        geometryRef.current = L.circle([latitude, longitude], {
          radius: lengthM,
          color: '#0093D0',
          weight: 2,
          fillColor: '#0093D0',
          fillOpacity: 0.15,
          interactive: false,
        }).addTo(map)
      } else {
        const coords = buildSectorPolygon(latitude, longitude, lengthM, sectorStart, sectorEnd)
        geometryRef.current = L.polygon(coords, {
          color: '#0093D0',
          weight: 2,
          fillColor: '#0093D0',
          fillOpacity: 0.15,
          interactive: false,
        }).addTo(map)
      }

      // Fit map to show geometry
      const pts = buildSectorPolygon(latitude, longitude, lengthM, sectorStart, sectorEnd)
      if (pts.length > 1) {
        map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] })
      }
    } else if (latitude !== null && longitude !== null) {
      map.setView([latitude, longitude], 14)
    }
  }, [latitude, longitude, lengthM, sectorStart, sectorEnd, onLocationChange])

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
      <style>{`
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
      <div ref={mapRef} style={{ height: 240, width: '100%' }} />
      {/* Hint overlay */}
      {(latitude === null || longitude === null) && (
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(8,14,20,0.82)', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
          padding: '5px 14px', fontSize: 11, color: '#8899aa',
          pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 1000,
        }}>
          Clique para posicionar o centro do pivô
        </div>
      )}
    </div>
  )
}

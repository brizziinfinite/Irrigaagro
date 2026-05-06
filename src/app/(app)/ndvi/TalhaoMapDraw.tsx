'use client'

import { useEffect, useRef } from 'react'

interface Props {
  existingPolygon?: Record<string, unknown> | null
  onPolygonChange: (geojson: Record<string, unknown> | null) => void
  height?: number
  centerLat?: number
  centerLng?: number
}

export function TalhaoMapDraw({
  existingPolygon,
  onPolygonChange,
  height = 360,
  centerLat = -22.88,
  centerLng = -50.36,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)
  const drawnLayerRef = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false

    async function init() {
      const L = (await import('leaflet')).default
      // @ts-expect-error CSS module import
      await import('leaflet/dist/leaflet.css')
      await import('@geoman-io/leaflet-geoman-free')
      // @ts-expect-error CSS module import
      await import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css')

      if (cancelled || !containerRef.current) return

      // Fix default icon
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(containerRef.current!, { zoomControl: true }).setView(
        [centerLat, centerLng],
        15
      )
      mapRef.current = map

      // Satellite tiles
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Esri', maxZoom: 19 }
      ).addTo(map)

      // Geoman controls — só polígono
      ;(map as unknown as { pm: { addControls: (opts: Record<string, unknown>) => void } }).pm.addControls({
        position: 'topleft',
        drawMarker: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawRectangle: true,
        drawPolygon: true,
        drawCircle: false,
        drawText: false,
        editMode: true,
        dragMode: false,
        cutPolygon: false,
        removalMode: true,
        rotateMode: false,
      })

      // Load existing polygon
      if (existingPolygon) {
        try {
          const layer = L.geoJSON(existingPolygon as unknown as Parameters<typeof L.geoJSON>[0])
          layer.addTo(map)
          drawnLayerRef.current = layer
          map.fitBounds(layer.getBounds(), { padding: [20, 20] })
        } catch (e) {
          console.error('Error loading existing polygon:', e)
        }
      }

      // Helper to extract GeoJSON from layer
      function extractGeoJSON(layer: unknown): Record<string, unknown> | null {
        try {
          const lWithToGeoJSON = layer as { toGeoJSON?: () => { geometry: Record<string, unknown> } }
          if (lWithToGeoJSON.toGeoJSON) {
            return lWithToGeoJSON.toGeoJSON().geometry as Record<string, unknown>
          }
        } catch { /* ignore */ }
        return null
      }

      // Events
      const mapWithPm = map as unknown as {
        on: (event: string, cb: (e: { layer: unknown }) => void) => void
      }

      mapWithPm.on('pm:create', (e) => {
        // Remove previous drawn layer
        if (drawnLayerRef.current) {
          ;(map as unknown as { removeLayer: (l: unknown) => void }).removeLayer(drawnLayerRef.current)
        }
        drawnLayerRef.current = e.layer
        const geo = extractGeoJSON(e.layer)
        onPolygonChange(geo)
      })

      mapWithPm.on('pm:remove', () => {
        drawnLayerRef.current = null
        onPolygonChange(null)
      })

      // Edit finish
      ;(map as unknown as { on: (e: string, cb: () => void) => void }).on('pm:edit', () => {
        if (drawnLayerRef.current) {
          const geo = extractGeoJSON(drawnLayerRef.current)
          onPolygonChange(geo)
        }
      })
    }

    init()

    return () => {
      cancelled = true
      if (mapRef.current) {
        ;(mapRef.current as { remove: () => void }).remove()
        mapRef.current = null
        drawnLayerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ height, borderRadius: 12, overflow: 'hidden' }} />
      <div style={{
        position: 'absolute', bottom: 8, right: 8, zIndex: 1000,
        background: 'rgba(13,21,32,0.85)', borderRadius: 8, padding: '5px 10px',
        fontSize: 10, color: '#8899aa', pointerEvents: 'none',
      }}>
        Clique no ícone de polígono para desenhar · clique duplo para fechar
      </div>
    </div>
  )
}

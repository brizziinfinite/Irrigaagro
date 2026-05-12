'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  existingPolygon?: Record<string, unknown> | null
  onPolygonChange: (geojson: Record<string, unknown> | null) => void
  onDrawingChange?: (drawing: boolean) => void
  height?: number
  centerLat?: number
  centerLng?: number
}

export function TalhaoMapDraw({
  existingPolygon,
  onPolygonChange,
  onDrawingChange,
  height = 460,
  centerLat = -22.88,
  centerLng = -50.36,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)
  const drawnLayersRef = useRef<unknown[]>([])
  const [polyCount, setPolyCount] = useState(0)
  const [isDrawing, setIsDrawing] = useState(false)

  // Helper: build GeoJSON from all drawn layers
  function buildGeoJSON(layers: unknown[]): Record<string, unknown> | null {
    if (layers.length === 0) return null

    const polys: unknown[][] = []
    for (const layer of layers) {
      try {
        const lWithToGeoJSON = layer as { toGeoJSON?: () => { geometry: { type: string; coordinates: unknown[][] } } }
        if (lWithToGeoJSON.toGeoJSON) {
          const geo = lWithToGeoJSON.toGeoJSON().geometry
          if (geo.type === 'Polygon') {
            polys.push(geo.coordinates as unknown[])
          } else if (geo.type === 'MultiPolygon') {
            // Rectangle from geoman comes as Polygon, but handle MultiPolygon too
            for (const coords of geo.coordinates) polys.push(coords as unknown[])
          }
        }
      } catch { /* ignore */ }
    }

    if (polys.length === 0) return null
    if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0] }
    return { type: 'MultiPolygon', coordinates: polys }
  }

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

      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Esri', maxZoom: 19 }
      ).addTo(map)

      // Geoman controls
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

      // Load existing polygon/multipolygon
      if (existingPolygon) {
        try {
          const geo = existingPolygon as { type: string }
          if (geo.type === 'MultiPolygon') {
            // Load each polygon as separate layer
            const featureCollection = {
              type: 'FeatureCollection',
              features: (existingPolygon as { coordinates: unknown[][] }).coordinates.map(coords => ({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: coords },
                properties: {},
              }))
            }
            const layerGroup = L.geoJSON(featureCollection as unknown as Parameters<typeof L.geoJSON>[0])
            layerGroup.addTo(map)
            layerGroup.eachLayer((l) => {
              drawnLayersRef.current.push(l)
            })
            setPolyCount(drawnLayersRef.current.length)
            map.fitBounds(layerGroup.getBounds(), { padding: [20, 20] })
          } else {
            const layer = L.geoJSON(existingPolygon as unknown as Parameters<typeof L.geoJSON>[0])
            layer.addTo(map)
            layer.eachLayer((l) => {
              drawnLayersRef.current.push(l)
            })
            setPolyCount(drawnLayersRef.current.length)
            map.fitBounds(layer.getBounds(), { padding: [20, 20] })
          }
        } catch (e) {
          console.error('Error loading existing polygon:', e)
        }
      }

      const mapWithPm = map as unknown as {
        on: (event: string, cb: (e: { layer: unknown }) => void) => void
      }

      // Track drawing state
      ;(map as unknown as { on: (e: string, cb: () => void) => void }).on('pm:drawstart', () => {
        setIsDrawing(true)
        onDrawingChange?.(true)
      })
      ;(map as unknown as { on: (e: string, cb: () => void) => void }).on('pm:drawend', () => {
        setIsDrawing(false)
        onDrawingChange?.(false)
      })

      // Accumulate layers — DON'T remove previous
      mapWithPm.on('pm:create', (e) => {
        drawnLayersRef.current = [...drawnLayersRef.current, e.layer]
        const count = drawnLayersRef.current.length
        setPolyCount(count)
        const geo = buildGeoJSON(drawnLayersRef.current)
        onPolygonChange(geo)
      })

      mapWithPm.on('pm:remove', (e) => {
        drawnLayersRef.current = drawnLayersRef.current.filter(l => l !== e.layer)
        const count = drawnLayersRef.current.length
        setPolyCount(count)
        const geo = buildGeoJSON(drawnLayersRef.current)
        onPolygonChange(geo)
      })

      ;(map as unknown as { on: (e: string, cb: () => void) => void }).on('pm:edit', () => {
        const geo = buildGeoJSON(drawnLayersRef.current)
        onPolygonChange(geo)
      })
    }

    init()

    return () => {
      cancelled = true
      if (mapRef.current) {
        ;(mapRef.current as { remove: () => void }).remove()
        mapRef.current = null
        drawnLayersRef.current = []
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ height, borderRadius: 12, overflow: 'hidden' }} />

      {/* Status overlay */}
      <div style={{
        position: 'absolute', bottom: 8, left: 8, right: 8, zIndex: 1000,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        pointerEvents: 'none',
      }}>
        {/* Instrução */}
        <div style={{
          background: 'rgba(13,21,32,0.88)', borderRadius: 8, padding: '5px 10px',
          fontSize: 11, color: '#8899aa',
        }}>
          {isDrawing
            ? '📍 Clique para adicionar pontos · duplo-clique para fechar'
            : 'Clique em 📐 para desenhar · pode adicionar múltiplas áreas'}
        </div>

        {/* Contador de polígonos */}
        {polyCount > 0 && (
          <div style={{
            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 8, padding: '5px 10px', fontSize: 11,
            color: '#4ade80', fontWeight: 600,
          }}>
            {polyCount} área{polyCount !== 1 ? 's' : ''} desenhada{polyCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

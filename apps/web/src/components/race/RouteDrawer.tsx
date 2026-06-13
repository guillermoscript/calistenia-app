import { useEffect, useRef, useCallback, useState } from 'react'
import type L from 'leaflet'
import { cn } from '../../lib/utils'

interface RouteDrawerProps {
  points: Array<{ lat: number; lng: number }>
  onChange: (points: Array<{ lat: number; lng: number }>) => void
  height?: string
  className?: string
}

const TILES_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const TILES_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'

const START_COLOR = '#22c55e'
const END_COLOR = '#ef4444'
const MID_COLOR = '#9ca3af'   // gray-400
const LINE_COLOR = '#a3e635'  // lime-400

const DEFAULT_CENTER: [number, number] = [10.48, -66.90] // Caracas
const DEFAULT_ZOOM = 13
const ME_COLOR = '#a3e635' // lime-400

// Inject pulse style once
let pulseInjected = false
function injectMePulse() {
  if (pulseInjected) return
  pulseInjected = true
  const el = document.createElement('style')
  el.textContent = `
.route-me-marker {
  width: 18px; height: 18px;
  background: ${ME_COLOR};
  border: 3px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 0 ${ME_COLOR}80;
  animation: route-me-pulse 1.5s ease-out infinite;
}
@keyframes route-me-pulse {
  0%   { box-shadow: 0 0 0 0 ${ME_COLOR}80; }
  70%  { box-shadow: 0 0 0 14px ${ME_COLOR}00; }
  100% { box-shadow: 0 0 0 0 ${ME_COLOR}00; }
}`
  document.head.appendChild(el)
}

export default function RouteDrawer({ points, onChange, height = '250px', className }: RouteDrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.LayerGroup | null>(null)
  const meLayerRef = useRef<L.LayerGroup | null>(null)
  const meWatchIdRef = useRef<number | null>(null)
  const leafletRef = useRef<typeof L | null>(null)
  const [ready, setReady] = useState(false)
  const [debug, setDebug] = useState<string>('init...')
  const [permDenied, setPermDenied] = useState(false)
  const hasPannedToMeRef = useRef(false)
  const drawMeRef = useRef<((pos: GeolocationPosition, source: string) => void) | null>(null)
  // Keep a ref to points so the click handler always sees the latest
  const pointsRef = useRef(points)
  pointsRef.current = points

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Draw/redraw markers and polyline
  const redraw = useCallback(() => {
    const map = mapRef.current
    const layers = layersRef.current
    const leaflet = leafletRef.current
    if (!map || !layers || !leaflet) return

    layers.clearLayers()
    const pts = pointsRef.current
    if (pts.length === 0) return

    // Polyline
    if (pts.length > 1) {
      leaflet.polyline(
        pts.map(p => [p.lat, p.lng] as [number, number]),
        { color: LINE_COLOR, weight: 3, opacity: 0.85, lineCap: 'round', lineJoin: 'round' },
      ).addTo(layers)
    }

    pts.forEach((p, i) => {
      const isStart = i === 0
      const isEnd = i === pts.length - 1 && pts.length > 1

      const color = isStart ? START_COLOR : isEnd ? END_COLOR : MID_COLOR
      const radius = isStart || isEnd ? 7 : 4

      const marker = leaflet.circleMarker([p.lat, p.lng], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 1,
        weight: 2,
      }).addTo(layers)

      // Tap existing point to remove it
      marker.on('click', (e: L.LeafletMouseEvent) => {
        leaflet.DomEvent.stopPropagation(e)
        const next = pointsRef.current.filter((_, idx) => idx !== i)
        onChangeRef.current(next)
      })
    })
  }, [])

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    ;(async () => {
      const [leaflet] = await Promise.all([
        import('leaflet').then(m => m.default),
        import('leaflet/dist/leaflet.css'),
      ])
      if (cancelled) return

      leafletRef.current = leaflet

      // Try to get user location for initial center
      let center: [number, number] = DEFAULT_CENTER
      let zoom = DEFAULT_ZOOM
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
        )
        center = [pos.coords.latitude, pos.coords.longitude]
      } catch {
        // Use default center
      }

      if (cancelled) return

      const map = leaflet.map(containerRef.current!, {
        zoomControl: false,
        attributionControl: false,
        center,
        zoom,
      })

      leaflet.tileLayer(TILES_URL, {
        attribution: TILES_ATTR,
        maxZoom: 19,
        // @ts-expect-error -- retina tiles
        r: leaflet.Browser.retina ? '@2x' : '',
      }).addTo(map)

      leaflet.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)
      leaflet.control.zoom({ position: 'bottomleft' }).addTo(map)

      layersRef.current = leaflet.layerGroup().addTo(map)
      meLayerRef.current = leaflet.layerGroup().addTo(map)
      mapRef.current = map

      // Dialog animates open — container may be 0×0 on mount. Force Leaflet to
      // recompute size after layout settles, and watch the container for resizes.
      setTimeout(() => map.invalidateSize(), 100)
      setTimeout(() => map.invalidateSize(), 350)
      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        const ro = new ResizeObserver(() => map.invalidateSize())
        ro.observe(containerRef.current)
        ;(map as any).__ro = ro
      }

      // Click on map → add waypoint
      map.on('click', (e: L.LeafletMouseEvent) => {
        const next = [...pointsRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }]
        onChangeRef.current(next)
      })

      // Watch user position — draw pulsing "TÚ" marker, separate layer so it doesn't
      // interfere with waypoint click-to-remove
      injectMePulse()
      const hasGeo = !!navigator.geolocation
      setDebug(hasGeo ? 'waiting GPS...' : 'no geolocation API')

      const drawMe = (pos: GeolocationPosition, source: string) => {
        setPermDenied(false)
        if (cancelled) return
        const meLayers = meLayerRef.current
        const lf = leafletRef.current
        if (!meLayers || !lf) { setDebug(`${source} but layers not ready`); return }
        setDebug(`✓ ${source} lat=${pos.coords.latitude.toFixed(4)} acc=${Math.round(pos.coords.accuracy)}m`)
        meLayers.clearLayers()
        // SVG circleMarkers — no CSS dependency, always render
        lf.circleMarker([pos.coords.latitude, pos.coords.longitude], {
          radius: 14, color: ME_COLOR, fillColor: ME_COLOR, fillOpacity: 0.18, weight: 2, interactive: false,
        }).addTo(meLayers)
        lf.circleMarker([pos.coords.latitude, pos.coords.longitude], {
          radius: 7, color: '#ffffff', fillColor: ME_COLOR, fillOpacity: 1, weight: 3, interactive: false,
        }).addTo(meLayers)
        if (!hasPannedToMeRef.current) {
          hasPannedToMeRef.current = true
          const m = mapRef.current
          if (m && pointsRef.current.length === 0) m.setView([pos.coords.latitude, pos.coords.longitude], 16)
          setTimeout(() => m?.invalidateSize(), 50)
        }
      }

      drawMeRef.current = drawMe

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => drawMe(pos, 'first'),
          (err) => {
            setDebug(`getCurrentPosition err code=${err.code}: ${err.message}`)
            if (err.code === 1) setPermDenied(true)
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
        )
        meWatchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => drawMe(pos, 'watch'),
          (err) => {
            setDebug(`watch err code=${err.code}: ${err.message}`)
            if (err.code === 1) setPermDenied(true)
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
        )
      }

      setReady(true)
      // Initial draw if points already exist
      redraw()
    })()

    return () => {
      cancelled = true
      if (meWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(meWatchIdRef.current)
        meWatchIdRef.current = null
      }
      ;(mapRef.current as any)?.__ro?.disconnect?.()
      mapRef.current?.remove()
      mapRef.current = null
      layersRef.current = null
      meLayerRef.current = null
      setReady(false)
    }
  }, [redraw])

  // Redraw when points change
  useEffect(() => {
    if (!ready) return
    redraw()
  }, [points, redraw, ready])

  const handleUndo = () => {
    if (points.length === 0) return
    onChange(points.slice(0, -1))
  }

  const handleClear = () => {
    if (points.length === 0) return
    onChange([])
  }

  const handleRequestLocation = () => {
    if (!navigator.geolocation) return
    setDebug('requesting permission...')
    navigator.geolocation.getCurrentPosition(
      (pos) => drawMeRef.current?.(pos, 'manual'),
      (err) => {
        setDebug(`manual err code=${err.code}: ${err.message}`)
        if (err.code === 1) setPermDenied(true)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  return (
    <div className="space-y-1">
      {/* Permission denied banner with retry */}
      {permDenied && (
        <div className="rounded bg-amber-500/15 border border-amber-500/40 px-3 py-2 text-xs text-amber-300 flex items-center justify-between gap-2">
          <span>Sin permiso de ubicación</span>
          <button
            type="button"
            onClick={handleRequestLocation}
            className="rounded bg-amber-500 text-zinc-900 px-2 py-1 text-[11px] font-bebas tracking-widest"
          >
            ACTIVAR GPS
          </button>
        </div>
      )}
      {/* Debug panel — can remove later */}
      <div className="rounded bg-red-500/10 border border-red-500/30 px-2 py-1 text-[9px] font-mono text-red-300 break-words">
        [v2] {debug}
      </div>
      <div className={cn('relative rounded-xl overflow-hidden', className)} style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />

      {/* Controls overlay */}
      <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
        <button
          type="button"
          onClick={handleUndo}
          disabled={points.length === 0}
          className="rounded bg-gray-900/80 px-2 py-1 text-xs text-white disabled:opacity-40"
        >
          Deshacer
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={points.length === 0}
          className="rounded bg-gray-900/80 px-2 py-1 text-xs text-white disabled:opacity-40"
        >
          Limpiar
        </button>
      </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '../../lib/utils'
import { snapToRoads } from '../../lib/snapToRoads'
import type { GpsPoint } from '../../types'

interface RouteMapProps {
  points: GpsPoint[]
  height?: string
  className?: string
  /** Show a pulsing marker at the last point (for live tracking) */
  live?: boolean
  /** Activity type — used to pick the right OSRM profile for road snapping */
  activityType?: 'running' | 'walking' | 'cycling'
}

// Voyager: a lighter, more readable CARTO style with labels and soft colors
const TILES_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const TILES_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'

const START_COLOR = '#22c55e' // green-500 (start pin — always green)
const END_COLOR = '#ef4444'   // red-500  (finish pin — always red)

/** Read the --lime CSS variable and convert to a usable hex/hsl string */
function getLimeColor(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--lime').trim()
  return raw ? `hsl(${raw})` : '#16a34a'
}

/** Build pulse CSS using the current theme lime color */
function buildPulseCSS(color: string): string {
  return `
.live-marker {
  width: 16px; height: 16px;
  background: ${color};
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 0 ${color}80;
  animation: live-pulse 1.5s ease-out infinite;
}
@keyframes live-pulse {
  0%   { box-shadow: 0 0 0 0 ${color}80; }
  70%  { box-shadow: 0 0 0 14px ${color}00; }
  100% { box-shadow: 0 0 0 0 ${color}00; }
}
`
}

let pulseStyleEl: HTMLStyleElement | null = null
function injectPulseStyle(color: string) {
  if (!pulseStyleEl) {
    pulseStyleEl = document.createElement('style')
    document.head.appendChild(pulseStyleEl)
  }
  pulseStyleEl.textContent = buildPulseCSS(color)
}

export default function RouteMap({ points, height = '300px', className, live = false, activityType }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.LayerGroup | null>(null)
  const [snappedCoords, setSnappedCoords] = useState<[number, number][] | null>(null)

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    })

    L.tileLayer(TILES_URL, {
      attribution: TILES_ATTR,
      maxZoom: 19,
      // @ts-expect-error -- retina tiles
      r: L.Browser.retina ? '@2x' : '',
    }).addTo(map)

    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    layersRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layersRef.current = null
    }
  }, [])

  // Snap to roads for non-live views
  useEffect(() => {
    if (live || points.length < 2) {
      setSnappedCoords(null)
      return
    }

    let cancelled = false
    const profile = activityType === 'cycling' ? 'cycling' : 'foot'

    snapToRoads(points, profile).then(coords => {
      if (!cancelled) setSnappedCoords(coords)
    })

    return () => { cancelled = true }
  }, [points, live, activityType])

  // Update route layers when points or snapped coords change
  useEffect(() => {
    const map = mapRef.current
    const layers = layersRef.current
    if (!map || !layers || points.length === 0) return

    layers.clearLayers()

    const routeColor = getLimeColor()

    // Use snapped coordinates for the route line if available, raw GPS otherwise
    const routeCoords: L.LatLngTuple[] = (snappedCoords && !live)
      ? snappedCoords.map(([lat, lng]) => [lat, lng] as L.LatLngTuple)
      : points.map(p => [p.lat, p.lng] as L.LatLngTuple)

    // Original GPS start/end for markers (always use raw points)
    const rawCoords = points.map(p => [p.lat, p.lng] as L.LatLngTuple)

    // Route polyline (snapped or raw)
    const polyline = L.polyline(routeCoords, {
      color: routeColor,
      weight: 4,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layers)

    // Start marker (always at raw GPS start)
    L.circleMarker(rawCoords[0], {
      radius: 7,
      color: START_COLOR,
      fillColor: START_COLOR,
      fillOpacity: 1,
      weight: 2,
    }).addTo(layers)

    // End / live marker (always at raw GPS end)
    if (rawCoords.length > 1) {
      const lastCoord = rawCoords[rawCoords.length - 1]

      if (live) {
        injectPulseStyle(routeColor)
        const icon = L.divIcon({
          className: '',
          html: '<div class="live-marker"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        })
        L.marker(lastCoord, { icon }).addTo(layers)
      } else {
        L.circleMarker(lastCoord, {
          radius: 7,
          color: END_COLOR,
          fillColor: END_COLOR,
          fillOpacity: 1,
          weight: 2,
        }).addTo(layers)
      }
    }

    // Fit bounds
    map.fitBounds(polyline.getBounds(), { padding: [30, 30] })
  }, [points, snappedCoords, live])

  if (points.length === 0) {
    return (
      <div className={cn('flex items-center justify-center bg-muted/50 rounded-xl', className)} style={{ height }}>
        <span className="text-sm text-muted-foreground">Sin datos de ruta</span>
      </div>
    )
  }

  return <div ref={containerRef} className={cn('rounded-xl overflow-hidden', className)} style={{ height }} />
}

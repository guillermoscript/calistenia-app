import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GpsPoint } from '../../types'

interface RouteMapProps {
  points: GpsPoint[]
  height?: string
  className?: string
  /** Show a pulsing marker at the last point (for live tracking) */
  live?: boolean
}

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const DARK_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'

const ROUTE_COLOR = '#c8f542'
const START_COLOR = '#22c55e'
const END_COLOR = '#ef4444'

/** CSS for the pulsing live-position marker — injected once */
const PULSE_CSS = `
.live-marker {
  width: 16px; height: 16px;
  background: ${ROUTE_COLOR};
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(200, 245, 66, 0.6);
  animation: live-pulse 1.5s ease-out infinite;
}
@keyframes live-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(200, 245, 66, 0.6); }
  70%  { box-shadow: 0 0 0 14px rgba(200, 245, 66, 0); }
  100% { box-shadow: 0 0 0 0 rgba(200, 245, 66, 0); }
}
`

let pulseStyleInjected = false
function injectPulseStyle() {
  if (pulseStyleInjected) return
  const style = document.createElement('style')
  style.textContent = PULSE_CSS
  document.head.appendChild(style)
  pulseStyleInjected = true
}

export default function RouteMap({ points, height = '300px', className = '', live = false }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.LayerGroup | null>(null)

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    })

    L.tileLayer(DARK_TILES, {
      attribution: DARK_ATTR,
      maxZoom: 19,
      // @ts-expect-error -- retina tiles
      r: L.Browser.retina ? '@2x' : '',
    }).addTo(map)

    // Compact attribution in bottom-right
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

  // Update route layers when points change
  useEffect(() => {
    const map = mapRef.current
    const layers = layersRef.current
    if (!map || !layers || points.length === 0) return

    layers.clearLayers()

    const coords = points.map(p => [p.lat, p.lng] as L.LatLngTuple)

    // Route polyline
    const polyline = L.polyline(coords, {
      color: ROUTE_COLOR,
      weight: 4,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layers)

    // Start marker
    L.circleMarker(coords[0], {
      radius: 7,
      color: START_COLOR,
      fillColor: START_COLOR,
      fillOpacity: 1,
      weight: 2,
    }).addTo(layers)

    // End / live marker
    if (coords.length > 1) {
      const lastCoord = coords[coords.length - 1]

      if (live) {
        injectPulseStyle()
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
  }, [points, live])

  if (points.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-muted/50 rounded-xl ${className}`} style={{ height }}>
        <span className="text-sm text-muted-foreground">Sin datos de ruta</span>
      </div>
    )
  }

  return <div ref={containerRef} className={`rounded-xl overflow-hidden ${className}`} style={{ height }} />
}

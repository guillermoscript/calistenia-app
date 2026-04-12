import { useEffect, useRef, useState } from 'react'
import type L from 'leaflet'
import { cn } from '../../lib/utils'

export interface RaceMapMarker {
  id: string
  lat: number
  lng: number
  label: string
  isMe?: boolean
  isLeader?: boolean
}

interface RaceMapProps {
  routePoints?: Array<{ lat: number; lng: number }> | null
  markers?: RaceMapMarker[]
  height?: string
  className?: string
}

const TILES_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const TILES_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'

const START_COLOR = '#22c55e'
const END_COLOR = '#ef4444'
const LINE_COLOR = '#a3e635'
const OTHER_COLOR = '#3b82f6'

function getLimeColor(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--lime').trim()
  return raw ? `hsl(${raw})` : '#a3e635'
}

export default function RaceMap({ routePoints, markers, height = '240px', className }: RaceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const leafletRef = useRef<typeof L | null>(null)
  const hasFitRef = useRef(false)
  const [ready, setReady] = useState(false)

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
      const map = leaflet.map(containerRef.current!, {
        zoomControl: false,
        attributionControl: false,
      })
      map.setView([0, 0], 2)
      leaflet.tileLayer(TILES_URL, {
        attribution: TILES_ATTR,
        maxZoom: 19,
        // @ts-expect-error retina
        r: leaflet.Browser.retina ? '@2x' : '',
      }).addTo(map)
      leaflet.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)
      leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
      routeLayerRef.current = leaflet.layerGroup().addTo(map)
      markerLayerRef.current = leaflet.layerGroup().addTo(map)
      mapRef.current = map
      setReady(true)
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      routeLayerRef.current = null
      markerLayerRef.current = null
      hasFitRef.current = false
      setReady(false)
    }
  }, [])

  // Draw route
  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    const layers = routeLayerRef.current
    const leaflet = leafletRef.current
    if (!map || !layers || !leaflet) return
    layers.clearLayers()
    if (!routePoints || routePoints.length === 0) return

    const coords = routePoints.map(p => [p.lat, p.lng] as [number, number])
    const polyline = leaflet.polyline(coords, {
      color: LINE_COLOR,
      weight: 3,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layers)
    leaflet.circleMarker(coords[0], {
      radius: 7, color: START_COLOR, fillColor: START_COLOR, fillOpacity: 1, weight: 2,
    }).addTo(layers)
    if (coords.length > 1) {
      leaflet.circleMarker(coords[coords.length - 1], {
        radius: 7, color: END_COLOR, fillColor: END_COLOR, fillOpacity: 1, weight: 2,
      }).addTo(layers)
    }
    if (!hasFitRef.current) {
      map.fitBounds(polyline.getBounds(), { padding: [30, 30] })
      hasFitRef.current = true
    }
  }, [routePoints, ready])

  // Draw markers
  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    const layers = markerLayerRef.current
    const leaflet = leafletRef.current
    if (!map || !layers || !leaflet) return
    layers.clearLayers()
    if (!markers || markers.length === 0) return

    const valid = markers.filter(m =>
      m.lat != null && m.lng != null &&
      !(m.lat === 0 && m.lng === 0) &&
      Math.abs(m.lat) <= 90 && Math.abs(m.lng) <= 180,
    )
    const limeColor = getLimeColor()

    valid.filter(m => !m.isMe).forEach(m => {
      leaflet.circleMarker([m.lat, m.lng], {
        radius: m.isLeader ? 6 : 5,
        color: m.isLeader ? limeColor : OTHER_COLOR,
        fillColor: m.isLeader ? limeColor : OTHER_COLOR,
        fillOpacity: 0.9,
        weight: 2,
      })
        .bindTooltip(m.label, { direction: 'top', offset: [0, -8] })
        .addTo(layers)
    })

    const me = valid.find(m => m.isMe)
    if (me) {
      leaflet.circleMarker([me.lat, me.lng], {
        radius: 14, color: limeColor, fillColor: limeColor, fillOpacity: 0.2, weight: 2, interactive: false,
      }).addTo(layers)
      leaflet.circleMarker([me.lat, me.lng], {
        radius: 7, color: '#ffffff', fillColor: limeColor, fillOpacity: 1, weight: 3,
      })
        .bindTooltip(me.label, { permanent: true, direction: 'top', offset: [0, -10] })
        .addTo(layers)
    }

    // If no route, fit to markers on first draw
    if (!hasFitRef.current && valid.length > 0) {
      const bounds = leaflet.latLngBounds(valid.map(m => [m.lat, m.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
      hasFitRef.current = true
    }
  }, [markers, ready])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    if (!map) return
    const t1 = setTimeout(() => map.invalidateSize(), 100)
    const t2 = setTimeout(() => map.invalidateSize(), 350)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [ready])

  const hasContent = (routePoints && routePoints.length > 0) || (markers && markers.length > 0)
  if (!hasContent) {
    return (
      <div className={cn('flex items-center justify-center bg-muted/50 rounded-xl', className)} style={{ height }}>
        <span className="text-sm text-muted-foreground">Sin ruta disponible</span>
      </div>
    )
  }

  return <div ref={containerRef} className={cn('rounded-xl overflow-hidden', className)} style={{ height }} />
}

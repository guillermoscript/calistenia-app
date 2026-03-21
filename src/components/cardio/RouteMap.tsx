import { useEffect, useRef } from 'react'
import type { GpsPoint } from '../../types'

interface RouteMapProps {
  points: GpsPoint[]
  height?: string
  className?: string
}

declare global {
  interface Window { L: any }
}

export default function RouteMap({ points, height = '300px', className = '' }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || points.length === 0 || !window.L) return

    // Initialize map if not done
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = window.L.map(mapRef.current)
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current)
    }

    const map = mapInstanceRef.current

    // Clear previous layers (except tile layer)
    map.eachLayer((layer: any) => {
      if (!layer._url) map.removeLayer(layer)
    })

    const coords = points.map(p => [p.lat, p.lng] as [number, number])

    // Draw route polyline
    const polyline = window.L.polyline(coords, {
      color: '#c8f542',
      weight: 4,
      opacity: 0.9,
    }).addTo(map)

    // Start marker (green)
    window.L.circleMarker(coords[0], {
      radius: 8, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1, weight: 2,
    }).addTo(map)

    // End marker (red)
    if (coords.length > 1) {
      window.L.circleMarker(coords[coords.length - 1], {
        radius: 8, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1, weight: 2,
      }).addTo(map)
    }

    // Fit bounds
    map.fitBounds(polyline.getBounds(), { padding: [30, 30] })

    return () => {
      // Don't destroy map on every update, just clear layers
    }
  }, [points])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  if (points.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-muted/50 rounded-xl ${className}`} style={{ height }}>
        <span className="text-sm text-muted-foreground">Sin datos de ruta</span>
      </div>
    )
  }

  return <div ref={mapRef} className={`rounded-xl ${className}`} style={{ height }} />
}

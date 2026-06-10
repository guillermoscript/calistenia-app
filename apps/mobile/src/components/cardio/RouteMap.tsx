/**
 * Mapa de ruta GPS con MapLibre (sin API key). Tiles raster de CARTO —
 * voyager en claro y dark_matter en oscuro, igual que el RouteMap web (Leaflet).
 * Segmentos con gap GPS se pintan discontinuos, como en la web.
 */
import { useMemo } from 'react'
import { View } from 'react-native'
import { Map as MapLibreMap, Camera, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native'
import { useColorScheme } from 'nativewind'
import type { GpsPoint, CardioActivityType } from '@calistenia/core/types'

const ROUTE_COLOR: Record<CardioActivityType, string> = {
  running: '#84cc16',
  walking: '#f59e0b',
  cycling: '#0ea5e9',
}

function cartoStyle(dark: boolean) {
  const variant = dark ? 'dark_all' : 'rastertiles/voyager'
  return {
    version: 8 as const,
    sources: {
      carto: {
        type: 'raster' as const,
        tiles: ['a', 'b', 'c', 'd'].map(
          (s) => `https://${s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`,
        ),
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO',
      },
    },
    layers: [{ id: 'carto', type: 'raster' as const, source: 'carto' }],
  }
}

interface RouteMapProps {
  points: GpsPoint[]
  /** Cambia cuando hay puntos nuevos — los points llegan por ref estable. */
  pointsVersion: number
  height?: number
  live?: boolean
  activityType: CardioActivityType
}

export default function RouteMap({ points, pointsVersion, height = 220, live = false, activityType }: RouteMapProps) {
  const { colorScheme } = useColorScheme()
  const dark = colorScheme === 'dark'

  const { routeGeoJSON, gapGeoJSON, markersGeoJSON, bounds, last } = useMemo(() => {
    // Tramos continuos (sólido) y saltos por gap GPS (discontinuo)
    const segments: [number, number][][] = []
    const gaps: [number, number][][] = []
    let current: [number, number][] = []
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity

    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const coord: [number, number] = [p.lng, p.lat]
      if (p.lng < minLng) minLng = p.lng
      if (p.lng > maxLng) maxLng = p.lng
      if (p.lat < minLat) minLat = p.lat
      if (p.lat > maxLat) maxLat = p.lat

      if (p.gap && current.length > 0) {
        gaps.push([current[current.length - 1], coord])
        if (current.length > 1) segments.push(current)
        current = [coord]
      } else {
        current.push(coord)
      }
    }
    if (current.length > 1) segments.push(current)

    const lastPt = points.length > 0 ? points[points.length - 1] : null
    const markers: GeoJSON.Feature[] = []
    if (points.length > 0) {
      markers.push({
        type: 'Feature',
        properties: { color: '#22c55e' },
        geometry: { type: 'Point', coordinates: [points[0].lng, points[0].lat] },
      })
    }
    if (lastPt && points.length > 1) {
      markers.push({
        type: 'Feature',
        properties: { color: live ? '#22c55e' : '#ef4444' },
        geometry: { type: 'Point', coordinates: [lastPt.lng, lastPt.lat] },
      })
    }

    return {
      routeGeoJSON: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiLineString', coordinates: segments },
      } as GeoJSON.Feature,
      gapGeoJSON: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiLineString', coordinates: gaps },
      } as GeoJSON.Feature,
      markersGeoJSON: { type: 'FeatureCollection', features: markers } as GeoJSON.FeatureCollection,
      bounds: [minLng, minLat, maxLng, maxLat] as [number, number, number, number],
      last: lastPt,
    }
    // points llega por ref mutable — pointsVersion es la señal real de cambio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsVersion, live])

  const mapStyle = useMemo(() => cartoStyle(dark), [dark])

  if (points.length < 2 || !last) return null

  const color = ROUTE_COLOR[activityType] ?? ROUTE_COLOR.running
  const pad = { top: 32, bottom: 32, left: 32, right: 32 }

  return (
    <View className="overflow-hidden rounded-xl border border-border" style={{ height }}>
      <MapLibreMap mapStyle={mapStyle} style={{ flex: 1 }}>
        {live ? (
          <Camera
            initialViewState={{ center: [last.lng, last.lat], zoom: 15.5 }}
            center={[last.lng, last.lat]}
            zoom={15.5}
            duration={800}
            easing="linear"
          />
        ) : (
          <Camera initialViewState={{ bounds, padding: pad }} bounds={bounds} padding={pad} duration={0} />
        )}

        <GeoJSONSource id="route" data={routeGeoJSON}>
          <Layer
            id="route-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': color, 'line-width': 4 }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="route-gaps" data={gapGeoJSON}>
          <Layer
            id="route-gaps-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': color, 'line-width': 3, 'line-opacity': 0.6, 'line-dasharray': [1, 2] }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="route-markers" data={markersGeoJSON}>
          <Layer
            id="route-markers-circle"
            type="circle"
            paint={{
              'circle-color': ['get', 'color'],
              'circle-radius': 6,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            }}
          />
        </GeoJSONSource>
      </MapLibreMap>
    </View>
  )
}

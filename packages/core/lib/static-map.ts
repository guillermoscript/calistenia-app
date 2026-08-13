import type { GpsPoint } from '../types'

/**
 * Framework-agnostic Web-Mercator helpers for rendering a STATIC map of a GPS
 * route — real raster tiles + the route polyline — into a fixed-size box.
 *
 * Pure math only (no DOM, no React Native). Both apps share this:
 *  - web composites tiles + route onto a <canvas> for the share image
 *  - mobile lays tiles out as <Image> in a <View> (so react-native-view-shot can
 *    capture it without touching the GL surface) and draws the route with SVG
 *
 * Tiles come from CARTO's keyless raster basemaps, matching the live RouteMap
 * (voyager / dark_all), so the share card looks like the in-app map.
 */

const TILE_SIZE = 256

export type MapTheme = 'light' | 'dark'

export interface LatLng {
  lat: number
  lng: number
}

export interface RouteBounds {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

/**
 * Project lng/lat to normalized Web-Mercator world coordinates, each in [0, 1].
 * y grows southward (higher latitude → smaller y), matching slippy-tile space.
 */
export function projectNormalized(lat: number, lng: number): { x: number; y: number } {
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878)
  const sinLat = Math.sin((clampedLat * Math.PI) / 180)
  const x = (lng + 180) / 360
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)
  return { x, y }
}

export function getRouteBounds(points: Pick<GpsPoint, 'lat' | 'lng'>[]): RouteBounds | null {
  if (!points || points.length === 0) return null
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  if (!isFinite(minLat) || !isFinite(minLng)) return null
  return { minLat, minLng, maxLat, maxLng }
}

export interface StaticMapViewport {
  zoom: number
  /** viewport size in CSS pixels */
  width: number
  height: number
  /** world size in pixels at this zoom: TILE_SIZE * 2^zoom */
  worldSize: number
  /** world-pixel coordinates of the viewport's top-left corner */
  originX: number
  originY: number
}

export interface FitViewportOpts {
  /** inner padding (px) kept clear of the route on every side. Default 48. */
  padding?: number
  /** never zoom in past this (avoids blurry over-zoom on tiny routes). Default 16. */
  maxZoom?: number
  /** never zoom out past this. Default 1. */
  minZoom?: number
  /** fallback zoom when the route is a single point / zero-area. Default 15. */
  pointZoom?: number
}

/**
 * Pick the highest integer zoom at which the whole route fits inside
 * width×height (minus padding), and the world-pixel origin that centers it.
 * Returns null if there are no usable points.
 */
export function fitViewport(
  points: Pick<GpsPoint, 'lat' | 'lng'>[],
  width: number,
  height: number,
  opts: FitViewportOpts = {},
): StaticMapViewport | null {
  const bounds = getRouteBounds(points)
  if (!bounds) return null

  const padding = opts.padding ?? 48
  const maxZoom = opts.maxZoom ?? 16
  const minZoom = opts.minZoom ?? 1
  const pointZoom = opts.pointZoom ?? 15

  const nw = projectNormalized(bounds.maxLat, bounds.minLng) // top-left
  const se = projectNormalized(bounds.minLat, bounds.maxLng) // bottom-right
  const fracX = Math.abs(se.x - nw.x)
  const fracY = Math.abs(se.y - nw.y)
  const centerX = (nw.x + se.x) / 2
  const centerY = (nw.y + se.y) / 2

  const availW = Math.max(1, width - padding * 2)
  const availH = Math.max(1, height - padding * 2)

  let zoom: number
  if (fracX < 1e-9 && fracY < 1e-9) {
    zoom = pointZoom
  } else {
    // largest zoom where the route's pixel span still fits the available box
    let z = maxZoom
    while (z > minZoom) {
      const worldSize = TILE_SIZE * 2 ** z
      if (fracX * worldSize <= availW && fracY * worldSize <= availH) break
      z--
    }
    zoom = z
  }

  const worldSize = TILE_SIZE * 2 ** zoom
  const originX = centerX * worldSize - width / 2
  const originY = centerY * worldSize - height / 2
  return { zoom, width, height, worldSize, originX, originY }
}

/** Project a GPS coordinate to pixel coordinates within the viewport (0..width, 0..height). */
export function pointToPixel(lat: number, lng: number, vp: StaticMapViewport): { x: number; y: number } {
  const n = projectNormalized(lat, lng)
  return {
    x: n.x * vp.worldSize - vp.originX,
    y: n.y * vp.worldSize - vp.originY,
  }
}

export interface TileRef {
  x: number
  y: number
  z: number
  /** top-left draw offset (px) of this tile within the viewport */
  px: number
  py: number
}

/**
 * Every tile needed to cover the viewport, with where to draw it.
 * Out-of-range tiles (poles / antimeridian) are skipped; the background shows through.
 */
export function tilesForViewport(vp: StaticMapViewport): TileRef[] {
  const z = vp.zoom
  const n = 2 ** z
  const minTx = Math.floor(vp.originX / TILE_SIZE)
  const maxTx = Math.floor((vp.originX + vp.width) / TILE_SIZE)
  const minTy = Math.floor(vp.originY / TILE_SIZE)
  const maxTy = Math.floor((vp.originY + vp.height) / TILE_SIZE)

  const tiles: TileRef[] = []
  for (let ty = minTy; ty <= maxTy; ty++) {
    if (ty < 0 || ty >= n) continue
    for (let tx = minTx; tx <= maxTx; tx++) {
      // wrap longitude so the world repeats horizontally
      const wrappedX = ((tx % n) + n) % n
      tiles.push({
        x: wrappedX,
        y: ty,
        z,
        px: tx * TILE_SIZE - vp.originX,
        py: ty * TILE_SIZE - vp.originY,
      })
    }
  }
  return tiles
}

export const TILE_PIXEL_SIZE = TILE_SIZE

/** Deterministic CARTO subdomain pick (a–d) so tiles load in parallel without randomness. */
function cartoSubdomain(t: TileRef): string {
  return ['a', 'b', 'c', 'd'][(t.x + t.y) & 3]
}

/**
 * Keyless CARTO raster tile URL matching the live RouteMap basemap.
 * `retina` requests @2x tiles for crisp share images on hi-dpi exports.
 */
export function cartoTileUrl(t: TileRef, theme: MapTheme = 'light', retina = false): string {
  // CARTO retired the `dark_matter` raster alias (now 404s); `dark_all` is the
  // current keyless dark basemap. `voyager` (light) is unchanged.
  const style = theme === 'dark' ? 'dark_all' : 'voyager'
  const r = retina ? '@2x' : ''
  return `https://${cartoSubdomain(t)}.basemaps.cartocdn.com/rastertiles/${style}/${t.z}/${t.x}/${t.y}${r}.png`
}

/** Route polyline color per activity, matching the live RouteMap. */
export const ROUTE_COLOR: Record<string, string> = {
  running: '#84cc16',
  walking: '#f59e0b',
  cycling: '#0ea5e9',
}

export interface FitRoutePathOpts {
  /** inner padding (px) kept clear of the route on every side. Default 16. */
  padding?: number
}

/**
 * Fit a route into a `width`×`height` box as bare pixel coordinates, with NO
 * tiles behind it — the "route glyph" used by share cards that draw the shape
 * of the run rather than a map of where it happened.
 *
 * Differs from `fitViewport` in one thing that matters: the scale is
 * CONTINUOUS, not snapped to integer tile zooms. `fitViewport` has to snap
 * because raster tiles only exist at integer zooms, and the price is up to
 * ~50% of the box wasted — invisible on a full-bleed hero, glaring in a small
 * panel. Without tiles there is nothing to snap to, so the route fills its box.
 *
 * Aspect ratio is preserved (one scale for both axes) and the result is
 * centered: a route is a shape, and stretching it to fill would lie about it.
 *
 * Returns pixel coordinates relative to the box's own origin (0,0) — the
 * caller translates. Null when there is nothing to draw. A degenerate route
 * (every point identical, or a single point) yields points at the exact center
 * rather than a division by zero.
 */
export function fitRoutePath(
  points: Pick<GpsPoint, 'lat' | 'lng'>[],
  width: number,
  height: number,
  opts: FitRoutePathOpts = {},
): { x: number; y: number }[] | null {
  if (!points?.length) return null

  const padding = opts.padding ?? 16
  const availW = Math.max(1, width - padding * 2)
  const availH = Math.max(1, height - padding * 2)

  const projected = points.map((p) => projectNormalized(p.lat, p.lng))
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of projected) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (!isFinite(minX) || !isFinite(minY)) return null

  const spanX = maxX - minX
  const spanY = maxY - minY

  // Ruta degenerada (un punto, o todos iguales): centrar en vez de dividir por 0.
  if (spanX < 1e-12 && spanY < 1e-12) {
    return projected.map(() => ({ x: width / 2, y: height / 2 }))
  }

  const scale = Math.min(
    spanX > 0 ? availW / spanX : Infinity,
    spanY > 0 ? availH / spanY : Infinity,
  )
  const drawnW = spanX * scale
  const drawnH = spanY * scale
  const offsetX = (width - drawnW) / 2
  const offsetY = (height - drawnH) / 2

  return projected.map((p) => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + (p.y - minY) * scale,
  }))
}

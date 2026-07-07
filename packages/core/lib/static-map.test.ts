import { describe, it, expect } from 'vitest'
import {
  projectNormalized,
  getRouteBounds,
  fitViewport,
  pointToPixel,
  tilesForViewport,
  cartoTileUrl,
  ROUTE_COLOR,
  TILE_PIXEL_SIZE,
} from './static-map'
import type { TileRef, StaticMapViewport } from './static-map'

// ── projectNormalized ─────────────────────────────────────────────────────────

describe('projectNormalized', () => {
  it('proyecta (0,0) al centro del mundo normalizado (0.5, 0.5)', () => {
    const { x, y } = projectNormalized(0, 0)
    expect(x).toBeCloseTo(0.5, 10)
    expect(y).toBeCloseTo(0.5, 10)
  })

  it('proyecta los extremos de longitud a x=0 y x=1', () => {
    expect(projectNormalized(0, -180).x).toBeCloseTo(0, 10)
    expect(projectNormalized(0, 180).x).toBeCloseTo(1, 10)
  })

  it('y crece hacia el sur (mayor latitud → menor y), como el espacio de slippy tiles', () => {
    const north = projectNormalized(60, 0)
    const south = projectNormalized(-60, 0)
    expect(north.y).toBeLessThan(south.y)
  })

  it('clampa latitudes fuera del rango de Web-Mercator (±85.05112878)', () => {
    const overNorth = projectNormalized(89, 0)
    const clampedNorth = projectNormalized(85.05112878, 0)
    expect(overNorth.y).toBeCloseTo(clampedNorth.y, 10)

    const overSouth = projectNormalized(-89, 0)
    const clampedSouth = projectNormalized(-85.05112878, 0)
    expect(overSouth.y).toBeCloseTo(clampedSouth.y, 10)
  })
})

// ── getRouteBounds ────────────────────────────────────────────────────────────

describe('getRouteBounds', () => {
  it('devuelve null para lista vacía o undefined', () => {
    expect(getRouteBounds([])).toBeNull()
    // @ts-expect-error — probamos robustez ante input inválido
    expect(getRouteBounds(undefined)).toBeNull()
  })

  it('con un solo punto, min y max coinciden', () => {
    const bounds = getRouteBounds([{ lat: 40.4, lng: -3.7 }])
    expect(bounds).toEqual({ minLat: 40.4, minLng: -3.7, maxLat: 40.4, maxLng: -3.7 })
  })

  it('calcula min/max sobre varios puntos', () => {
    const bounds = getRouteBounds([
      { lat: 40.0, lng: -3.9 },
      { lat: 41.2, lng: -3.5 },
      { lat: 39.8, lng: -4.1 },
    ])
    expect(bounds).toEqual({ minLat: 39.8, minLng: -4.1, maxLat: 41.2, maxLng: -3.5 })
  })
})

// ── fitViewport ───────────────────────────────────────────────────────────────

describe('fitViewport', () => {
  it('devuelve null sin puntos', () => {
    expect(fitViewport([], 800, 600)).toBeNull()
  })

  it('usa pointZoom (fallback) cuando la ruta es un único punto (área cero)', () => {
    const vp = fitViewport([{ lat: 40.4, lng: -3.7 }], 800, 600)
    expect(vp?.zoom).toBe(15) // default pointZoom
  })

  it('usa pointZoom (fallback) cuando todos los puntos son idénticos', () => {
    const points = [
      { lat: 40.4, lng: -3.7 },
      { lat: 40.4, lng: -3.7 },
    ]
    const vp = fitViewport(points, 800, 600, { pointZoom: 12 })
    expect(vp?.zoom).toBe(12)
  })

  it('respeta width/height solicitados en el viewport devuelto', () => {
    const vp = fitViewport([{ lat: 40.4, lng: -3.7 }], 800, 600)
    expect(vp?.width).toBe(800)
    expect(vp?.height).toBe(600)
    expect(vp?.worldSize).toBe(TILE_PIXEL_SIZE * 2 ** (vp?.zoom ?? 0))
  })

  it('para una ruta minúscula, usa el maxZoom configurado (siempre cabe)', () => {
    const points = [
      { lat: 40.4, lng: -3.7 },
      { lat: 40.4001, lng: -3.6999 }, // ~15m de separación
    ]
    const vp = fitViewport(points, 800, 600, { maxZoom: 10 })
    expect(vp?.zoom).toBe(10)
  })

  it('para una ruta enorme (casi todo el planeta), cae al minZoom configurado', () => {
    const points = [
      { lat: 80, lng: -170 },
      { lat: -80, lng: 170 },
    ]
    const vp = fitViewport(points, 800, 600, { minZoom: 1, maxZoom: 16 })
    expect(vp?.zoom).toBe(1)
  })

  it('centra la ruta: las esquinas de la bounding box quedan dentro del canvas', () => {
    const points = [
      { lat: 40.42, lng: -3.71 },
      { lat: 40.41, lng: -3.69 },
    ]
    const width = 800
    const height = 600
    const vp = fitViewport(points, width, height, { padding: 48 }) as StaticMapViewport
    const bounds = getRouteBounds(points)!
    const nwPx = pointToPixel(bounds.maxLat, bounds.minLng, vp)
    const sePx = pointToPixel(bounds.minLat, bounds.maxLng, vp)
    expect(nwPx.x).toBeGreaterThanOrEqual(-0.5)
    expect(nwPx.y).toBeGreaterThanOrEqual(-0.5)
    expect(sePx.x).toBeLessThanOrEqual(width + 0.5)
    expect(sePx.y).toBeLessThanOrEqual(height + 0.5)
  })
})

// ── pointToPixel ──────────────────────────────────────────────────────────────

describe('pointToPixel', () => {
  it('proyecta un punto a coordenadas de pixel dentro del viewport', () => {
    const vp: StaticMapViewport = {
      zoom: 10,
      width: 256,
      height: 256,
      worldSize: TILE_PIXEL_SIZE * 2 ** 10,
      originX: 0,
      originY: 0,
    }
    // (0,0) → normalizado (0.5,0.5) → pixel = 0.5*worldSize
    const { x, y } = pointToPixel(0, 0, vp)
    expect(x).toBeCloseTo(0.5 * vp.worldSize, 5)
    expect(y).toBeCloseTo(0.5 * vp.worldSize, 5)
  })

  it('resta el origen del viewport', () => {
    const worldSize = TILE_PIXEL_SIZE * 2 ** 10
    const vp: StaticMapViewport = { zoom: 10, width: 256, height: 256, worldSize, originX: 100, originY: 50 }
    const { x, y } = pointToPixel(0, 0, vp)
    expect(x).toBeCloseTo(0.5 * worldSize - 100, 5)
    expect(y).toBeCloseTo(0.5 * worldSize - 50, 5)
  })
})

// ── tilesForViewport ──────────────────────────────────────────────────────────

describe('tilesForViewport', () => {
  it('genera las 4 tiles que cubren un viewport de 256x256 alineado a origen 0', () => {
    const vp: StaticMapViewport = { zoom: 2, width: 256, height: 256, worldSize: TILE_PIXEL_SIZE * 4, originX: 0, originY: 0 }
    const tiles = tilesForViewport(vp)
    expect(tiles).toHaveLength(4)
    expect(tiles).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0, z: 2, px: 0, py: 0 },
        { x: 1, y: 0, z: 2, px: 256, py: 0 },
        { x: 0, y: 1, z: 2, px: 0, py: 256 },
        { x: 1, y: 1, z: 2, px: 256, py: 256 },
      ]),
    )
  })

  it('hace wrap horizontal de la longitud (antimeridiano) en vez de dejar tiles negativas', () => {
    // zoom=1 → n=2 tiles de ancho. originX=-100 hace que tx parta en -1.
    const vp: StaticMapViewport = { zoom: 1, width: 256, height: 256, worldSize: TILE_PIXEL_SIZE * 2, originX: -100, originY: 0 }
    const tiles = tilesForViewport(vp)
    const xs = tiles.map(t => t.x)
    // tx=-1 envuelve a x=1 (n=2); tx=0 se queda en x=0. Ninguna x debe ser negativa.
    expect(xs.every(x => x >= 0)).toBe(true)
    expect(xs).toContain(1)
    expect(xs).toContain(0)
  })

  it('omite tiles fuera de rango en el eje Y (polos), sin reventar', () => {
    // zoom=0 → n=1 fila. originY muy negativo deja la fila completa fuera de rango (ty=-2).
    const vp: StaticMapViewport = { zoom: 0, width: 100, height: 100, worldSize: TILE_PIXEL_SIZE, originX: 0, originY: -500 }
    const tiles = tilesForViewport(vp)
    expect(tiles).toEqual([])
  })
})

// ── cartoTileUrl (regresión CARTO dark_matter → dark_all) ─────────────────────

describe('cartoTileUrl', () => {
  // OJO CRÍTICO: este test fija literalmente el host y el nombre de estilo usados en prod.
  // Si alguien cambia accidentalmente 'dark_all' (p.ej. de vuelta a 'dark_matter', que CARTO
  // retiró y causó una regresión real) o el host cartocdn.com, este test debe fallar en CI.
  it('pin: tema dark usa el host y estilo "dark_all" (dark_matter fue retirado por CARTO)', () => {
    const t: TileRef = { x: 1, y: 2, z: 3, px: 0, py: 0 }
    // subdominio determinista: (x+y)&3 = (1+2)&3 = 3 → 'd'
    expect(cartoTileUrl(t, 'dark')).toBe('https://d.basemaps.cartocdn.com/rastertiles/dark_all/3/1/2.png')
  })

  it('pin: tema light (o por defecto) usa el estilo "voyager"', () => {
    const t: TileRef = { x: 0, y: 0, z: 5, px: 0, py: 0 }
    // subdominio: (0+0)&3 = 0 → 'a'
    expect(cartoTileUrl(t, 'light')).toBe('https://a.basemaps.cartocdn.com/rastertiles/voyager/5/0/0.png')
    // sin theme explícito, el default es 'light'
    expect(cartoTileUrl(t)).toBe('https://a.basemaps.cartocdn.com/rastertiles/voyager/5/0/0.png')
  })

  it('pin: retina agrega el sufijo @2x antes de la extensión', () => {
    const t: TileRef = { x: 3, y: 5, z: 8, px: 0, py: 0 }
    // subdominio: (3+5)&3 = 8&3 = 0 → 'a'
    expect(cartoTileUrl(t, 'dark', true)).toBe('https://a.basemaps.cartocdn.com/rastertiles/dark_all/8/3/5@2x.png')
  })

  it('el subdominio (a-d) es determinista según (x+y)&3, sin aleatoriedad', () => {
    const t: TileRef = { x: 2, y: 2, z: 4, px: 0, py: 0 }
    const url1 = cartoTileUrl(t, 'dark')
    const url2 = cartoTileUrl(t, 'dark')
    expect(url1).toBe(url2)
    // (2+2)&3 = 0 → 'a'
    expect(url1.startsWith('https://a.')).toBe(true)
  })
})

// ── constantes ────────────────────────────────────────────────────────────────

describe('constantes exportadas', () => {
  it('TILE_PIXEL_SIZE es 256 (tamaño estándar de tile slippy-map)', () => {
    expect(TILE_PIXEL_SIZE).toBe(256)
  })

  it('ROUTE_COLOR fija los colores por tipo de actividad (deben coincidir con RouteMap en vivo)', () => {
    expect(ROUTE_COLOR).toEqual({
      running: '#84cc16',
      walking: '#f59e0b',
      cycling: '#0ea5e9',
    })
  })
})

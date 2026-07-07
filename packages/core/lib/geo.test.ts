import { describe, it, expect } from 'vitest'
import {
  kalmanUpdate,
  haversineDistance,
  calculateTotalDistance,
  calculateElevationGain,
  formatPace,
  formatDuration,
  calculateSplitsAndDistance,
  calculateSplits,
  calculateMaxPace,
  calculateMaxSpeed,
  calculateAvgSpeed,
  formatSpeed,
  assessTrackQuality,
  pointsToGPX,
} from './geo'
import type { GpsPoint } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Mueve un punto `meters` al norte sobre el mismo meridiano. Sobre un mismo
 * meridiano, haversineDistance se reduce exactamente a R * dLat (el ángulo
 * central), así que esta fórmula inversa da fixtures de distancia exacta
 * para testear las funciones que agregan haversineDistance.
 */
const R = 6371000
function pointNorth(lat: number, lng: number, meters: number): { lat: number; lng: number } {
  const dLatDeg = (meters / R) * (180 / Math.PI)
  return { lat: lat + dLatDeg, lng }
}

function gp(lat: number, lng: number, timestamp: number, extra: Partial<GpsPoint> = {}): GpsPoint {
  return { lat, lng, timestamp, ...extra }
}

// ── kalmanUpdate ──────────────────────────────────────────────────────────────

describe('kalmanUpdate', () => {
  it('sin estado previo, devuelve la medición tal cual con variance = accuracy²', () => {
    const state = kalmanUpdate(null, 40.0, -3.7, 5, 1000)
    expect(state).toEqual({ lat: 40.0, lng: -3.7, variance: 25, timestamp: 1000 })
  })

  it('con accuracy muy baja, la variance mínima es 1 (evita división por cero / sobreconfianza)', () => {
    const state = kalmanUpdate(null, 40.0, -3.7, 0, 1000)
    expect(state.variance).toBe(1)
  })

  it('mezcla la medición con el estado previo (el resultado queda entre ambos)', () => {
    const prev = kalmanUpdate(null, 40.0, -3.7, 5, 1000)
    const next = kalmanUpdate(prev, 40.001, -3.7, 5, 2000)
    expect(next.lat).toBeGreaterThan(40.0)
    expect(next.lat).toBeLessThan(40.001)
    expect(next.timestamp).toBe(2000)
  })

  it('con dt=0 (mismo timestamp), la predicted variance no crece por ruido de proceso', () => {
    const prev = kalmanUpdate(null, 40.0, -3.7, 10, 1000)
    const next = kalmanUpdate(prev, 40.0, -3.7, 10, 1000)
    // predVar = prevVar + (PROCESS_NOISE*0)^2 = prevVar = 100
    // k = 100/(100+100) = 0.5 → variance resultante = 0.5*100 = 50
    expect(next.variance).toBeCloseTo(50, 5)
  })
})

// ── haversineDistance ─────────────────────────────────────────────────────────

describe('haversineDistance', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(haversineDistance(40.4168, -3.7038, 40.4168, -3.7038)).toBe(0)
  })

  it('1 grado de latitud ≈ 111.19 km (radio terrestre 6371 km)', () => {
    const d = haversineDistance(0, 0, 1, 0)
    expect(d).toBeCloseTo(R * (Math.PI / 180), 3) // metros, distancia exacta sobre el meridiano
  })

  it('distancia conocida Madrid–Barcelona ≈ 500 km', () => {
    const d = haversineDistance(40.4168, -3.7038, 41.3874, 2.1686)
    expect(d / 1000).toBeGreaterThan(480)
    expect(d / 1000).toBeLessThan(520)
  })

  it('es simétrica (a→b === b→a)', () => {
    const d1 = haversineDistance(40.0, -3.0, 41.0, -2.0)
    const d2 = haversineDistance(41.0, -2.0, 40.0, -3.0)
    expect(d1).toBe(d2)
  })
})

// ── calculateTotalDistance ────────────────────────────────────────────────────

describe('calculateTotalDistance', () => {
  it('devuelve 0 con lista vacía', () => {
    expect(calculateTotalDistance([])).toBe(0)
  })

  it('devuelve 0 con un solo punto', () => {
    expect(calculateTotalDistance([gp(40, -3, 0)])).toBe(0)
  })

  it('suma tramos consecutivos en km', () => {
    const p0 = gp(0, 0, 0)
    const p1n = pointNorth(0, 0, 500)
    const p1 = gp(p1n.lat, p1n.lng, 1000)
    const p2n = pointNorth(p1.lat, p1.lng, 500)
    const p2 = gp(p2n.lat, p2n.lng, 2000)
    expect(calculateTotalDistance([p0, p1, p2])).toBeCloseTo(1.0, 3)
  })
})

// ── calculateElevationGain ────────────────────────────────────────────────────

describe('calculateElevationGain', () => {
  it('devuelve 0 con lista vacía o de un punto', () => {
    expect(calculateElevationGain([])).toBe(0)
    expect(calculateElevationGain([gp(0, 0, 0, { alt: 100 })])).toBe(0)
  })

  it('solo acumula subidas, ignora bajadas', () => {
    const points = [
      gp(0, 0, 0, { alt: 100 }),
      gp(0, 0, 1, { alt: 150 }), // +50
      gp(0, 0, 2, { alt: 120 }), // baja, no cuenta
      gp(0, 0, 3, { alt: 180 }), // +60
    ]
    expect(calculateElevationGain(points)).toBe(110)
  })

  it('ignora puntos sin altitud (null/undefined)', () => {
    const points = [
      gp(0, 0, 0, { alt: undefined }),
      gp(0, 0, 1, { alt: 200 }),
      gp(0, 0, 2), // sin alt
      gp(0, 0, 3, { alt: 250 }),
    ]
    // par (undefined,200) no cuenta; (200, sin alt) no cuenta; (sin alt, 250) no cuenta
    expect(calculateElevationGain(points)).toBe(0)
  })
})

// ── formatPace ────────────────────────────────────────────────────────────────

describe('formatPace', () => {
  it('formatea minutos:segundos con padding', () => {
    expect(formatPace(5.5)).toBe('5:30')
  })

  it('redondea segundos y hace rollover cuando llegan a 60', () => {
    // 5.999 min → 5 min + 0.999*60=59.94 → round=60 → rollover a 6:00
    expect(formatPace(5.999)).toBe('6:00')
  })

  it('devuelve "--:--" para valores no finitos o <= 0', () => {
    expect(formatPace(0)).toBe('--:--')
    expect(formatPace(-1)).toBe('--:--')
    expect(formatPace(Infinity)).toBe('--:--')
    expect(formatPace(NaN)).toBe('--:--')
  })
})

// ── formatDuration ────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formatea sin horas como m:ss', () => {
    expect(formatDuration(125)).toBe('2:05')
  })

  it('formatea con horas como h:mm:ss', () => {
    expect(formatDuration(3725)).toBe('1:02:05')
  })

  it('formatea 0 segundos', () => {
    expect(formatDuration(0)).toBe('0:00')
  })
})

// ── calculateSplitsAndDistance ────────────────────────────────────────────────

describe('calculateSplitsAndDistance', () => {
  it('devuelve splits vacíos y distancia 0 con menos de 2 puntos', () => {
    expect(calculateSplitsAndDistance([])).toEqual({ splits: [], totalDistanceKm: 0 })
    expect(calculateSplitsAndDistance([gp(0, 0, 0)])).toEqual({ splits: [], totalDistanceKm: 0 })
  })

  it('genera un split de 1km cuando el punto cruza el umbral (tiempo asignado al punto GPS, no interpolado)', () => {
    // OJO: el algoritmo no interpola el instante exacto del corte de km — usa el timestamp
    // del punto GPS que hace cruzar el umbral. Por eso el segmento se hace de 1050m (en vez
    // de exactamente 1000m): con exactamente 1000m, el error de punto flotante del haversine
    // (999.9999999999998) puede dejar el cruce justo por debajo del umbral y desplazar el
    // split a un punto distinto. Usar 1050m hace el test determinista sin depender de esa
    // precisión límite.
    const p0 = gp(0, 0, 0)
    const end = pointNorth(0, 0, 1050)
    // 300 segundos = 5 min → pace 5:00/km (asignado al punto p1 completo, no al km exacto)
    const p1 = gp(end.lat, end.lng, 300_000)
    const { splits, totalDistanceKm } = calculateSplitsAndDistance([p0, p1])
    expect(splits).toEqual([{ km: 1, time_seconds: 300, pace: 5 }])
    expect(totalDistanceKm).toBeCloseTo(1.05, 6)
  })

  it('agrega un split parcial final cuando el remanente supera 100m', () => {
    const p0 = gp(0, 0, 0)
    const mid = pointNorth(0, 0, 1050) // cruza el km 1 en este punto
    const p1 = gp(mid.lat, mid.lng, 300_000)
    const endPt = pointNorth(mid.lat, mid.lng, 250) // +250m tras el km 1 (remanente > 100m)
    const p2 = gp(endPt.lat, endPt.lng, 360_000) // +60s más
    const { splits, totalDistanceKm } = calculateSplitsAndDistance([p0, p1, p2])
    expect(splits).toHaveLength(2)
    expect(splits[0]).toEqual({ km: 1, time_seconds: 300, pace: 5 })
    expect(splits[1].km).toBeCloseTo(1.3, 2)
    expect(splits[1].time_seconds).toBe(60)
    // pace parcial normalizado: (60s/60)/(300m/1000) = 1/0.3 ≈ 3.33 min/km
    expect(splits[1].pace).toBeCloseTo(3.33, 2)
    expect(totalDistanceKm).toBeCloseTo(1.3, 3)
  })

  it('no agrega split parcial si el remanente es <= 100m', () => {
    const p0 = gp(0, 0, 0)
    const mid = pointNorth(0, 0, 1000)
    const p1 = gp(mid.lat, mid.lng, 300_000)
    const endPt = pointNorth(mid.lat, mid.lng, 50) // solo +50m, por debajo del umbral de 100m
    const p2 = gp(endPt.lat, endPt.lng, 310_000)
    const { splits } = calculateSplitsAndDistance([p0, p1, p2])
    expect(splits).toHaveLength(1)
  })
})

describe('calculateSplits (deprecated)', () => {
  it('devuelve el mismo array de splits que calculateSplitsAndDistance', () => {
    const p0 = gp(0, 0, 0)
    const end = pointNorth(0, 0, 1000)
    const p1 = gp(end.lat, end.lng, 300_000)
    const points = [p0, p1]
    expect(calculateSplits(points)).toEqual(calculateSplitsAndDistance(points).splits)
  })
})

// ── calculateMaxPace ──────────────────────────────────────────────────────────

describe('calculateMaxPace', () => {
  it('devuelve 0 con menos de 3 puntos', () => {
    expect(calculateMaxPace([])).toBe(0)
    expect(calculateMaxPace([gp(0, 0, 0), gp(0, 0, 1)])).toBe(0)
  })

  it('calcula el mejor ritmo sobre una ventana de ~200m a velocidad constante', () => {
    // 5 puntos, cada uno +100m / +30s → velocidad constante → pace ~5:00/km en toda la ventana
    let lat = 0
    let lng = 0
    let t = 0
    const points: GpsPoint[] = [gp(lat, lng, t)]
    for (let i = 0; i < 4; i++) {
      const next = pointNorth(lat, lng, 100)
      lat = next.lat
      lng = next.lng
      t += 30_000
      points.push(gp(lat, lng, t))
    }
    expect(calculateMaxPace(points)).toBeCloseTo(5, 1)
  })
})

// ── calculateMaxSpeed ─────────────────────────────────────────────────────────

describe('calculateMaxSpeed', () => {
  it('devuelve 0 con menos de 3 puntos', () => {
    expect(calculateMaxSpeed([])).toBe(0)
    expect(calculateMaxSpeed([gp(0, 0, 0, { speed: 5 }), gp(0, 0, 1, { speed: 5 })])).toBe(0)
  })

  it('usa media móvil de 3 puntos y devuelve el máximo en km/h', () => {
    const points = [
      gp(0, 0, 0, { speed: 0 }),
      gp(0, 0, 1, { speed: 10 }),
      gp(0, 0, 2, { speed: 20 }),
      gp(0, 0, 3, { speed: 10 }),
      gp(0, 0, 4, { speed: 0 }),
    ]
    // medias: (0+10+20)/3=10, (10+20+10)/3=13.33, (20+10+0)/3=10 → max 13.33 m/s * 3.6 = 48.0 km/h
    expect(calculateMaxSpeed(points)).toBeCloseTo(48.0, 1)
  })

  it('trata speed ausente como 0', () => {
    const points = [gp(0, 0, 0), gp(0, 0, 1, { speed: 30 }), gp(0, 0, 2)]
    // media = (0+30+0)/3 = 10 m/s = 36 km/h
    expect(calculateMaxSpeed(points)).toBeCloseTo(36, 1)
  })
})

// ── calculateAvgSpeed ─────────────────────────────────────────────────────────

describe('calculateAvgSpeed', () => {
  it('devuelve 0 si duración o distancia son <= 0', () => {
    expect(calculateAvgSpeed(10, 0)).toBe(0)
    expect(calculateAvgSpeed(10, -5)).toBe(0)
    expect(calculateAvgSpeed(0, 3600)).toBe(0)
    expect(calculateAvgSpeed(-1, 3600)).toBe(0)
  })

  it('calcula la velocidad media en km/h', () => {
    // 21.1 km en 1.5h (5400s) = 14.0667 → redondeado a 14.1
    expect(calculateAvgSpeed(21.1, 5400)).toBeCloseTo(14.1, 5)
  })
})

// ── formatSpeed ───────────────────────────────────────────────────────────────

describe('formatSpeed', () => {
  it('formatea con un decimal', () => {
    expect(formatSpeed(25.34)).toBe('25.3')
  })

  it('devuelve "--" para valores no finitos o <= 0', () => {
    expect(formatSpeed(0)).toBe('--')
    expect(formatSpeed(-5)).toBe('--')
    expect(formatSpeed(Infinity)).toBe('--')
    expect(formatSpeed(NaN)).toBe('--')
  })
})

// ── assessTrackQuality ────────────────────────────────────────────────────────

describe('assessTrackQuality', () => {
  it('grade "good" sin gaps y alta densidad de puntos', () => {
    // 20 puntos para 1km → densidad 20 pts/km >= 10
    const points: GpsPoint[] = Array.from({ length: 20 }, (_, i) => gp(0, 0, i))
    const result = assessTrackQuality(points, 1)
    expect(result).toEqual({ grade: 'good', gapCount: 0, gapDistanceKm: 0 })
  })

  it('grade "estimated" con algún gap pero ratio de gap bajo y densidad razonable', () => {
    const p0 = gp(0, 0, 0)
    const afterGapPt = pointNorth(0, 0, 50) // 50m de "hueco"
    const p1 = gp(afterGapPt.lat, afterGapPt.lng, 1000, { gap: true })
    // completar con puntos densos para superar pointDensity >= 3 y mantener gapRatio bajo
    const extra: GpsPoint[] = Array.from({ length: 8 }, (_, i) => gp(afterGapPt.lat, afterGapPt.lng, 2000 + i))
    const points = [p0, p1, ...extra]
    // 10 puntos / 2km → densidad 5 pts/km (>= 3, evita 'poor' por densidad);
    // gapRatio = 0.05km / 2km = 0.025 (<= 0.2, evita 'poor' por gap) → 'estimated'
    const result = assessTrackQuality(points, 2)
    expect(result.gapCount).toBe(1)
    expect(result.grade).toBe('estimated')
  })

  it('grade "poor" cuando el ratio de gap supera 0.2', () => {
    const p0 = gp(0, 0, 0)
    const afterGapPt = pointNorth(0, 0, 500) // 500m de gap
    const p1 = gp(afterGapPt.lat, afterGapPt.lng, 1000, { gap: true })
    const points = [p0, p1]
    // totalDistanceKm = 1 → gapRatio = 0.5/1 = 0.5 > 0.2 → poor
    const result = assessTrackQuality(points, 1)
    expect(result.grade).toBe('poor')
    expect(result.gapDistanceKm).toBeCloseTo(0.5, 2)
  })

  it('grade "poor" cuando la densidad de puntos es muy baja (< 3 pts/km), aunque no haya gaps', () => {
    const points = [gp(0, 0, 0), gp(0, 0, 1)]
    // totalDistanceKm=10 → densidad 0.2 pts/km, muy baja
    const result = assessTrackQuality(points, 10)
    expect(result.gapCount).toBe(0)
    expect(result.grade).toBe('poor')
  })

  // OJO: cuando totalDistanceKm es 0 (ruta estática/sin movimiento) con >=2 puntos, la
  // división "points.length / totalDistanceKm" da pointDensity=0 (guardado por el ternario
  // `totalDistanceKm > 0 ? ... : 0`), lo que dispara el branch "pointDensity < 10" y luego
  // "pointDensity < 3" → grade siempre "poor", incluso sin ningún gap real. Se documenta
  // el comportamiento actual tal cual, no es un fix.
  it('OJO: con totalDistanceKm=0 y sin gaps, igualmente da grade "poor" (densidad forzada a 0)', () => {
    const points = [gp(0, 0, 0), gp(0, 0, 1), gp(0, 0, 2)]
    const result = assessTrackQuality(points, 0)
    expect(result.gapCount).toBe(0)
    expect(result.grade).toBe('poor')
  })
})

// ── pointsToGPX ───────────────────────────────────────────────────────────────

describe('pointsToGPX', () => {
  it('genera un GPX válido con cabecera, nombre de actividad y trkpts', () => {
    const points = [
      gp(40.4168, -3.7038, 1000, { alt: 650 }),
      gp(40.417, -3.7035, 2000), // sin altitud
    ]
    const gpx = pointsToGPX(points, 'running')
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(gpx).toContain('<gpx version="1.1" creator="CalisteniaApp">')
    expect(gpx).toContain('<name>running -')
    expect(gpx).toContain('<trkpt lat="40.4168" lon="-3.7038">')
    expect(gpx).toContain('<ele>650</ele>')
    expect(gpx).toContain(`<time>${new Date(1000).toISOString()}</time>`)
    // el segundo punto no tiene alt → no debe emitir <ele>
    expect(gpx).toContain(`<trkpt lat="40.417" lon="-3.7035"><time>${new Date(2000).toISOString()}</time></trkpt>`)
    expect(gpx.trim().endsWith('</gpx>')).toBe(true)
  })

  it('genera un track vacío (sin trkpts) para lista vacía sin romper', () => {
    const gpx = pointsToGPX([], 'walking')
    expect(gpx).toContain('<trkseg>')
    expect(gpx).toContain('</trkseg>')
    expect(gpx).toContain('<name>walking -')
  })
})

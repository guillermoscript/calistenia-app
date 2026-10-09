import { describe, it, expect } from 'vitest'
import { acceptRaceFix, computeRaceStats, createRaceTrackState } from './raceTrack'

const fix = (latitude: number, longitude: number, accuracy: number | null | undefined = 5) =>
  ({ latitude, longitude, accuracy })

describe('acceptRaceFix', () => {
  it('rechaza precisión desconocida o peor que el umbral', () => {
    const s = createRaceTrackState()
    expect(acceptRaceFix(s, fix(40, -3, null), 0)).toBeNull()
    expect(acceptRaceFix(s, { latitude: 40, longitude: -3, accuracy: undefined }, 0)).toBeNull()
    expect(acceptRaceFix(s, fix(40, -3, 31), 0)).toBeNull()
    expect(acceptRaceFix(s, fix(40, -3, 30), 0)).not.toBeNull()
  })

  it('el primer fix fija la posición sin sumar distancia', () => {
    const s = acceptRaceFix(createRaceTrackState(), fix(40, -3), 1500)!
    expect(s.hasPosition).toBe(true)
    expect(s.distanceKm).toBe(0)
    expect(s.track).toEqual([{ lat: 40, lng: -3, t: 1500 }])
  })

  it('suma distancia entre fixes y no muta el estado anterior', () => {
    const s1 = acceptRaceFix(createRaceTrackState(), fix(40, -3), 0)!
    const s2 = acceptRaceFix(s1, fix(40.001, -3), 10_000)!
    expect(s2.distanceKm).toBeGreaterThan(0.1)
    expect(s2.distanceKm).toBeLessThan(0.12)
    expect(s1.track).toHaveLength(1)
    expect(s2.track).toHaveLength(2)
  })

  it('ignora jitter cero y teleports de 500 m o más, pero mueve la posición', () => {
    const s1 = acceptRaceFix(createRaceTrackState(), fix(40, -3), 0)!
    expect(acceptRaceFix(s1, fix(40, -3), 1000)!.distanceKm).toBe(0)
    const tele = acceptRaceFix(s1, fix(40.01, -3), 1000)!
    expect(tele.distanceKm).toBe(0)
    expect(tele.lastLat).toBe(40.01)
  })

  it('retoma desde un recorrido y distancia iniciales', () => {
    const s = createRaceTrackState([{ lat: 1, lng: 2, t: 0 }], 3)
    expect(s.hasPosition).toBe(true)
    expect(s.distanceKm).toBe(3)
    expect(s.lastLat).toBe(1)
  })
})

describe('computeRaceStats', () => {
  it('calcula el ritmo medio y es 0 sin distancia', () => {
    const s = { ...createRaceTrackState(), distanceKm: 2, lastLat: 1, lastLng: 2, hasPosition: true }
    expect(computeRaceStats(s, 600).avg_pace).toBe(5)
    expect(computeRaceStats(createRaceTrackState(), 600).avg_pace).toBe(0)
    expect(computeRaceStats(s, -4).duration_seconds).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import { sortRaceParticipants, type RaceSortInput } from './race-sort'
import type { RaceParticipant, ParticipantStatus } from '../types/race'

const TIME_RACE: RaceSortInput = { mode: 'time', target_distance_km: 0 }
const DIST_RACE: RaceSortInput = { mode: 'distance', target_distance_km: 5 }
const FREE_RACE: RaceSortInput = { mode: 'distance', target_distance_km: 0 }

let seq = 0
const p = (over: Partial<RaceParticipant> & { status?: ParticipantStatus } = {}): RaceParticipant => ({
  id: `p${++seq}`,
  race: 'r1',
  user: `u${seq}`,
  display_name: `Runner ${seq}`,
  status: 'racing',
  distance_km: 0,
  duration_seconds: 0,
  avg_pace: 0,
  last_lat: null,
  last_lng: null,
  last_update: null,
  finished_at: null,
  gps_track: null,
  ...over,
})

describe('sortRaceParticipants', () => {
  it('modo time: finalizados ordenan por distancia desc, no por finished_at', () => {
    // finished_at en orden INVERSO a la distancia (el más lento sincronizó primero)
    const slow = p({ display_name: 'Slow', status: 'finished', distance_km: 3.1, finished_at: '2026-07-08T10:30:00.100Z' })
    const fast = p({ display_name: 'Fast', status: 'finished', distance_km: 5.2, finished_at: '2026-07-08T10:30:01.900Z' })
    const mid = p({ display_name: 'Mid', status: 'finished', distance_km: 4.0, finished_at: '2026-07-08T10:30:00.500Z' })

    const out = sortRaceParticipants([slow, fast, mid], TIME_RACE)
    expect(out.map((x) => x.display_name)).toEqual(['Fast', 'Mid', 'Slow'])
  })

  it('modo time: empate de distancia se rompe por mejor pace, luego nombre', () => {
    const a = p({ display_name: 'Bravo', status: 'finished', distance_km: 5, avg_pace: 6.0 })
    const b = p({ display_name: 'Alfa', status: 'finished', distance_km: 5, avg_pace: 5.5 })
    const c = p({ display_name: 'Aaa', status: 'finished', distance_km: 5, avg_pace: 6.0 })

    const out = sortRaceParticipants([a, b, c], TIME_RACE)
    expect(out.map((x) => x.display_name)).toEqual(['Alfa', 'Aaa', 'Bravo'])
  })

  it('modo distance con objetivo: finalizados ordenan por finished_at asc', () => {
    const second = p({ display_name: 'Second', status: 'finished', distance_km: 5, finished_at: '2026-07-08T10:31:00Z' })
    const first = p({ display_name: 'First', status: 'finished', distance_km: 5, finished_at: '2026-07-08T10:30:00Z' })

    const out = sortRaceParticipants([second, first], DIST_RACE)
    expect(out.map((x) => x.display_name)).toEqual(['First', 'Second'])
  })

  it('modo distance con objetivo: finished sin finished_at va detrás', () => {
    const noTs = p({ display_name: 'NoTs', status: 'finished', finished_at: null })
    const withTs = p({ display_name: 'WithTs', status: 'finished', finished_at: '2026-07-08T10:30:00Z' })

    const out = sortRaceParticipants([noTs, withTs], DIST_RACE)
    expect(out.map((x) => x.display_name)).toEqual(['WithTs', 'NoTs'])
  })

  it('carrera libre (sin objetivo): finalizados ordenan por distancia, no por force-finish', () => {
    // El creador termina la carrera → todos finished casi a la vez
    const far = p({ display_name: 'Far', status: 'finished', distance_km: 6, finished_at: '2026-07-08T10:30:00.900Z' })
    const near = p({ display_name: 'Near', status: 'finished', distance_km: 2, finished_at: '2026-07-08T10:30:00.100Z' })

    const out = sortRaceParticipants([near, far], FREE_RACE)
    expect(out.map((x) => x.display_name)).toEqual(['Far', 'Near'])
  })

  it('grupos: finalizados primero, corriendo en medio, dnf al final (ambos modos)', () => {
    const dnf = p({ display_name: 'Dnf', status: 'dnf', distance_km: 9 })
    const racing = p({ display_name: 'Racing', status: 'racing', distance_km: 4 })
    const fin = p({ display_name: 'Fin', status: 'finished', distance_km: 1, finished_at: '2026-07-08T10:30:00Z' })

    for (const race of [TIME_RACE, DIST_RACE]) {
      const out = sortRaceParticipants([dnf, racing, fin], race)
      expect(out.map((x) => x.display_name)).toEqual(['Fin', 'Racing', 'Dnf'])
    }
  })

  it('en carrera: distancia desc, empate por menos tiempo, luego nombre', () => {
    const a = p({ display_name: 'B', status: 'racing', distance_km: 3, duration_seconds: 900 })
    const b = p({ display_name: 'A', status: 'racing', distance_km: 3, duration_seconds: 800 })
    const c = p({ display_name: 'C', status: 'racing', distance_km: 4, duration_seconds: 999 })

    const out = sortRaceParticipants([a, b, c], TIME_RACE)
    expect(out.map((x) => x.display_name)).toEqual(['C', 'A', 'B'])
  })

  it('race null (aún cargando): agrupa y cae al criterio por llegada sin crashear', () => {
    const fin = p({ display_name: 'Fin', status: 'finished', finished_at: '2026-07-08T10:30:00Z' })
    const racing = p({ display_name: 'Racing', status: 'racing', distance_km: 4 })

    const out = sortRaceParticipants([racing, fin], null)
    expect(out.map((x) => x.display_name)).toEqual(['Fin', 'Racing'])
  })

  it('no muta el array de entrada', () => {
    const arr = [p({ distance_km: 1 }), p({ distance_km: 2 })]
    const copy = [...arr]
    sortRaceParticipants(arr, TIME_RACE)
    expect(arr).toEqual(copy)
  })
})

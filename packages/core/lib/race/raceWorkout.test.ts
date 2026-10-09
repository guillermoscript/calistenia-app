import { describe, it, expect } from 'vitest'
import { buildRaceWorkoutRecord } from './raceWorkout'
import type { Race, RaceParticipant } from '../../types/race'

const race = {
  id: 'r1', name: 'Domingo', activity_type: 'cycling',
  starts_at: '2026-01-01T10:00:00.000Z', finished_at: '2026-01-01T10:30:00.000Z',
} as Race
const me = {
  id: 'p1', distance_km: 12.3, duration_seconds: 1800, avg_pace: 2.4,
  finished_at: '2026-01-01T10:29:00.000Z',
} as RaceParticipant

describe('buildRaceWorkoutRecord', () => {
  it('usa el tipo de actividad de la carrera y estima calorías', () => {
    const rec = buildRaceWorkoutRecord(race, me, [{ lat: 1, lng: 2, t: 5000 }], 'u1')
    expect(rec.user).toBe('u1')
    expect(rec.activity_type).toBe('cycling')
    expect(rec.calories_burned).toBeGreaterThan(0)
    expect(rec.note).toBe('Race: Domingo')
    expect(rec.finished_at).toBe(me.finished_at)
    expect(rec.gps_points).toEqual([
      { lat: 1, lng: 2, timestamp: new Date(race.starts_at).getTime() + 5000 },
    ])
  })

  it('sin finished_at propio cae al de la carrera', () => {
    const rec = buildRaceWorkoutRecord(race, { ...me, finished_at: null }, [], 'u1')
    expect(rec.finished_at).toBe(race.finished_at)
  })
})

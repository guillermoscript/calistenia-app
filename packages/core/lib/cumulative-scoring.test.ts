import { describe, it, expect } from 'vitest'
import {
  parseRepsTotal,
  sumExerciseTotal,
  countWorkouts,
  sumDistanceKm,
  compareLeaderboardEntries,
  isCumulativeMetric,
  type RankableEntry,
} from './cumulative-scoring'

describe('parseRepsTotal', () => {
  it('parses a plain number', () => {
    expect(parseRepsTotal('12')).toBe(12)
  })

  it('sums comma-separated segments', () => {
    expect(parseRepsTotal('8,10,12')).toBe(30)
  })

  it('multiplies NxM segments', () => {
    expect(parseRepsTotal('3x10')).toBe(30)
    expect(parseRepsTotal('3X10')).toBe(30)
    expect(parseRepsTotal('3×10')).toBe(30)
  })

  it('takes the larger side of a range as a single set', () => {
    expect(parseRepsTotal('8-12')).toBe(12)
  })

  it('sums plus-separated segments', () => {
    expect(parseRepsTotal('10+8')).toBe(18)
  })

  it('returns 0 for segments with no numbers', () => {
    expect(parseRepsTotal('max')).toBe(0)
  })

  it('returns 0 for empty, null and undefined', () => {
    expect(parseRepsTotal('')).toBe(0)
    expect(parseRepsTotal(null)).toBe(0)
    expect(parseRepsTotal(undefined)).toBe(0)
  })

  it('mixes multiplication and plain segments', () => {
    expect(parseRepsTotal('3x10, 8')).toBe(38)
  })

  it('extracts the number from free text', () => {
    expect(parseRepsTotal('10 reps')).toBe(10)
  })
})

describe('sumExerciseTotal', () => {
  it('returns 0 for an empty array', () => {
    expect(sumExerciseTotal([])).toBe(0)
  })

  it('sums parsed reps across rows', () => {
    const rows = [
      { workout_key: 'w1', logged_at: '2026-08-01T10:00:00Z', reps: '10' },
      { workout_key: 'w1', logged_at: '2026-08-01T10:05:00Z', reps: '3x10' },
    ]
    expect(sumExerciseTotal(rows)).toBe(40)
  })

  it('counts the same record id once (idempotent across refetches)', () => {
    const rows = [
      { id: 'a1', workout_key: 'w1', logged_at: '2026-08-01T10:00:00Z', reps: '10' },
      { id: 'a1', workout_key: 'w1', logged_at: '2026-08-01T10:00:00Z', reps: '10' },
    ]
    expect(sumExerciseTotal(rows)).toBe(10)
  })

  it('counts distinct records with identical content separately', () => {
    // Dos series reales de 10 pueden ser idénticas en todos los campos salvo el id.
    const rows = [
      { id: 'a1', workout_key: 'w1', logged_at: '2026-08-01T10:00:00Z', reps: '10' },
      { id: 'a2', workout_key: 'w1', logged_at: '2026-08-01T10:00:00Z', reps: '10' },
    ]
    expect(sumExerciseTotal(rows)).toBe(20)
  })

  it('counts a past-logged 3x10 as 30, not 10 (regresión #374)', () => {
    // `LogWorkoutPage` pasa `date` a `logSet`, así que las tres series comparten
    // `logged_at` = medianoche. Deduplicar por contenido las colapsaba en una.
    const rows = [
      { id: 'p1', workout_key: 'p1_day4', logged_at: '2026-08-05 00:00:00', reps: '10' },
      { id: 'p2', workout_key: 'p1_day4', logged_at: '2026-08-05 00:00:00', reps: '10' },
      { id: 'p3', workout_key: 'p1_day4', logged_at: '2026-08-05 00:00:00', reps: '10' },
    ]
    expect(sumExerciseTotal(rows)).toBe(30)
  })

  it('counts rows differing only in logged_at separately', () => {
    const rows = [
      { id: 'b1', workout_key: 'w1', logged_at: '2026-08-01T10:00:00Z', reps: '10' },
      { id: 'b2', workout_key: 'w1', logged_at: '2026-08-01T10:05:00Z', reps: '10' },
    ]
    expect(sumExerciseTotal(rows)).toBe(20)
  })

  it('counts rows differing only in reps separately', () => {
    const rows = [
      { id: 'c1', workout_key: 'w1', logged_at: '2026-08-01T10:00:00Z', reps: '10' },
      { id: 'c2', workout_key: 'w1', logged_at: '2026-08-01T10:00:00Z', reps: '12' },
    ]
    expect(sumExerciseTotal(rows)).toBe(22)
  })

  it('counts every row when the rows carry no id', () => {
    const rows = [{ reps: '10' }, { reps: '10' }]
    expect(sumExerciseTotal(rows)).toBe(20)
  })
})

describe('countWorkouts', () => {
  const utcToLocalDay = (utc: string) => utc.slice(0, 10)

  it('returns 0 for no sessions and no cardio', () => {
    expect(countWorkouts([], [], utcToLocalDay)).toBe(0)
  })

  it('dedupes sessions by (workout_key, local day)', () => {
    const sessions = [
      { workout_key: 'w1', completed_at: '2026-08-01T10:00:00Z' },
      { workout_key: 'w1', completed_at: '2026-08-01T20:00:00Z' },
    ]
    expect(countWorkouts(sessions, [], utcToLocalDay)).toBe(1)
  })

  it('counts the same workout_key on different days separately', () => {
    const sessions = [
      { workout_key: 'w1', completed_at: '2026-08-01T10:00:00Z' },
      { workout_key: 'w1', completed_at: '2026-08-02T10:00:00Z' },
    ]
    expect(countWorkouts(sessions, [], utcToLocalDay)).toBe(2)
  })

  it('counts different workout_keys on the same day separately', () => {
    const sessions = [
      { workout_key: 'w1', completed_at: '2026-08-01T10:00:00Z' },
      { workout_key: 'w2', completed_at: '2026-08-01T10:00:00Z' },
    ]
    expect(countWorkouts(sessions, [], utcToLocalDay)).toBe(2)
  })

  it('dedupes cardio by unique id', () => {
    const cardio = [
      { id: 'c1', started_at: '2026-08-01T10:00:00Z' },
      { id: 'c1', started_at: '2026-08-01T10:00:00Z' },
    ]
    expect(countWorkouts([], cardio, utcToLocalDay)).toBe(1)
  })

  it('sums sessions and cardio', () => {
    const sessions = [{ workout_key: 'w1', completed_at: '2026-08-01T10:00:00Z' }]
    const cardio = [{ id: 'c1', started_at: '2026-08-01T10:00:00Z' }]
    expect(countWorkouts(sessions, cardio, utcToLocalDay)).toBe(2)
  })

  it('ignores sessions without completed_at', () => {
    const sessions = [{ workout_key: 'w1' }]
    expect(countWorkouts(sessions, [], utcToLocalDay)).toBe(0)
  })
})

describe('sumDistanceKm', () => {
  it('returns 0 for an empty array', () => {
    expect(sumDistanceKm([])).toBe(0)
  })

  it('sums distances', () => {
    const rows = [{ id: 'c1', distance_km: 5 }, { id: 'c2', distance_km: 3 }]
    expect(sumDistanceKm(rows)).toBe(8)
  })

  it('counts a duplicate id once', () => {
    const rows = [{ id: 'c1', distance_km: 5 }, { id: 'c1', distance_km: 5 }]
    expect(sumDistanceKm(rows)).toBe(5)
  })

  it('treats a missing distance_km as 0', () => {
    const rows = [{ id: 'c1' }, { id: 'c2', distance_km: 4 }]
    expect(sumDistanceKm(rows)).toBe(4)
  })

  it('rounds to 2 decimals, avoiding float artifacts', () => {
    const rows = [{ id: 'c1', distance_km: 0.1 }, { id: 'c2', distance_km: 0.2 }]
    expect(sumDistanceKm(rows)).toBe(0.3)
  })
})

describe('compareLeaderboardEntries', () => {
  const entry = (over: Partial<RankableEntry>): RankableEntry => ({
    value: 0,
    joinedAt: '2026-08-01',
    userId: 'u1',
    ...over,
  })

  it('ranks the higher value first', () => {
    const a = entry({ value: 10, userId: 'a' })
    const b = entry({ value: 20, userId: 'b' })
    expect(compareLeaderboardEntries(a, b)).toBeGreaterThan(0)
    expect(compareLeaderboardEntries(b, a)).toBeLessThan(0)
  })

  it('breaks value ties with the earlier joinedAt first', () => {
    const early = entry({ value: 10, joinedAt: '2026-08-01', userId: 'a' })
    const late = entry({ value: 10, joinedAt: '2026-08-05', userId: 'b' })
    expect(compareLeaderboardEntries(early, late)).toBeLessThan(0)
    expect(compareLeaderboardEntries(late, early)).toBeGreaterThan(0)
  })

  it('breaks value+joinedAt ties with the lower userId first', () => {
    const a = entry({ value: 10, joinedAt: '2026-08-01', userId: 'aaa' })
    const b = entry({ value: 10, joinedAt: '2026-08-01', userId: 'bbb' })
    expect(compareLeaderboardEntries(a, b)).toBeLessThan(0)
    expect(compareLeaderboardEntries(b, a)).toBeGreaterThan(0)
  })

  it('sorts deterministically regardless of input order', () => {
    const e1 = entry({ value: 10, joinedAt: '2026-08-01', userId: 'aaa' })
    const e2 = entry({ value: 10, joinedAt: '2026-08-01', userId: 'bbb' })
    const e3 = entry({ value: 20, joinedAt: '2026-08-03', userId: 'ccc' })
    const e4 = entry({ value: 10, joinedAt: '2026-08-02', userId: 'ddd' })

    const sortedA = [e1, e2, e3, e4].sort(compareLeaderboardEntries).map(e => e.userId)
    const sortedB = [e4, e3, e2, e1].sort(compareLeaderboardEntries).map(e => e.userId)
    const sortedC = [e3, e1, e4, e2].sort(compareLeaderboardEntries).map(e => e.userId)

    expect(sortedA).toEqual(['ccc', 'aaa', 'bbb', 'ddd'])
    expect(sortedB).toEqual(sortedA)
    expect(sortedC).toEqual(sortedA)
  })
})

describe('isCumulativeMetric', () => {
  it('is true for the three cumulative metrics', () => {
    expect(isCumulativeMetric('total_workouts')).toBe(true)
    expect(isCumulativeMetric('total_exercise')).toBe(true)
    expect(isCumulativeMetric('total_distance')).toBe(true)
  })

  it('is false for non-cumulative metrics', () => {
    expect(isCumulativeMetric('exercise')).toBe(false)
    expect(isCumulativeMetric('custom')).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { ExerciseTimingTracker, formatTimingClock, prepareTimingBreakdown } from './exerciseTiming'

const A = { id: 'a', name: 'Exercise A' }
const B = { id: 'b', name: 'Exercise B' }

describe('ExerciseTimingTracker', () => {
  it('1. single exercise: enter at t=0, finalize at t=90_000 → 90s', () => {
    const tracker = new ExerciseTimingTracker()
    tracker.enterExercise(A, 0)
    const timings = tracker.finalize(90_000)
    expect(timings).toHaveLength(1)
    expect(timings[0].exerciseId).toBe('a')
    expect(timings[0].exerciseName).toBe('Exercise A')
    expect(timings[0].seconds).toBe(90)
  })

  it('2. two exercises sequential: A at 0, B at 60_000, finalize at 150_000 → A=60s, B=90s', () => {
    const tracker = new ExerciseTimingTracker()
    tracker.enterExercise(A, 0)
    tracker.enterExercise(B, 60_000)
    const timings = tracker.finalize(150_000)
    expect(timings).toHaveLength(2)
    expect(timings[0]).toMatchObject({ exerciseId: 'a', seconds: 60 })
    expect(timings[1]).toMatchObject({ exerciseId: 'b', seconds: 90 })
  })

  it('3. re-entering same exercise is no-op: enter A at 0, enter A at 30_000, finalize at 60_000 → A=60s', () => {
    const tracker = new ExerciseTimingTracker()
    tracker.enterExercise(A, 0)
    tracker.enterExercise(A, 30_000) // no-op — same exercise
    const timings = tracker.finalize(60_000)
    expect(timings).toHaveLength(1)
    expect(timings[0]).toMatchObject({ exerciseId: 'a', seconds: 60 })
  })

  it('4. revisit accumulates: A at 0, B at 60_000, A at 120_000, finalize at 180_000 → A=120s, B=60s, order [A, B]', () => {
    const tracker = new ExerciseTimingTracker()
    tracker.enterExercise(A, 0)
    tracker.enterExercise(B, 60_000)
    tracker.enterExercise(A, 120_000)
    const timings = tracker.finalize(180_000)
    expect(timings).toHaveLength(2)
    expect(timings[0]).toMatchObject({ exerciseId: 'a', seconds: 120 })
    expect(timings[1]).toMatchObject({ exerciseId: 'b', seconds: 60 })
  })

  it('5. serialization round-trip: getState()/restore, then continue → A=100s, B=60s', () => {
    const tracker1 = new ExerciseTimingTracker()
    tracker1.enterExercise(A, 0)
    const state = tracker1.getState()
    // State snapshot captures open interval (currentId=a, currentStartedAt=0)
    const tracker2 = new ExerciseTimingTracker(state)
    tracker2.enterExercise(B, 100_000)
    const timings = tracker2.finalize(160_000)
    expect(timings).toHaveLength(2)
    expect(timings[0]).toMatchObject({ exerciseId: 'a', seconds: 100 })
    expect(timings[1]).toMatchObject({ exerciseId: 'b', seconds: 60 })
  })

  it('6. finalize with nothing entered → []', () => {
    const tracker = new ExerciseTimingTracker()
    const timings = tracker.finalize(0)
    expect(timings).toEqual([])
  })

  it('7. negative delta clamped: enter A at 1000, finalize at 500 → A=0s', () => {
    const tracker = new ExerciseTimingTracker()
    tracker.enterExercise(A, 1000)
    const timings = tracker.finalize(500) // now < startedAt → delta clamped to 0
    expect(timings).toHaveLength(1)
    expect(timings[0]).toMatchObject({ exerciseId: 'a', seconds: 0 })
  })
})

describe('formatTimingClock', () => {
  it('0 → "0:00"', () => {
    expect(formatTimingClock(0)).toBe('0:00')
  })

  it('59 → "0:59"', () => {
    expect(formatTimingClock(59)).toBe('0:59')
  })

  it('90 → "1:30"', () => {
    expect(formatTimingClock(90)).toBe('1:30')
  })

  it('3661 → "1:01:01"', () => {
    expect(formatTimingClock(3661)).toBe('1:01:01')
  })
})

describe('prepareTimingBreakdown', () => {
  const t = (id: string, seconds: number) => ({ exerciseId: id, exerciseName: id.toUpperCase(), seconds })

  it('sorts longest-first and flags the max', () => {
    const { rows, overflowCount } = prepareTimingBreakdown([t('a', 60), t('b', 120), t('c', 90)])
    expect(rows.map(r => r.exerciseId)).toEqual(['b', 'c', 'a'])
    expect(rows.map(r => r.isMax)).toEqual([true, false, false])
    expect(overflowCount).toBe(0)
  })

  it('computes pct relative to the longest (max = 100)', () => {
    const { rows } = prepareTimingBreakdown([t('a', 50), t('b', 100)])
    expect(rows.find(r => r.exerciseId === 'b')!.pct).toBe(100)
    expect(rows.find(r => r.exerciseId === 'a')!.pct).toBe(50)
  })

  it('returns no rows when fewer than two timed exercises', () => {
    expect(prepareTimingBreakdown([t('a', 90)]).rows).toEqual([])
    expect(prepareTimingBreakdown([]).rows).toEqual([])
  })

  it('treats all-zero timings as nothing to show (no NaN pct)', () => {
    const { rows } = prepareTimingBreakdown([t('a', 0), t('b', 0)])
    expect(rows).toEqual([])
  })

  it('drops zero-second exercises but keeps the rest', () => {
    const { rows } = prepareTimingBreakdown([t('a', 0), t('b', 30), t('c', 60)])
    expect(rows.map(r => r.exerciseId)).toEqual(['c', 'b'])
  })

  it('caps at limit and reports overflowCount', () => {
    const all = [t('a', 10), t('b', 20), t('c', 30), t('d', 40)]
    const { rows, overflowCount } = prepareTimingBreakdown(all, 2)
    expect(rows.map(r => r.exerciseId)).toEqual(['d', 'c'])
    expect(overflowCount).toBe(2)
  })

  it('ties at the max are all flagged isMax', () => {
    const { rows } = prepareTimingBreakdown([t('a', 100), t('b', 100), t('c', 50)])
    expect(rows.filter(r => r.isMax).map(r => r.exerciseId).sort()).toEqual(['a', 'b'])
  })
})

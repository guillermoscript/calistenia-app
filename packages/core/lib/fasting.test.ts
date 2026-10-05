import { afterEach, describe, expect, it, vi } from 'vitest'
import { setTimezone } from './dateUtils'
import {
  FASTING_HOUR_MS as HOUR, FastingError, formatFastingDuration,
  fromLocalDateTimeInput, getFastingErrorKey, getFastingProgress, getFastingSummary,
  normalizeFastingTimestamp, parseFastingTimestamp, toLocalDateTimeInput,
  validateFastingSession, validateFastingSettings, parseFastingGoalHours,
  type FastingSession, type FastingSessionInput,
} from './fasting'

const NOW = Date.parse('2026-10-04T20:00:00Z')
const instant = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString()
const fast = (overrides: Partial<FastingSession> = {}): FastingSession => ({
  id: 'fast-1', userId: 'user-1', startedAt: instant(48), endedAt: instant(24),
  goalHours: 24, notes: '', ...overrides,
})
const input = (overrides: Partial<FastingSessionInput> = {}): FastingSessionInput => ({
  startedAt: instant(48), endedAt: instant(24), goalHours: 24, notes: '', ...overrides,
})
const fails = (fn: () => unknown, code: string) => expect(fn).toThrowError(new FastingError(code))

afterEach(() => setTimezone('UTC'))

describe('UTC timestamp normalization and local editors', () => {
  it('reads PocketBase UTC, missing Z and explicit offset dates consistently in another timezone', () => {
    setTimezone('America/Caracas')
    for (const value of ['2026-10-04 20:00:00.000Z', '2026-10-04 20:00:00', '2026-10-04T16:00:00-04:00']) {
      expect(parseFastingTimestamp(value)).toBe(NOW)
      expect(normalizeFastingTimestamp(value)).toBe('2026-10-04T20:00:00.000Z')
    }
    expect(toLocalDateTimeInput('2026-10-04 20:00:00.000Z')).toBe('2026-10-04T16:00')
    expect(fromLocalDateTimeInput('2026-10-04T16:00')).toBe('2026-10-04T20:00:00.000Z')
  })

  it('uses Intl when locale date strings cannot be parsed on Hermes', () => {
    const localeString = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('Invalid Date')
    try {
      setTimezone('America/Caracas')
      expect(toLocalDateTimeInput('2026-10-04T20:00:00.000Z')).toBe('2026-10-04T16:00')
      expect(fromLocalDateTimeInput('2026-10-04T16:00')).toBe('2026-10-04T20:00:00.000Z')
    } finally { localeString.mockRestore() }
  })

  it.each([
    ['Asia/Kathmandu', '2026-10-04T00:15', '2026-10-03T18:30:00.000Z'],
    ['America/New_York', '2026-11-01T01:30', '2026-11-01T05:30:00.000Z'],
    ['Australia/Lord_Howe', '2026-10-04T02:45', '2026-10-03T15:45:00.000Z'],
  ])('round-trips %s fractional offsets and repeated DST hours', (timezone, local, utc) => {
    setTimezone(timezone)
    expect(fromLocalDateTimeInput(local)).toBe(utc)
    expect(toLocalDateTimeInput(utc)).toBe(local)
  })

  it('rejects invalid timestamp input instead of returning an invalid ISO date', () => {
    expect(Number.isNaN(parseFastingTimestamp('not-a-date'))).toBe(true)
    fails(() => normalizeFastingTimestamp(''), 'invalidDate')
  })

  it.each(['2026-02-29T12:00', '2026-02-31T12:00', '2026-04-31T12:00', '2026-13-01T12:00',
    '2026-00-01T12:00', '2026-10-00T12:00', '2026-10-04T24:00', '2026-10-04T12:60',
    '2026-10-4T12:00', '2026-10-04', ''])('rejects calendar rollover or malformed local value %s', value => {
    setTimezone('UTC')
    fails(() => fromLocalDateTimeInput(value), 'invalidDate')
  })

  it('accepts leap days and rejects nonexistent DST local time', () => {
    setTimezone('UTC')
    expect(fromLocalDateTimeInput('2028-02-29T12:00')).toBe('2028-02-29T12:00:00.000Z')
    setTimezone('America/New_York')
    fails(() => fromLocalDateTimeInput('2026-03-08T02:30'), 'invalidDate')
    expect(fromLocalDateTimeInput('2026-03-08T03:30')).toBe('2026-03-08T07:30:00.000Z')
  })
})

describe('timer persistence and goal progress', () => {
  it('measures a 48-hour multi-day fast from its start timestamp', () => {
    const active = fast({ startedAt: instant(48), endedAt: null, goalHours: 48 })
    expect(getFastingProgress(active, NOW)).toEqual({
      elapsedMs: 48 * HOUR, remainingMs: 0, targetAt: new Date(NOW).toISOString(), progress: 1, goalReached: true,
    })
    expect(formatFastingDuration(48 * HOUR + 123000)).toBe('48:02:03')
  })

  it('continues elapsed time after reaching the goal until explicitly ended', () => {
    const active = fast({ startedAt: instant(49), endedAt: null, goalHours: 48 })
    const progress = getFastingProgress(active, NOW)
    expect(progress.elapsedMs).toBe(49 * HOUR)
    expect(progress.goalReached).toBe(true)
    expect(progress.progress).toBe(1)
    expect(active.endedAt).toBeNull()
    expect(getFastingSummary([active], NOW).completedCount).toBe(0)
  })

  it('freezes completed duration and snapshot goal regardless of current time or preferences', () => {
    const completed = fast({ goalHours: 36 })
    expect(getFastingProgress(completed, NOW)).toEqual(getFastingProgress(completed, NOW + 72 * HOUR))
    expect(getFastingProgress(completed, NOW)).toMatchObject({ elapsedMs: 24 * HOUR, remainingMs: 12 * HOUR, goalReached: false })
  })

  it('clamps timer before its start without producing negative displayed seconds', () => {
    expect(getFastingProgress(fast({ endedAt: null }), NOW - 96 * HOUR).elapsedMs).toBe(0)
    expect(formatFastingDuration(-1000)).toBe('00:00:00')
  })
})

describe('session integrity', () => {
  it.each([0, -1, 48.1, NaN, Infinity])('rejects invalid goal %s', goalHours => {
    fails(() => validateFastingSession(input({ goalHours }), [], NOW), 'invalidGoal')
  })

  it('accepts decimal and bounded goals, while weekly goals remain integers', () => {
    validateFastingSettings({ goalHours: 1, weeklyGoal: 1 })
    validateFastingSettings({ goalHours: 48, weeklyGoal: 7 })
    validateFastingSettings({ goalHours: 16.5, weeklyGoal: 3 })
    for (const weeklyGoal of [0, 8, 1.5, NaN]) fails(() => validateFastingSettings({ goalHours: 16, weeklyGoal }), 'invalidWeeklyGoal')
  })

  it('requires past dates, positive duration, and notes within 2000 characters', () => {
    fails(() => validateFastingSession(input({ startedAt: 'bad' }), [], NOW), 'invalidDate')
    fails(() => validateFastingSession(input({ startedAt: instant(-1), endedAt: null }), [], NOW), 'futureDate')
    fails(() => validateFastingSession(input({ endedAt: instant(-1) }), [], NOW), 'futureDate')
    for (const endedAt of [instant(48), instant(72)]) fails(() => validateFastingSession(input({ endedAt }), [], NOW), 'endBeforeStart')
    fails(() => validateFastingSession(input({ notes: 'x'.repeat(2001) }), [], NOW), 'notesTooLong')
    validateFastingSession(input({ notes: 'x'.repeat(2000) }), [], NOW)
  })

  it('rejects both partial overlaps and containment', () => {
    for (const [start, end] of [[60, 36], [36, 12], [40, 30], [60, 12]]) {
      fails(() => validateFastingSession(input({ startedAt: instant(start), endedAt: instant(end) }), [fast()], NOW), 'overlap')
    }
  })

  it('allows touching boundaries and editing the same record', () => {
    validateFastingSession(input({ startedAt: instant(24), endedAt: instant(12) }), [fast()], NOW)
    validateFastingSession(input({ startedAt: instant(72), endedAt: instant(48) }), [fast()], NOW)
    validateFastingSession(input({ id: 'fast-1', notes: 'Corrected' }), [fast()], NOW)
  })

  it('rejects second active sessions and backdated conflicts with either active or completed history', () => {
    const active = fast({ endedAt: null })
    fails(() => validateFastingSession(input({ startedAt: instant(1), endedAt: null }), [active], NOW), 'alreadyActive')
    fails(() => validateFastingSession(input({ startedAt: instant(36), endedAt: instant(12) }), [active], NOW), 'overlap')
    fails(() => validateFastingSession(input({ startedAt: instant(60), endedAt: null }), [fast()], NOW), 'overlap')
    validateFastingSession(input({ startedAt: instant(72), endedAt: instant(48) }), [active], NOW)
  })
})

describe('progress summaries in the configured timezone', () => {
  const completedAt = (id: string, endedAt: string, hours = 24) => fast({
    id, endedAt, startedAt: new Date(Date.parse(endedAt) - hours * HOUR).toISOString(),
  })

  it('counts a multi-day session once on its end date and excludes an active session', () => {
    setTimezone('UTC')
    const sessions = [completedAt('long', '2026-10-04T10:00:00Z', 48), completedAt('short', '2026-10-03T10:00:00Z', 12), fast({ id: 'active', endedAt: null })]
    expect(getFastingSummary(sessions, NOW)).toEqual({
      completedCount: 2, totalHours: 60, averageHours: 30, goalsReached: 1,
      weekCompleted: 2, monthCompleted: 2, weekHours: 60, monthHours: 60,
    })
  })

  it('starts the week on Monday in Caracas even when UTC has reached the next day', () => {
    setTimezone('America/Caracas')
    const sessions = [completedAt('sunday', '2026-10-05T02:00:00Z'), completedAt('monday', '2026-10-05T05:00:00Z')]
    expect(getFastingSummary(sessions.slice(0, 1), Date.parse('2026-10-05T03:00:00Z')).weekCompleted).toBe(1)
    expect(getFastingSummary(sessions, Date.parse('2026-10-05T06:00:00Z')).weekCompleted).toBe(1)
  })

  it('counts month rollover by local end date and handles the year boundary', () => {
    setTimezone('America/Caracas')
    const sessions = [completedAt('december', '2027-01-01T02:00:00Z'), completedAt('january', '2027-01-01T06:00:00Z')]
    expect(getFastingSummary(sessions.slice(0, 1), Date.parse('2027-01-01T03:00:00Z')).monthCompleted).toBe(1)
    expect(getFastingSummary(sessions, Date.parse('2027-01-01T08:00:00Z')).monthCompleted).toBe(1)
  })

  it('returns zero totals when history is empty', () => {
    expect(getFastingSummary([], NOW)).toMatchObject({ completedCount: 0, averageHours: 0, totalHours: 0, weekCompleted: 0, monthCompleted: 0 })
  })
})

describe('server error translation', () => {
  it.each([
    ['started_at', 'fasting_date', 'invalidDate'], ['started_at', 'fasting_future', 'futureDate'],
    ['ended_at', 'fasting_order', 'endBeforeStart'], ['started_at', 'fasting_overlap', 'overlap'],
  ])('maps server %s %s to a meaningful error', (field, code, expected) => {
    expect(getFastingErrorKey({ response: { data: { [field]: { code } } } })).toBe(`fasting.error.${expected}`)
  })

  it('distinguishes missing migrations, network problems, authentication and unknown errors', () => {
    expect(getFastingErrorKey(new FastingError('alreadyActive'))).toBe('fasting.error.alreadyActive')
    expect(getFastingErrorKey({ status: 404 })).toBe('fasting.error.unavailable')
    expect(getFastingErrorKey({ status: 0 })).toBe('fasting.error.offline')
    expect(getFastingErrorKey({ status: 401 })).toBe('fasting.error.signIn')
    expect(getFastingErrorKey(null)).toBe('fasting.error.save')
  })

  it.each([
    ['goal_hours', 'validation_min', 'invalidGoal'], ['goal_hours', 'validation_max', 'invalidGoal'],
    ['weekly_goal', 'validation_integer', 'invalidWeeklyGoal'], ['notes', 'validation_length', 'notesTooLong'],
  ])('maps generic PocketBase validation errors using field %s', (field, code, expected) => {
    expect(getFastingErrorKey({ response: { data: { [field]: { code } } } })).toBe(`fasting.error.${expected}`)
  })
})


describe('localized custom goals', () => {
  it.each(['16.5', '16,5', ' 16,5 '])('accepts a localized decimal %s', value => {
    expect(parseFastingGoalHours(value)).toBe(16.5)
  })
  it.each(['', 'Infinity', '1,000.5', '1.000,5', '16,5,2'])('rejects malformed or ambiguous numeric text %s', value => {
    expect(Number.isNaN(parseFastingGoalHours(value))).toBe(true)
  })
})

describe('editor timezone snapshots', () => {
  it('keeps the original editor timezone after the profile timezone changes', () => {
    setTimezone('America/Caracas')
    const editorTimezone = 'America/Caracas'
    const instant = '2026-10-04T20:00:00.000Z'
    const input = toLocalDateTimeInput(instant, editorTimezone)
    setTimezone('Asia/Kathmandu')
    expect(toLocalDateTimeInput(instant, editorTimezone)).toBe(input)
    expect(fromLocalDateTimeInput(input, editorTimezone)).toBe(instant)
  })
})

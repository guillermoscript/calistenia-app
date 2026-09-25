/**
 * openpanel-retention-report.test.mjs — Unit tests for the pure logic behind
 * the retention report (issue #826). No network: everything here works on
 * plain in-memory event arrays, so a failing assertion points at exactly one
 * broken metric instead of "the OpenPanel instance was unreachable".
 *
 * ISO-week fixtures were cross-checked against Python's `datetime.isocalendar()`
 * (stdlib, independent implementation) before being hardcoded below.
 *
 * Run with: pnpm test:retention-report
 * Or:       pnpm --filter @calistenia/core exec vitest run ../../scripts/openpanel-retention-report.test.mjs --root ../../scripts
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  FUNNEL_STEPS,
  REQUIRED_EVENT_NAMES,
  DEMO_PLAY_EXCLUDED_PROFILE_IDS,
  LOOKAHEAD_DAYS,
  LOOKAHEAD_EVENT_NAMES,
  parseCoreExcludedProfileIds,
  extractAnalyticsExcludedIds,
  isLikelyAnonymousProfileId,
  excludeProfiles,
  utcDayIndex,
  isoWeekKey,
  countDistinctProfiles,
  earliestByProfile,
  computeFunnel,
  computeCohortRetention,
  computeNorthStar,
  computeFirstWorkoutAbandonment,
  addDaysToDateString,
  buildEventFetchWindows,
  filterEventsInDeclaredRange,
  buildFunnelEventsByStep,
  toInclusiveEndOfDay,
  normalizeOpenPanelEvent,
  parseDotEnv,
  parseArgs,
  renderPlatformReport,
  fetchEventsPage,
} from './openpanel-retention-report.mjs'

const DAY = 86_400_000

function ev(event, profileId, createdAt, properties = null) {
  return { event, profileId, createdAt, properties }
}

describe('parseCoreExcludedProfileIds', () => {
  it('splits, trims and drops empty entries', () => {
    expect(parseCoreExcludedProfileIds(' abc123 , def456,, ')).toEqual(new Set(['abc123', 'def456']))
  })

  it('returns an empty set for undefined/empty input', () => {
    expect(parseCoreExcludedProfileIds(undefined)).toEqual(new Set())
    expect(parseCoreExcludedProfileIds('')).toEqual(new Set())
  })
})

describe('extractAnalyticsExcludedIds', () => {
  it('extracts ids from the real analytics.ts export shape', () => {
    const src = "export const ANALYTICS_EXCLUDED_PROFILE_IDS: ReadonlySet<string> = new Set(['7imoyrw39rritud'])"
    expect(extractAnalyticsExcludedIds(src)).toEqual(new Set(['7imoyrw39rritud']))
  })

  it('handles multiple ids and double quotes', () => {
    const src = 'const ANALYTICS_EXCLUDED_PROFILE_IDS = new Set(["a1", \'b2\'])'
    expect(extractAnalyticsExcludedIds(src)).toEqual(new Set(['a1', 'b2']))
  })

  it('returns null instead of throwing when the shape changed', () => {
    expect(extractAnalyticsExcludedIds('export const SOMETHING_ELSE = 1')).toBeNull()
  })

  it('the local DEMO_PLAY_EXCLUDED_PROFILE_IDS copy matches this shape', () => {
    // Guards the copy itself never silently drifts from what the extractor expects.
    expect([...DEMO_PLAY_EXCLUDED_PROFILE_IDS]).toEqual(['7imoyrw39rritud'])
  })
})

describe('isLikelyAnonymousProfileId', () => {
  it('matches a 32-char hex OpenPanel anonymous id', () => {
    expect(isLikelyAnonymousProfileId('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(true)
  })

  it('rejects a PocketBase-style 15-char profile id', () => {
    expect(isLikelyAnonymousProfileId('7imoyrw39rritud')).toBe(false)
  })

  it('rejects non-strings and empty values', () => {
    expect(isLikelyAnonymousProfileId(undefined)).toBe(false)
    expect(isLikelyAnonymousProfileId('')).toBe(false)
  })
})

describe('excludeProfiles', () => {
  it('drops events whose profileId is in the excluded set', () => {
    const events = [ev('x', 'a', 0), ev('x', 'b', 0), ev('x', 'c', 0)]
    expect(excludeProfiles(events, new Set(['b']))).toEqual([events[0], events[2]])
  })
})

describe('utcDayIndex', () => {
  it('is stable within the same UTC calendar day and steps by one across midnight', () => {
    const midday = Date.UTC(2026, 8, 23, 12, 0, 0)
    const sameDayLater = Date.UTC(2026, 8, 23, 23, 59, 0)
    const nextDay = Date.UTC(2026, 8, 24, 0, 0, 1)
    expect(utcDayIndex(sameDayLater)).toBe(utcDayIndex(midday))
    expect(utcDayIndex(nextDay)).toBe(utcDayIndex(midday) + 1)
  })
})

describe('isoWeekKey', () => {
  // Ground truth from Python: datetime(2026,1,4).isocalendar() == (2026, 1, 7)
  it('2026-01-04 (Sunday) is 2026-W01', () => {
    expect(isoWeekKey(Date.UTC(2026, 0, 4))).toBe('2026-W01')
  })

  // datetime(2025,1,1).isocalendar() == (2025, 1, 3)
  it('2025-01-01 (Wednesday) is 2025-W01', () => {
    expect(isoWeekKey(Date.UTC(2025, 0, 1))).toBe('2025-W01')
  })

  it('a Monday and the following Sunday share the same week', () => {
    // datetime(2026,1,5)/(2026,1,11).isocalendar() both == (2026, 2, *)
    expect(isoWeekKey(Date.UTC(2026, 0, 5))).toBe('2026-W02')
    expect(isoWeekKey(Date.UTC(2026, 0, 11))).toBe('2026-W02')
  })

  it('the next Monday rolls over to the next week', () => {
    expect(isoWeekKey(Date.UTC(2026, 0, 12))).toBe('2026-W03')
  })

  // The classic ISO edge case: late-December dates that belong to next year's week 1.
  it('2025-12-29 (Monday) belongs to 2026-W01, not 2025', () => {
    expect(isoWeekKey(Date.UTC(2025, 11, 29))).toBe('2026-W01')
  })

  it('2025-12-31 (Wednesday) also belongs to 2026-W01', () => {
    expect(isoWeekKey(Date.UTC(2025, 11, 31))).toBe('2026-W01')
  })
})

describe('countDistinctProfiles / earliestByProfile', () => {
  it('counts unique profiles regardless of repeated events', () => {
    const events = [ev('x', 'a', 0), ev('x', 'a', 1), ev('x', 'b', 2)]
    expect(countDistinctProfiles(events)).toBe(2)
  })

  it('keeps the earliest event per profile', () => {
    const events = [ev('x', 'a', 500), ev('x', 'a', 100), ev('x', 'a', 300)]
    expect(earliestByProfile(events).get('a').createdAt).toBe(100)
  })
})

describe('computeFunnel', () => {
  it('counts distinct profiles per step and derives conversion percentages', () => {
    const eventsByStep = {
      session_started: [ev('e', 'a', 0), ev('e', 'b', 0), ev('e', 'c', 0), ev('e', 'd', 0)],
      signup_completed: [ev('e', 'a', 0), ev('e', 'b', 0)],
      onboarding_completed: [ev('e', 'a', 0)],
      first_workout_started: [ev('e', 'a', 0)],
      workout_completed: [],
    }
    const rows = computeFunnel(eventsByStep)
    expect(rows.map(r => r.key)).toEqual(FUNNEL_STEPS.map(s => s.key))
    expect(rows[0]).toMatchObject({ profiles: 4, pctOfPrevious: null, pctOfFirst: 100 })
    expect(rows[1]).toMatchObject({ profiles: 2, pctOfPrevious: 50, pctOfFirst: 50 })
    expect(rows[4]).toMatchObject({ profiles: 0, pctOfPrevious: 0 })
  })

  it('a repeated workout_completed by one profile still counts as one profile', () => {
    const eventsByStep = Object.fromEntries(FUNNEL_STEPS.map(s => [s.key, []]))
    eventsByStep.workout_completed = [ev('workout_completed', 'a', 0), ev('workout_completed', 'a', DAY)]
    const rows = computeFunnel(eventsByStep)
    expect(rows.find(r => r.key === 'workout_completed').profiles).toBe(1)
  })
})

describe('computeCohortRetention', () => {
  it('buckets by ISO week of signup and flags return on exact day offsets', () => {
    const signupMonday = Date.UTC(2026, 0, 5) // 2026-W02
    const signups = [
      ev('signup_completed', 'a', signupMonday),
      ev('signup_completed', 'b', signupMonday + 3 * 3600_000),
      ev('signup_completed', 'c', signupMonday + 8 * DAY), // 2026-W03
    ]
    const activity = [
      ev('session_started', 'a', signupMonday + 1 * DAY + 3600_000), // a returns D1
      ev('session_started', 'a', signupMonday + 7 * DAY + 3600_000), // a returns D7
      // b never returns
      ev('session_started', 'c', signupMonday + 8 * DAY + 1 * DAY), // c returns D1 of its own cohort
    ]
    const result = computeCohortRetention(signups, activity, { days: [1, 7] })
    const w02 = result.cohorts.find(c => c.week === '2026-W02')
    const w03 = result.cohorts.find(c => c.week === '2026-W03')
    expect(w02.size).toBe(2)
    expect(w02.retention[1]).toMatchObject({ returned: 1, rate: 50 })
    expect(w02.retention[7]).toMatchObject({ returned: 1, rate: 50 })
    expect(w03.size).toBe(1)
    expect(w03.retention[1]).toMatchObject({ returned: 1, rate: 100 })
    expect(result.totalSize).toBe(3)
    expect(result.overall[1].returned).toBe(2)
  })

  it('uses calendar-day boundaries, not a rolling 24h window', () => {
    const signupTs = Date.UTC(2026, 0, 5, 22, 0, 0) // Jan 5, 22:00 UTC
    const signups = [ev('signup_completed', 'a', signupTs), ev('signup_completed', 'b', signupTs)]
    const activity = [
      // a: 1h later, still calendar-day 0 (Jan 5) — must NOT count as D1.
      ev('session_started', 'a', signupTs + 1 * 3600_000),
      // b: just after midnight, only ~2h05m later but already calendar-day 1 (Jan 6) —
      // MUST count as D1. A rolling-24h implementation would get this wrong.
      ev('session_started', 'b', signupTs + 2 * 3600_000 + 5 * 60_000),
    ]
    const result = computeCohortRetention(signups, activity, { days: [1] })
    expect(result.overall[1].returned).toBe(1)
  })

  it('a profile with no signup events produces empty cohorts', () => {
    const result = computeCohortRetention([], [], { days: [1, 7] })
    expect(result.cohorts).toEqual([])
    expect(result.totalSize).toBe(0)
    expect(result.overall[1].rate).toBe(0)
  })
})

describe('computeNorthStar', () => {
  const signupTs = Date.UTC(2026, 0, 1)

  it('qualifies a profile with exactly the threshold within the window', () => {
    const signups = [ev('signup_completed', 'a', signupTs)]
    const completions = [
      ev('workout_completed', 'a', signupTs + 1 * DAY),
      ev('workout_completed', 'a', signupTs + 2 * DAY),
      ev('workout_completed', 'a', signupTs + 3 * DAY),
    ]
    const result = computeNorthStar(signups, completions, { windowDays: 7, threshold: 3 })
    expect(result).toMatchObject({ cohortSize: 1, qualifying: 1, rate: 100 })
  })

  it('does not qualify a profile one short of the threshold', () => {
    const signups = [ev('signup_completed', 'a', signupTs)]
    const completions = [ev('workout_completed', 'a', signupTs + 1 * DAY), ev('workout_completed', 'a', signupTs + 2 * DAY)]
    const result = computeNorthStar(signups, completions, { windowDays: 7, threshold: 3 })
    expect(result).toMatchObject({ qualifying: 0, rate: 0 })
  })

  it('a completion just outside the window does not count', () => {
    const signups = [ev('signup_completed', 'a', signupTs)]
    const completions = [
      ev('workout_completed', 'a', signupTs + 1 * DAY),
      ev('workout_completed', 'a', signupTs + 2 * DAY),
      ev('workout_completed', 'a', signupTs + 7 * DAY), // exactly at the boundary: excluded (half-open window)
    ]
    const result = computeNorthStar(signups, completions, { windowDays: 7, threshold: 3 })
    expect(result.qualifying).toBe(0)
  })

  it('a completion before signup (data artifact) is never counted', () => {
    const signups = [ev('signup_completed', 'a', signupTs)]
    const completions = [ev('workout_completed', 'a', signupTs - 3600_000)]
    const result = computeNorthStar(signups, completions)
    expect(result.qualifying).toBe(0)
  })
})

describe('computeFirstWorkoutAbandonment', () => {
  it('uses is_first_workout when at least one abandoned event carries the property', () => {
    const started = [ev('first_workout_started', 'a', 0), ev('first_workout_started', 'b', 0)]
    const completed = []
    const abandoned = [
      ev('workout_abandoned', 'a', 100, { is_first_workout: true }),
      ev('workout_abandoned', 'b', 100, { is_first_workout: false }),
    ]
    const result = computeFirstWorkoutAbandonment(started, completed, abandoned)
    expect(result).toMatchObject({ method: 'is_first_workout', cohortSize: 2, abandoned: 1, rate: 50 })
  })

  it('falls back to "no matching completion within 24h" when the property is absent everywhere', () => {
    const start = Date.UTC(2026, 0, 1, 10, 0, 0)
    const started = [ev('first_workout_started', 'a', start), ev('first_workout_started', 'b', start)]
    const completed = [ev('workout_completed', 'a', start + 3600_000)] // a completed within the hour
    const abandoned = [ev('workout_abandoned', 'b', start + 500_000, { duration_seconds: 40 })] // no is_first_workout key
    const result = computeFirstWorkoutAbandonment(started, completed, abandoned)
    expect(result).toMatchObject({ method: 'fallback_no_matching_completion', cohortSize: 2, abandoned: 1, rate: 50 })
  })

  it('fallback treats a completion just past the window as still abandoned', () => {
    const start = Date.UTC(2026, 0, 1)
    const started = [ev('first_workout_started', 'a', start)]
    const completed = [ev('workout_completed', 'a', start + 25 * 3600_000)] // 25h later
    const result = computeFirstWorkoutAbandonment(started, completed, [], { fallbackWindowHours: 24 })
    expect(result).toMatchObject({ abandoned: 1, rate: 100 })
  })

  it('an empty cohort has a defined zero rate instead of NaN', () => {
    const result = computeFirstWorkoutAbandonment([], [], [])
    expect(result.rate).toBe(0)
  })
})

describe('addDaysToDateString', () => {
  it('adds days to a bare YYYY-MM-DD date', () => {
    expect(addDaysToDateString('2026-09-22', 7)).toBe('2026-09-29')
  })

  it('rolls over month and year boundaries', () => {
    expect(addDaysToDateString('2026-12-28', 7)).toBe('2027-01-04')
  })

  it('returns the input unchanged when it is not a parseable date', () => {
    expect(addDaysToDateString('not-a-date', 7)).toBe('not-a-date')
  })
})

describe('buildEventFetchWindows', () => {
  it('extends `to` by LOOKAHEAD_DAYS only for session_started and workout_completed', () => {
    const windows = buildEventFetchWindows(REQUIRED_EVENT_NAMES, { from: '2026-08-20', to: '2026-09-22' })
    const byEvent = Object.fromEntries(windows.map(w => [w.event, w]))

    expect(LOOKAHEAD_EVENT_NAMES.has('session_started')).toBe(true)
    expect(LOOKAHEAD_EVENT_NAMES.has('workout_completed')).toBe(true)
    expect(byEvent.session_started.to).toBe(addDaysToDateString('2026-09-22', LOOKAHEAD_DAYS))
    expect(byEvent.workout_completed.to).toBe(addDaysToDateString('2026-09-22', LOOKAHEAD_DAYS))
  })

  it('leaves `to` untouched for events that are not a lookahead signal', () => {
    const windows = buildEventFetchWindows(REQUIRED_EVENT_NAMES, { from: '2026-08-20', to: '2026-09-22' })
    const byEvent = Object.fromEntries(windows.map(w => [w.event, w]))

    expect(byEvent.signup_completed.to).toBe('2026-09-22')
    expect(byEvent.onboarding_completed.to).toBe('2026-09-22')
    expect(byEvent.first_workout_started.to).toBe('2026-09-22')
    expect(byEvent.workout_abandoned.to).toBe('2026-09-22')
  })

  it('never changes `from` for any event', () => {
    const windows = buildEventFetchWindows(REQUIRED_EVENT_NAMES, { from: '2026-08-20', to: '2026-09-22' })
    expect(windows.every(w => w.from === '2026-08-20')).toBe(true)
  })
})

describe('filterEventsInDeclaredRange', () => {
  it('keeps only events within [from, to] inclusive, using the end-of-day cutoff for `to`', () => {
    const events = [
      ev('e', 'before', Date.UTC(2026, 7, 1) - 1), // just before `from`
      ev('e', 'start', Date.UTC(2026, 7, 1)), // exactly `from`
      ev('e', 'mid', Date.UTC(2026, 7, 3)),
      ev('e', 'end', Date.UTC(2026, 7, 7, 23, 59, 59, 999)), // last instant of `to`
      ev('e', 'after', Date.UTC(2026, 7, 8)), // just past `to`
    ]
    const kept = filterEventsInDeclaredRange(events, { from: '2026-08-01', to: '2026-08-07' })
    expect(kept.map(e => e.profileId)).toEqual(['start', 'mid', 'end'])
  })
})

describe('buildFunnelEventsByStep (regression: funnel must not see the lookahead-extended fetch window)', () => {
  it('excludes a profile whose only session_started/workout_completed falls in the lookahead window', () => {
    const from = '2026-08-01'
    const to = '2026-08-07'
    // Shaped exactly like what runPlatform actually passes: session_started
    // and workout_completed were fetched through buildEventFetchWindows,
    // i.e. up to `to + LOOKAHEAD_DAYS` (2026-08-14), so the raw arrays
    // already contain events dated after the declared `to`.
    const eventsByStep = {
      session_started: [
        ev('session_started', 'in-range', Date.UTC(2026, 7, 3)),
        ev('session_started', 'lookahead-only', Date.UTC(2026, 7, 10)), // inside +7d lookahead, outside declared range
      ],
      signup_completed: [ev('signup_completed', 'in-range', Date.UTC(2026, 7, 2))],
      onboarding_completed: [],
      first_workout_started: [],
      workout_completed: [
        ev('workout_completed', 'in-range', Date.UTC(2026, 7, 3)),
        ev('workout_completed', 'lookahead-only', Date.UTC(2026, 7, 12)),
      ],
    }

    const scoped = buildFunnelEventsByStep(eventsByStep, { from, to })
    const funnel = computeFunnel(scoped)

    expect(funnel.find(r => r.key === 'session_started').profiles).toBe(1)
    expect(funnel.find(r => r.key === 'workout_completed').profiles).toBe(1)
  })

  it('leaves steps outside LOOKAHEAD_EVENT_NAMES untouched, even with a lookahead-window event', () => {
    // signup_completed/onboarding_completed/first_workout_started are always
    // fetched with the exact declared `to` (see buildEventFetchWindows), so
    // this only guards that buildFunnelEventsByStep does not over-filter them.
    const eventsByStep = {
      session_started: [],
      signup_completed: [ev('signup_completed', 'a', Date.UTC(2026, 7, 3))],
      onboarding_completed: [ev('onboarding_completed', 'a', Date.UTC(2026, 7, 3))],
      first_workout_started: [ev('first_workout_started', 'a', Date.UTC(2026, 7, 3))],
      workout_completed: [],
    }
    const scoped = buildFunnelEventsByStep(eventsByStep, { from: '2026-08-01', to: '2026-08-07' })
    expect(scoped.signup_completed).toEqual(eventsByStep.signup_completed)
    expect(scoped.onboarding_completed).toEqual(eventsByStep.onboarding_completed)
    expect(scoped.first_workout_started).toEqual(eventsByStep.first_workout_started)
  })
})

describe('toInclusiveEndOfDay', () => {
  it('normalizes a bare YYYY-MM-DD date to the last instant of that UTC day', () => {
    expect(toInclusiveEndOfDay('2026-09-22')).toBe('2026-09-22T23:59:59.999Z')
  })

  it('leaves a value that already carries a time component untouched', () => {
    expect(toInclusiveEndOfDay('2026-09-22T10:00:00.000Z')).toBe('2026-09-22T10:00:00.000Z')
  })
})

describe('fetchEventsPage (HTTP layer)', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('requests `properties` explicitly and sends an inclusive end-of-day cutoff', async () => {
    let requestedUrl
    global.fetch = vi.fn(async url => {
      requestedUrl = url
      return { ok: true, status: 200, json: async () => ({ data: [], meta: { pages: 1 } }) }
    })

    await fetchEventsPage({
      baseUrl: 'https://openpanel.example/api',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      projectId: 'p1',
      event: 'session_started',
      from: '2026-08-20',
      to: '2026-09-22',
      page: 1,
      limit: 1000,
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const url = new URL(requestedUrl)
    expect(url.searchParams.get('includes')).toBe('profile,meta,properties')
    expect(url.searchParams.get('start')).toBe('2026-08-20')
    expect(url.searchParams.get('end')).toBe('2026-09-22T23:59:59.999Z')
  })
})

describe('normalizeOpenPanelEvent', () => {
  it('reads the documented field names', () => {
    const raw = { name: 'signup_completed', profileId: 'p1', createdAt: '2026-01-01T00:00:00.000Z', properties: { method: 'email' } }
    expect(normalizeOpenPanelEvent(raw)).toEqual({
      event: 'signup_completed',
      profileId: 'p1',
      createdAt: Date.UTC(2026, 0, 1),
      properties: { method: 'email' },
    })
  })

  it('falls back to alternate field names and a null properties object', () => {
    const raw = { event: 'workout_completed', profile: { id: 'p2' }, timestamp: 1767225600000 }
    const out = normalizeOpenPanelEvent(raw)
    expect(out.event).toBe('workout_completed')
    expect(out.profileId).toBe('p2')
    expect(out.createdAt).toBe(1767225600000)
    expect(out.properties).toBeNull()
  })
})

describe('parseDotEnv', () => {
  it('parses KEY=VALUE lines, skips comments/blank lines, and strips quotes', () => {
    const content = [
      '# comment',
      '',
      'OPENPANEL_READ_CLIENT_ID=abc123',
      'QUOTED="hello world"',
      "SINGLE='x y'",
      'WITH_EQUALS=a=b=c',
    ].join('\n')
    expect(parseDotEnv(content)).toEqual({
      OPENPANEL_READ_CLIENT_ID: 'abc123',
      QUOTED: 'hello world',
      SINGLE: 'x y',
      WITH_EQUALS: 'a=b=c',
    })
  })
})

describe('parseArgs', () => {
  it('reads --from/--to/--platform/--out and defaults platform to both', () => {
    expect(parseArgs(['--from', '2026-08-20', '--to', '2026-09-22'])).toMatchObject({
      from: '2026-08-20',
      to: '2026-09-22',
      platform: 'both',
      out: null,
    })
  })

  it('reads an explicit platform and out path', () => {
    expect(parseArgs(['--platform', 'web', '--out', 'report.md.local'])).toMatchObject({
      platform: 'web',
      out: 'report.md.local',
    })
  })
})

describe('renderPlatformReport', () => {
  it('is pure markdown text containing every section, with no network calls', () => {
    const funnel = computeFunnel(Object.fromEntries(FUNNEL_STEPS.map(s => [s.key, []])))
    const cohortRetention = computeCohortRetention([], [])
    const northStar = computeNorthStar([], [])
    const abandonment = computeFirstWorkoutAbandonment([], [], [])
    const out = renderPlatformReport('mobile', {
      from: '2026-08-20',
      to: '2026-09-22',
      funnel,
      cohortRetention,
      northStar,
      abandonment,
      caveats: ['aviso de prueba'],
    })
    expect(out).toContain('## mobile')
    expect(out).toContain('### Embudo')
    expect(out).toContain('### D1 / D7')
    expect(out).toContain('### Métrica norte')
    expect(out).toContain('### Abandono del primer entreno')
    expect(out).toContain('aviso de prueba')
  })
})

describe('REQUIRED_EVENT_NAMES', () => {
  it('covers every funnel step plus workout_abandoned, with no duplicates', () => {
    expect(new Set(REQUIRED_EVENT_NAMES).size).toBe(REQUIRED_EVENT_NAMES.length)
    for (const step of FUNNEL_STEPS) expect(REQUIRED_EVENT_NAMES).toContain(step.key)
    expect(REQUIRED_EVENT_NAMES).toContain('workout_abandoned')
  })
})

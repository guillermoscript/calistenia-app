import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  buildWeekWindows,
  computeMilestoneProgress,
  computeProgramProgress,
  getMilestoneState,
  getProgramEndDay,
  getProgramQueryRange,
  getWeekForDay,
  type CommunityProgramMilestone,
} from './community-programs'
import { getTimezone, setTimezone, utcToLocalDateStr } from './dateUtils'

const originalTz = getTimezone()
afterAll(() => setTimezone(originalTz))

/** Día local a partir de un timestamp de PB, con la tz que fije cada test. */
const localDay = (utc: string) => utcToLocalDateStr(utc)

function milestone(over: Partial<CommunityProgramMilestone> & { id: string; week: number }): CommunityProgramMilestone {
  return {
    program: 'prog1',
    title_key: `communityProgram.30dias.week${over.week}.title`,
    kind: 'workout_count',
    target: 3,
    ...over,
  }
}

describe('buildWeekWindows', () => {
  it('splits a 28-day program into four 7-day windows, end day inclusive', () => {
    const windows = buildWeekWindows('2026-08-01', 28)
    expect(windows).toHaveLength(4)
    expect(windows[0]).toEqual({ week: 1, startDay: '2026-08-01', endDay: '2026-08-07', days: 7 })
    expect(windows[3]).toEqual({ week: 4, startDay: '2026-08-22', endDay: '2026-08-28', days: 7 })
    expect(getProgramEndDay(windows)).toBe('2026-08-28')
  })

  it('leaves a short final window when the duration is not divisible by 7', () => {
    // El programa de 30 días: 4 semanas completas + una cola de 2 días.
    const windows = buildWeekWindows('2026-08-01', 30)
    expect(windows).toHaveLength(5)
    expect(windows[4]).toEqual({ week: 5, startDay: '2026-08-29', endDay: '2026-08-30', days: 2 })
    expect(getProgramEndDay(windows)).toBe('2026-08-30')
  })

  it('returns an empty list for non-positive or invalid durations instead of throwing', () => {
    expect(buildWeekWindows('2026-08-01', 0)).toEqual([])
    expect(buildWeekWindows('2026-08-01', -7)).toEqual([])
    expect(buildWeekWindows('', 30)).toEqual([])
    expect(getProgramEndDay([])).toBe('')
  })

  // El caso que el issue pide explícitamente: un cambio de hora dentro del
  // programa NO puede crear una semana de 6 u 8 días. Como toda la aritmética
  // es de calendario (`addDays` sobre YYYY-MM-DD) y no de milisegundos, esto se
  // cumple en cualquier zona horaria.
  it.each([
    ['America/New_York', '2026-03-01'], // DST salta el 8 de marzo de 2026
    ['Europe/Madrid', '2026-03-22'], // DST salta el 29 de marzo de 2026
    ['Australia/Sydney', '2026-03-29'], // fin de DST en el hemisferio sur
  ])('keeps every week exactly 7 calendar days across a DST shift (%s)', (tz, start) => {
    setTimezone(tz)
    const windows = buildWeekWindows(start, 28)
    expect(windows).toHaveLength(4)
    for (const w of windows) {
      expect(w.days).toBe(7)
    }
    // Y encadenan sin huecos ni solapes.
    expect(windows[1].startDay > windows[0].endDay).toBe(true)
    expect(windows.map(w => w.startDay)).toEqual([start, ...windows.slice(1).map(w => w.startDay)])
  })
})

describe('getWeekForDay', () => {
  const windows = buildWeekWindows('2026-08-01', 30)

  it('finds the window containing a day, with both ends inclusive', () => {
    expect(getWeekForDay(windows, '2026-08-01')?.week).toBe(1)
    expect(getWeekForDay(windows, '2026-08-07')?.week).toBe(1)
    expect(getWeekForDay(windows, '2026-08-08')?.week).toBe(2)
    expect(getWeekForDay(windows, '2026-08-30')?.week).toBe(5)
  })

  it('returns null outside the program', () => {
    expect(getWeekForDay(windows, '2026-07-31')).toBeNull()
    expect(getWeekForDay(windows, '2026-08-31')).toBeNull()
    expect(getWeekForDay(windows, '')).toBeNull()
  })
})

describe('computeMilestoneProgress — week boundaries in the viewer timezone', () => {
  beforeEach(() => setTimezone('Europe/Madrid'))

  const windows = buildWeekWindows('2026-08-01', 28)
  const milestones = [milestone({ id: 'm1', week: 1, target: 3 })]

  it('counts a 23:30 local workout on the last day of the week for that week', () => {
    // 2026-08-07 23:30 en Madrid (UTC+2) = 2026-08-07 21:30Z.
    const progress = computeMilestoneProgress({
      milestones,
      windows,
      sessions: [{ workout_key: 'w1', completed_at: '2026-08-07 21:30:00.000Z' }],
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-08',
    })
    expect(progress[0].completed).toBe(1)
  })

  it('does not count a 00:10 local workout on the first day of the next week', () => {
    // 2026-08-08 00:10 en Madrid = 2026-08-07 22:10Z: mismo día UTC, semana
    // distinta. Si dedujéramos el día en UTC, esto contaría en la semana 1.
    const progress = computeMilestoneProgress({
      milestones,
      windows,
      sessions: [{ workout_key: 'w1', completed_at: '2026-08-07 22:10:00.000Z' }],
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-08',
    })
    expect(progress[0].completed).toBe(0)
  })

  it('excludes activity from before the member joined', () => {
    // Doce entrenos justo antes de apuntarse no pueden completar nada.
    const before = Array.from({ length: 12 }, (_, i) => ({
      workout_key: `w${i}`,
      completed_at: `2026-07-${String(20 + (i % 10)).padStart(2, '0')} 10:00:00.000Z`,
    }))
    const progress = computeMilestoneProgress({
      milestones,
      windows,
      sessions: before,
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-02',
    })
    expect(progress[0].completed).toBe(0)
    expect(progress[0].isComplete).toBe(false)
  })

  it('dedupes the same workout logged twice on the same day', () => {
    const twice = [
      { workout_key: 'push-a', completed_at: '2026-08-03 08:00:00.000Z' },
      { workout_key: 'push-a', completed_at: '2026-08-03 09:30:00.000Z' },
    ]
    const progress = computeMilestoneProgress({
      milestones,
      windows,
      sessions: twice,
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-04',
    })
    expect(progress[0].completed).toBe(1)
  })

  it('counts cardio sessions alongside strength sessions', () => {
    const progress = computeMilestoneProgress({
      milestones,
      windows,
      sessions: [{ workout_key: 'push-a', completed_at: '2026-08-03 08:00:00.000Z' }],
      cardio: [
        { id: 'c1', started_at: '2026-08-04 08:00:00.000Z' },
        { id: 'c2', started_at: '2026-08-05 08:00:00.000Z' },
      ],
      utcToLocalDay: localDay,
      today: '2026-08-06',
    })
    expect(progress[0].completed).toBe(3)
    expect(progress[0].isComplete).toBe(true)
  })

  it('reflects a deleted or edited workout on the next read', () => {
    const rows = [
      { workout_key: 'a', completed_at: '2026-08-02 08:00:00.000Z' },
      { workout_key: 'b', completed_at: '2026-08-03 08:00:00.000Z' },
      { workout_key: 'c', completed_at: '2026-08-04 08:00:00.000Z' },
    ]
    const base = { milestones, windows, cardio: [], utcToLocalDay: localDay, today: '2026-08-06' }
    expect(computeMilestoneProgress({ ...base, sessions: rows })[0].isComplete).toBe(true)
    // El usuario borra un entreno: el hito deja de estar completo, sin
    // revocación explícita, porque nunca se persistió nada.
    expect(computeMilestoneProgress({ ...base, sessions: rows.slice(1) })[0].isComplete).toBe(false)
  })

  it('a milestone cannot be completed twice — progress is a recount, not an increment', () => {
    const rows = [
      { workout_key: 'a', completed_at: '2026-08-02 08:00:00.000Z' },
      { workout_key: 'b', completed_at: '2026-08-03 08:00:00.000Z' },
      { workout_key: 'c', completed_at: '2026-08-04 08:00:00.000Z' },
    ]
    const input = { milestones, windows, sessions: rows, cardio: [], utcToLocalDay: localDay, today: '2026-08-06' }
    const first = computeMilestoneProgress(input)
    const second = computeMilestoneProgress(input)
    expect(first[0].completed).toBe(3)
    expect(second[0].completed).toBe(3)
    expect(second[0].isComplete).toBe(true)
  })

  it('locks a milestone until its week has started', () => {
    const all = [milestone({ id: 'm1', week: 1 }), milestone({ id: 'm4', week: 4 })]
    const progress = computeMilestoneProgress({
      milestones: all,
      windows,
      sessions: [],
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-03',
    })
    expect(progress[0].isUnlocked).toBe(true)
    expect(progress[1].isUnlocked).toBe(false)
  })

  it('orders milestones by week then sort_order regardless of fetch order', () => {
    const shuffled = [
      milestone({ id: 'b', week: 2, sort_order: 1 }),
      milestone({ id: 'a', week: 1 }),
      milestone({ id: 'c', week: 2, sort_order: 0 }),
    ]
    const progress = computeMilestoneProgress({
      milestones: shuffled,
      windows,
      sessions: [],
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-03',
    })
    expect(progress.map(p => p.milestone.id)).toEqual(['a', 'c', 'b'])
  })
})

describe('computeMilestoneProgress — safe states', () => {
  beforeEach(() => setTimezone('Europe/Madrid'))
  const windows = buildWeekWindows('2026-08-01', 28)

  it('marks a milestone pointing at a week outside the program as broken, never complete', () => {
    const progress = computeMilestoneProgress({
      milestones: [milestone({ id: 'm9', week: 9 })],
      windows,
      sessions: Array.from({ length: 20 }, (_, i) => ({ workout_key: `w${i}`, completed_at: '2026-08-02 08:00:00.000Z' })),
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-10',
    })
    expect(progress[0].isBroken).toBe(true)
    expect(progress[0].window).toBeNull()
    expect(progress[0].isComplete).toBe(false)
  })

  it('marks a challenge milestone whose challenge is gone as broken', () => {
    const progress = computeMilestoneProgress({
      milestones: [milestone({ id: 'mc', week: 1, kind: 'challenge', preset_key: 'starter_7_day', target: 3 })],
      windows,
      sessions: [],
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-02',
    })
    expect(progress[0].isBroken).toBe(true)
    expect(progress[0].isComplete).toBe(false)
  })

  it('uses caller-supplied progress for a resolvable challenge milestone', () => {
    const progress = computeMilestoneProgress({
      milestones: [milestone({ id: 'mc', week: 1, kind: 'challenge', preset_key: 'starter_7_day', target: 3 })],
      windows,
      sessions: [],
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-02',
      challengeProgress: { mc: 3 },
    })
    expect(progress[0].isBroken).toBe(false)
    expect(progress[0].completed).toBe(3)
    expect(progress[0].isComplete).toBe(true)
  })

  it('never completes a milestone whose target is zero', () => {
    const progress = computeMilestoneProgress({
      milestones: [milestone({ id: 'm0', week: 1, target: 0 })],
      windows,
      sessions: [],
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-02',
    })
    expect(progress[0].isComplete).toBe(false)
  })
})

describe('computeProgramProgress', () => {
  beforeEach(() => setTimezone('Europe/Madrid'))

  const program = { duration_days: 30 }
  const fourWeeks = [1, 2, 3, 4].map(week => milestone({ id: `m${week}`, week, target: 3 }))

  const sessionsFor = (days: string[]) =>
    days.map((day, i) => ({ workout_key: `w${i}`, completed_at: `${day} 10:00:00.000Z` }))

  it('reports current week, next milestone and overall percentage', () => {
    const progress = computeProgramProgress({
      program,
      startedOn: '2026-08-01',
      milestones: fourWeeks,
      sessions: sessionsFor(['2026-08-02', '2026-08-03', '2026-08-04']),
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-10',
    })
    expect(progress.currentWeek).toBe(2)
    expect(progress.completedMilestones).toBe(1)
    expect(progress.totalMilestones).toBe(4)
    expect(progress.percent).toBe(25)
    expect(progress.nextMilestone?.milestone.id).toBe('m2')
    expect(progress.isComplete).toBe(false)
    expect(progress.endDay).toBe('2026-08-30')
    expect(progress.daysRemaining).toBe(20)
  })

  it('completes the program when every milestone is met', () => {
    const days = ['02', '03', '04', '09', '10', '11', '16', '17', '18', '23', '24', '25'].map(d => `2026-08-${d}`)
    const progress = computeProgramProgress({
      program,
      startedOn: '2026-08-01',
      milestones: fourWeeks,
      sessions: sessionsFor(days),
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-30',
    })
    expect(progress.completedMilestones).toBe(4)
    expect(progress.percent).toBe(100)
    expect(progress.isComplete).toBe(true)
    expect(progress.nextMilestone).toBeNull()
    expect(progress.daysRemaining).toBe(0)
  })

  it('keeps a missed week missed — later workouts cannot backfill it', () => {
    // Nada en la semana 1; de sobra en la semana 2.
    const days = ['09', '10', '11', '12'].map(d => `2026-08-${d}`)
    const progress = computeProgramProgress({
      program,
      startedOn: '2026-08-01',
      milestones: fourWeeks,
      sessions: sessionsFor(days),
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-14',
    })
    expect(progress.milestones[0].isComplete).toBe(false)
    expect(progress.milestones[1].isComplete).toBe(true)
    expect(progress.percent).toBe(25)
  })

  it('is rolling: two members who joined on different days get different windows', () => {
    const sessions = sessionsFor(['2026-08-02', '2026-08-03', '2026-08-04'])
    const early = computeProgramProgress({
      program, startedOn: '2026-08-01', milestones: fourWeeks, sessions, cardio: [],
      utcToLocalDay: localDay, today: '2026-08-10',
    })
    const late = computeProgramProgress({
      program, startedOn: '2026-08-05', milestones: fourWeeks, sessions, cardio: [],
      utcToLocalDay: localDay, today: '2026-08-10',
    })
    expect(early.milestones[0].window?.startDay).toBe('2026-08-01')
    expect(late.milestones[0].window?.startDay).toBe('2026-08-05')
    // Los mismos entrenos cuentan para el primero y no para el segundo:
    // apuntarse más tarde no hereda la actividad anterior.
    expect(early.completedMilestones).toBe(1)
    expect(late.completedMilestones).toBe(0)
  })

  it('renders a safe, non-complete state for a program with no milestones', () => {
    const progress = computeProgramProgress({
      program, startedOn: '2026-08-01', milestones: [], sessions: [], cardio: [],
      utcToLocalDay: localDay, today: '2026-08-10',
    })
    expect(progress.totalMilestones).toBe(0)
    expect(progress.percent).toBe(0)
    // "Nada que hacer" no es "lo has conseguido".
    expect(progress.isComplete).toBe(false)
    expect(progress.nextMilestone).toBeNull()
  })

  it('renders a safe state for a program with a zero duration', () => {
    const progress = computeProgramProgress({
      program: { duration_days: 0 }, startedOn: '2026-08-01', milestones: fourWeeks,
      sessions: [], cardio: [], utcToLocalDay: localDay, today: '2026-08-10',
    })
    expect(progress.currentWeek).toBeNull()
    expect(progress.endDay).toBe('')
    expect(progress.milestones.every(m => m.isBroken)).toBe(true)
    expect(progress.isComplete).toBe(false)
  })

  it('reports no current week before the start or after the end', () => {
    const base = {
      program, startedOn: '2026-08-01', milestones: fourWeeks, sessions: [], cardio: [],
      utcToLocalDay: localDay,
    }
    expect(computeProgramProgress({ ...base, today: '2026-07-30' }).currentWeek).toBeNull()
    expect(computeProgramProgress({ ...base, today: '2026-09-05' }).currentWeek).toBeNull()
  })
})

describe('getMilestoneState', () => {
  beforeEach(() => setTimezone('Europe/Madrid'))

  const program = { duration_days: 28 }
  const fourWeeks = [1, 2, 3, 4].map(week => milestone({ id: `m${week}`, week, target: 3 }))

  function statesOn(today: string, days: string[]) {
    const progress = computeProgramProgress({
      program,
      startedOn: '2026-08-01',
      milestones: fourWeeks,
      sessions: days.map((day, i) => ({ workout_key: `w${i}`, completed_at: `${day} 10:00:00.000Z` })),
      cardio: [],
      utcToLocalDay: localDay,
      today,
    })
    return progress.milestones.map(m => getMilestoneState(m, today))
  }

  it('distinguishes complete, active, locked and missed weeks', () => {
    // Semana 1 completa, semana 2 en curso a medias, 3 y 4 aún bloqueadas.
    const states = statesOn('2026-08-10', ['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-09'])
    expect(states).toEqual(['complete', 'active', 'locked', 'locked'])
  })

  it('marks a week whose window closed without the target as missed', () => {
    const states = statesOn('2026-08-10', [])
    expect(states[0]).toBe('missed')
    expect(states[1]).toBe('active')
  })

  it('reports an unresolvable milestone as unavailable', () => {
    const progress = computeMilestoneProgress({
      milestones: [milestone({ id: 'm9', week: 9 })],
      windows: buildWeekWindows('2026-08-01', 28),
      sessions: [],
      cardio: [],
      utcToLocalDay: localDay,
      today: '2026-08-10',
    })
    expect(getMilestoneState(progress[0], '2026-08-10')).toBe('unavailable')
  })
})

describe('getProgramQueryRange', () => {
  it('spans the whole program so progress needs one query, not one per week', () => {
    expect(getProgramQueryRange('2026-08-01', 30)).toEqual({ startDay: '2026-08-01', endDay: '2026-08-30' })
  })

  it('degrades to a single day for invalid content instead of throwing', () => {
    expect(getProgramQueryRange('2026-08-01', 0)).toEqual({ startDay: '2026-08-01', endDay: '2026-08-01' })
  })
})

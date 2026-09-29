import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeWeeklyStreak,
  crossedWeeklyStreakMilestone,
  goalForWeekFromChanges,
  HISTORICAL_WEEKLY_GOAL,
  parseGoalLog,
  streakDayOf,
  WEEKLY_STREAK_MILESTONES,
  withGoalChange,
  type GoalChange,
  type WeeklyStreak,
} from './weeklyStreak'

interface FixtureCase {
  name: string
  today: string
  goal?: number
  goalChanges?: GoalChange[]
  fallbackGoal?: number
  doneDates: string[]
  expected: WeeklyStreak
}

// Mismo fichero que usará el servidor (#801): se lee como JSON plano, sin
// depender de `resolveJsonModule`.
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__/weekly-streak.json')
const { cases } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { cases: FixtureCase[] }

describe('computeWeeklyStreak · __fixtures__/weekly-streak.json', () => {
  it('el fixture tiene los casos que pide la issue', () => {
    const names = cases.map(c => c.name).join(' | ')
    for (const needle of ['semana cumplida', 'semana fallida', 'semana en curso', 'cambio de objetivo', 'cambio de programa', 'reentrada retroactiva']) {
      expect(names).toContain(needle)
    }
  })

  it.each(cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const goal = c.goalChanges ? goalForWeekFromChanges(c.goalChanges, c.fallbackGoal ?? 3) : (c.goal ?? 3)
    expect(computeWeeklyStreak(c.doneDates, goal, c.today)).toEqual(c.expected)
  })
})

describe('computeWeeklyStreak', () => {
  it('pasa el lunes y el domingo al objetivo de la función', () => {
    const calls: [string, string][] = []
    computeWeeklyStreak(['2026-09-22'], (start, last) => { calls.push([start, last]); return 1 }, '2026-09-30')
    expect(calls).toContainEqual(['2026-09-28', '2026-09-30'])
    expect(calls).toContainEqual(['2026-09-21', '2026-09-27'])
  })

  it('best nunca es menor que current', () => {
    const r = computeWeeklyStreak(['2026-09-28'], 1, '2026-09-30')
    expect(r.current).toBe(1)
    expect(r.best).toBe(1)
  })
})

describe('crossedWeeklyStreakMilestone', () => {
  it('hitos 4, 8, 12, 26 y 52 semanas', () => {
    expect(WEEKLY_STREAK_MILESTONES).toEqual([4, 8, 12, 26, 52])
    expect(crossedWeeklyStreakMilestone(3, 4)).toBe(4)
    expect(crossedWeeklyStreakMilestone(4, 5)).toBeNull()
    expect(crossedWeeklyStreakMilestone(25, 26)).toBe(26)
    // Reentrada retroactiva que salta varios: el mayor.
    expect(crossedWeeklyStreakMilestone(3, 9)).toBe(8)
    expect(crossedWeeklyStreakMilestone(0, 0)).toBeNull()
  })
})

describe('historial de objetivos (#801)', () => {
  it('parseGoalLog acepta el JSON de PocketBase y descarta basura', () => {
    expect(parseGoalLog([{ from: '2026-09-01', goal: 4 }, { from: '2026-02-31', goal: 2 }, { goal: 3 }, null]))
      .toEqual([{ from: '2026-09-01', goal: 4 }])
    expect(parseGoalLog('[{"from":"2026-09-01","goal":4}]')).toEqual([{ from: '2026-09-01', goal: 4 }])
    expect(parseGoalLog('roto')).toEqual([])
    expect(parseGoalLog(null)).toEqual([])
    expect(parseGoalLog({ from: '2026-09-01', goal: 4 })).toEqual([])
  })

  it('withGoalChange no escribe si el objetivo ya es el vigente', () => {
    // Sin historial rige el histórico (3): guardar 3 no cambia nada.
    expect(withGoalChange([], HISTORICAL_WEEKLY_GOAL, '2026-09-30')).toBeNull()
    expect(withGoalChange([{ from: '2026-09-01', goal: 4 }], 4, '2026-09-30')).toBeNull()
  })

  it('withGoalChange añade el cambio desde hoy', () => {
    expect(withGoalChange([], 4, '2026-09-30')).toEqual([{ from: '2026-09-30', goal: 4 }])
    expect(withGoalChange([{ from: '2026-09-01', goal: 4 }], 2, '2026-09-30'))
      .toEqual([{ from: '2026-09-01', goal: 4 }, { from: '2026-09-30', goal: 2 }])
  })

  it('withGoalChange sustituye un cambio del mismo día', () => {
    expect(withGoalChange([{ from: '2026-09-01', goal: 4 }, { from: '2026-09-30', goal: 2 }], 5, '2026-09-30'))
      .toEqual([{ from: '2026-09-01', goal: 4 }, { from: '2026-09-30', goal: 5 }])
  })

  it('withGoalChange ignora fechas y objetivos inválidos', () => {
    expect(withGoalChange([], 4, 'ayer')).toBeNull()
    expect(withGoalChange([], Number.NaN, '2026-09-30')).toBeNull()
  })

  it('el historial que escribe el cliente da la racha del fixture de cambio de programa', () => {
    let log: GoalChange[] = []
    log = withGoalChange(log, 4, '2026-08-01') ?? log
    log = withGoalChange(log, 3, '2026-09-14') ?? log
    const days = ['2026-08-31', '2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-08', '2026-09-10', '2026-09-12',
      '2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30']
    expect(computeWeeklyStreak(days, goalForWeekFromChanges(log, HISTORICAL_WEEKLY_GOAL), '2026-09-30').current).toBe(4)
  })
})

describe('streakDayOf (#801)', () => {
  it('toma los 10 primeros caracteres, como el servidor', () => {
    expect(streakDayOf('2026-09-29 23:30:00')).toBe('2026-09-29')
    expect(streakDayOf('2026-09-29T23:30:00.000Z')).toBe('2026-09-29')
  })

  it('cae al siguiente campo solo si el primero está vacío', () => {
    expect(streakDayOf('', '2026-09-28T10:00:00Z')).toBe('2026-09-28')
    expect(streakDayOf(null, undefined, '2026-09-28 10:00')).toBe('2026-09-28')
    // Como el COALESCE(NULLIF(finished_at, ''), started_at) del SQL: basura no cae.
    expect(streakDayOf('basura', '2026-09-28T10:00:00Z')).toBeNull()
    expect(streakDayOf()).toBeNull()
  })
})

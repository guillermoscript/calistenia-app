import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeWeeklyStreak,
  crossedWeeklyStreakMilestone,
  goalForWeekFromChanges,
  recentWeeks,
  WEEKLY_STREAK_MILESTONES,
  weeklyStreakHistory,
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

describe('recentWeeks', () => {
  // 2026-09-28 es lunes; hoy es el miércoles de esa semana.
  const today = '2026-09-30'

  it('devuelve N semanas de la más antigua a la en curso', () => {
    const weeks = recentWeeks([], 3, today, 10)
    expect(weeks).toHaveLength(10)
    expect(weeks[9]).toMatchObject({ weekStart: '2026-09-28', current: true })
    expect(weeks[0]).toMatchObject({ weekStart: '2026-07-27', current: false })
    expect(weeks.filter(w => w.current)).toHaveLength(1)
  })

  it('cuenta días distintos e ignora el futuro y lo anterior a la ventana', () => {
    const weeks = recentWeeks(
      ['2026-09-21', '2026-09-21', '2026-09-23', '2026-10-01', '2026-01-05', 'basura'],
      2,
      today,
      2,
    )
    expect(weeks).toEqual([
      { weekStart: '2026-09-21', done: 2, goal: 2, met: true, current: false },
      { weekStart: '2026-09-28', done: 0, goal: 2, met: false, current: true },
    ])
  })

  it('coincide con computeWeeklyStreak en la semana en curso', () => {
    const dates = ['2026-09-14', '2026-09-16', '2026-09-22', '2026-09-28', '2026-09-29']
    const streak = computeWeeklyStreak(dates, 2, today)
    const last = recentWeeks(dates, 2, today).at(-1)!
    expect(last.done).toBe(streak.thisWeek.done)
    expect(last.met).toBe(streak.thisWeek.met)
  })

  it('pide a la función el objetivo del último día de cada semana y lo acota a 1-7', () => {
    const asked: string[] = []
    const weeks = recentWeeks([], (_start, lastDay) => { asked.push(lastDay); return 0 }, today, 2)
    expect(asked).toEqual(['2026-09-27', today])
    expect(weeks.every(w => w.goal === 1)).toBe(true)
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

describe('weeklyStreakHistory', () => {
  // Hoy miércoles 30-09-2026: semana en curso desde el lunes 28-09.
  const today = '2026-09-30'

  it('devuelve `count` semanas de la más antigua a la en curso', () => {
    const h = weeklyStreakHistory([], 3, today, 10)
    expect(h).toHaveLength(10)
    expect(h[0].weekStart).toBe('2026-07-27')
    expect(h[9].weekStart).toBe('2026-09-28')
  })

  it('marca cumplidas, fallidas y la en curso sin romperla', () => {
    const days = ['2026-09-14', '2026-09-15', '2026-09-21', '2026-09-28']
    const h = weeklyStreakHistory(days, 2, today, 3)
    expect(h.map(w => [w.weekStart, w.done, w.state])).toEqual([
      ['2026-09-14', 2, 'met'],
      ['2026-09-21', 1, 'missed'],
      ['2026-09-28', 1, 'current'],
    ])
  })

  it('la en curso sale cumplida en cuanto llega al objetivo', () => {
    const h = weeklyStreakHistory(['2026-09-28', '2026-09-29'], 2, today, 1)
    expect(h).toEqual([{ weekStart: '2026-09-28', done: 2, goal: 2, state: 'met' }])
  })

  it('cuenta días distintos e ignora fechas futuras e inválidas', () => {
    const h = weeklyStreakHistory(['2026-09-28', '2026-09-28', '2026-10-02', 'ayer'], 1, today, 1)
    expect(h[0].done).toBe(1)
  })

  it('coincide con computeWeeklyStreak en la semana en curso', () => {
    const days = ['2026-09-21', '2026-09-23', '2026-09-29']
    const goal = goalForWeekFromChanges([{ from: '2026-09-27', goal: 4 }], 2)
    const h = weeklyStreakHistory(days, goal, today, 2)
    const s = computeWeeklyStreak(days, goal, today)
    expect(h[1]).toMatchObject({ done: s.thisWeek.done, goal: s.thisWeek.goal })
    expect(h[0]).toMatchObject({ goal: 4, state: 'missed' })
  })
})

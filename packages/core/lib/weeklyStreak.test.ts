import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeWeeklyStreak,
  crossedWeeklyStreakMilestone,
  goalForWeekFromChanges,
  WEEKLY_STREAK_MILESTONES,
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

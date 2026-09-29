import { describe, expect, it } from 'vitest'
import { DEFAULT_WEEKLY_GOAL, getEffectiveWeeklyGoal, trainableDaysPerWeek } from './weeklyGoal'
import type { DayId, DayType, WeekDay } from '../types'

const day = (id: DayId, type: DayType): WeekDay => ({ id, name: id, focus: id, type, color: '#fff' })
const FOUR_DAYS = { weekDays: [
  day('lun', 'push'), day('mar', 'pull'), day('mie', 'rest'), day('jue', 'legs'),
  day('vie', 'rest'), day('sab', 'cardio'), day('dom', 'rest'),
] }

describe('getEffectiveWeeklyGoal', () => {
  it('ignora el 5 guardado mientras no sea personalizado: usa los días del programa', () => {
    expect(getEffectiveWeeklyGoal({ weeklyGoal: 5 }, FOUR_DAYS)).toBe(4)
    expect(getEffectiveWeeklyGoal({ weeklyGoal: 5, weeklyGoalCustom: false }, FOUR_DAYS)).toBe(4)
  })

  it('usa weekly_goal cuando weekly_goal_custom es true', () => {
    expect(getEffectiveWeeklyGoal({ weeklyGoal: 2, weeklyGoalCustom: true }, FOUR_DAYS)).toBe(2)
    expect(getEffectiveWeeklyGoal({ weeklyGoal: 6, weeklyGoalCustom: true }, null)).toBe(6)
  })

  it('sin programa vale 3', () => {
    expect(DEFAULT_WEEKLY_GOAL).toBe(3)
    expect(getEffectiveWeeklyGoal({ weeklyGoal: 5 }, null)).toBe(3)
    expect(getEffectiveWeeklyGoal(null, undefined)).toBe(3)
  })

  it('programa sin días entrenables → 3', () => {
    expect(getEffectiveWeeklyGoal({ weeklyGoal: 5 }, { weekDays: [day('lun', 'rest')] })).toBe(3)
  })

  it('un personalizado inválido cae al programa y se acota a 1-7', () => {
    expect(getEffectiveWeeklyGoal({ weeklyGoal: 0, weeklyGoalCustom: true }, FOUR_DAYS)).toBe(4)
    expect(getEffectiveWeeklyGoal({ weeklyGoal: 12, weeklyGoalCustom: true }, FOUR_DAYS)).toBe(7)
  })

  it('trainableDaysPerWeek cuenta cardio y excluye rest', () => {
    expect(trainableDaysPerWeek(FOUR_DAYS.weekDays)).toBe(4)
    expect(trainableDaysPerWeek(undefined)).toBe(0)
  })
})

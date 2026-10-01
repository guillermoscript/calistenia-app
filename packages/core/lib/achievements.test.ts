import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENT_CATALOG,
  achievementCounts,
  buildAchievementList,
  evaluateEarlyAchievements,
} from './achievements'
import { WEEKLY_STREAK_MILESTONES } from './weeklyStreak'

describe('evaluateEarlyAchievements', () => {
  it('sin entrenos no hay nada', () => {
    expect(evaluateEarlyAchievements({ totalWorkouts: 0, bestWeeklyStreak: 0 })).toEqual([])
  })
  it('el primer entreno da first_workout', () => {
    expect(evaluateEarlyAchievements({ totalWorkouts: 1, bestWeeklyStreak: 0 })).toEqual(['first_workout'])
  })
  it('2 entrenos no llegan a three_workouts, 3 sí', () => {
    expect(evaluateEarlyAchievements({ totalWorkouts: 2, bestWeeklyStreak: 0 })).toEqual(['first_workout'])
    expect(evaluateEarlyAchievements({ totalWorkouts: 3, bestWeeklyStreak: 0 })).toEqual(['first_workout', 'three_workouts'])
  })
  it('una semana cumplida da first_week_complete aunque haya pocos entrenos (objetivo 1)', () => {
    expect(evaluateEarlyAchievements({ totalWorkouts: 1, bestWeeklyStreak: 1 })).toEqual(['first_workout', 'first_week_complete'])
  })
  it('valores raros no rompen', () => {
    expect(evaluateEarlyAchievements({ totalWorkouts: NaN, bestWeeklyStreak: -3 })).toEqual([])
  })
})

describe('catálogo', () => {
  it('los hitos de racha usan los hitos semanales de #801', () => {
    const streak = ACHIEVEMENT_CATALOG.filter(d => d.source === 'derived')
    expect(streak.map(d => d.target)).toEqual([...WEEKLY_STREAK_MILESTONES])
    expect(streak.every(d => d.metric === 'weeks')).toBe(true)
  })
  it('keys únicas', () => {
    const keys = ACHIEVEMENT_CATALOG.map(d => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('buildAchievementList', () => {
  it('cuenta de cero: todo bloqueado, con progreso parcial', () => {
    const items = buildAchievementList({ totalWorkouts: 2, bestWeeklyStreak: 0 })
    expect(achievementCounts(items)).toEqual({ unlocked: 1, total: ACHIEVEMENT_CATALOG.length })
    const three = items.find(i => i.key === 'three_workouts')!
    expect(three).toMatchObject({ unlocked: false, progress: 2, target: 3 })
    // El siguiente más cercano va el primero entre los pendientes.
    expect(items[0].key).toBe('first_workout')
    expect(items[1].key).toBe('three_workouts')
  })
  it('conseguido si hay fila aunque las stats vayan atrasadas', () => {
    const items = buildAchievementList({ totalWorkouts: 0, bestWeeklyStreak: 0 }, { first_workout: '2026-09-01 10:00:00.000Z' })
    const first = items.find(i => i.key === 'first_workout')!
    expect(first).toMatchObject({ unlocked: true, unlockedAt: '2026-09-01 10:00:00.000Z', progress: 1 })
  })
  it('conseguido por stats sin fila, sin fecha', () => {
    const items = buildAchievementList({ totalWorkouts: 5, bestWeeklyStreak: 4 })
    expect(items.find(i => i.key === 'three_workouts')).toMatchObject({ unlocked: true, unlockedAt: null })
    expect(items.find(i => i.key === 'streak_4w')).toMatchObject({ unlocked: true })
    expect(items.find(i => i.key === 'streak_8w')).toMatchObject({ unlocked: false, progress: 4, target: 8 })
  })
  it('los conseguidos van primero, el más reciente antes; admite Map', () => {
    const map = new Map<string, string | null>([
      ['first_workout', '2026-09-01 10:00:00.000Z'],
      ['three_workouts', '2026-09-05 10:00:00.000Z'],
    ])
    const items = buildAchievementList({ totalWorkouts: 3, bestWeeklyStreak: 0 }, map)
    expect(items.slice(0, 2).map(i => i.key)).toEqual(['three_workouts', 'first_workout'])
  })
})

import { describe, it, expect } from 'vitest'
import {
  clampHour,
  clampMinute,
  parseHour,
  parseMinute,
  clampPauseInterval,
  buildPauseSlots,
  rawReminderId,
  buildReminderTimeline,
} from './reminders'
import type { MealReminder } from '../types'
import type { WorkoutReminder } from '../hooks/useWorkoutReminders'

describe('clampHour / clampMinute', () => {
  it('formatea a dos dígitos dentro de rango', () => {
    expect(clampHour('7')).toBe('07')
    expect(clampMinute('5')).toBe('05')
  })

  it('clampa por arriba y por abajo', () => {
    expect(clampHour('30')).toBe('23')
    expect(clampHour('-2')).toBe('00')
    expect(clampMinute('75')).toBe('59')
    expect(clampMinute('-1')).toBe('00')
  })

  it('entradas no numéricas → "00"', () => {
    expect(clampHour('')).toBe('00')
    expect(clampHour('ab')).toBe('00')
    expect(clampMinute('')).toBe('00')
  })
})

describe('parseHour / parseMinute / clampPauseInterval', () => {
  it('clampa numéricamente', () => {
    expect(parseHour('30')).toBe(23)
    expect(parseHour('-1')).toBe(0)
    expect(parseHour('8')).toBe(8)
    expect(parseMinute('75')).toBe(59)
    expect(parseMinute('15')).toBe(15)
  })

  it('no numérico → 0', () => {
    expect(parseHour('')).toBe(0)
    expect(parseMinute('x')).toBe(0)
  })

  it('intervalo de pausas: mínimo 5, defecto 25', () => {
    expect(clampPauseInterval('30')).toBe(30)
    expect(clampPauseInterval('2')).toBe(5)
    expect(clampPauseInterval('')).toBe(25)
    expect(clampPauseInterval('abc')).toBe(25)
  })
})

describe('buildPauseSlots', () => {
  it('expande la ventana saltando el primer hueco (inicio:00)', () => {
    expect(buildPauseSlots(9, 11, 30)).toEqual([
      { hour: 9, minute: 30 },
      { hour: 10, minute: 0 },
      { hour: 10, minute: 30 },
    ])
  })

  it('intervalo de 60 → un hueco por hora salvo la primera', () => {
    expect(buildPauseSlots(9, 12, 60)).toEqual([
      { hour: 10, minute: 0 },
      { hour: 11, minute: 0 },
    ])
  })

  it('rango inválido o intervalo no positivo → []', () => {
    expect(buildPauseSlots(18, 9, 25)).toEqual([])
    expect(buildPauseSlots(9, 9, 25)).toEqual([])
    expect(buildPauseSlots(9, 12, 0)).toEqual([])
  })
})

describe('rawReminderId', () => {
  it('quita el prefijo meal-/workout-', () => {
    expect(rawReminderId('meal-abc123')).toBe('abc123')
    expect(rawReminderId('workout-xyz')).toBe('xyz')
  })

  it('solo quita el primer prefijo', () => {
    expect(rawReminderId('workout-meal-1')).toBe('meal-1')
    expect(rawReminderId('abc')).toBe('abc')
  })
})

describe('buildReminderTimeline', () => {
  const meal = (over: Partial<MealReminder> = {}): MealReminder => ({
    id: 'm1',
    mealType: 'almuerzo',
    hour: 12,
    minute: 0,
    enabled: true,
    daysOfWeek: [1, 2, 3],
    ...over,
  })
  const workout = (over: Partial<WorkoutReminder> = {}): WorkoutReminder => ({
    id: 'w1',
    hour: 8,
    minute: 0,
    daysOfWeek: [1, 2, 3, 4, 5],
    enabled: true,
    reminderType: 'workout',
    ...over,
  })

  it('fusiona y ordena por hora del día', () => {
    const timeline = buildReminderTimeline(
      [meal({ id: 'm1', hour: 12 })],
      [
        workout({ id: 'w1', hour: 8 }),
        workout({ id: 'w2', hour: 10, minute: 30, reminderType: 'pause' }),
      ],
    )
    expect(timeline.map(i => i.id)).toEqual(['workout-w1', 'workout-w2', 'meal-m1'])
    expect(timeline.map(i => i.type)).toEqual(['workout', 'pause', 'meal'])
  })

  it('prefija ids y conserva días/enabled/mealType', () => {
    const [item] = buildReminderTimeline([meal({ enabled: false })], [])
    expect(item.id).toBe('meal-m1')
    expect(item.type).toBe('meal')
    expect(item.mealType).toBe('almuerzo')
    expect(item.enabled).toBe(false)
    expect(item.days).toEqual([1, 2, 3])
  })

  it('ordena por minutos dentro de la misma hora', () => {
    const timeline = buildReminderTimeline(
      [meal({ id: 'm1', hour: 8, minute: 45 })],
      [workout({ id: 'w1', hour: 8, minute: 15 })],
    )
    expect(timeline.map(i => i.id)).toEqual(['workout-w1', 'meal-m1'])
  })
})

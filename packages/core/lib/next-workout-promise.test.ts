import { describe, it, expect } from 'vitest'
import { computeNextWorkoutPromise } from './next-workout-promise'
import type { WeekDay, DayId, DayType } from '../types'

const day = (id: DayId, type: DayType): WeekDay => ({ id, name: id, focus: '', type, color: '' })
const WEEK: WeekDay[] = [
  day('lun', 'full'), day('mar', 'rest'), day('mie', 'legs'), day('jue', 'rest'),
  day('vie', 'cardio'), day('sab', 'rest'), day('dom', 'rest'),
]

describe('computeNextWorkoutPromise (#825)', () => {
  it('sin recordatorio ni programa activo devuelve null', () => {
    expect(computeNextWorkoutPromise({ todayId: 'lun' })).toBeNull()
    expect(computeNextWorkoutPromise({ todayId: 'lun', reminder: null, weekDays: null })).toBeNull()
  })

  it('con recordatorio activo, usa su siguiente día y su hora', () => {
    // Ajustes > Recordatorios: 1=lunes..7=domingo. Hoy lunes, recordatorio mié/vie.
    expect(computeNextWorkoutPromise({
      todayId: 'lun',
      reminder: { hour: 19, minute: 0, daysOfWeek: [3, 5] },
    })).toEqual({ source: 'reminder', dayId: 'mie', time: '19:00' })
  })

  it('nunca ofrece hoy: un recordatorio que solo cubre hoy da la vuelta a la semana', () => {
    // Hoy lunes (1), recordatorio solo lunes → el próximo es el lunes que viene.
    expect(computeNextWorkoutPromise({
      todayId: 'lun',
      reminder: { hour: 8, minute: 30, daysOfWeek: [1] },
    })).toEqual({ source: 'reminder', dayId: 'lun', time: '08:30' })
  })

  it('normaliza domingo en la convención 0 (onboarding) y 7 (Ajustes)', () => {
    expect(computeNextWorkoutPromise({
      todayId: 'vie',
      reminder: { hour: 7, minute: 0, daysOfWeek: [0] },
    })).toEqual({ source: 'reminder', dayId: 'dom', time: '07:00' })
    expect(computeNextWorkoutPromise({
      todayId: 'vie',
      reminder: { hour: 7, minute: 0, daysOfWeek: [7] },
    })).toEqual({ source: 'reminder', dayId: 'dom', time: '07:00' })
  })

  it('sin recordatorio válido, cae al siguiente día entrenable del programa activo', () => {
    expect(computeNextWorkoutPromise({ todayId: 'lun', weekDays: WEEK }))
      .toEqual({ source: 'program', dayId: 'mie' })
  })

  it('recordatorio con días fuera de rango (sin días válidos) también cae al programa', () => {
    expect(computeNextWorkoutPromise({
      todayId: 'lun',
      reminder: { hour: 19, minute: 0, daysOfWeek: [99, -3] },
      weekDays: WEEK,
    })).toEqual({ source: 'program', dayId: 'mie' })
  })

  it('el recordatorio gana sobre el programa cuando los dos existen', () => {
    expect(computeNextWorkoutPromise({
      todayId: 'lun',
      reminder: { hour: 20, minute: 0, daysOfWeek: [7] }, // domingo
      weekDays: WEEK, // el programa diría 'mie'
    })).toEqual({ source: 'reminder', dayId: 'dom', time: '20:00' })
  })

  it('da la vuelta a la semana desde domingo para el programa', () => {
    expect(computeNextWorkoutPromise({ todayId: 'dom', weekDays: WEEK }))
      .toEqual({ source: 'program', dayId: 'lun' })
  })

  it('sin ningún día entrenable en el programa y sin recordatorio, null', () => {
    expect(computeNextWorkoutPromise({ todayId: 'lun', weekDays: [day('lun', 'rest')] })).toBeNull()
    expect(computeNextWorkoutPromise({ todayId: 'lun', weekDays: [] })).toBeNull()
  })
})

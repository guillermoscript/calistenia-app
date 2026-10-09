import { describe, it, expect } from 'vitest'
import { WorkoutNotSavedError, isWorkoutNotSavedError, removeOneWorkoutDone, wallClockDayBounds } from './workout-done'
import type { ProgressMap } from '../types'

const K = 'done_2026-10-09_p1_lun'

describe('removeOneWorkoutDone', () => {
  it('quita la marca de un entreno hecho una vez', () => {
    const prev: ProgressMap = {
      [K]: { done: true, date: '2026-10-09', workoutKey: 'p1_lun', count: 1, note: '' },
      other: { done: true, date: '2026-10-08', workoutKey: 'p1_dom', note: '' },
    }
    const next = removeOneWorkoutDone(prev, K)
    expect(next[K]).toBeUndefined()
    expect(next.other).toBe(prev.other)
    expect(prev[K]).toBeDefined() // no muta la entrada
  })

  it('con el mismo entreno repetido en el día resta uno y conserva la clave', () => {
    const prev: ProgressMap = { [K]: { done: true, date: '2026-10-09', workoutKey: 'p1_lun', count: 2, note: 'x' } }
    expect(removeOneWorkoutDone(prev, K)[K]).toEqual({ done: true, date: '2026-10-09', workoutKey: 'p1_lun', count: 1, note: 'x' })
  })

  it('sin `count` (marca antigua) cuenta como uno', () => {
    const prev: ProgressMap = { [K]: { done: true, date: '2026-10-09', workoutKey: 'p1_lun', note: '' } }
    expect(removeOneWorkoutDone(prev, K)).toEqual({})
  })

  it('sin la clave no cambia nada', () => {
    expect(removeOneWorkoutDone({}, K)).toEqual({})
  })
})

describe('WorkoutNotSavedError', () => {
  it('lleva la clave, el status y la causa del rechazo', () => {
    const cause = Object.assign(new Error('bad'), { status: 400 })
    const e = new WorkoutNotSavedError('p1_lun', cause)
    expect(e.workoutKey).toBe('p1_lun')
    expect(e.status).toBe(400)
    expect(e.cause).toBe(cause)
    expect(isWorkoutNotSavedError(e)).toBe(true)
  })

  it('sin status conocido queda en null y no confunde otros errores', () => {
    expect(new WorkoutNotSavedError('p1_lun', 'x').status).toBeNull()
    expect(isWorkoutNotSavedError(new Error('x'))).toBe(false)
    expect(isWorkoutNotSavedError(null)).toBe(false)
  })
})

describe('wallClockDayBounds', () => {
  it('es el día literal en hora de pared, sin pasar por UTC', () => {
    expect(wallClockDayBounds('2026-10-09')).toEqual({ from: '2026-10-09 00:00:00', to: '2026-10-09 23:59:59.999' })
  })

  it('una sesión de las 23:30 o de las 00:00 cae en su día y no en el vecino', () => {
    const { from, to } = wallClockDayBounds('2026-10-09')
    // Comparación de strings: igual que la hace SQLite sobre el campo de PB.
    const inDay = (v: string) => v >= from && v <= to
    expect(inDay('2026-10-09 00:00:00.000Z')).toBe(true)
    expect(inDay('2026-10-09 23:30:00.000Z')).toBe(true)
    expect(inDay('2026-10-08 23:30:00.000Z')).toBe(false)
    expect(inDay('2026-10-10 00:00:00.000Z')).toBe(false)
  })
})

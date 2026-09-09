import { describe, expect, it } from 'vitest'
import { applyDeload, deloadSets, isDeloadTarget } from './deload'
import type { Exercise, Workout } from '../types'

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'pushup_std', name: 'Flexiones', sets: 4, reps: '8-12', rest: 90,
    muscles: '', note: '', youtube: '', priority: 'high', section: 'main', ...over,
  }
}

const WORKOUT: Workout = {
  phase: 1, day: 'lun', title: 'Empuje',
  exercises: [
    ex({ id: 'arm_circles', sets: 1, priority: 'low', section: 'warmup', isTimer: true, timerSeconds: 45 }),
    ex({ id: 'pushup_std', sets: 4, priority: 'high' }),
    ex({ id: 'dip', sets: 3, priority: 'med' }),
    ex({ id: 'plank', sets: 3, priority: 'low' }),
    ex({ id: 'lsit', sets: 'intentos', priority: 'high' }),
    ex({ id: 'stretch', sets: 2, priority: 'low', section: 'cooldown' }),
  ],
}

describe('deloadSets', () => {
  it('parte por arriba: 3 → 2, 4 → 2, 5 → 3', () => {
    expect(deloadSets(3)).toBe(2)
    expect(deloadSets(4)).toBe(2)
    expect(deloadSets(5)).toBe(3)
  })

  it('una serie sigue siendo una y el texto no se toca', () => {
    expect(deloadSets(1)).toBe(1)
    expect(deloadSets(0)).toBe(0)
    expect(deloadSets('múltiples')).toBe('múltiples')
  })
})

describe('isDeloadTarget', () => {
  it('solo la parte principal de prioridad alta o media', () => {
    expect(isDeloadTarget(ex({ priority: 'high' }))).toBe(true)
    expect(isDeloadTarget(ex({ priority: 'med' }))).toBe(true)
    expect(isDeloadTarget(ex({ priority: 'low' }))).toBe(false)
    expect(isDeloadTarget(ex({ priority: 'high', section: 'warmup' }))).toBe(false)
    expect(isDeloadTarget(ex({ priority: 'high', section: 'cooldown' }))).toBe(false)
  })

  it('sin `section` (filas viejas) cuenta como principal', () => {
    expect(isDeloadTarget(ex({ section: undefined }))).toBe(true)
  })
})

describe('applyDeload', () => {
  it('reduce los principales, deja calentamiento, accesorios y texto, y marca `deload`', () => {
    const out = applyDeload(WORKOUT)
    expect(out.deload).toBe(true)
    expect(out.exercises.map(e => e.sets)).toEqual([1, 2, 2, 3, 'intentos', 2])
  })

  it('no muta la entrada y conserva la identidad de los ejercicios que no cambian', () => {
    const out = applyDeload(WORKOUT)
    expect(WORKOUT.deload).toBeUndefined()
    expect(WORKOUT.exercises[1].sets).toBe(4)
    expect(out.exercises[0]).toBe(WORKOUT.exercises[0])
    expect(out.exercises[3]).toBe(WORKOUT.exercises[3])
    expect(out.exercises[1]).not.toBe(WORKOUT.exercises[1])
  })

  it('reps, descanso y temporizador no cambian: menos volumen, misma intensidad', () => {
    const out = applyDeload(WORKOUT)
    expect(out.exercises[1].reps).toBe('8-12')
    expect(out.exercises[1].rest).toBe(90)
    expect(out.exercises[0].timerSeconds).toBe(45)
  })
})

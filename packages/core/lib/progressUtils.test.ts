import { describe, it, expect } from 'vitest'
import { isFreeSession, filterProgressByType } from './progressUtils'
import type { ProgressMap } from '../types'

describe('isFreeSession', () => {
  it('true si el workoutKey empieza con "free_"', () => {
    expect(isFreeSession('free_abc123')).toBe(true)
  })

  it('false para keys de programa', () => {
    expect(isFreeSession('program1_day2')).toBe(false)
  })

  it('false para undefined, null y string vacío', () => {
    expect(isFreeSession(undefined)).toBe(false)
    expect(isFreeSession(null)).toBe(false)
    expect(isFreeSession('')).toBe(false)
  })
})

describe('filterProgressByType', () => {
  it('separa entradas "done_" por tipo usando el workoutKey embebido en la key', () => {
    const progress = {
      'done_2026-07-01_free_abc': true,
      'done_2026-07-01_program1_day2': true,
    } as unknown as ProgressMap
    expect(Object.keys(filterProgressByType(progress, 'free'))).toEqual(['done_2026-07-01_free_abc'])
    expect(Object.keys(filterProgressByType(progress, 'program'))).toEqual(['done_2026-07-01_program1_day2'])
  })

  it('usa el campo workoutKey de los ExerciseLog para clasificar', () => {
    const progress = {
      log1: { workoutKey: 'free_xyz' },
      log2: { workoutKey: 'program1_day1' },
    } as unknown as ProgressMap
    expect(Object.keys(filterProgressByType(progress, 'free'))).toEqual(['log1'])
    expect(Object.keys(filterProgressByType(progress, 'program'))).toEqual(['log2'])
  })

  it('entradas desconocidas (sin workoutKey y sin prefijo done_) se incluyen por defecto en "program"', () => {
    const progress = { misc: { foo: 'bar' } } as unknown as ProgressMap
    expect(Object.keys(filterProgressByType(progress, 'program'))).toEqual(['misc'])
    expect(Object.keys(filterProgressByType(progress, 'free'))).toEqual([])
  })

  it('objeto vacío devuelve objeto vacío para ambos tipos', () => {
    expect(filterProgressByType({}, 'free')).toEqual({})
    expect(filterProgressByType({}, 'program')).toEqual({})
  })

  it('un progress mixto conserva solo las entradas del tipo pedido en cada llamada', () => {
    const progress = {
      'done_2026-07-01_free_abc': true,
      log1: { workoutKey: 'free_xyz' },
      log2: { workoutKey: 'program1_day1' },
      misc: {},
    } as unknown as ProgressMap
    const free = filterProgressByType(progress, 'free')
    const program = filterProgressByType(progress, 'program')
    expect(Object.keys(free).sort()).toEqual(['done_2026-07-01_free_abc', 'log1'])
    expect(Object.keys(program).sort()).toEqual(['log2', 'misc'])
  })
})

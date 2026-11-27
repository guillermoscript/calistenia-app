import { describe, expect, it } from 'vitest'
import { buildProgramRecap, setValue, type RecapExerciseInput } from './programRecap'
import type { ExerciseLog } from '../types'

const START = '2026-06-03'
const END = '2026-08-25'

const log = (date: string, reps: string[], weight?: number): ExerciseLog => ({
  date,
  workoutKey: 'p1_lun',
  exerciseId: 'x',
  sets: reps.map(r => ({ reps: r, note: '', timestamp: 0, ...(weight ? { weight } : {}) })),
})

const ex = (key: string, logs: ExerciseLog[], isTimer = false): RecapExerciseInput => ({ key, name: key, isTimer, logs })

describe('setValue', () => {
  it('lastre gana a las reps', () => {
    expect(setValue({ reps: '5', weight: 10 })).toEqual({ unit: 'kg', value: 10 })
  })
  it('lee reps, rangos y segundos', () => {
    expect(setValue({ reps: '12' })).toEqual({ unit: 'reps', value: 12 })
    expect(setValue({ reps: '8-10' })).toEqual({ unit: 'reps', value: 8 })
    expect(setValue({ reps: '30 s' })).toEqual({ unit: 's', value: 30 })
    expect(setValue({ reps: '45' }, true)).toEqual({ unit: 's', value: 45 })
  })
  it('descarta lo ilegible o cero', () => {
    expect(setValue({ reps: 'máx' })).toBeNull()
    expect(setValue({ reps: '0' })).toBeNull()
  })
})

describe('buildProgramRecap (#941)', () => {
  it('compara la mejor marca de la primera semana con la de la última', () => {
    const r = buildProgramRecap({
      startDay: START, endDay: END,
      exercises: [ex('dominadas', [
        log('2026-06-03', ['3', '4']),       // semana 1 → 4
        log('2026-07-01', ['6']),
        log('2026-08-24', ['8', '7']),       // semana 12 → 8
      ])],
    })
    expect(r.comparisons).toEqual([
      { key: 'dominadas', name: 'dominadas', unit: 'reps', firstWeek: 1, lastWeek: 12, first: 4, last: 8, delta: 4 },
    ])
    expect(r.setsLogged).toBe(5)
    expect(r.exercisesTrained).toBe(1)
  })

  it('sin datos en dos semanas distintas no hay comparación (nada de «0 → 12»)', () => {
    const r = buildProgramRecap({
      startDay: START, endDay: END,
      exercises: [ex('fondos', [log('2026-06-03', ['10']), log('2026-06-05', ['12'])])],
    })
    expect(r.comparisons).toEqual([])
    expect(r.exercisesTrained).toBe(1)
  })

  it('ignora lo que cae fuera del programa para la comparación', () => {
    const r = buildProgramRecap({
      startDay: START, endDay: END,
      exercises: [ex('flexiones', [log('2026-05-01', ['50']), log('2026-06-04', ['10']), log('2026-09-10', ['40']), log('2026-08-20', ['15'])])],
    })
    expect(r.comparisons[0]).toMatchObject({ first: 10, last: 15 })
    expect(r.setsLogged).toBe(2)
  })

  it('compara en la unidad con datos en las dos semanas, prefiriendo kg', () => {
    const r = buildProgramRecap({
      startDay: START, endDay: END,
      exercises: [ex('dominada lastrada', [
        log('2026-06-03', ['8']),
        log('2026-06-04', ['5'], 5),
        log('2026-08-20', ['5'], 12.5),
      ])],
    })
    expect(r.comparisons[0]).toMatchObject({ unit: 'kg', first: 5, last: 12.5 })
  })

  it('los ejercicios de temporizador se comparan en segundos', () => {
    const r = buildProgramRecap({
      startDay: START, endDay: END,
      exercises: [ex('plancha', [log('2026-06-03', ['30']), log('2026-08-20', ['60'])], true)],
    })
    expect(r.comparisons[0]).toMatchObject({ unit: 's', first: 30, last: 60 })
  })

  it('ordena por días entrenados y recorta al máximo', () => {
    const many = (key: string, days: number) => ex(key, [
      ...Array.from({ length: days }, (_, i) => log(`2026-06-${String(3 + i).padStart(2, '0')}`, ['5'])),
      log('2026-08-20', ['6']),
    ])
    const r = buildProgramRecap({
      startDay: START, endDay: END, maxComparisons: 2,
      exercises: [many('a', 1), many('b', 5), many('c', 3)],
    })
    expect(r.comparisons.map(c => c.key)).toEqual(['b', 'c'])
  })

  it('récord: la mejor del programa supera la mejor de antes de empezar', () => {
    const r = buildProgramRecap({
      startDay: START, endDay: END,
      exercises: [
        ex('dominadas', [log('2026-05-10', ['6']), log('2026-07-01', ['9'])]),
        ex('fondos', [log('2026-05-10', ['20']), log('2026-07-01', ['15'])]),   // peor: no es récord
        ex('pistol', [log('2026-07-01', ['5'])]),                              // sin historial previo
      ],
    })
    expect(r.records).toEqual([{ key: 'dominadas', name: 'dominadas', unit: 'reps', previous: 6, value: 9 }])
  })

  it('sin fechas de programa devuelve vacío', () => {
    expect(buildProgramRecap({ startDay: null, endDay: END, exercises: [] })).toEqual({
      comparisons: [], records: [], setsLogged: 0, exercisesTrained: 0,
    })
  })
})

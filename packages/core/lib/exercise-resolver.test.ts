import { describe, it, expect, vi } from 'vitest'
import { buildExerciseResolver } from './exercise-resolver'
import { buildCatalogIndex, type RawCatalog } from './catalogIndex'
import { muscleTokensToGroups } from './muscles'
import type { Workout } from '../types'

const RAW: RawCatalog = {
  categories: {
    push: {
      exercises: [
        { id: 'pushups', seed_slug: 'flexiones-clasicas', name: { es: 'Flexiones', en: 'Push-ups' }, muscle_groups: ['pecho', 'triceps'] },
        { id: 'nomuscle', name: { es: 'Raro', en: 'Odd' } },
        { id: 'plank', name: { es: 'Plancha', en: 'Plank' }, muscle_groups: ['core'], isTimer: true },
      ],
    },
    pull: {
      exercises: [
        { id: 'pullups', name: { es: 'Dominadas', en: 'Pull-ups' }, muscle_groups: ['espalda', 'biceps'] },
      ],
    },
  },
}

const index = buildCatalogIndex(RAW)

const WORKOUT: Workout = {
  phase: 1,
  day: 'lun',
  title: 'Lunes',
  exercises: [
    { id: 'lun_1_1', name: 'Flexiones', sets: 3, reps: '10', rest: 60, muscles: 'Pecho, tríceps', note: '', youtube: '', priority: 'high' },
    { id: 'lun_1_2', name: 'Remo invertido', sets: 3, reps: '10', rest: 60, muscles: 'Espalda, bíceps (largo)', note: '', youtube: '', priority: 'high' },
    { id: 'lun_1_3', name: 'Cosa inventada', sets: 3, reps: '10', rest: 60, muscles: '', note: '', youtube: '', priority: 'high' },
  ],
}

const getWorkout = (phase: number, dayId: string) => (phase === 1 && dayId === 'lun' ? WORKOUT : null)

describe('buildExerciseResolver', () => {
  const resolve = buildExerciseResolver({ index, getWorkout, locale: 'es' })

  it('paso 1: id de catálogo', () => {
    expect(resolve('pullups', 'free_1')).toEqual({ key: 'pullups', name: 'Dominadas', muscleGroups: ['espalda', 'biceps'], resolved: true, isTimer: false })
    expect(resolve('plank', 'free_1').isTimer).toBe(true)
  })

  it('paso 1: seed_slug y nombre también resuelven al catálogo', () => {
    expect(resolve('flexiones-clasicas', 'free_1').key).toBe('pushups')
    expect(resolve('Push-ups', 'free_1').key).toBe('pushups')
  })

  it('paso 1: entrada del catálogo sin muscle_groups sigue siendo resuelta', () => {
    expect(resolve('nomuscle', 'free_1')).toEqual({ key: 'nomuscle', name: 'Raro', muscleGroups: [], resolved: true, isTimer: false })
  })

  it('localiza el nombre', () => {
    const en = buildExerciseResolver({ index, getWorkout, locale: 'en' })
    expect(en('pullups', 'free_1').name).toBe('Pull-ups')
  })

  it('paso 2: slot del programa que casa por nombre con el catálogo hereda su id y músculos', () => {
    expect(resolve('lun_1_1', 'p1_lun')).toEqual({ key: 'pushups', name: 'Flexiones', muscleGroups: ['pecho', 'triceps'], resolved: true, isTimer: false })
  })

  it('paso 2: slot sin match en catálogo tokeniza el texto de músculos', () => {
    expect(resolve('lun_1_2', 'p1_lun')).toEqual({ key: 'remo invertido', name: 'Remo invertido', muscleGroups: ['biceps', 'espalda'], resolved: true, isTimer: false })
  })

  it('paso 2: slot con nombre pero sin músculos queda resuelto y sin grupo', () => {
    expect(resolve('lun_1_3', 'p1_lun')).toMatchObject({ name: 'Cosa inventada', muscleGroups: [], resolved: true })
  })

  it('paso 3: slot de un programa que no es el activo es desconocido', () => {
    expect(resolve('mar_2_1', 'p2_mar')).toEqual({ key: 'mar_2_1', name: 'mar_2_1', muscleGroups: [], resolved: false, isTimer: false })
    expect(resolve('lun_9_9', 'p1_lun')).toMatchObject({ resolved: false })
  })

  it('sin índice, los slots siguen resolviendo por el programa y los ids de catálogo caen a desconocido', () => {
    const noIndex = buildExerciseResolver({ index: null, getWorkout, locale: 'es' })
    expect(noIndex('lun_1_1', 'p1_lun')).toEqual({ key: 'flexiones', name: 'Flexiones', muscleGroups: ['pecho', 'triceps'], resolved: true, isTimer: false })
    expect(noIndex('pullups', 'free_1').resolved).toBe(false)
  })

  it('memoiza: getWorkout se llama una vez por workoutKey', () => {
    const spy = vi.fn(getWorkout)
    const r = buildExerciseResolver({ index, getWorkout: spy, locale: 'es' })
    r('lun_1_1', 'p1_lun'); r('lun_1_2', 'p1_lun'); r('lun_1_1', 'p1_lun')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('muscleTokensToGroups', () => {
  it('ES con acentos y paréntesis', () => {
    expect(muscleTokensToGroups('Pecho, tríceps (cabeza larga), hombros')).toEqual(['pecho', 'hombros', 'triceps'])
  })

  it('EN con plurales y barras', () => {
    expect(muscleTokensToGroups('Lats / biceps, forearms')).toEqual(['biceps', 'antebrazos', 'espalda'])
  })

  it('no confunde lateral con lats ni absoluto con abs', () => {
    expect(muscleTokensToGroups('deltoide lateral')).toEqual(['hombros'])
    expect(muscleTokensToGroups('control absoluto')).toEqual([])
  })

  it('lower back es lumbar, no espalda', () => {
    expect(muscleTokensToGroups('Lower back, glutes')).toEqual(['lumbar', 'gluteos'])
  })

  it('vacío o sin nada reconocible', () => {
    expect(muscleTokensToGroups('')).toEqual([])
    expect(muscleTokensToGroups(null)).toEqual([])
    expect(muscleTokensToGroups('todo el cuerpo')).toEqual([])
  })
})

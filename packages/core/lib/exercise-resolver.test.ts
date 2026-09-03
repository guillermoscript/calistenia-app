import { describe, it, expect, vi } from 'vitest'
import { buildExerciseResolver, groupLogsByResolvedExercise, resolveExerciseNameField, resolveExerciseDisplayName } from './exercise-resolver'
import { buildCatalogIndex, type RawCatalog } from './catalogIndex'
import { muscleTokensToGroups } from './muscles'
import type { ProgressMap, Workout } from '../types'

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

describe('resolveExerciseNameField / resolveExerciseDisplayName', () => {
  it('un slug de catálogo en el nombre se cambia por el name {es,en} del catálogo', () => {
    expect(resolveExerciseNameField('flexiones-clasicas', 'lun_1_9', index)).toEqual({ es: 'Flexiones', en: 'Push-ups' })
    expect(resolveExerciseNameField('pushups', 'lun_1_9', index)).toEqual({ es: 'Flexiones', en: 'Push-ups' })
  })

  it('con el nombre irresoluble, resuelve por el exercise_id', () => {
    expect(resolveExerciseNameField('sphinx_pushup', 'pushups', index)).toEqual({ es: 'Flexiones', en: 'Push-ups' })
  })

  it('un nombre humano pasa intacto, aunque el id sea de catálogo', () => {
    expect(resolveExerciseNameField('Flexiones arqueras', 'pushups', index)).toBe('Flexiones arqueras')
    expect(resolveExerciseNameField({ es: 'Mi ejercicio' }, 'pushups', index)).toEqual({ es: 'Mi ejercicio' })
  })

  it('clave de máquina que no resuelve a nada se queda como estaba', () => {
    expect(resolveExerciseNameField('cosa_desconocida', 'lun_1_9', index)).toBe('cosa_desconocida')
  })

  it('sin índice no se afirma nada', () => {
    expect(resolveExerciseNameField('flexiones-clasicas', 'lun_1_9', null)).toBe('flexiones-clasicas')
  })

  it('display: localiza y cae al exerciseId antes que a vacío', () => {
    expect(resolveExerciseDisplayName('flexiones-clasicas', 'lun_1_9', 'en', index)).toBe('Push-ups')
    expect(resolveExerciseDisplayName('', 'lun_1_9', 'es', index)).toBe('lun_1_9')
    expect(resolveExerciseDisplayName('', 'plank', 'es', index)).toBe('Plancha')
  })
})

describe('groupLogsByResolvedExercise (#692)', () => {
  const resolve = buildExerciseResolver({ index, getWorkout, locale: 'es' })
  const log = (exerciseId: string, workoutKey: string, date: string) => ({ exerciseId, workoutKey, date, sets: [{ reps: 10 }] })
  const progress = {
    'done_2026-01-03_p1_lun': { note: '' },
    'lun_1_1_2026-01-03': log('lun_1_1', 'p1_lun', '2026-01-03'),
    'pushups_2026-01-01': log('pushups', 'free_1', '2026-01-01'),
    'flexiones-clasicas_2026-01-02': log('flexiones-clasicas', 'free_2', '2026-01-02'),
    'lun_1_3_2026-01-03': log('lun_1_3', 'p1_lun', '2026-01-03'),
    'zzz_2026-01-04': log('zzz', 'free_3', '2026-01-04'),
  } as unknown as ProgressMap

  it('fusiona la clave de slot, el seed_slug y el id de catálogo bajo la misma identidad', () => {
    const { logs, names } = groupLogsByResolvedExercise(progress, resolve)
    expect(Object.keys(logs).sort()).toEqual(['cosa inventada', 'pushups', 'zzz'])
    expect(logs.pushups.map(l => l.exerciseId)).toEqual(['pushups', 'flexiones-clasicas', 'lun_1_1'])
    expect(names.pushups).toBe('Flexiones')
  })

  it('lo que no resuelve conserva su clave cruda y su nombre', () => {
    const { logs, names } = groupLogsByResolvedExercise(progress, resolve)
    expect(logs.zzz).toHaveLength(1)
    expect(names.zzz).toBe('zzz')
    expect(names['cosa inventada']).toBe('Cosa inventada')
  })

  it('ignora las claves done_ y las entradas sin series', () => {
    const { logs } = groupLogsByResolvedExercise({ 'done_x': { note: '' }, weird: { exerciseId: 'pushups' } } as unknown as ProgressMap, resolve)
    expect(logs).toEqual({})
  })
})

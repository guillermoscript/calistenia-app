import { describe, it, expect } from 'vitest'
import { applyOverrides, applyOverrideToExercise, indexOverrides, type ProgramOverride } from './programOverrides'
import type { Exercise, WorkoutsMap } from '../types'

const exercise = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'lun_1_2',
  name: 'Flexión de rodillas',
  sets: 3,
  reps: '10',
  rest: 60,
  muscles: 'pecho',
  note: '',
  youtube: '',
  priority: 'high',
  ...over,
})

const workouts = (exercises: Exercise[]): WorkoutsMap => ({
  p1_lun: { phase: 1, day: 'lun', title: 'Empuje', exercises },
})

describe('indexOverrides', () => {
  it('descarta las filas sin `exerciseId`', () => {
    const map = indexOverrides([{ exerciseId: '' }, { exerciseId: 'lun_1_2', repsOverride: '11' }])
    expect(map.size).toBe(1)
    expect(map.get('lun_1_2')?.repsOverride).toBe('11')
  })
})

describe('applyOverrideToExercise', () => {
  it('sin override devuelve la MISMA referencia', () => {
    const ex = exercise()
    expect(applyOverrideToExercise(ex, undefined)).toBe(ex)
  })

  it('un override que no cambia nada devuelve la misma referencia', () => {
    // Aceptar dos veces la misma dosis no puede invalidar el memo de nadie.
    const ex = exercise({ reps: '11' })
    expect(applyOverrideToExercise(ex, { exerciseId: 'lun_1_2', repsOverride: '11' })).toBe(ex)
  })

  it('la dosis aceptada sustituye a la prescrita', () => {
    const out = applyOverrideToExercise(exercise(), { exerciseId: 'lun_1_2', repsOverride: '11' })
    expect(out.reps).toBe('11')
    expect(out.name).toBe('Flexión de rodillas')
  })

  it('en temporizador la dosis actualiza TAMBIÉN `timerSeconds`', () => {
    // Si solo se tocara `reps`, el chip diría 35 s y la cuenta atrás contaría 30.
    const plank = exercise({ id: 'lun_1_3', name: 'Plancha', isTimer: true, reps: '30', timerSeconds: 30 })
    const out = applyOverrideToExercise(plank, { exerciseId: 'lun_1_3', repsOverride: '35' })
    expect(out.reps).toBe('35')
    expect(out.timerSeconds).toBe(35)
  })

  it('la variante aceptada cambia el ejercicio pero NO la clave del hueco', () => {
    // El `id` es la clave con la que se escriben las series y se reencuentra el
    // override: si cambiara, el siguiente día no habría override que aplicar.
    const out = applyOverrideToExercise(exercise(), {
      exerciseId: 'lun_1_2',
      exerciseIdOverride: 'pushup_std',
      exerciseNameOverride: 'Flexión estándar',
      repsOverride: '8',
    })
    expect(out.id).toBe('lun_1_2')
    expect(out.variant_of).toBe('pushup_std')
    expect(out.name).toBe('Flexión estándar')
    expect(out.reps).toBe('8')
  })

  it('una variante sin nombre resuelto conserva el nombre viejo antes que quedarse en blanco', () => {
    const out = applyOverrideToExercise(exercise(), {
      exerciseId: 'lun_1_2',
      exerciseIdOverride: 'pushup_std',
    })
    expect(out.variant_of).toBe('pushup_std')
    expect(out.name).toBe('Flexión de rodillas')
  })
})

describe('applyOverrides', () => {
  it('sin overrides devuelve el mapa de entrada tal cual', () => {
    const map = workouts([exercise()])
    expect(applyOverrides(map, [])).toBe(map)
  })

  it('un override que no casa con ningún hueco se ignora en silencio', () => {
    // El autor pudo reordenar o borrar el ejercicio; la fila sobra, pero no
    // puede tumbar el día.
    const map = workouts([exercise()])
    const huerfano: ProgramOverride[] = [{ exerciseId: 'mar_9_9', repsOverride: '20' }]
    expect(applyOverrides(map, huerfano)).toBe(map)
  })

  it('solo se reconstruye el día que cambia', () => {
    const tocado = exercise({ id: 'lun_1_2' })
    const intacto = exercise({ id: 'lun_1_3', name: 'Remo' })
    const map: WorkoutsMap = {
      p1_lun: { phase: 1, day: 'lun', title: 'Empuje', exercises: [tocado] },
      p1_mie: { phase: 1, day: 'mie', title: 'Tirón', exercises: [intacto] },
    }
    const out = applyOverrides(map, [{ exerciseId: 'lun_1_2', repsOverride: '11' }])

    expect(out).not.toBe(map)
    expect(out.p1_lun.exercises[0].reps).toBe('11')
    expect(out.p1_mie).toBe(map.p1_mie)
  })

  it('el mismo hueco en dos fases recibe el mismo override', () => {
    // La clave de slot lleva el día, no la fase: un ejercicio que se repite en
    // la fase 2 es el mismo hueco y hereda lo aceptado.
    const map: WorkoutsMap = {
      p1_lun: { phase: 1, day: 'lun', title: 'Empuje', exercises: [exercise()] },
      p2_lun: { phase: 2, day: 'lun', title: 'Empuje', exercises: [exercise()] },
    }
    const out = applyOverrides(map, [{ exerciseId: 'lun_1_2', repsOverride: '11' }])
    expect(out.p1_lun.exercises[0].reps).toBe('11')
    expect(out.p2_lun.exercises[0].reps).toBe('11')
  })

  it('no muta el mapa de entrada', () => {
    const map = workouts([exercise()])
    applyOverrides(map, [{ exerciseId: 'lun_1_2', repsOverride: '11' }])
    expect(map.p1_lun.exercises[0].reps).toBe('10')
  })
})

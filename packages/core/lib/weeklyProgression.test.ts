import { describe, expect, it } from 'vitest'
import {
  applyProgressionToExercise,
  applyWeeklyProgression,
  effectiveWeek,
  progressionList,
  shiftDurationReps,
  shiftReps,
} from './weeklyProgression'
import { inferTimerFromReps } from './exercise-timer-inference'
import type { Exercise, WeeklyProgression, Workout } from '../types'

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'pushup_std', name: 'Flexiones', sets: 4, reps: '8-12', rest: 90,
    muscles: '', note: '', youtube: '', priority: 'high', section: 'main', ...over,
  }
}

/** El caso real de #755: el colgado de la fase 1 de Pull-up Roadmap. */
const DEAD_HANG: Exercise = ex({
  id: 'dead_hang', name: 'Colgado', sets: 3, reps: '20 s', rest: 60,
  isTimer: true, timerSeconds: 20,
  weeklyProgression: { field: 'timerSeconds', values: [20, 25, 30, 20] },
})

const WORKOUT: Workout = {
  phase: 1, day: 'lun', title: 'Tirón',
  exercises: [
    ex({ id: 'arm_circles', sets: 1, reps: '45 s', priority: 'low', section: 'warmup', isTimer: true, timerSeconds: 45 }),
    DEAD_HANG,
    ex({ id: 'pullup_neg2', sets: 3, reps: '4', weeklyProgression: { field: 'reps', values: ['4', '4-5', '4-5', '4'] } }),
    ex({ id: 'pushup_std' }),
  ],
}

describe('progressionList', () => {
  it('acepta una rampa suelta, una lista y la ausencia del campo', () => {
    const one: WeeklyProgression = { field: 'sets', step: 1 }
    expect(progressionList(one)).toEqual([one])
    expect(progressionList([one, { field: 'reps', step: 1 }])).toHaveLength(2)
    expect(progressionList(undefined)).toEqual([])
  })
})

describe('shiftReps', () => {
  it('mueve un número suelto y los dos extremos de un rango', () => {
    expect(shiftReps('6', 1)).toBe('7')
    expect(shiftReps('4-6', 1)).toBe('5-7')
    expect(shiftReps('8-12', -2)).toBe('6-10')
  })

  it('no baja de cero', () => {
    expect(shiftReps('1', -5)).toBe('0')
    expect(shiftReps('1-2', -5)).toBe('0-0')
  })

  it('devuelve null en cualquier otro texto: la rampa lineal no lo sabe leer', () => {
    expect(shiftReps('12/lado', 1)).toBeNull()
    expect(shiftReps('máx', 1)).toBeNull()
    expect(shiftReps('5 (8 s de bajada)', 1)).toBeNull()
    expect(shiftReps('', 1)).toBeNull()
  })
})

describe('shiftDurationReps', () => {
  it('mueve una duración simple y un rango, conservando la unidad y el formato', () => {
    expect(shiftDurationReps('20 s', 10)).toBe('30 s')
    expect(shiftDurationReps('45s', 5)).toBe('50s')
    expect(shiftDurationReps('30-45 seg', 10)).toBe('40-55 seg')
  })

  it('conserva el sufijo de lateralidad', () => {
    expect(shiftDurationReps('20-30s por lado', 5)).toBe('25-35s por lado')
  })

  it('devuelve null en lo que no es una duración pura', () => {
    // Los mismos contraejemplos que documenta `exercise-timer-inference.ts`.
    expect(shiftDurationReps('6x10s hold', 5)).toBeNull()
    expect(shiftDurationReps('3-5 (descenso lento 3-4s)', 5)).toBeNull()
    expect(shiftDurationReps('8-12', 5)).toBeNull()
    expect(shiftDurationReps('', 5)).toBeNull()
  })

  it('casa exactamente lo que `inferTimerFromReps` considera una duración', () => {
    for (const reps of ['20 s', '45s', '30-45 seg', '20-30s por lado', '2 min']) {
      expect(inferTimerFromReps(reps)).not.toBeNull()
      expect(shiftDurationReps(reps, 5)).not.toBeNull()
    }
    for (const reps of ['6x10s hold', '3-5 (descenso lento 3-4s)', '8-12', '12/lado']) {
      expect(inferTimerFromReps(reps)).toBeNull()
      expect(shiftDurationReps(reps, 5)).toBeNull()
    }
  })
})

describe('effectiveWeek', () => {
  const step: WeeklyProgression = { field: 'timerSeconds', step: 5 }
  const short: WeeklyProgression = { field: 'timerSeconds', values: [20, 25, 30] }
  const full: WeeklyProgression = { field: 'timerSeconds', values: [20, 25, 30, 20] }

  it('fuera de la descarga es la semana tal cual', () => {
    expect(effectiveWeek(step, 3, false)).toBe(3)
    expect(effectiveWeek(full, 4, false)).toBe(4)
  })

  it('en la descarga la rampa lineal vuelve a la primera semana', () => {
    expect(effectiveWeek(step, 4, true)).toBe(1)
  })

  it('en la descarga se respeta el valor que el autor declaró para esa semana', () => {
    expect(effectiveWeek(full, 4, true)).toBe(4)
  })

  it('en la descarga una lista más corta que la fase se reinicia en vez de quedarse clavada', () => {
    expect(effectiveWeek(short, 4, true)).toBe(1)
  })
})

describe('applyProgressionToExercise — forma explícita', () => {
  it('el colgado de #755: semana 3 son 30 s, y el `reps` del botón rápido también', () => {
    const out = applyProgressionToExercise(DEAD_HANG, DEAD_HANG.weeklyProgression as WeeklyProgression, 3, false)
    expect(out.timerSeconds).toBe(30)
    expect(out.reps).toBe('30 s')
  })

  it('la semana 1 devuelve el mismo objeto: nada que cambiar, identidad intacta', () => {
    const prog = DEAD_HANG.weeklyProgression as WeeklyProgression
    expect(applyProgressionToExercise(DEAD_HANG, prog, 1, false)).toBe(DEAD_HANG)
  })

  it('la semana 4 vuelve a 20 s, como dice la nota', () => {
    const prog = DEAD_HANG.weeklyProgression as WeeklyProgression
    expect(applyProgressionToExercise(DEAD_HANG, prog, 4, false).timerSeconds).toBe(20)
  })

  it('pasada la última semana declarada se mantiene el último valor', () => {
    const prog: WeeklyProgression = { field: 'timerSeconds', values: [20, 25, 30] }
    expect(applyProgressionToExercise(DEAD_HANG, prog, 9, false).timerSeconds).toBe(30)
  })

  it('vale para `reps` de texto, que es lo que la forma lineal no sabe leer', () => {
    const e = ex({ reps: '5 (8 s de bajada)' })
    const prog: WeeklyProgression = { field: 'reps', values: ['5 (6 s)', '5 (7 s)', '5 (8 s)'] }
    expect(applyProgressionToExercise(e, prog, 2, false).reps).toBe('5 (7 s)')
  })
})

describe('applyProgressionToExercise — forma lineal', () => {
  it('suma el paso por cada semana transcurrida', () => {
    const e = ex({ reps: '20 s', isTimer: true, timerSeconds: 20 })
    const prog: WeeklyProgression = { field: 'timerSeconds', step: 5 }
    expect(applyProgressionToExercise(e, prog, 1, false).timerSeconds).toBe(20)
    expect(applyProgressionToExercise(e, prog, 3, false).timerSeconds).toBe(30)
    expect(applyProgressionToExercise(e, prog, 3, false).reps).toBe('30 s')
  })

  it('respeta el techo y el suelo', () => {
    const e = ex({ reps: '20 s', isTimer: true, timerSeconds: 20 })
    expect(applyProgressionToExercise(e, { field: 'timerSeconds', step: 5, max: 30 }, 8, false).timerSeconds).toBe(30)
    expect(applyProgressionToExercise(ex({ rest: 120 }), { field: 'rest', step: -15, min: 60 }, 8, false).rest).toBe(60)
  })

  it('sube series y repeticiones', () => {
    expect(applyProgressionToExercise(ex({ sets: 3 }), { field: 'sets', step: 1 }, 3, false).sets).toBe(5)
    expect(applyProgressionToExercise(ex({ reps: '8-12' }), { field: 'reps', step: 1 }, 3, false).reps).toBe('10-14')
  })

  it('deja en paz lo que no tiene número que ramear', () => {
    const textSets = ex({ sets: 'intentos' })
    expect(applyProgressionToExercise(textSets, { field: 'sets', step: 1 }, 3, false)).toBe(textSets)

    const textReps = ex({ reps: '12/lado' })
    expect(applyProgressionToExercise(textReps, { field: 'reps', step: 1 }, 3, false)).toBe(textReps)

    const noTimer = ex({ timerSeconds: undefined })
    expect(applyProgressionToExercise(noTimer, { field: 'timerSeconds', step: 5 }, 3, false)).toBe(noTimer)
  })

  it('un `timerSeconds` con `reps` que no es duración mueve solo el cronómetro', () => {
    const e = ex({ reps: 'máx', isTimer: true, timerSeconds: 20 })
    const out = applyProgressionToExercise(e, { field: 'timerSeconds', step: 5 }, 3, false)
    expect(out.timerSeconds).toBe(30)
    expect(out.reps).toBe('máx')
  })

  it('sin `step` ni `values` no hace nada', () => {
    const e = ex()
    expect(applyProgressionToExercise(e, { field: 'sets' }, 3, false)).toBe(e)
  })
})

describe('applyWeeklyProgression', () => {
  it('aplica la dosis de la semana 3 y deja el resto de la sesión igual', () => {
    const out = applyWeeklyProgression(WORKOUT, 3, false)
    expect(out.exercises[1].timerSeconds).toBe(30)
    expect(out.exercises[1].reps).toBe('30 s')
    expect(out.exercises[2].reps).toBe('4-5')  // la semana 1 eran 4 a secas
    // El calentamiento y el empuje no declaran rampa: mismos objetos.
    expect(out.exercises[0]).toBe(WORKOUT.exercises[0])
    expect(out.exercises[3]).toBe(WORKOUT.exercises[3])
  })

  it('no muta la entrada', () => {
    applyWeeklyProgression(WORKOUT, 3, false)
    expect(WORKOUT.exercises[1].timerSeconds).toBe(20)
    expect(WORKOUT.exercises[1].reps).toBe('20 s')
  })

  it('devuelve el MISMO `Workout` cuando no hay nada que cambiar', () => {
    // Semana 1: las dos rampas coinciden con el valor de la fila, que es lo
    // que el validador (`progression_base`) exige al contenido.
    expect(applyWeeklyProgression(WORKOUT, 1, false)).toBe(WORKOUT)
    // Sin semana (programa sin empezar o rango de fase ilegible).
    expect(applyWeeklyProgression(WORKOUT, null, false)).toBe(WORKOUT)
    // Una sesión sin ninguna rampa declarada: retrocompatibilidad (#755).
    const plain: Workout = { ...WORKOUT, exercises: [ex(), ex({ id: 'dip' })] }
    expect(applyWeeklyProgression(plain, 3, false)).toBe(plain)
  })

  it('en la semana de descarga la rampa vuelve al principio de la fase', () => {
    const short: Workout = {
      ...WORKOUT,
      exercises: [ex({ id: 'dead_hang', reps: '20 s', isTimer: true, timerSeconds: 20, weeklyProgression: { field: 'timerSeconds', step: 5 } })],
    }
    expect(applyWeeklyProgression(short, 4, false).exercises[0].timerSeconds).toBe(35)
    expect(applyWeeklyProgression(short, 4, true).exercises[0].timerSeconds).toBe(20)
  })

  it('aplica varias rampas sobre el mismo ejercicio', () => {
    const w: Workout = {
      ...WORKOUT,
      exercises: [ex({
        sets: 3, reps: '8-10', rest: 120,
        weeklyProgression: [
          { field: 'sets', step: 1, max: 4 },
          { field: 'reps', step: 2 },
          { field: 'rest', step: -15, min: 90 },
        ],
      })],
    }
    const out = applyWeeklyProgression(w, 3, false).exercises[0]
    expect(out.sets).toBe(4)
    expect(out.reps).toBe('12-14')
    expect(out.rest).toBe(90)
  })
})

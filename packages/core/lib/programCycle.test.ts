import { describe, expect, it } from 'vitest'
import {
  MAX_PROGRAM_CYCLE,
  applyCycleProgression,
  applyCycleStep,
  canRepeatProgram,
  normalizeCycle,
  phaseLength,
} from './programCycle'
import type { Exercise, Phase, Workout } from '../types'

function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'pushup_std', name: 'Flexiones', sets: 4, reps: '8-12', rest: 90,
    muscles: '', note: '', youtube: '', priority: 'high', section: 'main', ...over,
  }
}

const PHASES: Phase[] = [
  { id: 1, name: 'Base', weeks: '1-4', color: '#000', bg: '#000' },
  { id: 2, name: 'Fuerza', weeks: '5-10', color: '#000', bg: '#000' },
]

const HANG_VALUES = ex({
  id: 'dead_hang', sets: 3, reps: '20 s', isTimer: true, timerSeconds: 20,
  weeklyProgression: { field: 'timerSeconds', values: [20, 25, 30, 20] },
})
const NEG_LINEAR = ex({ id: 'pullup_neg', sets: 3, reps: '4', weeklyProgression: { field: 'reps', step: 1, max: 10 } })
const PLAIN_REPS = ex({ id: 'pushup_std', reps: '8-12' })
const PLAIN_TIMER = ex({ id: 'plank', reps: '30 s', isTimer: true, timerSeconds: 30 })
const PLAIN_SINGLE = ex({ id: 'dips', reps: '6' })
const TEXT_REPS = ex({ id: 'max', reps: 'máx' })
// QA #939: filas sembradas con `timer_seconds: 0` que NO son de tiempo.
const ZERO_TIMER = ex({ id: 'hollow', reps: '12-15', timerSeconds: 0 })
const WARMUP = ex({ id: 'circles', reps: '', timerSeconds: 30, section: 'warmup' })

const WORKOUT: Workout = {
  phase: 1, day: 'lun', title: 'Tirón',
  exercises: [HANG_VALUES, NEG_LINEAR, PLAIN_REPS, PLAIN_TIMER, PLAIN_SINGLE, TEXT_REPS, ZERO_TIMER, WARMUP],
}

const byId = (w: Workout, id: string) => w.exercises.find(e => e.id === id)!

describe('normalizeCycle / canRepeatProgram (#939)', () => {
  it('0, vacío o basura es la primera vuelta', () => {
    expect(normalizeCycle(0)).toBe(1)
    expect(normalizeCycle(undefined)).toBe(1)
    expect(normalizeCycle(Number.NaN)).toBe(1)
    expect(normalizeCycle(2)).toBe(2)
  })

  it('se puede repetir hasta llegar a la vuelta máxima', () => {
    expect(MAX_PROGRAM_CYCLE).toBe(3)
    expect(canRepeatProgram(0)).toBe(true)
    expect(canRepeatProgram(2)).toBe(true)
    expect(canRepeatProgram(3)).toBe(false)
  })
})

describe('phaseLength', () => {
  it('lee el rango de la fase', () => {
    expect(phaseLength(PHASES, 1)).toBe(4)
    expect(phaseLength(PHASES, 2)).toBe(6)
    expect(phaseLength(PHASES, 9)).toBeNull()
  })
})

describe('applyCycleStep', () => {
  it('la vuelta 1 devuelve el mismo objeto', () => {
    expect(applyCycleStep(WORKOUT, 1)).toBe(WORKOUT)
  })

  it('sin rampa: +1 rep por vuelta (y a los dos extremos del rango) y +5 s en el tiempo', () => {
    const w2 = applyCycleStep(WORKOUT, 2)
    expect(byId(w2, 'pushup_std').reps).toBe('9-13')
    expect(byId(w2, 'dips').reps).toBe('7')
    expect(byId(w2, 'plank')).toMatchObject({ timerSeconds: 35, reps: '35 s' })
    const w3 = applyCycleStep(WORKOUT, 3)
    expect(byId(w3, 'pushup_std').reps).toBe('10-14')
    expect(byId(w3, 'plank')).toMatchObject({ timerSeconds: 40, reps: '40 s' })
  })

  it('timerSeconds 0 no es un ejercicio de tiempo: sube las reps', () => {
    const w2 = applyCycleStep(WORKOUT, 2)
    expect(byId(w2, 'hollow')).toMatchObject({ reps: '13-16', timerSeconds: 0 })
  })

  it('no sube el calentamiento ni la vuelta a la calma', () => {
    expect(byId(applyCycleStep(WORKOUT, 2), 'circles')).toBe(WARMUP)
  })

  it('no toca lo que tiene rampa, lo que no es número, ni las series', () => {
    const w2 = applyCycleStep(WORKOUT, 2)
    expect(byId(w2, 'dead_hang')).toBe(HANG_VALUES)
    expect(byId(w2, 'pullup_neg')).toBe(NEG_LINEAR)
    expect(byId(w2, 'max')).toBe(TEXT_REPS)
    expect(byId(w2, 'pushup_std').sets).toBe(4)
  })
})

describe('applyCycleProgression', () => {
  it('vuelta 1 = la rampa de siempre', () => {
    const w = applyCycleProgression(WORKOUT, PHASES, 1, 2, false, 1)
    expect(byId(w, 'dead_hang').timerSeconds).toBe(25)
    expect(byId(w, 'pullup_neg').reps).toBe('5')
    expect(byId(w, 'pushup_std').reps).toBe('8-12')
  })

  it('vuelta 2: la rampa sigue por donde acabó la vuelta 1', () => {
    // Fase 1 de 4 semanas: la semana 1 de la vuelta 2 es la «semana 5».
    const w = applyCycleProgression(WORKOUT, PHASES, 1, 1, false, 2)
    expect(byId(w, 'pullup_neg').reps).toBe('8')      // 4 + 4 semanas × 1
    expect(byId(w, 'dead_hang').timerSeconds).toBe(20) // values: techo = último valor declarado
    expect(byId(w, 'pushup_std').reps).toBe('9-13')   // sin rampa: escalón
  })

  it('la rampa lineal respeta su max', () => {
    const w = applyCycleProgression(WORKOUT, PHASES, 1, 4, false, 3)
    expect(byId(w, 'pullup_neg').reps).toBe('10')
  })

  it('en la semana de descarga la rampa vuelve a su base', () => {
    const w = applyCycleProgression(WORKOUT, PHASES, 1, 4, true, 2)
    expect(byId(w, 'pullup_neg').reps).toBe('4')
  })

  it('sin semana conocida no inventa rampa, pero el escalón de vuelta sí se aplica', () => {
    const w = applyCycleProgression(WORKOUT, PHASES, 1, null, false, 2)
    expect(byId(w, 'pullup_neg')).toBe(NEG_LINEAR)
    expect(byId(w, 'pushup_std').reps).toBe('9-13')
  })
})

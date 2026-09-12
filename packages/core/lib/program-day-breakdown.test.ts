import { describe, expect, it } from 'vitest'
import type { CircuitDefinition, Exercise } from '../types'
import {
  circuitToSessionExercises,
  defaultBreakdownPhase,
  programDayToSessionExercises,
} from './program-day-breakdown'

function ex(id: string, over: Partial<Exercise> = {}): Exercise {
  return {
    id, name: id, sets: 3, reps: '8', rest: 60, muscles: '', note: '', youtube: '',
    priority: 'med', ...over,
  }
}

describe('programDayToSessionExercises', () => {
  it('ordena calentamiento → principal → vuelta a la calma sin desordenar cada sección', () => {
    const out = programDayToSessionExercises([
      ex('a', { section: 'main' }), ex('b', { section: 'cooldown' }),
      ex('c', { section: 'warmup' }), ex('d', { section: 'main' }),
    ])
    expect(out.map(e => [e.exerciseId, e.section])).toEqual([
      ['c', 'warmup'], ['a', 'main'], ['d', 'main'], ['b', 'cooldown'],
    ])
  })

  it('un ejercicio sin sección cuenta como bloque principal', () => {
    expect(programDayToSessionExercises([ex('a')])[0].section).toBe('main')
  })

  it('cada serie planificada es una fila con las reps objetivo', () => {
    const [out] = programDayToSessionExercises([ex('a', { sets: 3, reps: '8-12', rest: 90, note: 'lento' })])
    expect(out.sets.map(s => [s.setNumber, s.reps])).toEqual([[1, '8-12'], [2, '8-12'], [3, '8-12']])
    expect(out).toMatchObject({ restSeconds: 90, note: 'lento', bestSet: null, hasWeight: false, hasRpe: false })
  })

  it('prefiere el texto de reps y cae a los segundos del temporizador si va vacío', () => {
    const [withText, withTimer] = programDayToSessionExercises([
      ex('a', { sets: 2, reps: '30-45 seg', isTimer: true, timerSeconds: 45 }),
      ex('b', { sets: 2, reps: '', isTimer: true, timerSeconds: 30 }),
    ])
    expect(withText.sets[0].reps).toBe('30-45 seg')
    expect(withTimer.sets[0].reps).toBe('30s')
  })

  it('series en texto dan una sola fila que conserva ese texto', () => {
    const [out] = programDayToSessionExercises([ex('a', { sets: 'múltiples', reps: 'intentos' })])
    expect(out.sets.map(s => s.reps)).toEqual(['múltiples × intentos'])
  })

  it('sin descanso ni nota no inventa campos', () => {
    const [out] = programDayToSessionExercises([ex('a', { rest: 0, note: '' })])
    expect(out.restSeconds).toBeUndefined()
    expect(out.note).toBeUndefined()
  })
})

describe('circuitToSessionExercises', () => {
  it('una fila por ronda, con reps o segundos de trabajo', () => {
    const circuit: CircuitDefinition = {
      id: 'c', name: 'Circuito', mode: 'timed', rounds: 3, restBetweenExercises: 15, restBetweenRounds: 60,
      workSeconds: 40,
      exercises: [
        { exerciseId: 'burpee', name: { es: 'Burpee', en: 'Burpee' } },
        { exerciseId: 'squat', name: 'Sentadilla', reps: '15' },
      ],
    }
    const [burpee, squat] = circuitToSessionExercises(circuit, 'es')
    expect(burpee.name).toBe('Burpee')
    expect(burpee.sets.map(s => s.reps)).toEqual(['40s', '40s', '40s'])
    expect(squat.sets.map(s => s.reps)).toEqual(['15', '15', '15'])
  })
})

describe('defaultBreakdownPhase', () => {
  const phases = [{ id: 1 }, { id: 2 }, { id: 3 }]

  it('usa la fase en curso si el programa la tiene', () => {
    expect(defaultBreakdownPhase(phases, 2)).toBe(2)
  })

  it('cae a la primera fase si no hay fase en curso o no existe', () => {
    expect(defaultBreakdownPhase(phases, null)).toBe(1)
    expect(defaultBreakdownPhase(phases, 7)).toBe(1)
    expect(defaultBreakdownPhase([], 2)).toBe(1)
  })
})

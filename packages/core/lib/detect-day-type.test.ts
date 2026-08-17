import { describe, it, expect } from 'vitest'
import type { Exercise } from '../types'
import { detectDayType } from './detect-day-type'

/** Solo `muscles` decide el tipo de día; el resto del ejercicio es relleno. */
function ex(muscles: string): Exercise {
  return {
    id: 'x', name: 'Ejercicio', sets: 3, reps: '10', rest: 60,
    muscles, note: '', youtube: '', priority: 'normal',
  } as Exercise
}

describe('detectDayType', () => {
  it('sin ejercicios devuelve full', () => {
    expect(detectDayType([])).toBe('full')
  })

  it('un día sin músculos reconocibles cae en full en vez de inventarse un tipo', () => {
    expect(detectDayType([ex('cuello'), ex('')])).toBe('full')
  })

  it('clasifica los cuatro tipos principales por músculo', () => {
    expect(detectDayType([ex('pecho'), ex('tríceps')])).toBe('push')
    expect(detectDayType([ex('espalda'), ex('bíceps')])).toBe('pull')
    expect(detectDayType([ex('cuádriceps'), ex('glúteo')])).toBe('legs')
    expect(detectDayType([ex('abdominal'), ex('oblicuo')])).toBe('lumbar')
    expect(detectDayType([ex('cardio')])).toBe('cardio')
  })

  it('entiende también los nombres en inglés', () => {
    expect(detectDayType([ex('chest'), ex('shoulder')])).toBe('push')
    expect(detectDayType([ex('back'), ex('lat')])).toBe('pull')
  })

  it('gana el músculo mayoritario, no el primero de la lista', () => {
    expect(detectDayType([ex('pecho'), ex('espalda'), ex('dorsal')])).toBe('pull')
  })

  it('parte por comas, espacios y barras', () => {
    expect(detectDayType([ex('pecho, hombro / tríceps')])).toBe('push')
  })

  it('es insensible a mayúsculas', () => {
    expect(detectDayType([ex('PECHO'), ex('Tríceps')])).toBe('push')
  })

  it('cada token cuenta una sola vez aunque case con varias keywords', () => {
    // 'pierna' y 'pecho' empatan a 1, y el empate lo resuelve el orden de
    // prioridad (push antes que legs), no el orden de los ejercicios.
    expect(detectDayType([ex('pierna'), ex('pecho')])).toBe('push')
  })

  it('ignora los ejercicios sin campo muscles', () => {
    const sinMusculos = { ...ex('pecho'), muscles: '' as unknown as string }
    expect(detectDayType([sinMusculos, ex('espalda')])).toBe('pull')
  })
})

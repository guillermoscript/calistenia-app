/**
 * Tests de `inferTimerFromReps` (#690).
 *
 * El grueso son los NEGATIVOS: el riesgo de esta función no es dejarse una
 * duración sin detectar (la fila se queda como está hoy), sino meter un
 * cronómetro en un ejercicio de repeticiones y falsear la serie.
 */

import { describe, it, expect } from 'vitest'
import { inferTimerFromReps } from './exercise-timer-inference'

describe('inferTimerFromReps — duraciones puras', () => {
  it('un valor suelto en segundos', () => {
    expect(inferTimerFromReps('45s')).toEqual({ isTimer: true, timerSeconds: 45 })
    expect(inferTimerFromReps('60 seg')).toEqual({ isTimer: true, timerSeconds: 60 })
    expect(inferTimerFromReps('30 segundos')).toEqual({ isTimer: true, timerSeconds: 30 })
    expect(inferTimerFromReps('20 sec')).toEqual({ isTimer: true, timerSeconds: 20 })
    expect(inferTimerFromReps('20secs')).toEqual({ isTimer: true, timerSeconds: 20 })
    expect(inferTimerFromReps('15 segs')).toEqual({ isTimer: true, timerSeconds: 15 })
  })

  it('un rango se queda con el EXTREMO ALTO', () => {
    expect(inferTimerFromReps('30-45 seg')).toEqual({ isTimer: true, timerSeconds: 45 })
    expect(inferTimerFromReps('20-30s')).toEqual({ isTimer: true, timerSeconds: 30 })
    expect(inferTimerFromReps('15 - 25 s')).toEqual({ isTimer: true, timerSeconds: 25 })
  })

  it('acepta el guion largo del rango', () => {
    expect(inferTimerFromReps('30–45s')).toEqual({ isTimer: true, timerSeconds: 45 })
  })

  it('los minutos se pasan a segundos', () => {
    expect(inferTimerFromReps('2 min')).toEqual({ isTimer: true, timerSeconds: 120 })
    expect(inferTimerFromReps('3mins')).toEqual({ isTimer: true, timerSeconds: 180 })
    expect(inferTimerFromReps('1-2 minutos')).toEqual({ isTimer: true, timerSeconds: 120 })
  })

  it('el sufijo de lateralidad no cambia lo que dura una serie', () => {
    expect(inferTimerFromReps('20-30s por lado')).toEqual({ isTimer: true, timerSeconds: 30 })
    expect(inferTimerFromReps('30s cada lado')).toEqual({ isTimer: true, timerSeconds: 30 })
    expect(inferTimerFromReps('45s c/lado')).toEqual({ isTimer: true, timerSeconds: 45 })
    expect(inferTimerFromReps('30s/lado')).toEqual({ isTimer: true, timerSeconds: 30 })
    expect(inferTimerFromReps('20-30 seg / lado')).toEqual({ isTimer: true, timerSeconds: 30 })
    expect(inferTimerFromReps('30s each side')).toEqual({ isTimer: true, timerSeconds: 30 })
    expect(inferTimerFromReps('30s per side')).toEqual({ isTimer: true, timerSeconds: 30 })
  })

  it('ignora espacios sobrantes y mayúsculas', () => {
    expect(inferTimerFromReps('  45 SEG  ')).toEqual({ isTimer: true, timerSeconds: 45 })
    expect(inferTimerFromReps('2 MIN')).toEqual({ isTimer: true, timerSeconds: 120 })
  })
})

describe('inferTimerFromReps — lo que NO es una duración', () => {
  it('series por aguante: el número de delante son series, no segundos', () => {
    expect(inferTimerFromReps('6x10s hold')).toBeNull()
    expect(inferTimerFromReps('5 × 10s hold')).toBeNull()
  })

  it('repeticiones con una nota de tempo', () => {
    expect(inferTimerFromReps('3-5 (descenso lento 3-4s)')).toBeNull()
    expect(inferTimerFromReps('10 (3s arriba)')).toBeNull()
  })

  it('un formato con prefijo propio (AMRAP) no es una duración pura', () => {
    expect(inferTimerFromReps('AMRAP 60s')).toBeNull()
  })

  it('repeticiones a secas', () => {
    expect(inferTimerFromReps('12-15')).toBeNull()
    expect(inferTimerFromReps('10')).toBeNull()
    expect(inferTimerFromReps('máx')).toBeNull()
  })

  it('vacío, nulo o indefinido', () => {
    expect(inferTimerFromReps('')).toBeNull()
    expect(inferTimerFromReps('   ')).toBeNull()
    expect(inferTimerFromReps(null)).toBeNull()
    expect(inferTimerFromReps(undefined)).toBeNull()
  })

  it('una duración de cero no vale: el crono acabaría al abrirse', () => {
    expect(inferTimerFromReps('0s')).toBeNull()
    expect(inferTimerFromReps('0-0 min')).toBeNull()
  })

  it('una unidad que no reconocemos se queda fuera', () => {
    expect(inferTimerFromReps('30 reps')).toBeNull()
    expect(inferTimerFromReps('2 horas')).toBeNull()
    expect(inferTimerFromReps('30m')).toBeNull()
  })
})

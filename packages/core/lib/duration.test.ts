import { describe, it, expect } from 'vitest'
import { calculateWorkoutDuration, formatDuration } from './duration'

describe('calculateWorkoutDuration', () => {
  it('estima con timer: sets * timerSeconds + (sets-1) * rest', () => {
    // 3 sets * 20s + 2 * 45s rest = 60 + 90 = 150s -> 2.5min -> round(2.5) = 3 (round half up en JS)
    const minutes = calculateWorkoutDuration([
      { sets: 3, reps: '20s', rest: 45, isTimer: true, timerSeconds: 20 },
    ])
    expect(minutes).toBe(3)
  })

  it('estima sin timer: 30s fijo por set de trabajo', () => {
    // 4 sets * 30s + 3 * 60s rest = 120 + 180 = 300s -> 5min
    const minutes = calculateWorkoutDuration([{ sets: 4, reps: '10', rest: 60 }])
    expect(minutes).toBe(5)
  })

  it('isTimer sin timerSeconds cae al fallback de 30s (guard `ex.isTimer && ex.timerSeconds`)', () => {
    const withTimerSeconds = calculateWorkoutDuration([{ sets: 3, reps: '30s', rest: 60, isTimer: true, timerSeconds: 30 }])
    const withoutTimerSeconds = calculateWorkoutDuration([{ sets: 3, reps: '30s', rest: 60, isTimer: true }])
    expect(withoutTimerSeconds).toBe(withTimerSeconds)
  })

  it('sets no numérico (p.ej. "multiples") usa el fallback de 3 sets', () => {
    const withFallback = calculateWorkoutDuration([{ sets: 'multiples', reps: '10', rest: 60 }])
    const explicit3 = calculateWorkoutDuration([{ sets: 3, reps: '10', rest: 60 }])
    expect(withFallback).toBe(explicit3)
  })

  it('rest en 0 (falsy) usa el fallback de 60s por el operador `||`', () => {
    // OJO: `ex.rest || 60` trata rest=0 igual que rest ausente, así que un
    // descanso EXPLÍCITO de 0s no se puede representar: siempre cae a 60s.
    const restZero = calculateWorkoutDuration([{ sets: 3, reps: '10', rest: 0 }])
    const restSixty = calculateWorkoutDuration([{ sets: 3, reps: '10', rest: 60 }])
    expect(restZero).toBe(restSixty)
  })

  it('no aplica descanso después del último set (sets=1 -> sin rest)', () => {
    // 1 set * 30s + 0 * rest = 30s -> round(30/60) = round(0.5) = 1 (round half up)
    const minutes = calculateWorkoutDuration([{ sets: 1, reps: '10', rest: 90 }])
    expect(minutes).toBe(1)
  })

  it('suma varios ejercicios', () => {
    const total = calculateWorkoutDuration([
      { sets: 3, reps: '10', rest: 60 }, // 3*30 + 2*60 = 210s
      { sets: 3, reps: '10', rest: 60 }, // 210s más
    ])
    // 420s total -> 7min
    expect(total).toBe(7)
  })

  it('lista vacía -> 0 minutos', () => {
    expect(calculateWorkoutDuration([])).toBe(0)
  })
})

describe('formatDuration', () => {
  it('menos de 60 minutos -> "N min"', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(59)).toBe('59 min')
  })

  it('exactamente una hora -> "1h" sin minutos', () => {
    expect(formatDuration(60)).toBe('1h')
  })

  it('horas exactas sin resto -> "Nh"', () => {
    expect(formatDuration(120)).toBe('2h')
  })

  it('horas + minutos -> "Nh Mmin"', () => {
    expect(formatDuration(90)).toBe('1h 30min')
    expect(formatDuration(125)).toBe('2h 5min')
  })
})

import { describe, it, expect } from 'vitest'
import { toCardioSession } from './cardio-session-view'

describe('toCardioSession', () => {
  it('rellena los valores por defecto de un registro mínimo', () => {
    const s = toCardioSession({ id: 'a' })
    expect(s).toMatchObject({
      id: 'a', activity_type: 'running', gps_points: [], distance_km: 0,
      duration_seconds: 0, avg_pace: 0, elevation_gain: 0, splits: [],
    })
  })

  it('conserva los campos del registro, programa y métricas del reloj', () => {
    const splits = [{ km: 1, pace: 5, elapsed: 300 }]
    const s = toCardioSession({
      id: 'b', user: 'u', program: 'p', program_day_key: 'd', activity_type: 'cycling',
      distance_km: 10, splits, hr_avg: 140, hr_max: 170, calories_actual: 400,
    })
    expect(s.program).toBe('p')
    expect(s.program_day_key).toBe('d')
    expect(s.activity_type).toBe('cycling')
    expect(s.splits).toEqual(splits)
    expect(s.hr_avg).toBe(140)
    expect(s.calories_actual).toBe(400)
  })

  it('splits que no son array quedan en []', () => {
    expect(toCardioSession({ id: 'c', splits: 'x' }).splits).toEqual([])
  })
})

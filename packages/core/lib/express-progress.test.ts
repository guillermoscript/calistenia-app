import { describe, it, expect } from 'vitest'
import { computeExpressProgress } from './express-progress'

describe('computeExpressProgress', () => {
  it('suma varios sets del mismo día y compara contra el objetivo', () => {
    const res = computeExpressProgress(
      [
        { date: '2026-08-01', reps: '10' },
        { date: '2026-08-01', reps: '12' },
        { date: '2026-08-02', reps: '5' },
      ],
      '2026-08-01', 3, 20, '2026-08-03',
    )
    expect(res.totalDays).toBe(3)
    expect(res.dailyProgress).toEqual([
      { date: '2026-08-01', value: 22, completed: true },
      { date: '2026-08-02', value: 5, completed: false },
      { date: '2026-08-03', value: 0, completed: false },
    ])
    expect(res.daysCompleted).toBe(1)
  })

  it('alcanzar justo el objetivo cuenta como completado', () => {
    const res = computeExpressProgress(
      [{ date: '2026-08-01', reps: '20' }],
      '2026-08-01', 1, 20, '2026-08-01',
    )
    expect(res.daysCompleted).toBe(1)
    expect(res.currentStreak).toBe(1)
  })

  it('un día fallado anterior a hoy rompe la racha', () => {
    const res = computeExpressProgress(
      [
        { date: '2026-08-01', reps: '20' },
        { date: '2026-08-03', reps: '20' },
      ],
      '2026-08-01', 5, 20, '2026-08-03',
    )
    expect(res.daysCompleted).toBe(2)
    expect(res.currentStreak).toBe(1)
  })

  it('hoy incompleto no rompe la racha (el día sigue en curso)', () => {
    const res = computeExpressProgress(
      [
        { date: '2026-08-01', reps: '20' },
        { date: '2026-08-02', reps: '25' },
      ],
      '2026-08-01', 5, 20, '2026-08-03',
    )
    expect(res.currentStreak).toBe(2)
  })

  it('los días futuros no puntúan ni afectan la racha', () => {
    const res = computeExpressProgress(
      [{ date: '2026-08-01', reps: '20' }],
      '2026-08-01', 7, 20, '2026-08-01',
    )
    expect(res.dailyProgress).toHaveLength(7)
    expect(res.daysCompleted).toBe(1)
    expect(res.currentStreak).toBe(1)
  })

  it('reps en texto libre se parsean ("3x10" → 10) y lo no numérico se ignora', () => {
    const res = computeExpressProgress(
      [
        { date: '2026-08-01', reps: '3x10' },
        { date: '2026-08-01', reps: 'max' },
        { date: '2026-08-01', reps: null },
      ],
      '2026-08-01', 1, 10, '2026-08-01',
    )
    expect(res.dailyProgress[0].value).toBe(10)
    expect(res.daysCompleted).toBe(1)
  })

  it('sin sets devuelve todos los días a cero', () => {
    const res = computeExpressProgress([], '2026-08-01', 3, 20, '2026-08-05')
    expect(res.daysCompleted).toBe(0)
    expect(res.currentStreak).toBe(0)
    expect(res.dailyProgress.every(d => d.value === 0 && !d.completed)).toBe(true)
  })

  it('objetivo 0 o negativo nunca marca días completados', () => {
    const res = computeExpressProgress(
      [{ date: '2026-08-01', reps: '50' }],
      '2026-08-01', 2, 0, '2026-08-02',
    )
    expect(res.daysCompleted).toBe(0)
  })

  it('sets fuera de la ventana del reto no cuentan', () => {
    const res = computeExpressProgress(
      [
        { date: '2026-07-31', reps: '20' },
        { date: '2026-08-03', reps: '20' },
      ],
      '2026-08-01', 2, 20, '2026-08-05',
    )
    expect(res.daysCompleted).toBe(0)
  })
})

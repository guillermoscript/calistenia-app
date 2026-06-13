import { describe, it, expect } from 'vitest'
import { buildWidgetSnapshot } from '../widget-snapshot'

const baseArgs = {
  today: '2026-06-10',
  tz: 'America/New_York',
  lang: 'es' as const,
  programName: 'Calistenia 26 semanas',
  programPhase: 2,
  todayId: 'mie',
  weekDays: [
    { id: 'lun', type: 'strength' },
    { id: 'mar', type: 'rest' },
    { id: 'mie', type: 'strength' },
  ],
  workout: { title: 'Pull Day', exerciseCount: 6 },
  todayType: 'strength',
  isDone: (key: string) => key === 'p2_lun',
  streak: 4,
  weeklyDone: 2,
  weeklyGoal: 5,
}

describe('buildWidgetSnapshot', () => {
  it('construye la semana con done por clave p{fase}_{dia}', () => {
    const snap = buildWidgetSnapshot(baseArgs)
    expect(snap.week).toEqual([
      { id: 'lun', done: true, type: 'strength' },
      { id: 'mar', done: false, type: 'rest' },
      { id: 'mie', done: false, type: 'strength' },
    ])
  })

  it('rellena workoutToday con done de hoy y metadatos', () => {
    const snap = buildWidgetSnapshot({ ...baseArgs, isDone: (k: string) => k === 'p2_mie' })
    expect(snap.workoutToday).toEqual({
      title: 'Pull Day', type: 'strength', done: true, exerciseCount: 6, programPhase: 2,
    })
    expect(snap.date).toBe('2026-06-10')
    expect(snap.tz).toBe('America/New_York')
    expect(snap.streak).toBe(4)
    expect(snap.weeklyDone).toBe(2)
    expect(snap.weeklyGoal).toBe(5)
    expect(snap.lang).toBe('es')
  })

  it('workoutToday null sin programa/workout', () => {
    const snap = buildWidgetSnapshot({ ...baseArgs, programName: null, workout: null })
    expect(snap.workoutToday).toBeNull()
    expect(snap.programName).toBeNull()
  })

  it('día de descanso: workoutToday con type rest y title vacío si no hay workout', () => {
    const snap = buildWidgetSnapshot({ ...baseArgs, todayId: 'mar', todayType: 'rest', workout: null })
    expect(snap.workoutToday).toEqual({
      title: '', type: 'rest', done: false, exerciseCount: 0, programPhase: 2,
    })
  })
})

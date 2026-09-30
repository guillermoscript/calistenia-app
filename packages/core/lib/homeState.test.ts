import { describe, expect, it } from 'vitest'
import { deriveActivation, resolveHomeStage } from './activation'
import { dayHasContent, getHomeState, HOME_STATE_PRECEDENCE, type HomeStateInput } from './homeState'
import type { DayId, DayType, WeekDay } from '../types'

const day = (id: DayId, type: DayType, extra: Partial<WeekDay> = {}): WeekDay =>
  ({ id, name: id, focus: id, type, color: '#fff', ...extra })

// Planche Roadmap real: lun empuje · mar tirón · jue planche · sáb empuje pesado.
const WEEK: WeekDay[] = [
  day('lun', 'push'), day('mar', 'pull'), day('mie', 'rest'), day('jue', 'full'),
  day('vie', 'rest'), day('sab', 'push'), day('dom', 'rest'),
]
const TUESDAY = '2026-09-29'
const WEDNESDAY = '2026-09-30'

const done = (...keys: string[]) => (key: string, date?: string) => keys.includes(`${date}|${key}`)

/** Veterano con programa, martes, que entrenó ayer. */
function input(over: Partial<HomeStateInput> = {}): HomeStateInput {
  return {
    today: TUESDAY,
    activeProgram: { id: 'prog' },
    programProgress: { nextDay: 'mar', isDeloadWeek: false, isCompleted: false, currentWeek: 3, currentPhase: 1 },
    weekDays: WEEK,
    isWorkoutDone: done(),
    lastActivityDay: '2026-09-28',
    activeActivity: null,
    account: { stage: 'full', sessions: 20, pending: false },
    activation: null,
    week: { done: 1, goal: 4 },
    ...over,
  }
}

describe('getHomeState · un test por kind', () => {
  it('training_day: toca entrenar, con «día 2 de 4»', () => {
    const s = getHomeState(input())
    expect(s).toMatchObject({
      kind: 'training_day',
      deload: false,
      day: { dayId: 'mar', date: TUESDAY, workoutKey: 'p1_mar', dayType: 'strength', index: 2, of: 4 },
    })
  })

  it('training_day: dayType cardio / circuit / yoga', () => {
    const weekDays = [day('lun', 'cardio'), day('mar', 'circuit'), day('mie', 'yoga')]
    expect(getHomeState(input({ today: '2026-09-28', weekDays }))).toMatchObject({ kind: 'training_day', day: { dayType: 'cardio' } })
    expect(getHomeState(input({ today: TUESDAY, weekDays }))).toMatchObject({ kind: 'training_day', day: { dayType: 'circuit' } })
    expect(getHomeState(input({ today: WEDNESDAY, weekDays }))).toMatchObject({ kind: 'training_day', day: { dayType: 'yoga' } })
  })

  it('training_day con modificador deload', () => {
    const s = getHomeState(input({ programProgress: { nextDay: 'mar', isDeloadWeek: true, isCompleted: false, currentWeek: 4, currentPhase: 1 } }))
    expect(s).toMatchObject({ kind: 'training_day', deload: true })
  })

  it('usa la fase en curso en la clave del día', () => {
    const s = getHomeState(input({ programProgress: { nextDay: 'mar', isDeloadWeek: false, isCompleted: false, currentWeek: 9, currentPhase: 2 } }))
    expect(s).toMatchObject({ kind: 'training_day', day: { workoutKey: 'p2_mar' } })
  })

  it('in_progress: hay una actividad sin terminar', () => {
    const s = getHomeState(input({ activeActivity: { type: 'strength', startedDay: TUESDAY, workoutKey: 'p1_mar' } }))
    expect(s).toMatchObject({ kind: 'in_progress', fromAnotherDay: false, activity: { type: 'strength' } })
  })

  it.each(['cardio', 'circuit', 'free', 'battle'] as const)('in_progress también para %s', (type) => {
    expect(getHomeState(input({ activeActivity: { type } })).kind).toBe('in_progress')
  })

  it('program_complete: terminado y sin nextDay', () => {
    const s = getHomeState(input({ programProgress: { nextDay: null, isDeloadWeek: false, isCompleted: true, currentWeek: 16, currentPhase: 4 } }))
    expect(s.kind).toBe('program_complete')
  })

  it('no_program: sin programa y con entrenos en la cuenta', () => {
    expect(getHomeState(input({ activeProgram: null })).kind).toBe('no_program')
  })

  it('no_program ignora los weekDays de reserva (FALLBACK_PHASES)', () => {
    expect(getHomeState(input({ activeProgram: null, weekDays: WEEK })).kind).toBe('no_program')
  })

  it('first_workout: 0 entrenos en la cuenta, con la meta si la ventana sigue abierta', () => {
    const activation = deriveActivation({ sessionDays: [], signupDay: '2026-09-28', today: TUESDAY })
    const s = getHomeState(input({ account: { stage: 'first', sessions: 0, pending: false }, activation, lastActivityDay: null }))
    expect(s).toMatchObject({ kind: 'first_workout', showActivationGoal: true })
  })

  it('first_workout sin la meta con la ventana cerrada', () => {
    const activation = deriveActivation({ sessionDays: [], signupDay: '2026-09-01', today: TUESDAY })
    const s = getHomeState(input({ account: { stage: 'first', sessions: 0, pending: false }, activation, lastActivityDay: null }))
    expect(s).toMatchObject({ kind: 'first_workout', showActivationGoal: false })
  })

  it('first_workout también sin programa', () => {
    const s = getHomeState(input({ activeProgram: null, account: { stage: 'first', sessions: 0, pending: false }, lastActivityDay: null }))
    expect(s.kind).toBe('first_workout')
  })

  it('comeback: 7 o más días desde el último entreno', () => {
    const s = getHomeState(input({ lastActivityDay: '2026-09-22' }))
    expect(s).toMatchObject({ kind: 'comeback', daysSinceLast: 7, day: { dayId: 'mar', date: TUESDAY } })
  })

  it('comeback en día de descanso propone el siguiente día con contenido', () => {
    const s = getHomeState(input({ today: WEDNESDAY, lastActivityDay: '2026-09-16' }))
    expect(s).toMatchObject({ kind: 'comeback', daysSinceLast: 14, day: { dayId: 'jue', date: '2026-10-01' } })
  })

  it('done_today: el día de hoy ya está hecho, con el siguiente', () => {
    const s = getHomeState(input({ isWorkoutDone: done(`${TUESDAY}|p1_mar`), lastActivityDay: TUESDAY }))
    expect(s).toMatchObject({ kind: 'done_today', variant: 'default', day: { dayId: 'mar' }, next: { dayId: 'jue', date: '2026-10-01' } })
  })

  it('done_today variante cardio', () => {
    const weekDays = [day('mar', 'cardio', { cardioConfig: { activityType: 'running' } as WeekDay['cardioConfig'] })]
    const s = getHomeState(input({ weekDays, isWorkoutDone: done(`${TUESDAY}|p1_mar`), lastActivityDay: TUESDAY }))
    expect(s).toMatchObject({ kind: 'done_today', variant: 'cardio' })
  })

  it('week_complete: semana cumplida y hoy es descanso', () => {
    const s = getHomeState(input({ today: WEDNESDAY, week: { done: 4, goal: 4 } }))
    expect(s).toMatchObject({ kind: 'week_complete', next: { dayId: 'jue' } })
  })

  it('rest_day: hoy es descanso, con el día siguiente', () => {
    const s = getHomeState(input({ today: WEDNESDAY }))
    expect(s).toMatchObject({ kind: 'rest_day', comingSoon: false, next: { dayId: 'jue', date: '2026-10-01', index: 3, of: 4 } })
  })

  it('rest_day: un día «contenido próximamente» es descanso y salta al siguiente con contenido', () => {
    const empty = new Set<DayId>(['mar', 'jue'])
    const s = getHomeState(input({ dayHasContent: d => !empty.has(d.id) }))
    expect(s).toMatchObject({ kind: 'rest_day', comingSoon: true, next: { dayId: 'sab', date: '2026-10-03' } })
  })

  it('rest_day con un programa sin días', () => {
    expect(getHomeState(input({ weekDays: [] }))).toMatchObject({ kind: 'rest_day', comingSoon: false, next: null })
  })
})

describe('getHomeState · precedencia', () => {
  it('el orden documentado es el de la tabla', () => {
    expect(HOME_STATE_PRECEDENCE).toEqual([
      'in_progress', 'program_complete', 'no_program', 'first_workout', 'comeback',
      'done_today', 'week_complete', 'rest_day', 'training_day',
    ])
  })

  it('sesión en curso de ayer + descanso hoy → in_progress', () => {
    const s = getHomeState(input({ today: WEDNESDAY, activeActivity: { type: 'strength', startedDay: TUESDAY, workoutKey: 'p1_mar' } }))
    expect(s).toMatchObject({ kind: 'in_progress', fromAnotherDay: true })
  })

  it('in_progress gana a program_complete, first_workout y comeback', () => {
    const activeActivity = { type: 'cardio' as const, startedDay: TUESDAY }
    expect(getHomeState(input({ activeActivity, programProgress: { nextDay: null, isDeloadWeek: false, isCompleted: true, currentWeek: 16, currentPhase: 4 } })).kind).toBe('in_progress')
    expect(getHomeState(input({ activeActivity, account: { stage: 'first', sessions: 0, pending: false } })).kind).toBe('in_progress')
    expect(getHomeState(input({ activeActivity, lastActivityDay: '2026-08-01' })).kind).toBe('in_progress')
  })

  it('program_complete gana a comeback', () => {
    const s = getHomeState(input({ lastActivityDay: '2026-08-01', programProgress: { nextDay: null, isDeloadWeek: false, isCompleted: true, currentWeek: 16, currentPhase: 4 } }))
    expect(s.kind).toBe('program_complete')
  })

  it('isCompleted con nextDay no es program_complete', () => {
    const s = getHomeState(input({ programProgress: { nextDay: 'mar', isDeloadWeek: false, isCompleted: true, currentWeek: 16, currentPhase: 4 } }))
    expect(s.kind).toBe('training_day')
  })

  it('first_workout gana a comeback aunque haya un último día viejo', () => {
    const s = getHomeState(input({ account: { stage: 'first', sessions: 0, pending: false }, lastActivityDay: '2026-08-01' }))
    expect(s.kind).toBe('first_workout')
  })

  it('el flag «ya llegó a 3» del dispositivo evita first_workout con el contador a 0', () => {
    const s = getHomeState(input({ account: { stage: 'full', sessions: 0, pending: false } }))
    expect(s.kind).toBe('training_day')
  })

  it('veterano que cambia de programa: el contador del programa a 0 no lo manda a first_workout (#858)', () => {
    // Así lo monta el inicio móvil: `useHomeStage` cruza `getTotalSessions()`
    // (0 con el programa recién activado) con las filas de `sessions` de la cuenta.
    const account = resolveHomeStage({ programSessions: 0, lifetimeSessions: 2, reachedBefore: false })
    expect(account).toEqual({ stage: 'early', sessions: 2, pending: false })
    expect(getHomeState(input({ account })).kind).toBe('training_day')
    // Sin el contador de la cuenta todavía: esqueleto, nunca «Tu primer entreno».
    const pending = resolveHomeStage({ programSessions: 0, lifetimeSessions: undefined, reachedBefore: false })
    expect(getHomeState(input({ account: pending })).modifiers.loading).toBe(true)
  })

  it('comeback gana a done_today', () => {
    // Hecho hoy según el mapa, pero el último día conocido es de hace 8 (dato viejo): manda comeback.
    const s = getHomeState(input({ isWorkoutDone: done(`${TUESDAY}|p1_mar`), lastActivityDay: '2026-09-21' }))
    expect(s.kind).toBe('comeback')
  })

  it('done_today gana a week_complete', () => {
    const s = getHomeState(input({ isWorkoutDone: done(`${TUESDAY}|p1_mar`), week: { done: 4, goal: 4 }, lastActivityDay: TUESDAY }))
    expect(s.kind).toBe('done_today')
  })

  it('semana cumplida en día de entreno sigue siendo training_day', () => {
    expect(getHomeState(input({ week: { done: 4, goal: 4 } })).kind).toBe('training_day')
  })
})

describe('getHomeState · modificadores', () => {
  it('inactiveDays solo entre 3 y 6 días', () => {
    expect(getHomeState(input({ lastActivityDay: '2026-09-27' })).modifiers.inactiveDays).toBeNull() // 2
    expect(getHomeState(input({ lastActivityDay: '2026-09-26' })).modifiers.inactiveDays).toBe(3)
    expect(getHomeState(input({ lastActivityDay: '2026-09-23' })).modifiers.inactiveDays).toBe(6)
    expect(getHomeState(input({ lastActivityDay: '2026-09-22' })).modifiers.inactiveDays).toBeNull() // 7 → comeback
    expect(getHomeState(input({ lastActivityDay: null })).modifiers.inactiveDays).toBeNull()
  })

  it('inactiveDays se suma a cualquier kind', () => {
    const s = getHomeState(input({ today: WEDNESDAY, lastActivityDay: '2026-09-26' }))
    expect(s.kind).toBe('rest_day')
    expect(s.modifiers.inactiveDays).toBe(4)
  })

  it('firstWeek con la ventana de activación abierta', () => {
    const activation = deriveActivation({ sessionDays: ['2026-09-28'], signupDay: '2026-09-28', today: TUESDAY })
    const s = getHomeState(input({ activation, account: { stage: 'early', sessions: 1, pending: false } }))
    expect(s.kind).toBe('training_day')
    expect(s.modifiers.firstWeek).toEqual({ done: 1, target: 3, daysRemaining: 6, reached: false })
  })

  it('firstWeek desaparece con la ventana cerrada o sin activación', () => {
    const closed = deriveActivation({ sessionDays: ['2026-09-01'], signupDay: '2026-09-01', today: TUESDAY })
    expect(getHomeState(input({ activation: closed })).modifiers.firstWeek).toBeNull()
    expect(getHomeState(input()).modifiers.firstWeek).toBeNull()
  })

  it('offline, unsynced y loading', () => {
    const s = getHomeState(input({ offline: true, unsynced: true, loading: true }))
    expect(s.modifiers).toMatchObject({ offline: true, unsynced: true, loading: true })
    expect(getHomeState(input()).modifiers).toMatchObject({ offline: false, unsynced: false, loading: false })
  })

  it('loading mientras el contador de la cuenta está pendiente', () => {
    const s = getHomeState(input({ account: { stage: 'first', sessions: 0, pending: true } }))
    expect(s.modifiers.loading).toBe(true)
  })
})

describe('dayHasContent', () => {
  it('fuerza y yoga necesitan ejercicios; cardio su config; circuito ejercicios; descanso nunca', () => {
    expect(dayHasContent(day('lun', 'push'), { exercises: [1] })).toBe(true)
    expect(dayHasContent(day('lun', 'push'), { exercises: [] })).toBe(false)
    expect(dayHasContent(day('lun', 'yoga'), null)).toBe(false)
    expect(dayHasContent(day('lun', 'cardio', { cardioConfig: { activityType: 'running' } as WeekDay['cardioConfig'] }), null)).toBe(true)
    expect(dayHasContent(day('lun', 'cardio'), null)).toBe(false)
    expect(dayHasContent(day('lun', 'circuit', { circuitConfig: { exercises: [1] } as unknown as WeekDay['circuitConfig'] }), null)).toBe(true)
    expect(dayHasContent(day('lun', 'rest'), { exercises: [1] })).toBe(false)
  })
})

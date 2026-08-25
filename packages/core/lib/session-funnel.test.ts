import { beforeEach, describe, expect, it, vi } from 'vitest'

// `track` estable (no un `vi.fn()` nuevo por llamada a `getPlatform()`) para
// poder afirmar sobre lo que se emite, no solo sobre lo que se construye.
const mockTrack = vi.hoisted(() => vi.fn())

vi.mock('../platform', () => ({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  getPlatform: () => ({ analytics: { track: mockTrack, identify: vi.fn(), clear: vi.fn() } }),
  getClientInfo: () => ({ version: '1.0.0', build: 0, platform: 'android' as const }),
}))

import { setAnalyticsProgramId } from './analytics'
import { TRAINING_FUNNEL_EVENTS, plannedSetCount, sessionFunnelProperties, trackWorkoutDayViewed } from './session-funnel'

describe('plannedSetCount', () => {
  it('suma las series numéricas', () => {
    expect(plannedSetCount([{ sets: 3 }, { sets: 4 }])).toBe(7)
  })

  // El catálogo admite «múltiples» / «intentos». Antes del #636 nadie sumaba
  // esto, pero un NaN aquí dejaría `completion_pct` en NaN para TODO el entreno.
  it('ignora las series que no son un número en vez de propagar NaN', () => {
    expect(plannedSetCount([{ sets: 3 }, { sets: 'múltiples' }, { sets: 2 }])).toBe(5)
    expect(plannedSetCount([{ sets: 'intentos' }])).toBe(0)
  })

  it('ignora los ceros y negativos de datos corruptos', () => {
    expect(plannedSetCount([{ sets: 0 }, { sets: -2 }, { sets: 3 }])).toBe(3)
  })
})

describe('sessionFunnelProperties', () => {
  beforeEach(() => { setAnalyticsProgramId(null) })

  it('deriva fase y día de la clave de sesión y sella versión y plataforma', () => {
    setAnalyticsProgramId('prog123')
    expect(sessionFunnelProperties({ workoutKey: 'p2_mie', source: 'program' })).toEqual({
      event_version: 1,
      platform: 'mobile',
      surface: 'session',
      workout_key: 'p2_mie',
      source: 'program',
      is_free_session: false,
      day_id: 'mie',
      phase: 2,
      program_id: 'prog123',
    })
  })

  // #376: una sesión libre tiene `phase: 0` (NO_PHASE), que no es una fase real.
  // Mandarlo como `phase: 0` metería una fase fantasma en los informes.
  it('una sesión libre no lleva fase ni programa', () => {
    setAnalyticsProgramId('prog123')
    const props = sessionFunnelProperties({ workoutKey: 'free_1783000000', source: 'free' })
    expect(props).not.toHaveProperty('phase')
    expect(props).not.toHaveProperty('program_id')
    expect(props).toMatchObject({ is_free_session: true, day_id: 'free' })
  })

  it('un programId explícito gana al del registro', () => {
    setAnalyticsProgramId('del-registro')
    expect(sessionFunnelProperties({ workoutKey: 'p1_lun', source: 'program', programId: 'explicito' }))
      .toMatchObject({ program_id: 'explicito' })
    expect(sessionFunnelProperties({ workoutKey: 'p1_lun', source: 'program', programId: null }))
      .not.toHaveProperty('program_id')
  })

  it('calcula la duración a partir del arranque y el cierre', () => {
    expect(sessionFunnelProperties({
      workoutKey: 'p1_lun', source: 'program',
      startedAt: 1_000_000, endedAt: 1_090_500,
    })).toMatchObject({ duration_seconds: 91 })
  })

  // El reloj del dispositivo puede retroceder (cambio de hora, NTP): una
  // duración negativa colaría un valor imposible en el embudo.
  it('nunca manda una duración negativa', () => {
    expect(sessionFunnelProperties({
      workoutKey: 'p1_lun', source: 'program', startedAt: 2_000_000, endedAt: 1_000_000,
    })).toMatchObject({ duration_seconds: 0 })
  })

  it('el porcentaje se topa en 100 aunque se registren series de más', () => {
    expect(sessionFunnelProperties({
      workoutKey: 'p1_lun', source: 'program', plannedSets: 10, setsLogged: 5,
    })).toMatchObject({ completion_pct: 50 })
    expect(sessionFunnelProperties({
      workoutKey: 'p1_lun', source: 'program', plannedSets: 10, setsLogged: 14,
    })).toMatchObject({ completion_pct: 100 })
  })

  it('sin series planificadas no inventa un porcentaje', () => {
    const props = sessionFunnelProperties({
      workoutKey: 'p1_lun', source: 'program', plannedSets: 0, setsLogged: 3,
    })
    expect(props).not.toHaveProperty('completion_pct')
    expect(props).toMatchObject({ sets_logged: 3 })
  })

  // §6 del #636: ninguna propiedad del embudo puede llevar texto libre.
  it('no expone nada identificable ni de forma libre', () => {
    const props = sessionFunnelProperties({
      workoutKey: 'p3_jue', source: 'program', startedAt: 1, endedAt: 2,
      exerciseCount: 6, plannedSets: 18, setsLogged: 9, reason: 'expired',
    })
    for (const forbidden of ['note', 'email', 'name', 'lat', 'lng', 'notes']) {
      expect(props).not.toHaveProperty(forbidden)
    }
    expect(Object.values(props).every(v => typeof v !== 'object' || v === null)).toBe(true)
  })
})

describe('trackWorkoutDayViewed', () => {
  beforeEach(() => {
    mockTrack.mockClear()
    setAnalyticsProgramId(null)
  })

  // Es el DENOMINADOR del embudo: sin él, `session_started` no tiene contra qué
  // medirse y no se sabe cuánta gente abre el día y se va (#636 §3).
  it('emite el bloque del embudo con el programa del registro', () => {
    setAnalyticsProgramId('prog123')

    trackWorkoutDayViewed({
      workoutKey: 'p2_mie',
      source: 'program',
      exerciseCount: 4,
      plannedSets: 12,
      alreadyDone: false,
    })

    expect(mockTrack).toHaveBeenCalledTimes(1)
    expect(mockTrack).toHaveBeenCalledWith(TRAINING_FUNNEL_EVENTS.workoutDayViewed, expect.objectContaining({
      event_version: 1,
      platform: 'mobile',
      surface: 'session',
      workout_key: 'p2_mie',
      source: 'program',
      phase: 2,
      day_id: 'mie',
      program_id: 'prog123',
      exercise_count: 4,
      already_done: false,
    }))
  })

  // Un día ya hecho que se vuelve a mirar no es el mismo denominador que uno
  // pendiente: sin distinguirlos, el embudo cuenta como «no arrancó» a quien ya
  // había entrenado ese día.
  it('marca el día ya hecho', () => {
    trackWorkoutDayViewed({ workoutKey: 'p1_lun', source: 'program', alreadyDone: true })

    expect(mockTrack.mock.calls[0][1]).toMatchObject({ already_done: true })
  })

  it('sin el dato, `already_done` no viaja como falso', () => {
    trackWorkoutDayViewed({ workoutKey: 'p1_lun', source: 'program' })

    expect(mockTrack.mock.calls[0][1]).not.toHaveProperty('already_done')
  })
})

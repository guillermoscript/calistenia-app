import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform', () => ({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  getPlatform: () => ({ analytics: { track: vi.fn(), identify: vi.fn(), clear: vi.fn() } }),
  getClientInfo: () => ({ version: '1.0.0', build: 0, platform: 'android' as const }),
}))

import { setAnalyticsProgramId } from './analytics'
import { plannedSetCount, sessionFunnelProperties } from './session-funnel'

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

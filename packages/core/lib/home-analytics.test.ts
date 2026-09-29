import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const track = vi.fn()

vi.mock('../platform', () => ({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  getPlatform: () => ({ analytics: { track, identify: vi.fn(), clear: vi.fn() } }),
  getClientInfo: () => ({ version: '1.0.0', build: 0, platform: 'android' as const }),
}))

import { CANONICAL_ANALYTICS_EVENTS } from './analytics'
import {
  HOME_ANALYTICS_STATES,
  HOME_PARA_TI_KINDS,
  __resetHomeAnalyticsForTests,
  serializeHomeModifiers,
  trackHomeChangeDay,
  trackHomeParaTiTap,
  trackHomePrimaryCta,
  trackHomeSecondaryTap,
  trackHomeViewed,
} from './home-analytics'

beforeEach(() => {
  track.mockClear()
  __resetHomeAnalyticsForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('contrato de eventos del inicio (#854)', () => {
  it('los cinco eventos son canónicos y con los nombres de la issue', () => {
    const events = Object.values(CANONICAL_ANALYTICS_EVENTS)
    for (const name of ['home_viewed', 'home_primary_cta', 'home_change_day', 'home_para_ti_tap', 'home_secondary_tap']) {
      expect(events).toContain(name)
    }
  })

  // Los mismos nueve `kind` que la tabla de `getHomeState` (#853), en su orden
  // de precedencia. Si #853 añade uno, este test obliga a tocar el contrato.
  it('los estados siguen la precedencia de getHomeState', () => {
    expect(HOME_ANALYTICS_STATES).toEqual([
      'in_progress', 'program_complete', 'no_program', 'first_workout', 'comeback',
      'done_today', 'week_complete', 'rest_day', 'training_day',
    ])
  })

  it('«Para ti» tiene las siete filas de la issue, en su orden de prioridad', () => {
    expect(HOME_PARA_TI_KINDS).toEqual([
      'battle', 'challenge', 'friends', 'nutrition', 'photos', 'featured_challenge', 'community_program',
    ])
  })
})

describe('serializeHomeModifiers', () => {
  it('ordena, quita duplicados y separa por comas', () => {
    expect(serializeHomeModifiers(['first_week', 'deload', 'first_week'])).toBe('deload,first_week')
  })

  it('sin modificadores manda `none`, nunca un string vacío', () => {
    expect(serializeHomeModifiers([])).toBe('none')
  })
})

describe('helpers track*', () => {
  it('home_viewed lleva estado, modificadores serializados, surface y plataforma', () => {
    trackHomeViewed({ state: 'training_day', modifiers: ['deload'] })

    expect(track).toHaveBeenCalledWith('home_viewed', {
      event_version: 1,
      platform: 'mobile',
      surface: 'home',
      state: 'training_day',
      modifiers: 'deload',
    })
  })

  it('los toques llevan los ms desde el último home_viewed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'))
    trackHomeViewed({ state: 'first_workout' })
    vi.setSystemTime(new Date('2026-09-29T10:00:02.500Z'))

    trackHomePrimaryCta({ state: 'first_workout' })

    expect(track).toHaveBeenLastCalledWith('home_primary_cta', expect.objectContaining({
      state: 'first_workout',
      ms_since_view: 2500,
    }))
  })

  it('sin home_viewed previo no inventa ms_since_view', () => {
    trackHomeChangeDay()

    const [, props] = track.mock.calls[0]
    expect(props).not.toHaveProperty('ms_since_view')
    expect(props).toMatchObject({ surface: 'home' })
  })

  it('home_para_ti_tap y home_secondary_tap llevan kind / target', () => {
    trackHomeParaTiTap({ kind: 'friends' })
    trackHomeSecondaryTap({ target: 'share', state: 'done_today' })

    expect(track).toHaveBeenCalledWith('home_para_ti_tap', expect.objectContaining({ kind: 'friends' }))
    expect(track).toHaveBeenCalledWith('home_secondary_tap', expect.objectContaining({
      target: 'share',
      state: 'done_today',
    }))
  })
})

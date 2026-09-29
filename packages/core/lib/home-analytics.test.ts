import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const track = vi.fn()
const client = vi.hoisted(() => ({ platform: 'android' as 'android' | 'web' }))

vi.mock('../platform', () => ({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  getPlatform: () => ({ analytics: { track, identify: vi.fn(), clear: vi.fn() } }),
  getClientInfo: () => ({ version: '1.0.0', build: 0, platform: client.platform }),
}))

import { CANONICAL_ANALYTICS_EVENTS } from './analytics'
import {
  HOME_ANALYTICS_STATES,
  HOME_PARA_TI_KINDS,
  HOME_VIEW_MAX_AGE_MS,
  PARA_TI_KIND_ALIASES,
  homeAnalyticsModifiers,
  resetHomeView,
  serializeHomeModifiers,
  toHomeParaTiKind,
  trackHomeChangeDay,
  trackHomeParaTiTap,
  trackHomePrimaryCta,
  trackHomeSecondaryTap,
  trackHomeViewed,
} from './home-analytics'

beforeEach(() => {
  track.mockClear()
  client.platform = 'android'
  resetHomeView()
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

  // Fija la lista y el orden de la tabla de `getHomeState` (#853) tal como los
  // recoge la issue. NO se compara con el `HomeState` real (vive en #864, aún
  // sin mergear): esa comprobación llegará cuando #864 esté en main.
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

describe('adaptadores desde HomeState / getParaTi (#853)', () => {
  const base = { inactiveDays: null, firstWeek: null, offline: false, unsynced: false }

  it('sin nada que añadir no hay modificadores', () => {
    expect(homeAnalyticsModifiers({ kind: 'rest_day', modifiers: base })).toEqual([])
  })

  it('recoge descarga, primera semana, inactividad y conexión', () => {
    expect(homeAnalyticsModifiers({
      kind: 'training_day',
      deload: true,
      day: { dayType: 'strength' },
      modifiers: { inactiveDays: 4, firstWeek: { done: 1 }, offline: true, unsynced: true },
    }).sort()).toEqual(['deload', 'first_week', 'inactive', 'offline', 'unsynced'])
  })

  it('cardio solo en el día de cardio y en su variante de «hecho»', () => {
    expect(homeAnalyticsModifiers({ kind: 'training_day', deload: false, day: { dayType: 'cardio' }, modifiers: base })).toEqual(['cardio'])
    expect(homeAnalyticsModifiers({ kind: 'done_today', variant: 'cardio', day: { dayType: 'cardio' }, modifiers: base })).toEqual(['cardio'])
    // La vuelta tras un parón no es un tablero de cardio aunque el día lo sea.
    expect(homeAnalyticsModifiers({ kind: 'comeback', day: { dayType: 'cardio' }, modifiers: base })).toEqual([])
  })

  it('traduce los kind de getParaTi a los nombres del informe', () => {
    // Todos los alias, leídos del propio mapa: uno nuevo queda cubierto solo.
    const aliases = PARA_TI_KIND_ALIASES
    expect(Object.keys(aliases).length).toBeGreaterThanOrEqual(4)
    for (const [source, expected] of Object.entries(aliases)) {
      expect(toHomeParaTiKind(source as keyof typeof aliases)).toBe(expected)
      // Y lo que sale de la traducción es siempre un nombre del informe.
      expect(HOME_PARA_TI_KINDS).toContain(expected)
    }
  })

  it('los nombres que ya son del informe pasan tal cual', () => {
    for (const kind of HOME_PARA_TI_KINDS) expect(toHomeParaTiKind(kind)).toBe(kind)
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

  it('home_viewed y los toques llevan platform=web en la web', () => {
    client.platform = 'web'
    trackHomeViewed({ state: 'rest_day' })
    trackHomeParaTiTap({ kind: 'phase_photos' })

    expect(track).toHaveBeenNthCalledWith(1, 'home_viewed', expect.objectContaining({
      platform: 'web',
      surface: 'home',
      state: 'rest_day',
      modifiers: 'none',
    }))
    expect(track).toHaveBeenNthCalledWith(2, 'home_para_ti_tap', expect.objectContaining({
      platform: 'web',
      kind: 'photos',
    }))
  })

  it('pasado el tope, el toque no lleva ms_since_view', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'))
    trackHomeViewed({ state: 'training_day' })

    // Justo en el tope todavía cuenta.
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z').getTime() + HOME_VIEW_MAX_AGE_MS)
    trackHomePrimaryCta({ state: 'training_day' })
    expect(track).toHaveBeenLastCalledWith('home_primary_cta', expect.objectContaining({
      ms_since_view: HOME_VIEW_MAX_AGE_MS,
    }))

    // Un ms más y es otra sesión de uso: se omite en los tres tipos de toque.
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z').getTime() + HOME_VIEW_MAX_AGE_MS + 1)
    trackHomePrimaryCta({ state: 'training_day' })
    trackHomeChangeDay()
    trackHomeParaTiTap({ kind: 'battle' })
    trackHomeSecondaryTap({ target: 'share', state: 'done_today' })
    for (const call of track.mock.calls.slice(-4)) {
      expect(call[1]).not.toHaveProperty('ms_since_view')
      expect(call[1]).toMatchObject({ surface: 'home' })
    }
  })

  it('resetHomeView olvida la visita hasta el siguiente home_viewed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'))
    trackHomeViewed({ state: 'training_day' })
    resetHomeView()

    vi.setSystemTime(new Date('2026-09-29T10:00:05Z'))
    trackHomeChangeDay()
    expect(track.mock.calls.at(-1)?.[1]).not.toHaveProperty('ms_since_view')

    // Al volver a enfocar, la visita nueva vuelve a medir desde cero.
    trackHomeViewed({ state: 'training_day' })
    vi.setSystemTime(new Date('2026-09-29T10:00:06Z'))
    trackHomeChangeDay()
    expect(track).toHaveBeenLastCalledWith('home_change_day', expect.objectContaining({ ms_since_view: 1000 }))
  })

  it('home_para_ti_tap y home_secondary_tap llevan kind / target', () => {
    trackHomeParaTiTap({ kind: 'friends_today' })
    trackHomeSecondaryTap({ target: 'share', state: 'done_today' })

    expect(track).toHaveBeenCalledWith('home_para_ti_tap', expect.objectContaining({ kind: 'friends' }))
    expect(track).toHaveBeenCalledWith('home_secondary_tap', expect.objectContaining({
      target: 'share',
      state: 'done_today',
    }))
  })
})

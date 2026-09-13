import { beforeEach, describe, expect, it, vi } from 'vitest'

const track = vi.fn()
const store = new Map<string, string>()
vi.mock('../platform', () => ({
  getPlatform: () => ({ analytics: { track, identify: vi.fn(), clear: vi.fn() } }),
  getClientInfo: () => ({ platform: 'web' }),
  storage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  },
}))

import { DISCOVERY_SOURCES } from './discovery-source'
import { markOnboardingDone } from './onboarding-state'
import { CARDIO_ACTIVE_KEY, STRENGTH_ACTIVE_KEY } from './storage-keys'
import {
  DISCOVERY_SURVEY_SOURCES,
  USER_GOALS,
  canShowDiscoverySurvey,
  getDiscoverySurveyStatus,
  getRememberedDiscoverySource,
  hasActiveWorkout,
  isUserGoalId,
  markDiscoverySurvey,
  rememberDiscoverySource,
  trackDiscoverySurveyCompleted,
  trackDiscoverySurveyDismissed,
  trackDiscoverySurveyViewed,
} from './discovery-survey'

const USER = 'u1'

beforeEach(() => {
  store.clear()
  track.mockClear()
})

describe('catálogos', () => {
  it('la pregunta de la fuente reutiliza el catálogo del onboarding (#586)', () => {
    expect(DISCOVERY_SURVEY_SOURCES).toBe(DISCOVERY_SOURCES)
  })

  it('los objetivos tienen ids únicos, clave i18n propia y «otro» al final', () => {
    const ids = USER_GOALS.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const o of USER_GOALS) expect(o.labelKey).toMatch(/^discoverySurvey\.goal[A-Z]/)
    expect(USER_GOALS.at(-1)?.id).toBe('other')
  })

  it('isUserGoalId acepta solo ids, nunca etiquetas', () => {
    expect(isUserGoalId('routine')).toBe(true)
    expect(isUserGoalId('Una rutina de calistenia')).toBe(false)
    expect(isUserGoalId(null)).toBe(false)
  })
})

describe('estado en storage', () => {
  it('empieza pendiente y recuerda contestada o descartada', () => {
    expect(getDiscoverySurveyStatus(USER)).toBe('pending')
    markDiscoverySurvey(USER, 'dismissed')
    expect(getDiscoverySurveyStatus(USER)).toBe('dismissed')
    markDiscoverySurvey(USER, 'answered')
    expect(getDiscoverySurveyStatus(USER)).toBe('answered')
    expect(getDiscoverySurveyStatus('otro')).toBe('pending')
  })

  it('un valor desconocido en storage cuenta como pendiente', () => {
    store.set(`calistenia_discovery_survey_v1_${USER}`, 'true')
    expect(getDiscoverySurveyStatus(USER)).toBe('pending')
  })

  it('recuerda la fuente del onboarding solo si es un id del catálogo', () => {
    expect(getRememberedDiscoverySource(USER)).toBeNull()
    rememberDiscoverySource(USER, 'ai_chat')
    expect(getRememberedDiscoverySource(USER)).toBe('ai_chat')
    store.set(`calistenia_discovery_source_${USER}`, 'ChatGPT o IA')
    expect(getRememberedDiscoverySource(USER)).toBeNull()
  })
})

describe('canShowDiscoverySurvey', () => {
  it('no sale hasta terminar el onboarding', () => {
    expect(canShowDiscoverySurvey(USER)).toBe(false)
    markOnboardingDone(USER)
    expect(canShowDiscoverySurvey(USER)).toBe(true)
  })

  it('no sale con un entreno en curso, y sí cuando termina', () => {
    markOnboardingDone(USER)
    store.set(STRENGTH_ACTIVE_KEY, JSON.stringify({ programId: 'p1', startedAt: Date.now() }))
    expect(hasActiveWorkout()).toBe(true)
    expect(canShowDiscoverySurvey(USER)).toBe(false)
    store.delete(STRENGTH_ACTIVE_KEY)
    expect(canShowDiscoverySurvey(USER)).toBe(true)
  })

  it('una sesión de hace más de 24 h o corrupta no la bloquea', () => {
    markOnboardingDone(USER)
    store.set(STRENGTH_ACTIVE_KEY, JSON.stringify({ startedAt: Date.now() - 25 * 60 * 60 * 1000 }))
    store.set(CARDIO_ACTIVE_KEY, '{roto')
    expect(hasActiveWorkout()).toBe(false)
    expect(canShowDiscoverySurvey(USER)).toBe(true)
  })

  it('no vuelve a salir una vez contestada o descartada', () => {
    markOnboardingDone(USER)
    markDiscoverySurvey(USER, 'dismissed')
    expect(canShowDiscoverySurvey(USER)).toBe(false)
  })
})

describe('analítica', () => {
  const names = () => track.mock.calls.map(([name]) => name)

  it('viewed lleva superficie, origen y paso', () => {
    trackDiscoverySurveyViewed('survey_web', 'goal')
    expect(track).toHaveBeenCalledTimes(1)
    expect(track.mock.calls[0]).toEqual(['discovery_survey_viewed', expect.objectContaining({
      event_version: 1, surface: 'discovery_survey', source: 'survey_web', step: 'goal',
    })])
  })

  it('completed manda ids, nunca etiquetas, y la fuente elegida en la encuesta pasa también por discovery_source_answered', () => {
    trackDiscoverySurveyCompleted('survey_mobile', { discoverySource: 'social', rememberedSource: null, goal: 'routine' })
    expect(names()).toEqual(['discovery_source_answered', 'discovery_survey_completed'])
    expect(track.mock.calls[0][1]).toMatchObject({ surface: 'discovery_survey', source: 'survey_mobile', discovery_source: 'social' })
    expect(track.mock.calls[1][1]).toMatchObject({
      surface: 'discovery_survey', source: 'survey_mobile',
      discovery_source: 'social', discovery_source_origin: 'survey', user_goal: 'routine',
    })
  })

  it('completed reutiliza la fuente del onboarding sin volver a emitir discovery_source_answered', () => {
    trackDiscoverySurveyCompleted('survey_web', { discoverySource: null, rememberedSource: 'friend', goal: 'learn_skill' })
    expect(names()).toEqual(['discovery_survey_completed'])
    expect(track.mock.calls[0][1]).toMatchObject({ discovery_source: 'friend', discovery_source_origin: 'onboarding', user_goal: 'learn_skill' })
  })

  it('completed sin fuente conocida omite las propiedades en vez de mandar null', () => {
    trackDiscoverySurveyCompleted('survey_web', { discoverySource: null, rememberedSource: null, goal: 'other' })
    expect(track.mock.calls[0][1]).not.toHaveProperty('discovery_source')
    expect(track.mock.calls[0][1]).not.toHaveProperty('discovery_source_origin')
  })

  it('dismissed en el paso del objetivo conserva la fuente ya contestada', () => {
    trackDiscoverySurveyDismissed('survey_web', 'goal', { discoverySource: 'search' })
    expect(names()).toEqual(['discovery_source_answered', 'discovery_survey_dismissed'])
    expect(track.mock.calls[1][1]).toMatchObject({ surface: 'discovery_survey', step: 'goal' })
  })

  it('dismissed en el primer paso no inventa ninguna fuente', () => {
    trackDiscoverySurveyDismissed('survey_mobile', 'source', { discoverySource: null })
    expect(names()).toEqual(['discovery_survey_dismissed'])
  })
})

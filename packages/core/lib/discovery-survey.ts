/**
 * Encuesta de descubrimiento (PR #771): «¿cómo conociste la app?» y «¿qué
 * buscabas cuando llegaste?». Un modal opcional, una sola vez por usuario, que
 * sale poco después de entrar en la app.
 *
 * Es la hermana del chip de bienvenida de #586 (`discovery-source.ts`), no un
 * duplicado: comparte el catálogo de fuentes y el evento
 * `discovery_source_answered`, y quien ya contestó la fuente en el onboarding
 * solo ve la pregunta del objetivo. Igual que allí, a analítica solo viajan
 * ids estables, nunca la etiqueta traducida ni texto libre.
 *
 * Cuándo NO sale, aunque esté pendiente:
 *   - antes de terminar el onboarding (allí ya se pregunta la fuente);
 *   - con un entreno en curso (fuerza, cardio o circuito): un modal encima de
 *     una serie es lo último que quiere ver nadie.
 * El componente reintenta más tarde en vez de darla por perdida.
 */

import { storage } from '../platform'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from './analytics'
import {
  DISCOVERY_SOURCES,
  isDiscoverySourceId,
  trackDiscoverySourceAnswered,
  type DiscoverySourceId,
  type DiscoverySourceOption,
} from './discovery-source'
import { isOnboardingDone } from './onboarding-state'
import { CARDIO_ACTIVE_KEY, CIRCUIT_ACTIVE_KEY, STRENGTH_ACTIVE_KEY } from './storage-keys'

export type UserGoalId = 'routine' | 'learn_skill' | 'track_progress' | 'train_at_home' | 'other'

export interface UserGoalOption {
  id: UserGoalId
  /** Clave i18n de la etiqueta (`discoverySurvey.goalRoutine`, …). */
  labelKey: string
}

/** Segunda pregunta. `other` cierra la lista igual que en `DISCOVERY_SOURCES`. */
export const USER_GOALS: readonly UserGoalOption[] = [
  { id: 'routine', labelKey: 'discoverySurvey.goalRoutine' },
  { id: 'learn_skill', labelKey: 'discoverySurvey.goalLearnSkill' },
  { id: 'track_progress', labelKey: 'discoverySurvey.goalTrackProgress' },
  { id: 'train_at_home', labelKey: 'discoverySurvey.goalTrainAtHome' },
  { id: 'other', labelKey: 'discoverySurvey.goalOther' },
]

/** Fuentes de la primera pregunta: el mismo catálogo que el chip del onboarding. */
export const DISCOVERY_SURVEY_SOURCES: readonly DiscoverySourceOption[] = DISCOVERY_SOURCES

export function isUserGoalId(value: unknown): value is UserGoalId {
  return typeof value === 'string' && USER_GOALS.some((o) => o.id === value)
}

/** Espera tras entrar en la app antes del primer intento de mostrarla. */
export const DISCOVERY_SURVEY_DELAY_MS = 4_000
/** Espera entre reintentos cuando algo la bloquea (onboarding, entreno en curso, tour). */
export const DISCOVERY_SURVEY_RETRY_MS = 15_000

export type DiscoverySurveyStatus = 'pending' | 'answered' | 'dismissed'

const surveyKey = (userId: string) => `calistenia_discovery_survey_v1_${userId}`
const sourceKey = (userId: string) => `calistenia_discovery_source_${userId}`

export function getDiscoverySurveyStatus(userId: string): DiscoverySurveyStatus {
  const value = storage.getItem(surveyKey(userId))
  return value === 'answered' || value === 'dismissed' ? value : 'pending'
}

export function markDiscoverySurvey(userId: string, status: Exclude<DiscoverySurveyStatus, 'pending'>): void {
  storage.setItem(surveyKey(userId), status)
}

/**
 * Guarda la fuente elegida en el chip del onboarding para que la encuesta no
 * la vuelva a preguntar. Se llama desde el mismo sitio que emite
 * `discovery_source_answered`.
 */
export function rememberDiscoverySource(userId: string, source: DiscoverySourceId): void {
  storage.setItem(sourceKey(userId), source)
}

export function getRememberedDiscoverySource(userId: string): DiscoverySourceId | null {
  const value = storage.getItem(sourceKey(userId))
  return isDiscoverySourceId(value) ? value : null
}

/**
 * Mismo umbral que los hooks de sesión al restaurar: una sesión más vieja la
 * borran al montar, así que tampoco puede frenar la encuesta para siempre.
 * Web tiene su propia copia en `apps/web/src/lib/active-workout.ts` porque se
 * consulta desde `main.tsx` antes de `initCore`.
 */
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000

function isLiveSession(key: string): boolean {
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    // Sin poder mirar se asume que puede haber un entreno: se reintenta luego.
    return true
  }
  if (!raw) return false
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return false
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const record = data as Record<string, unknown>
  const startedAt = [record.startedAt, record.startTime].find(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  if (startedAt === undefined) return true
  return Date.now() - startedAt <= MAX_SESSION_AGE_MS
}

/** Sesión de fuerza, cardio o circuito viva (menos de 24 h) en este dispositivo. */
export function hasActiveWorkout(): boolean {
  return [STRENGTH_ACTIVE_KEY, CARDIO_ACTIVE_KEY, CIRCUIT_ACTIVE_KEY].some(isLiveSession)
}

/** Pendiente Y en un momento en el que no molesta. Si es `false`, reintentar más tarde. */
export function canShowDiscoverySurvey(userId: string): boolean {
  return getDiscoverySurveyStatus(userId) === 'pending' && isOnboardingDone(userId) && !hasActiveWorkout()
}

export type DiscoverySurveyOrigin = 'survey_web' | 'survey_mobile'
export type DiscoverySurveyStep = 'source' | 'goal'

const SURFACE = 'discovery_survey'

export function trackDiscoverySurveyViewed(origin: DiscoverySurveyOrigin, step: DiscoverySurveyStep): void {
  trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.discoverySurveyViewed, {
    surface: SURFACE,
    source: origin,
    step,
  })
}

export interface DiscoverySurveyAnswers {
  /** Elegida en la encuesta. `null` si el paso no llegó a contestarse o no se mostró. */
  discoverySource: DiscoverySourceId | null
  /** Fuente ya contestada en el onboarding, si la hubo: la encuesta la reutiliza sin preguntar. */
  rememberedSource: DiscoverySourceId | null
  goal: UserGoalId | null
}

/**
 * Cierre sin enviar. Si el paso de la fuente ya se había contestado, esa
 * respuesta vale igual: se emite `discovery_source_answered` como haría el
 * onboarding al salir de la bienvenida.
 */
export function trackDiscoverySurveyDismissed(
  origin: DiscoverySurveyOrigin,
  step: DiscoverySurveyStep,
  answers: Pick<DiscoverySurveyAnswers, 'discoverySource'>,
): void {
  if (answers.discoverySource) trackDiscoverySourceAnswered(answers.discoverySource, origin)
  trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.discoverySurveyDismissed, {
    surface: SURFACE,
    source: origin,
    step,
  })
}

export function trackDiscoverySurveyCompleted(origin: DiscoverySurveyOrigin, answers: DiscoverySurveyAnswers): void {
  if (answers.discoverySource) trackDiscoverySourceAnswered(answers.discoverySource, origin)
  const source = answers.discoverySource ?? answers.rememberedSource
  trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.discoverySurveyCompleted, {
    surface: SURFACE,
    source: origin,
    discovery_source: source ?? undefined,
    discovery_source_origin: source ? (answers.discoverySource ? 'survey' : 'onboarding') : undefined,
    user_goal: answers.goal ?? undefined,
  })
}

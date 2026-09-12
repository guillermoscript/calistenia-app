/**
 * «¿Cómo conociste la app?» (#586).
 *
 * Una sola pregunta, opcional, en la pantalla de bienvenida del onboarding.
 * OpenPanel ya dice el referrer de la web y el install referrer de Play, pero
 * ninguno de los dos distingue «me lo dijo ChatGPT» de «lo vi en TikTok» ni
 * «me lo pasó un amigo», y ahí es donde se decide dónde buscar usuarios.
 *
 * Solo viajan ids estables (`ai_chat`, `friend`…), nunca texto libre: las
 * etiquetas son claves i18n y se pintan en cada app. Lógica pura compartida
 * por web y móvil; el chip vive en cada `StepWelcome`.
 */

import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from './analytics'

export type DiscoverySourceId =
  | 'app_store'
  | 'search'
  | 'ai_chat'
  | 'social'
  | 'friend'
  | 'github'
  | 'other'

export interface DiscoverySourceOption {
  id: DiscoverySourceId
  /** Clave i18n de la etiqueta (`onboarding.discoveryAppStore`, …). */
  labelKey: string
}

/**
 * Orden de aparición: primero lo más probable para la audiencia actual (Play
 * orgánico y búsqueda), `github` al final porque solo aplica a la web.
 */
export const DISCOVERY_SOURCES: readonly DiscoverySourceOption[] = [
  { id: 'app_store', labelKey: 'onboarding.discoveryAppStore' },
  { id: 'search', labelKey: 'onboarding.discoverySearch' },
  { id: 'ai_chat', labelKey: 'onboarding.discoveryAiChat' },
  { id: 'social', labelKey: 'onboarding.discoverySocial' },
  { id: 'friend', labelKey: 'onboarding.discoveryFriend' },
  { id: 'github', labelKey: 'onboarding.discoveryGithub' },
  { id: 'other', labelKey: 'onboarding.discoveryOther' },
]

/** Valor de `discovery_source` en `onboarding_completed` cuando no se contestó. */
export const DISCOVERY_SOURCE_NOT_ANSWERED = 'not_answered'

export function isDiscoverySourceId(value: unknown): value is DiscoverySourceId {
  return typeof value === 'string' && DISCOVERY_SOURCES.some((o) => o.id === value)
}

export type DiscoverySourceOrigin = 'onboarding_web' | 'onboarding_mobile'

/**
 * Emite `discovery_source_answered`. Se llama al SALIR de la bienvenida (con
 * «Empezar» o con «saltar»), no al tocar el chip: así cambiar de opinión antes
 * de seguir no cuenta dos veces. Quien elige y abandona ahí mismo se pierde,
 * pero ese caso es raro y el alternativo infla el recuento.
 */
export function trackDiscoverySourceAnswered(
  source: DiscoverySourceId,
  origin: DiscoverySourceOrigin,
): void {
  trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.discoverySourceAnswered, {
    surface: 'onboarding',
    source: origin,
    discovery_source: source,
  })
}

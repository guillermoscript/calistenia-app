/**
 * Reto destacado en Home (#351) — selección y estado de la card, compartidos
 * por web y móvil para que ambas apps muestren exactamente el mismo reto con
 * el mismo CTA.
 *
 * La selección es pura y testeable: recibe los retos con `is_featured`, los
 * ids en los que el usuario ya participa y la fecha de hoy. Reglas:
 *   1. Preferir retos vivos hoy (`isChallengeLiveOn`); gana el que antes
 *      termina (más urgencia, menos riesgo de enseñar algo lejano).
 *   2. Si no hay ninguno vivo, enseñar resultados de un destacado recién
 *      terminado (≤ RESULTS_WINDOW_DAYS) solo si el usuario participó.
 *   3. Si no, nada: la card no se renderiza y Home no se altera.
 */
import type { Challenge } from '../types'
import { isChallengeLiveOn } from './challenge-scoring'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from './analytics'

/** Días tras el fin de un reto en los que la card sigue enseñando resultados. */
export const RESULTS_WINDOW_DAYS = 7

/** Superficie/entrada canónicas de la card (contrato del issue #351). */
export const FEATURED_CHALLENGE_SURFACE = 'home'
export const FEATURED_CHALLENGE_SOURCE = 'home_featured_challenge'

export type FeaturedChallengeState = 'join' | 'continue' | 'results'

export interface FeaturedChallengeCard {
  challenge: Challenge
  state: FeaturedChallengeState
  isParticipant: boolean
  /** Días (enteros, ≥ 0) hasta `ends_at`; 0 = termina hoy. Solo con estado vivo. */
  daysRemaining: number
  /** % de tiempo transcurrido del reto (0-100). Es progreso temporal, no de puntuación. */
  progressPct: number
}

/** Días entre dos fechas `YYYY-MM-DD` (b - a), sin componente horario. */
function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.slice(0, 10).split('-').map(Number)
  const [by, bm, bd] = b.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

/** El reto terminó (por estado o por fecha) antes o durante `today`. */
function hasEnded(challenge: Challenge, today: string): boolean {
  return challenge.status === 'ended' || (!!challenge.ends_at && challenge.ends_at.slice(0, 10) < today)
}

export function pickFeaturedChallenge(
  candidates: Challenge[],
  joinedIds: Set<string>,
  today: string,
): FeaturedChallengeCard | null {
  // 1. Retos destacados vivos hoy, el que antes termine primero.
  const live = candidates
    .filter(c => isChallengeLiveOn(c, today))
    .sort((a, b) => a.ends_at.localeCompare(b.ends_at))

  if (live.length > 0) {
    const challenge = live[0]
    const isParticipant = joinedIds.has(challenge.id)
    const total = Math.max(1, diffDays(challenge.starts_at, challenge.ends_at))
    const elapsed = Math.max(0, diffDays(challenge.starts_at, today))
    return {
      challenge,
      state: isParticipant ? 'continue' : 'join',
      isParticipant,
      daysRemaining: Math.max(0, diffDays(today, challenge.ends_at)),
      progressPct: clampPct((elapsed / total) * 100),
    }
  }

  // 2. Destacado recién terminado en el que el usuario participó → resultados.
  const recentlyEnded = candidates
    .filter(c =>
      hasEnded(c, today) &&
      joinedIds.has(c.id) &&
      !!c.ends_at &&
      diffDays(c.ends_at, today) <= RESULTS_WINDOW_DAYS &&
      diffDays(c.ends_at, today) >= 0,
    )
    .sort((a, b) => b.ends_at.localeCompare(a.ends_at))

  if (recentlyEnded.length > 0) {
    return {
      challenge: recentlyEnded[0],
      state: 'results',
      isParticipant: true,
      daysRemaining: 0,
      progressPct: 100,
    }
  }

  return null
}

// ─── Tracking (mismo patrón que post-workout-actions.ts) ─────────────────────

/** Impresión de la card: una vez por montaje y por reto (efecto en el componente). */
export function trackFeaturedChallengeViewed(card: FeaturedChallengeCard): void {
  trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.featuredChallengeViewed, {
    surface: FEATURED_CHALLENGE_SURFACE,
    source: FEATURED_CHALLENGE_SOURCE,
    challenge_id: card.challenge.id,
    action: card.state,
    result: 'viewed',
  })
}

/** Apertura del detalle desde la card (tap/CTA de navegación). */
export function trackFeaturedChallengeOpened(card: FeaturedChallengeCard): void {
  trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeViewed, {
    surface: FEATURED_CHALLENGE_SURFACE,
    source: FEATURED_CHALLENGE_SOURCE,
    challenge_id: card.challenge.id,
    action: card.state,
    result: 'opened',
  })
}

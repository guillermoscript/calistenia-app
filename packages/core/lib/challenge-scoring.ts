/**
 * Reglas puras de puntuación de retos, compartidas por web y móvil.
 *
 * Vivían dentro de `hooks/useProgress.ts` para emitir `challenge_progress_updated`,
 * pero el panel post-entreno (#347) necesita exactamente el mismo criterio para
 * decir a qué reto ha sumado la sesión recién terminada. Extraerlas aquí evita
 * que las dos respuestas se desincronicen: si el evento dice que el entreno movió
 * un reto, el panel enseña ese reto, y al revés.
 */
import type { Challenge, Settings } from '../types'

// ─── Familias PR heredadas ───────────────────────────────────────────────────

const PR_PATTERNS: Array<{ test: (id: string) => boolean; key: keyof Settings }> = [
  { test: (id) => id.includes('pullup') || id.includes('chinup') || id === 'chin_up', key: 'pr_pullups' },
  { test: (id) => id.includes('pushup'), key: 'pr_pushups' },
  { test: (id) => id.startsWith('lsit') || id === 'l_sit', key: 'pr_lsit' },
  { test: (id) => id.startsWith('pistol'), key: 'pr_pistol' },
  { test: (id) => id.startsWith('handstand'), key: 'pr_handstand' },
]

/** Campo `pr_*` heredado para un id, o null si no es una de las 5 familias. */
export const legacyPrKey = (id: string): keyof Settings | null =>
  PR_PATTERNS.find(p => p.test(id))?.key ?? null

/** Métricas de reto cuya puntuación se lee de un campo `pr_*` de settings. */
const CHALLENGE_PR_METRIC_FIELD: Record<string, keyof Settings> = {
  most_pullups: 'pr_pullups',
  most_pushups: 'pr_pushups',
  most_lsit: 'pr_lsit',
  most_handstand: 'pr_handstand',
}

// ─── Criterio de "este entreno puede mover el reto" ──────────────────────────

/** Forma mínima que necesitan estos helpers; los registros de PB traen más campos. */
export type ScorableChallenge = Pick<Challenge, 'metric'> &
  Partial<Pick<Challenge, 'id' | 'exercise_slug' | 'starts_at' | 'ends_at' | 'status'>>

/**
 * Si completar este entreno puede realmente mover la puntuación del reto, tal y
 * como la calcula `getScore` en `useChallengeDetail`. Emitir (o destacar) para
 * todos los retos activos haría que `challenge_joined → challenge_progress_updated`
 * convirtiera al ~100% entrenara lo que entrenara el usuario.
 */
export function workoutAffectsChallenge(
  challenge: ScorableChallenge,
  loggedExerciseIds: Set<string>,
): boolean {
  switch (challenge.metric) {
    // Se puntúan por número/fechas de sesión: cualquier finalización cuenta.
    case 'most_sessions':
    case 'longest_streak':
      return true
    // Se puntúa por la mejor serie de un ejercicio dentro de la ventana.
    case 'exercise':
      return !!challenge.exercise_slug && loggedExerciseIds.has(challenge.exercise_slug)
    // Se puntúa desde un campo pr_*, que solo se mueve si se entrenó esa familia.
    case 'most_pullups':
    case 'most_pushups':
    case 'most_lsit':
    case 'most_handstand':
      return [...loggedExerciseIds].some(id => legacyPrKey(id) === CHALLENGE_PR_METRIC_FIELD[challenge.metric])
    // 'custom' se puntúa a mano y nunca deriva de un entreno.
    default:
      return false
  }
}

/**
 * Si el reto está vivo en la fecha dada. `starts_at`/`ends_at` pueden traer
 * componente de hora desde PocketBase, así que se comparan solo por fecha.
 */
export function isChallengeLiveOn(challenge: ScorableChallenge, today: string): boolean {
  if (challenge.status !== 'active') return false
  if (challenge.ends_at && challenge.ends_at.slice(0, 10) < today) return false
  if (challenge.starts_at && challenge.starts_at.slice(0, 10) > today) return false
  return true
}

/**
 * Retos vivos hoy a los que este entreno puede sumar. Es el filtro que comparten
 * el emisor de `challenge_progress_updated` y el panel post-entreno.
 */
export function pickAffectedChallenges<T extends ScorableChallenge>(
  challenges: Array<T | null | undefined>,
  loggedExerciseIds: Set<string>,
  today: string,
): T[] {
  return challenges.filter((c): c is T =>
    !!c && isChallengeLiveOn(c, today) && workoutAffectsChallenge(c, loggedExerciseIds),
  )
}

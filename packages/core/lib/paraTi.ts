/**
 * «Para ti» del inicio (#853, épica #852): como mucho 2 entradas en móvil y 3
 * en escritorio, debajo de la semana.
 *
 * Esta función solo decide QUÉ enseñar a partir de datos ya cargados
 * (booleanos y recuentos). Las consultas (retos, amigos, nutrición…) las lanza
 * cada plataforma, y solo si `paraTiEnabled` dice que el tramo lo permite: no
 * hay que pagar esas peticiones para una cuenta que aún no las va a ver.
 *
 * Orden de prioridad (se enseñan los primeros que apliquen):
 * 1. Batalla activa o en la que te toca.
 * 2. Reto en el que participas.
 * 3. Amigos que entrenaron hoy.
 * 4. Nutrición del día, solo si registraste comida en los últimos 7 días.
 * 5. Fotos de fase, solo la primera semana de una fase.
 * 6. Reto destacado para unirte, si no participas en ninguno.
 * 7. Programa de la comunidad, si no sigues a nadie.
 *
 * Nada antes del 3.er entreno de la cuenta, y nada con una actividad en curso.
 */
import { ACTIVATION_TARGET_SESSIONS } from './activation'
import type { HomeStateKind } from './homeState'

export type ParaTiKind =
  | 'battle'
  | 'challenge_progress'
  | 'friends_today'
  | 'nutrition_today'
  | 'phase_photos'
  | 'featured_challenge'
  | 'community_program'

export const PARA_TI_ORDER: readonly ParaTiKind[] = [
  'battle',
  'challenge_progress',
  'friends_today',
  'nutrition_today',
  'phase_photos',
  'featured_challenge',
  'community_program',
]

/** Máximo de entradas por superficie. */
export const PARA_TI_MAX = { mobile: 2, desktop: 3 } as const

export interface ParaTiGate {
  homeKind: HomeStateKind
  /** Entrenos de toda la cuenta (`useHomeStage().sessions`). */
  accountSessions: number
}

/** ¿Se enseña (y por tanto se consulta) «Para ti»? */
export function paraTiEnabled({ homeKind, accountSessions }: ParaTiGate): boolean {
  return homeKind !== 'in_progress' && accountSessions >= ACTIVATION_TARGET_SESSIONS
}

export interface ParaTiInput extends ParaTiGate {
  /** Batalla activa o en la que te toca jugar. */
  hasActiveBattle: boolean
  /** Retos en los que participas ahora mismo. */
  joinedChallenges: number
  /** Amigos (a los que sigues) que entrenaron hoy. */
  friendsTrainedToday: number
  /** Registraste alguna comida en los últimos 7 días. */
  loggedFoodLast7Days: boolean
  /** Es la primera semana de la fase en curso (`weekInPhase(...) === 1`). */
  firstWeekOfPhase: boolean
  /** Hay un reto destacado al que unirse. */
  featuredChallengeAvailable: boolean
  /** Personas a las que sigues. */
  followingCount: number
  /** Hay un programa de la comunidad que recomendar. */
  communityProgramAvailable: boolean
}

export function getParaTi(input: ParaTiInput, max: number): ParaTiKind[] {
  if (!paraTiEnabled(input) || !(max > 0)) return []
  const applies: Record<ParaTiKind, boolean> = {
    battle: input.hasActiveBattle,
    challenge_progress: input.joinedChallenges > 0,
    friends_today: input.friendsTrainedToday > 0,
    nutrition_today: input.loggedFoodLast7Days,
    phase_photos: input.firstWeekOfPhase,
    featured_challenge: input.featuredChallengeAvailable && input.joinedChallenges === 0,
    community_program: input.communityProgramAvailable && input.followingCount === 0,
  }
  return PARA_TI_ORDER.filter(kind => applies[kind]).slice(0, Math.floor(max))
}

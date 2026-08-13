/**
 * Panel de acciones post-entreno (#347): qué acciones se ofrecen tras completar
 * una sesión, en qué orden y con qué jerarquía.
 *
 * La UI se implementa por separado en web y móvil (no hay capa de componentes
 * compartida), así que las reglas viven aquí para que las dos plataformas
 * ofrezcan lo mismo y se puedan testear sin renderizar nada.
 */
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from './analytics'

export type PostWorkoutActionId = 'share' | 'invite' | 'challenge' | 'progress' | 'repeat'

export interface PostWorkoutAction {
  id: PostWorkoutActionId
  /** 'primary' se renderiza como CTA destacado; solo compartir lo es. */
  emphasis: 'primary' | 'secondary'
}

export interface PostWorkoutActionsInput {
  /** Hay código de referido con el que construir el enlace de invitación. */
  canInvite: boolean
  /** El host sabe reiniciar la misma rutina (`onRepeat`). */
  canRepeat: boolean
  /** Reto activo al que este entreno ha sumado, si lo hay. */
  affectedChallengeId?: string | null
}

/** Orden fijo del panel; compartir siempre primero y siempre primaria. */
const ORDER: PostWorkoutActionId[] = ['share', 'invite', 'challenge', 'progress', 'repeat']

/**
 * Acciones a mostrar. Compartir y progreso están siempre disponibles; retos
 * también (sin reto afectado lleva a la lista para unirse o crear), invitar
 * necesita código de referido y repetir necesita callback del host.
 */
export function buildPostWorkoutActions(input: PostWorkoutActionsInput): PostWorkoutAction[] {
  const available = new Set<PostWorkoutActionId>(['share', 'challenge', 'progress'])
  if (input.canInvite) available.add('invite')
  if (input.canRepeat) available.add('repeat')

  return ORDER
    .filter(id => available.has(id))
    .map(id => ({ id, emphasis: id === 'share' ? 'primary' : 'secondary' }))
}

/**
 * `post_workout_action_selected`. Se emite ADEMÁS del evento canónico propio de
 * cada acción (`share_card_shared`, `invite_sent`, `challenge_viewed`…), que se
 * sigue emitiendo donde ya lo hacía para no alterar los embudos existentes.
 */
export function trackPostWorkoutAction(
  action: PostWorkoutActionId,
  { workoutKey, challengeId }: { workoutKey: string; challengeId?: string | null },
): void {
  trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.postWorkoutActionSelected, {
    surface: 'post_workout',
    source: 'workout_completion',
    workout_id: workoutKey,
    action,
    result: 'selected',
    ...(challengeId ? { challenge_id: challengeId } : {}),
  })
}

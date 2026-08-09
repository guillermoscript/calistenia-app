/**
 * Reto activo al que ha sumado el entreno recién completado (#347).
 *
 * Lo usa el panel post-entreno para que la fila de retos sea contextual: si el
 * entreno ha movido un reto, se nombra y se enlaza; si no, se ofrece la lista
 * para unirse o crear uno.
 *
 * Reutiliza `useChallenges` a propósito en lugar de lanzar su propia consulta:
 * es la misma lectura de `challenge_participants` y comparte caché con la
 * pantalla de retos. El filtro sale de `lib/challenge-scoring`, el mismo que
 * decide si emitir `challenge_progress_updated`, para que evento y UI no puedan
 * discrepar.
 */
import { useMemo } from 'react'
import { useChallenges, type ChallengeWithMeta } from './useChallenges'
import { pickAffectedChallenges } from '../lib/challenge-scoring'
import { todayStr } from '../lib/dateUtils'

export interface PostWorkoutChallengeResult {
  /** Reto afectado que antes termina, o null si no hay ninguno. */
  challenge: ChallengeWithMeta | null
  loading: boolean
}

export function usePostWorkoutChallenge(
  userId: string | null,
  exerciseIds: string[],
): PostWorkoutChallengeResult {
  const { active, loading } = useChallenges(userId)

  // `exerciseIds` suele llegar como array nuevo en cada render; la clave estable
  // evita recalcular (y re-renderizar el panel) en cada tick de la celebración.
  const idsKey = exerciseIds.join('|')

  const challenge = useMemo(() => {
    if (!active.length) return null
    const logged = new Set(idsKey ? idsKey.split('|') : [])
    // `active` ya viene ordenado por ends_at ascendente: el primero es el que
    // antes se cierra y por tanto el más urgente de enseñar.
    return pickAffectedChallenges(active, logged, todayStr())[0] ?? null
  }, [active, idsKey])

  return { challenge, loading }
}

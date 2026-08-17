/**
 * Landing de invitación por código de referido (#473).
 *
 * Sustituye al `useEffect` de `InviteLandingPage`, que encadenaba tres
 * peticiones y además decidía la navegación desde dentro del propio efecto.
 *
 * Este hook **no navega ni escribe en `localStorage`**: core no conoce el router
 * de cada plataforma y móvil no tiene `localStorage`. En su lugar devuelve un
 * veredicto en `status` y la pantalla decide qué hacer con él.
 *
 * Los datos de quien invita y la vista previa del reto salen de dos endpoints
 * REST públicos, no de colecciones: `users`, `challenges` y
 * `challenge_participants` exigen autenticación en sus rules y el invitado
 * típico todavía no tiene cuenta (#313, GHSA-wwj3-9h95-wcpf).
 */

import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import type { TranslatableField } from '../lib/i18n-db'

export interface InviteInviter {
  id: string
  displayName: string
  avatarUrl: string | null
  level: number
  currentStreak: number
  totalSessions: number
}

export interface InviteProgramPreview {
  name: TranslatableField
  description: TranslatableField
  durationWeeks: number
}

export interface InviteChallengePreview {
  id: string
  title: string
  exerciseName: string
  dailyTarget: number
  durationDays: number
  participantCount: number
}

/**
 * Qué debe hacer la pantalla con esta invitación:
 * - `ready`: pintar la landing.
 * - `invalid-code`: el código no existe → llevar al registro.
 * - `own-link`: es el propio enlace del usuario → avisar, no invitar.
 * - `other-profile`: usuario con sesión abriendo el enlace de otro sin reto →
 *   no hay nada que ofrecerle, se le lleva al perfil de quien invita.
 */
export type InviteStatus = 'ready' | 'invalid-code' | 'own-link' | 'other-profile'

interface InviteLandingData {
  inviter: InviteInviter | null
  program: InviteProgramPreview | null
  challenge: InviteChallengePreview | null
  status: InviteStatus
}

interface ReferralLookupResponse {
  id: string
  display_name: string
  avatarUrl: string | null
}

export interface UseInviteLandingOptions {
  isLoggedIn: boolean
  currentUserId: string | null
}

export function useInviteLanding(
  code: string | null,
  challengeId: string | null,
  { isLoggedIn, currentUserId }: UseInviteLandingOptions,
) {
  const query = useQuery({
    queryKey: qk.inviteLanding(code, challengeId),
    enabled: !!code,
    staleTime: 60_000,
    queryFn: async (): Promise<InviteLandingData> => {
      // La vista previa del reto no depende de quién invita, así que se pide en
      // paralelo con el lookup en lugar de esperar a tenerlo resuelto.
      const [lookupRes, challenge] = await Promise.all([
        fetch(`${pb.baseUrl}/api/public/referral-lookup/${encodeURIComponent(code!)}`),
        challengeId ? fetchChallengePreview(challengeId) : Promise.resolve(null),
      ])

      if (!lookupRes.ok) {
        return { inviter: null, program: null, challenge, status: 'invalid-code' }
      }

      const user = (await lookupRes.json()) as ReferralLookupResponse

      // Con sesión abierta hay dos casos que no son una invitación de verdad.
      if (isLoggedIn && currentUserId) {
        if (user.id === currentUserId) {
          return { inviter: toInviter(user), program: null, challenge, status: 'own-link' }
        }
        if (!challengeId) {
          return { inviter: toInviter(user), program: null, challenge: null, status: 'other-profile' }
        }
      }

      // Stats de quien invita y, si no hay reto que enseñar, su programa actual:
      // ambas dependen de `user.id` pero no una de la otra.
      const [stats, program] = await Promise.all([
        pb
          .collection('public_user_stats')
          .getFirstListItem(pb.filter('user = {:uid}', { uid: user.id }), { $autoCancel: false })
          .catch(() => null),
        challengeId ? Promise.resolve(null) : fetchInviterProgram(user.id),
      ])

      return {
        inviter: {
          ...toInviter(user),
          level: stats?.level || 1,
          currentStreak: stats?.workout_streak_current || 0,
          totalSessions: stats?.total_sessions || 0,
        },
        program,
        challenge,
        status: 'ready',
      }
    },
  })

  const data = query.data

  return {
    inviter: data?.inviter ?? null,
    program: data?.program ?? null,
    challenge: data?.challenge ?? null,
    /** Mientras carga no hay veredicto todavía; la pantalla enseña su loader. */
    status: data?.status ?? null,
    loading: query.isLoading,
    error: query.error as Error | null,
  }
}

function toInviter(user: ReferralLookupResponse): InviteInviter {
  return {
    id: user.id,
    displayName: user.display_name || '',
    avatarUrl: user.avatarUrl,
    level: 1,
    currentStreak: 0,
    totalSessions: 0,
  }
}

async function fetchChallengePreview(challengeId: string): Promise<InviteChallengePreview | null> {
  try {
    const res = await fetch(
      `${pb.baseUrl}/api/public/challenge-preview/${encodeURIComponent(challengeId)}`,
    )
    if (!res.ok) return null
    const ch = (await res.json()) as {
      id: string
      title?: string
      exercise_name?: string
      daily_target?: number
      duration_days?: number
      participant_count?: number
    }
    return {
      id: ch.id,
      title: ch.title || '',
      exerciseName: ch.exercise_name || '',
      dailyTarget: ch.daily_target || 0,
      durationDays: ch.duration_days || 0,
      participantCount: ch.participant_count || 0,
    }
  } catch {
    // Reto borrado o endpoint caído: la landing sigue sirviendo como invitación.
    return null
  }
}

async function fetchInviterProgram(userId: string): Promise<InviteProgramPreview | null> {
  try {
    const rec = await pb
      .collection('user_programs')
      .getFirstListItem(pb.filter('user = {:uid} && is_current = true', { uid: userId }), {
        expand: 'program',
        $autoCancel: false,
      })
    const program = rec.expand?.program as
      | { name?: TranslatableField; description?: TranslatableField; duration_weeks?: number }
      | undefined
    if (!program) return null
    return {
      name: program.name ?? '',
      description: program.description ?? '',
      durationWeeks: program.duration_weeks || 0,
    }
  } catch {
    // Quien invita no tiene programa activo; no es un error de la landing.
    return null
  }
}

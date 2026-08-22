/**
 * Perfil público de un usuario (#473).
 *
 * Sustituye a dos copias del mismo `useEffect`: `UserProfilePage` en web y
 * `u/[id].tsx` en móvil, que pedían exactamente los mismos datos —misma
 * colección, mismo filtro, mismo `perPage`, mismo `sort`— en cinco peticiones
 * encadenadas. Como las cinco dependen solo de `userId`, aquí salen en una sola
 * ola con `Promise.all`.
 *
 * Lee de las views `public_*` (#386): las tablas base son owner-only y esta
 * pantalla se abre sobre el perfil de otra persona.
 *
 * Devuelve los textos crudos (`TranslatableField`) y no localizados. Antes se
 * localizaba dentro del efecto, lo que obligaba a poner `l` en sus dependencias
 * y hacía que **cambiar de idioma relanzara las cinco peticiones**.
 */

import { useQuery } from '@tanstack/react-query'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { todayStr, utcToLocalDateStr, localMidnightAsUTC } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import {
  buildMonthActivity,
  mapProfilePRs,
  mapRecentSessions,
  profileDisplayName,
} from '../lib/public-profile'
import type {
  PublicProfile,
  PublicPrsRow,
  PublicSessionRow,
  PublicUserStatsRow,
} from '../lib/public-profile'
import type { TranslatableField } from '../lib/i18n-db'

export type { PublicProfile } from '../lib/public-profile'

/**
 * Tope de sesiones que se piden para el calendario del mes. Es el número de días
 * del mes por un margen generoso de sesiones diarias; el calendario solo necesita
 * saber si hubo actividad, no cuántas.
 */
const MONTH_SESSIONS_PAGE = 200

export function usePublicProfile(userId: string | null) {
  // El mes entra en la clave: al cruzar la medianoche del día 1 la caché del mes
  // anterior no debe servir un calendario que ya no corresponde.
  const yearMonth = todayStr().slice(0, 7)

  const query = useQuery({
    queryKey: qk.publicProfile(userId, yearMonth),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<PublicProfile> => {
      const uid = userId!
      const byUser = pb.filter('user = {:uid}', { uid })

      // Las cinco consultas dependen solo de `uid`, así que van juntas. Las
      // opcionales caen a un valor vacío en lugar de tumbar el perfil entero:
      // un usuario recién registrado no tiene stats, ni PRs, ni programa.
      const [user, stats, prs, sessions, activeProgram] = await Promise.all([
        pb.collection('users').getOne(uid, { $autoCancel: false }),

        pb
          .collection('public_user_stats')
          .getFirstListItem(byUser, { $autoCancel: false })
          .catch(() => ({}) as PublicUserStatsRow),

        pb
          .collection('public_prs')
          .getList(1, 1, { filter: byUser, $autoCancel: false })
          .then(res => (res.items[0] ?? {}) as PublicPrsRow)
          .catch(() => ({}) as PublicPrsRow),

        pb
          .collection('public_sessions')
          .getList(1, MONTH_SESSIONS_PAGE, {
            filter: pb.filter('user = {:uid} && completed_at >= {:start}', {
              uid,
              start: localMidnightAsUTC(`${yearMonth}-01`),
            }),
            sort: '-completed_at',
            $autoCancel: false,
          })
          .then(res => res.items as unknown as PublicSessionRow[])
          .catch(() => [] as PublicSessionRow[]),

        pb
          .collection('user_programs')
          .getFirstListItem(pb.filter('user = {:uid} && is_current = true', { uid }), {
            expand: 'program',
            $autoCancel: false,
          })
          .then(rec => {
            const program = rec.expand?.program as
              | { id: string; name?: TranslatableField }
              | undefined
            return program ? { id: program.id, name: program.name ?? '' } : null
          })
          .catch(() => null),
      ])

      const statsRow = stats as PublicUserStatsRow

      return {
        id: user.id,
        displayName: profileDisplayName(user as { display_name?: string; name?: string; email?: string }),
        avatarUrl: getUserAvatarUrl(user, '200x200'),
        email: user.email ?? '',
        memberSince: user.created ? utcToLocalDateStr(user.created) : '',
        totalSessions: statsRow.total_sessions || 0,
        bestStreak: statsRow.workout_streak_best || 0,
        currentStreak: statsRow.workout_streak_current || 0,
        level: statsRow.level || 1,
        xp: statsRow.xp || 0,
        phase: (prs as PublicPrsRow).phase || 1,
        prs: mapProfilePRs(prs as PublicPrsRow),
        monthActivity: buildMonthActivity(yearMonth, sessions),
        recentSessions: mapRecentSessions(sessions),
        activeProgram,
        isPrivate: (user as { is_private?: boolean }).is_private === true,
      }
    },
  })

  return {
    profile: query.data ?? null,
    loading: query.isLoading,
    error: query.error as Error | null,
    /** El usuario no existe o no es visible: `users.getOne` es el único fetch que no perdona. */
    notFound: !!query.error,
  }
}

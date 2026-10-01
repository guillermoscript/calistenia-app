import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import {
  activeSinceDay,
  buildSuggestedUsers,
  SUGGESTED_USERS_FETCH,
  type SuggestedUser,
  type SuggestionStatsRow,
  type SuggestionUserRow,
} from '../lib/suggested-users'

interface Raw {
  stats: SuggestionStatsRow[]
  users: SuggestionUserRow[]
  /** id → url de avatar, resuelto aquí porque necesita `pb`. */
  avatars: Record<string, string | null>
}

const EMPTY: Raw = { stats: [], users: [], avatars: {} }

interface Options {
  /** Apaga la consulta (p. ej. cuando ya sigue a gente). */
  enabled?: boolean
  limit?: number
}

/**
 * Gente activa para seguir (#806). Dos lecturas: `public_user_stats` por
 * último entreno (las reglas de la view ya esconden cuentas privadas no
 * seguidas y bloqueos) y `users` de esos ids para nombre y avatar. El filtrado
 * fino —yo, seguidos, solicitados, bloqueados, privadas— es
 * `buildSuggestedUsers`, que se recalcula sin red al seguir a alguien.
 */
export function useSuggestedUsers(
  userId: string | null,
  followingIds: Set<string>,
  pendingOutgoingIds: Set<string>,
  blockedIds: Set<string>,
  { enabled = true, limit }: Options = {},
): { suggestions: SuggestedUser[]; loading: boolean } {
  const { data, isPending } = useQuery<Raw>({
    queryKey: qk.suggestedUsers(userId),
    enabled: !!userId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!(await isPocketBaseAvailable())) return EMPTY
      const stats = (await pb.collection('public_user_stats').getList(1, SUGGESTED_USERS_FETCH, {
        filter: pb.filter('user != {:me} && total_sessions > 0', { me: userId! }),
        sort: '-last_workout_date',
        fields: 'id,user,total_sessions,workout_streak_current,last_workout_date',
        $autoCancel: false,
      })).items as unknown as SuggestionStatsRow[]
      const ids = [...new Set(stats.map(s => s.user).filter((x): x is string => !!x))]
      if (ids.length === 0) return EMPTY

      const params: Record<string, string> = {}
      const clause = ids.map((id, i) => { params[`u${i}`] = id; return `id = {:u${i}}` }).join(' || ')
      const users = await pb.collection('users').getFullList({
        filter: pb.filter(clause, params),
        $autoCancel: false,
      })
      const avatars: Record<string, string | null> = {}
      for (const u of users) avatars[u.id] = getUserAvatarUrl(u as any, '100x100')
      return { stats, users: users as unknown as SuggestionUserRow[], avatars }
    },
  })

  const suggestions = useMemo(() => {
    const raw = data ?? EMPTY
    return buildSuggestedUsers({
      stats: raw.stats,
      users: raw.users,
      selfId: userId ?? '',
      followingIds,
      pendingOutgoingIds,
      blockedIds,
      activeSince: activeSinceDay(new Date()),
      limit,
    }).map(s => ({ ...s, avatarUrl: raw.avatars[s.id] ?? null }))
  }, [data, userId, followingIds, pendingOutgoingIds, blockedIds, limit])

  return { suggestions, loading: isPending && !!userId && enabled }
}

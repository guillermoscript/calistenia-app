import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { startOfWeekStr, todayStr } from '../lib/dateUtils'
import { wallClockDayRange } from '../lib/wallClock'
import { qk } from '../lib/query-keys'
import { authorDisplayName } from '../lib/author-name'

export interface LeaderboardEntry {
  userId: string
  displayName: string
  avatarUrl: string | null
  value: number
  isCurrentUser: boolean
  /** Cuenta privada (#422): solo la ve su dueño en los rankings. */
  isPrivate?: boolean
}

export type LeaderboardCategory = 'sessions_week' | 'sessions_month' | 'streak' | 'streak_best' | 'total_sessions' | 'xp' | 'total_sets' | 'pr_pullups' | 'pr_pushups' | 'pr_lsit' | 'pr_handstand'

export interface LeaderboardData {
  entries: Record<LeaderboardCategory, LeaderboardEntry[]>
  loading: boolean
  refreshing: boolean
  error: string | null
}

type Entries = Record<LeaderboardCategory, LeaderboardEntry[]>

const EMPTY_ENTRIES: Entries = {
  sessions_week: [], sessions_month: [], streak: [], streak_best: [],
  total_sessions: [], xp: [], total_sets: [],
  pr_pullups: [], pr_pushups: [], pr_lsit: [], pr_handstand: [],
}

/**
 * Quién entra en un ranking entre seguidos: yo + los seguidos ACEPTADOS. Una
 * solicitud pendiente a una cuenta privada (#422) no es un seguido, y sus views
 * devolverían 0 filas en silencio.
 */
export async function fetchRankingUserIds(userId: string): Promise<{ allUserIds: string[]; followedIds: string[] }> {
  const followsRes = await pb.collection('follows').getFullList({
    filter: pb.filter('follower = {:uid}', { uid: userId }),
    $autoCancel: false,
  })
  const followedIds = followsRes
    .filter((r: any) => r.status !== 'pending')
    .map((r: any) => r.following as string)
  return { allUserIds: [...new Set([userId, ...followedIds])], followedIds }
}

/**
 * Entrenos de `uid` desde `start`: SOLO de programa y libres (la tabla
 * `sessions`), la misma definición que la racha y el objetivo semanal (#890).
 * El cardio y los circuitos no cuentan: antes se sumaban y la misma persona
 * salía con 3 en Comunidad y 2 de 6 en Hoy/Progreso/Perfil. Sale de la view
 * `public_sessions` (#386): la tabla base es owner-only y aquí se leen datos de
 * otras personas.
 */
export async function countWorkoutSessionsSince(uid: string, start: string): Promise<number> {
  return pb.collection('public_sessions').getList(1, 1, {
    filter: pb.filter('user = {:uid} && completed_at >= {:start}', { uid, start }),
    $autoCancel: false,
  }).then((r: any) => r?.totalItems || 0).catch(() => 0)
}

/**
 * Leaderboard entre seguidos. Migrado a TanStack Query conservando la forma
 * pública { entries, loading, error, load }. Es LAZY: la query (9×N llamadas a
 * PB) no corre hasta que se llama `load()` la primera vez — `load` habilita la
 * query y, si ya estaba activa, fuerza refetch. staleTime 30s reemplaza el TTL
 * manual previo.
 */
export function useLeaderboard(userId: string | null) {
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)

  // `sessions.completed_at` es hora de pared local: cota de día sin pasar a UTC.
  const weekStartDay = startOfWeekStr()
  const weekStartStr = wallClockDayRange(weekStartDay, weekStartDay).from
  const today = todayStr()
  const monthStartDay = `${today.slice(0, 7)}-01`
  const monthStartStr = wallClockDayRange(monthStartDay, monthStartDay).from
  // Memo obligatorio (#578): `qk.leaderboard` devuelve un array nuevo en cada
  // render; sin memo `load` cambiaba de identidad, el `useEffect([load])` de la
  // página se disparaba en cada render e invalidaba la query en bucle.
  const key = useMemo(
    () => qk.leaderboard(userId, weekStartStr, monthStartStr),
    [userId, weekStartStr, monthStartStr],
  )

  const query = useQuery({
    queryKey: key,
    enabled: !!userId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Entries> => {
      // 1. A quién sigo
      const { allUserIds, followedIds } = await fetchRankingUserIds(userId!)

      // No sigo a nadie → leaderboard vacío.
      if (followedIds.length === 0) return EMPTY_ENTRIES

      // 2. Stats + PRs + conteos de sesiones por usuario (en paralelo).
      //    Todo sale de las views `public_*` (#386): las tablas base son
      //    owner-only y aquí se leen datos de otras personas. `public_prs`
      //    sustituye a `settings` y `public_user_stats` a `user_stats`.
      const userDataPromises = allUserIds.map(async (uid) => {
        const [
          userRes, statsRes, settingsRes,
          sessionsWeek, sessionsMonth,
        ] = await Promise.all([
          pb.collection('users').getOne(uid, { $autoCancel: false }).catch(() => null),
          pb.collection('public_user_stats').getFirstListItem(
            pb.filter('user = {:uid}', { uid }),
            { $autoCancel: false, fields: 'id,user,workout_streak_current,workout_streak_best,total_sessions,total_sets,xp' },
          ).catch(() => null),
          pb.collection('public_prs').getFirstListItem(
            pb.filter('user = {:uid}', { uid }),
            { $autoCancel: false, fields: 'id,user,pr_pullups,pr_pushups,pr_lsit,pr_handstand' },
          ).catch(() => null),
          countWorkoutSessionsSince(uid, weekStartStr),
          countWorkoutSessionsSince(uid, monthStartStr),
        ])

        const displayName = authorDisplayName(userRes as any) || '?'
        const avatarUrl = userRes ? getUserAvatarUrl(userRes as any, '100x100') : null
        const isMe = uid === userId

        return {
          userId: uid,
          displayName,
          avatarUrl,
          isCurrentUser: isMe,
          sessionsWeek,
          sessionsMonth,
          streak: (statsRes as any)?.workout_streak_current || 0,
          streak_best: (statsRes as any)?.workout_streak_best || 0,
          total_sessions: (statsRes as any)?.total_sessions || 0,
          total_sets: (statsRes as any)?.total_sets || 0,
          xp: (statsRes as any)?.xp || 0,
          pr_pullups: (settingsRes as any)?.pr_pullups || 0,
          pr_pushups: (settingsRes as any)?.pr_pushups || 0,
          pr_lsit: (settingsRes as any)?.pr_lsit || 0,
          pr_handstand: (settingsRes as any)?.pr_handstand || 0,
        }
      })

      const userData = await Promise.all(userDataPromises)

      // 3. Leaderboards ordenados por categoría.
      const build = (k: string): LeaderboardEntry[] =>
        userData
          .map(u => ({
            userId: u.userId,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
            value: (u as any)[k] as number,
            isCurrentUser: u.isCurrentUser,
          }))
          .sort((a, b) => b.value - a.value)

      return {
        sessions_week: build('sessionsWeek'),
        sessions_month: build('sessionsMonth'),
        streak: build('streak'),
        streak_best: build('streak_best'),
        total_sessions: build('total_sessions'),
        xp: build('xp'),
        total_sets: build('total_sets'),
        pr_pullups: build('pr_pullups'),
        pr_pushups: build('pr_pushups'),
        pr_lsit: build('pr_lsit'),
        pr_handstand: build('pr_handstand'),
      }
    },
  })

  const load = useCallback(async () => {
    if (!userId) return
    setEnabled((prev) => {
      if (prev) qc.invalidateQueries({ queryKey: key })
      return true
    })
  }, [userId, qc, key])

  return {
    entries: query.data ?? EMPTY_ENTRIES,
    // loading = primera carga únicamente; refreshing = refetch de fondo
    loading: query.isPending,
    refreshing: query.isFetching && !query.isPending,
    error: query.error ? String((query.error as any)?.message ?? query.error) : null,
    load,
  }
}

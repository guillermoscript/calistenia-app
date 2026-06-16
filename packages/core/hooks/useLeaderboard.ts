import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { startOfWeekStr, localMidnightAsUTC, todayStr } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'

export interface LeaderboardEntry {
  userId: string
  displayName: string
  avatarUrl: string | null
  value: number
  isCurrentUser: boolean
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
 * Leaderboard entre seguidos. Migrado a TanStack Query conservando la forma
 * pública { entries, loading, error, load }. Es LAZY: la query (9×N llamadas a
 * PB) no corre hasta que se llama `load()` la primera vez — `load` habilita la
 * query y, si ya estaba activa, fuerza refetch. staleTime 30s reemplaza el TTL
 * manual previo.
 */
export function useLeaderboard(userId: string | null) {
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)

  const weekStartStr = localMidnightAsUTC(startOfWeekStr())
  const today = todayStr()
  const monthStartStr = localMidnightAsUTC(`${today.slice(0, 7)}-01`)
  const key = qk.leaderboard(userId, weekStartStr, monthStartStr)

  const query = useQuery({
    queryKey: key,
    enabled: !!userId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Entries> => {
      // 1. A quién sigo
      const followsRes = await pb.collection('follows').getFullList({
        filter: pb.filter('follower = {:uid}', { uid: userId! }),
        $autoCancel: false,
      })
      const followedIds = followsRes.map((r: any) => r.following as string)
      const allUserIds = [...new Set([userId!, ...followedIds])]

      // No sigo a nadie → leaderboard vacío.
      if (allUserIds.length <= 1 && followedIds.length === 0) return EMPTY_ENTRIES

      // 2. Stats + settings + conteos de sesiones por usuario (en paralelo).
      const userDataPromises = allUserIds.map(async (uid) => {
        const [
          userRes, statsRes, settingsRes,
          weekSessionsRes, monthSessionsRes,
          weekCircuitRes, monthCircuitRes,
          weekCardioRes, monthCardioRes,
        ] = await Promise.all([
          pb.collection('users').getOne(uid, { $autoCancel: false }).catch(() => null),
          pb.collection('user_stats').getFirstListItem(
            pb.filter('user = {:uid}', { uid }),
            { $autoCancel: false, fields: 'id,user,workout_streak_current,workout_streak_best,total_sessions,total_sets,xp' },
          ).catch(() => null),
          pb.collection('settings').getFirstListItem(
            pb.filter('user = {:uid}', { uid }),
            { $autoCancel: false, fields: 'id,user,pr_pullups,pr_pushups,pr_lsit,pr_handstand' },
          ).catch(() => null),
          pb.collection('sessions').getList(1, 1, {
            filter: pb.filter('user = {:uid} && completed_at >= {:start}', { uid, start: weekStartStr }),
            $autoCancel: false,
          }).catch(() => ({ totalItems: 0 })),
          pb.collection('sessions').getList(1, 1, {
            filter: pb.filter('user = {:uid} && completed_at >= {:start}', { uid, start: monthStartStr }),
            $autoCancel: false,
          }).catch(() => ({ totalItems: 0 })),
          pb.collection('circuit_sessions').getList(1, 1, {
            filter: pb.filter('user = {:uid} && started_at >= {:start}', { uid, start: weekStartStr }),
            $autoCancel: false,
          }).catch(() => ({ totalItems: 0 })),
          pb.collection('circuit_sessions').getList(1, 1, {
            filter: pb.filter('user = {:uid} && started_at >= {:start}', { uid, start: monthStartStr }),
            $autoCancel: false,
          }).catch(() => ({ totalItems: 0 })),
          pb.collection('cardio_sessions').getList(1, 1, {
            filter: pb.filter('user = {:uid} && started_at >= {:start}', { uid, start: weekStartStr }),
            $autoCancel: false,
          }).catch(() => ({ totalItems: 0 })),
          pb.collection('cardio_sessions').getList(1, 1, {
            filter: pb.filter('user = {:uid} && started_at >= {:start}', { uid, start: monthStartStr }),
            $autoCancel: false,
          }).catch(() => ({ totalItems: 0 })),
        ])

        const displayName = (userRes as any)?.display_name || (userRes as any)?.email?.split('@')[0] || '?'
        const avatarUrl = userRes ? getUserAvatarUrl(userRes as any, '100x100') : null
        const isMe = uid === userId

        const weekStrength = (weekSessionsRes as any)?.totalItems || 0
        const weekCircuit = (weekCircuitRes as any)?.totalItems || 0
        const weekCardio = (weekCardioRes as any)?.totalItems || 0
        const monthStrength = (monthSessionsRes as any)?.totalItems || 0
        const monthCircuit = (monthCircuitRes as any)?.totalItems || 0
        const monthCardio = (monthCardioRes as any)?.totalItems || 0

        return {
          userId: uid,
          displayName,
          avatarUrl,
          isCurrentUser: isMe,
          sessionsWeek: weekStrength + weekCircuit + weekCardio,
          sessionsMonth: monthStrength + monthCircuit + monthCardio,
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

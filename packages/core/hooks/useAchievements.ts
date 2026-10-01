import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import {
  achievementCounts,
  buildAchievementList,
  type AchievementItem,
} from '../lib/achievements'

interface AchievementsData {
  totalWorkouts: number
  bestWeeklyStreak: number
  unlockedAtByKey: Record<string, string | null>
}

/**
 * Pantalla de logros (#802): stats propias (`user_stats`) + filas
 * desbloqueadas de `user_achievements` con el catálogo expandido. Ambas
 * colecciones son colecciones base (no vistas) con regla `user = auth.id`.
 *
 * Forma pública: `{ items, unlocked, total, loading, error, refresh }`.
 */
export function useAchievements(userId: string | null) {
  const { data, isPending, error, refetch } = useQuery<AchievementsData>({
    queryKey: qk.achievements(userId),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [stats, rows] = await Promise.all([
        pb.collection('user_stats')
          .getFirstListItem(pb.filter('user = {:uid}', { uid: userId! }), { $autoCancel: false })
          .catch((err: any) => {
            // Sin fila de stats = cuenta que aún no ha entrenado: todo a cero.
            if (err?.status === 404) return null
            throw err
          }),
        pb.collection('user_achievements').getFullList({
          filter: pb.filter('user = {:uid} && unlocked = true', { uid: userId! }),
          expand: 'achievement',
          $autoCancel: false,
        }),
      ])
      const unlockedAtByKey: Record<string, string | null> = {}
      for (const row of rows as any[]) {
        const key = row?.expand?.achievement?.key
        if (typeof key === 'string' && key) unlockedAtByKey[key] = row.unlocked_at || null
      }
      return {
        totalWorkouts: Number((stats as any)?.total_sessions) || 0,
        bestWeeklyStreak: Number((stats as any)?.workout_streak_best) || 0,
        unlockedAtByKey,
      }
    },
  })

  const items: AchievementItem[] = useMemo(
    () => buildAchievementList(
      { totalWorkouts: data?.totalWorkouts ?? 0, bestWeeklyStreak: data?.bestWeeklyStreak ?? 0 },
      data?.unlockedAtByKey ?? {},
    ),
    [data],
  )
  const counts = useMemo(() => achievementCounts(items), [items])

  return {
    items,
    unlocked: counts.unlocked,
    total: counts.total,
    loading: !!userId && isPending,
    error: error ? (error as Error) : null,
    refresh: refetch,
  }
}

import { useState, useCallback } from 'react'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { utcToLocalDateStr } from '../lib/dateUtils'
import { WORKOUTS } from '../data/workouts'
import { qk } from '../lib/query-keys'

export interface FeedItem {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  completedAt: string
  date: string
  workoutKey: string
  workoutTitle: string
  phase: number
  note: string
}

const PAGE_SIZE = 20

type UserInfo = { name: string; avatarUrl: string | null }
type FeedMeta = { allUserIds: string[]; userMap: Record<string, UserInfo> }

function mapSession(s: any, userMap: Record<string, UserInfo>): FeedItem {
  const workout = WORKOUTS[s.workout_key]
  return {
    id: s.id,
    userId: s.user,
    displayName: userMap[s.user]?.name || '?',
    avatarUrl: userMap[s.user]?.avatarUrl || null,
    completedAt: s.completed_at,
    date: utcToLocalDateStr(s.completed_at || s.created || ''),
    workoutKey: s.workout_key,
    workoutTitle: workout?.title || s.workout_key,
    phase: s.phase || 1,
    note: s.note || '',
  }
}

/**
 * Feed de actividad de seguidos. Migrado a TanStack Query conservando la forma
 * pública { items, loading, loadingMore, hasMore, load, loadMore }.
 *
 * Cadena dependiente y LAZY:
 *  1) metaQuery (qk.feed.meta) resuelve a quién sigo + mapa de usuarios.
 *  2) useInfiniteQuery (qk.feed.sessions) pagina las sesiones; cada página mapea
 *     con el userMap de la meta. `load` habilita la cadena; `loadMore` =
 *     fetchNextPage. staleTime 60s reemplaza el TTL manual.
 */
export function useActivityFeed(userId: string | null) {
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)

  const metaQuery = useQuery({
    queryKey: qk.feed.meta(userId),
    enabled: !!userId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<FeedMeta> => {
      const followsRes = await pb.collection('follows').getFullList({
        filter: pb.filter('follower = {:uid}', { uid: userId! }),
        $autoCancel: false,
      })
      const followedIds = followsRes.map((r: any) => r.following as string)
      // Ordenar para estabilizar la query key: mismo conjunto → misma key, sin cache thrash.
      const allUserIds = [...new Set([userId!, ...followedIds])].sort()

      const usersRes = await pb.collection('users').getList(1, allUserIds.length, {
        filter: allUserIds.map(uid => pb.filter('id = {:uid}', { uid })).join(' || '),
        $autoCancel: false,
      }).catch(() => ({ items: [] as any[] }))

      const userMap: Record<string, UserInfo> = {}
      ;(usersRes as any).items.forEach((u: any) => {
        if (u) userMap[u.id] = {
          name: u.display_name || u.email?.split('@')[0] || '?',
          avatarUrl: getUserAvatarUrl(u, '100x100'),
        }
      })
      return { allUserIds, userMap }
    },
  })

  const meta = metaQuery.data
  const allUserIds = meta?.allUserIds ?? []

  const feedQuery = useInfiniteQuery({
    queryKey: qk.feed.sessions(userId, allUserIds),
    enabled: !!userId && enabled && !!meta,
    staleTime: 60_000,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const uidFilter = allUserIds.map(uid => pb.filter('user = {:uid}', { uid })).join(' || ')
      const res = await pb.collection('sessions').getList(pageParam, PAGE_SIZE, {
        filter: uidFilter,
        sort: '-completed_at',
        $autoCancel: false,
      }).catch(() => ({ items: [] as any[], totalPages: 0 }))
      const userMap = meta?.userMap ?? {}
      return {
        items: ((res as any).items || []).map((s: any) => mapSession(s, userMap)),
        page: pageParam,
        totalPages: (res as any).totalPages || 0,
      }
    },
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  })

  const items = feedQuery.data?.pages.flatMap(p => p.items) ?? []

  const load = useCallback(async () => {
    if (!userId) return
    setEnabled((prev) => {
      if (prev) {
        qc.invalidateQueries({ queryKey: qk.feed.meta(userId) })
        qc.invalidateQueries({ queryKey: qk.feed.all })
      }
      return true
    })
  }, [userId, qc])

  const loadMore = useCallback(async () => {
    if (!feedQuery.hasNextPage || feedQuery.isFetchingNextPage) return
    await feedQuery.fetchNextPage()
  }, [feedQuery])

  return {
    items,
    loading: metaQuery.isFetching || feedQuery.isLoading,
    loadingMore: feedQuery.isFetchingNextPage,
    // Antes de la primera carga hasMore es true (igual que el hook previo).
    hasMore: !enabled || !meta ? true : (feedQuery.hasNextPage ?? false),
    load,
    loadMore,
  }
}

import { useState, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { utcToLocalDateStr } from '../lib/dateUtils'
import { WORKOUTS } from '../data/workouts'

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
const CACHE_TTL = 60_000 // 1 minute

export function useActivityFeed(userId: string | null) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const pageRef = useRef(1)
  const cacheRef = useRef<{ data: FeedItem[]; timestamp: number } | null>(null)
  const allUserIdsRef = useRef<string[]>([])
  const userMapRef = useRef<Map<string, { name: string; avatarUrl: string | null }>>(new Map())

  const load = useCallback(async () => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    // Check cache
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < CACHE_TTL) {
      setItems(cacheRef.current.data)
      return
    }

    setLoading(true)
    pageRef.current = 1
    try {
      // 1. Get who I follow
      const followsRes = await pb.collection('follows').getFullList({
        filter: pb.filter('follower = {:uid}', { uid: userId }),
        $autoCancel: false,
      })
      const followedIds = followsRes.map((r: any) => r.following as string)

      // 2. Fetch recent sessions for followed users + own sessions
      const allUserIds = [...new Set([userId, ...followedIds])]
      allUserIdsRef.current = allUserIds
      const uidFilter = allUserIds
        .map(uid => pb.filter('user = {:uid}', { uid }))
        .join(' || ')

      const [sessionsRes, usersRes] = await Promise.all([
        pb.collection('sessions').getList(1, PAGE_SIZE, {
          filter: uidFilter,
          sort: '-completed_at',
          $autoCancel: false,
        }).catch(() => ({ items: [] as any[], totalPages: 0 })),
        pb.collection('users').getList(1, allUserIds.length, {
          filter: allUserIds.map(uid => pb.filter('id = {:uid}', { uid })).join(' || '),
          $autoCancel: false,
        }).catch(() => ({ items: [] as any[] })),
      ])

      // Build user lookup
      const userMap = new Map<string, { name: string; avatarUrl: string | null }>()
      ;(usersRes as any).items.forEach((u: any) => {
        if (u) userMap.set(u.id, {
          name: u.display_name || u.email?.split('@')[0] || '?',
          avatarUrl: getUserAvatarUrl(u, '100x100'),
        })
      })
      userMapRef.current = userMap

      const sessData = sessionsRes as any
      const feedItems: FeedItem[] = (sessData.items || []).map((s: any) => {
        const workout = WORKOUTS[s.workout_key]
        return {
          id: s.id,
          userId: s.user,
          displayName: userMap.get(s.user)?.name || '?',
          avatarUrl: userMap.get(s.user)?.avatarUrl || null,
          completedAt: s.completed_at,
          date: utcToLocalDateStr(s.completed_at || s.created || ''),
          workoutKey: s.workout_key,
          workoutTitle: workout?.title || s.workout_key,
          phase: s.phase || 1,
          note: s.note || '',
        }
      })

      setItems(feedItems)
      setHasMore(pageRef.current < (sessData.totalPages || 0))
      cacheRef.current = { data: feedItems, timestamp: Date.now() }
    } catch (e: any) {
      if (e?.status !== 404 && e?.status !== 0) {
        console.warn('Activity feed load error:', e)
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  const loadMore = useCallback(async () => {
    if (!userId || loadingMore || !hasMore) return
    const allUserIds = allUserIdsRef.current
    if (allUserIds.length === 0) return

    setLoadingMore(true)
    const nextPage = pageRef.current + 1
    try {
      const uidFilter = allUserIds
        .map(uid => pb.filter('user = {:uid}', { uid }))
        .join(' || ')

      const sessionsRes = await pb.collection('sessions').getList(nextPage, PAGE_SIZE, {
        filter: uidFilter,
        sort: '-completed_at',
        $autoCancel: false,
      })

      const userMap = userMapRef.current
      const newItems: FeedItem[] = sessionsRes.items.map((s: any) => {
        const workout = WORKOUTS[s.workout_key]
        return {
          id: s.id,
          userId: s.user,
          displayName: userMap.get(s.user)?.name || '?',
          avatarUrl: userMap.get(s.user)?.avatarUrl || null,
          completedAt: s.completed_at,
          date: utcToLocalDateStr(s.completed_at || s.created || ''),
          workoutKey: s.workout_key,
          workoutTitle: workout?.title || s.workout_key,
          phase: s.phase || 1,
          note: s.note || '',
        }
      })

      pageRef.current = nextPage
      setItems(prev => {
        const combined = [...prev, ...newItems]
        // Update cache
        cacheRef.current = { data: combined, timestamp: Date.now() }
        return combined
      })
      setHasMore(nextPage < sessionsRes.totalPages)
    } catch {
      // silent
    } finally {
      setLoadingMore(false)
    }
  }, [userId, loadingMore, hasMore])

  return { items, loading, loadingMore, hasMore, load, loadMore }
}

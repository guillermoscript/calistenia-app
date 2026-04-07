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

const CACHE_TTL = 60_000 // 1 minute

export function useActivityFeed(userId: string | null) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const cacheRef = useRef<{ data: FeedItem[]; timestamp: number } | null>(null)

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
    try {
      // 1. Get who I follow
      const followsRes = await pb.collection('follows').getFullList({
        filter: pb.filter('follower = {:uid}', { uid: userId }),
        $autoCancel: false,
      })
      const followedIds = followsRes.map((r: any) => r.following as string)

      // 2. Fetch recent sessions for followed users + own sessions
      // Include own user so you can see comments/reactions on your workouts
      const allUserIds = [...new Set([userId, ...followedIds])]
      const uidFilter = allUserIds
        .map(uid => pb.filter('user = {:uid}', { uid }))
        .join(' || ')

      const [sessionsRes, usersRes] = await Promise.all([
        pb.collection('sessions').getList(1, 50, {
          filter: uidFilter,
          sort: '-completed_at',
          $autoCancel: false,
        }).catch(() => ({ items: [] as any[] })),
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

      // 3. Enrich and sort
      const allSessions = ((sessionsRes as any).items || [])
        .sort((a: any, b: any) =>
          new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
        )
        .slice(0, 50)

      const feedItems: FeedItem[] = allSessions.map((s: any) => {
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
      cacheRef.current = { data: feedItems, timestamp: Date.now() }
    } catch (e: any) {
      if (e?.status !== 404 && e?.status !== 0) {
        console.warn('Activity feed load error:', e)
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  return { items, loading, load }
}

import { useState, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { startOfWeekStr, localMidnightAsUTC, todayStr } from '../lib/dateUtils'
import dayjs from 'dayjs'

export interface LeaderboardEntry {
  userId: string
  displayName: string
  avatarUrl: string | null
  value: number
  isCurrentUser: boolean
}

export type LeaderboardCategory = 'sessions_week' | 'sessions_month' | 'streak' | 'pr_pullups' | 'pr_pushups' | 'pr_lsit' | 'pr_handstand'

export interface LeaderboardData {
  entries: Record<LeaderboardCategory, LeaderboardEntry[]>
  loading: boolean
  error: string | null
}

const CACHE_TTL = 30_000 // 30 seconds

export function useLeaderboard(userId: string | null) {
  const [entries, setEntries] = useState<Record<LeaderboardCategory, LeaderboardEntry[]>>({
    sessions_week: [], sessions_month: [], streak: [],
    pr_pullups: [], pr_pushups: [], pr_lsit: [], pr_handstand: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<{ data: typeof entries; timestamp: number } | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    // Check cache
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < CACHE_TTL) {
      setEntries(cacheRef.current.data)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Get who I follow
      const followsRes = await pb.collection('follows').getFullList({
        filter: pb.filter('follower = {:uid}', { uid: userId }),
        $autoCancel: false,
      })
      const followedIds = followsRes.map((r: any) => r.following as string)
      const allUserIds = [...new Set([userId, ...followedIds])]

      if (allUserIds.length <= 1 && followedIds.length === 0) {
        // Not following anyone
        setLoading(false)
        return
      }

      // 2. Fetch stats, settings, and session counts for all users
      const weekStartStr = localMidnightAsUTC(startOfWeekStr())
      const today = todayStr()
      const monthStartStr = localMidnightAsUTC(`${today.slice(0, 7)}-01`)

      // Parallel fetch for each user
      const userDataPromises = allUserIds.map(async (uid) => {
        const [userRes, statsRes, settingsRes, weekSessionsRes, monthSessionsRes] = await Promise.all([
          pb.collection('users').getOne(uid, { $autoCancel: false }).catch(() => null),
          pb.collection('user_stats').getFirstListItem(
            pb.filter('user = {:uid}', { uid }),
            { $autoCancel: false },
          ).catch(() => null),
          pb.collection('settings').getFirstListItem(
            pb.filter('user = {:uid}', { uid }),
            { $autoCancel: false },
          ).catch(() => null),
          pb.collection('sessions').getList(1, 1, {
            filter: pb.filter('user = {:uid} && completed_at >= {:start}', { uid, start: weekStartStr }),
            $autoCancel: false,
          }).catch(() => ({ totalItems: 0 })),
          pb.collection('sessions').getList(1, 1, {
            filter: pb.filter('user = {:uid} && completed_at >= {:start}', { uid, start: monthStartStr }),
            $autoCancel: false,
          }).catch(() => ({ totalItems: 0 })),
        ])

        const displayName = (userRes as any)?.display_name || (userRes as any)?.email?.split('@')[0] || '?'
        const avatarUrl = userRes ? getUserAvatarUrl(userRes as any, '100x100') : null
        const isMe = uid === userId

        return {
          userId: uid,
          displayName,
          avatarUrl,
          isCurrentUser: isMe,
          sessionsWeek: (weekSessionsRes as any)?.totalItems || 0,
          sessionsMonth: (monthSessionsRes as any)?.totalItems || 0,
          streak: (statsRes as any)?.workout_streak_current || 0,
          pr_pullups: (settingsRes as any)?.pr_pullups || 0,
          pr_pushups: (settingsRes as any)?.pr_pushups || 0,
          pr_lsit: (settingsRes as any)?.pr_lsit || 0,
          pr_handstand: (settingsRes as any)?.pr_handstand || 0,
        }
      })

      const userData = await Promise.all(userDataPromises)

      // 3. Build sorted leaderboards per category
      const build = (key: string): LeaderboardEntry[] =>
        userData
          .map(u => ({
            userId: u.userId,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
            value: (u as any)[key] as number,
            isCurrentUser: u.isCurrentUser,
          }))
          .sort((a, b) => b.value - a.value)

      const result: Record<LeaderboardCategory, LeaderboardEntry[]> = {
        sessions_week: build('sessionsWeek'),
        sessions_month: build('sessionsMonth'),
        streak: build('streak'),
        pr_pullups: build('pr_pullups'),
        pr_pushups: build('pr_pushups'),
        pr_lsit: build('pr_lsit'),
        pr_handstand: build('pr_handstand'),
      }

      setEntries(result)
      cacheRef.current = { data: result, timestamp: Date.now() }
    } catch (e: any) {
      // If follows collection doesn't exist or no data, just show empty — not an error
      if (e?.status === 404 || e?.status === 0) {
        // Collection not found or network error — silently return empty
      } else {
        console.warn('Leaderboard load error:', e)
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  return { entries, loading, error, load }
}

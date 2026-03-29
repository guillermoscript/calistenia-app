import { useState, useCallback } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { startOfWeekStr, todayStr, localMidnightAsUTC } from '../lib/dateUtils'

export interface CompareStats {
  sessionsThisWeek: number
  sessionsThisMonth: number
  phase: number
  /** Average sleep quality (1-5) over last 7 days, or null if no data */
  sleepAvgQuality: number | null
  /** Days with nutrition entries in last 7 days / 7 */
  nutritionAdherence: number | null
}

const EMPTY_STATS: CompareStats = {
  sessionsThisWeek: 0,
  sessionsThisMonth: 0,
  phase: 1,
  sleepAvgQuality: null,
  nutritionAdherence: null,
}

/**
 * Fetches extended compare stats for a given user from PocketBase.
 * Works for any user — only queries publicly readable collections
 * (sessions, settings, sleep_entries, nutrition_entries).
 */
export function useProfileCompare() {
  const [stats, setStats] = useState<CompareStats>(EMPTY_STATS)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (userId: string) => {
    const available = await isPocketBaseAvailable()
    if (!available) return

    setLoading(true)
    try {
      const today = todayStr()
      const weekStart = localMidnightAsUTC(startOfWeekStr())
      const monthStart = localMidnightAsUTC(`${today.slice(0, 7)}-01`)

      // 7 days ago for sleep/nutrition window
      const d = new Date()
      d.setDate(d.getDate() - 7)
      const sevenDaysAgo = d.toISOString()

      const [weekSessions, monthSessions, settingsRes, sleepRes, nutritionRes] = await Promise.all([
        pb.collection('sessions').getList(1, 1, {
          filter: pb.filter('user = {:uid} && completed_at >= {:start}', { uid: userId, start: weekStart }),
          $autoCancel: false,
        }).catch(() => ({ totalItems: 0 })),
        pb.collection('sessions').getList(1, 1, {
          filter: pb.filter('user = {:uid} && completed_at >= {:start}', { uid: userId, start: monthStart }),
          $autoCancel: false,
        }).catch(() => ({ totalItems: 0 })),
        pb.collection('settings').getFirstListItem(
          pb.filter('user = {:uid}', { uid: userId }),
          { $autoCancel: false },
        ).catch(() => null),
        pb.collection('sleep_entries').getList(1, 7, {
          filter: pb.filter('user = {:uid} && created >= {:start}', { uid: userId, start: sevenDaysAgo }),
          sort: '-date',
          $autoCancel: false,
        }).catch(() => null),
        pb.collection('nutrition_entries').getList(1, 50, {
          filter: pb.filter('user = {:uid} && created >= {:start}', { uid: userId, start: sevenDaysAgo }),
          $autoCancel: false,
        }).catch(() => null),
      ])

      // Sleep avg quality
      let sleepAvgQuality: number | null = null
      if (sleepRes && (sleepRes as any).items?.length > 0) {
        const items = (sleepRes as any).items as any[]
        const total = items.reduce((sum: number, e: any) => sum + (e.quality || 0), 0)
        sleepAvgQuality = Math.round((total / items.length) * 10) / 10
      }

      // Nutrition adherence: unique days with entries / 7
      let nutritionAdherence: number | null = null
      if (nutritionRes && (nutritionRes as any).items?.length > 0) {
        const items = (nutritionRes as any).items as any[]
        const uniqueDays = new Set(items.map((e: any) => e.date || e.created?.slice(0, 10)))
        nutritionAdherence = Math.round((uniqueDays.size / 7) * 100)
      }

      setStats({
        sessionsThisWeek: (weekSessions as any).totalItems || 0,
        sessionsThisMonth: (monthSessions as any).totalItems || 0,
        phase: (settingsRes as any)?.phase || 1,
        sleepAvgQuality,
        nutritionAdherence,
      })
    } catch (e) {
      console.warn('useProfileCompare: load error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  return { stats, loading, load }
}

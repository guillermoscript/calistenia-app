import { useState, useCallback, useRef } from 'react'
import { pb } from '../lib/pocketbase'
import dayjs from 'dayjs'
import i18n from '../lib/i18n'
import isoWeek from 'dayjs/plugin/isoWeek'
import tz from 'dayjs/plugin/timezone'
import utcPlugin from 'dayjs/plugin/utc'
import { getTimezone } from '../lib/dateUtils'

dayjs.extend(utcPlugin)
dayjs.extend(tz)
dayjs.extend(isoWeek)
import type { CardioSession, KmSplit } from '../types'

export interface CardioAggregateStats {
  totalDistance: number
  totalSessions: number
  totalDuration: number
  totalCalories: number
}

export interface PersonalRecords {
  best1km?: number // pace min/km
  best5km?: number
  best10km?: number
  longestDistance?: number
  highestElevation?: number
  bestPace?: number
}

export interface WeeklyTrendPoint {
  weekLabel: string    // e.g. "Mar 3"
  distance: number     // km
  sessions: number
}

const emptyStats: CardioAggregateStats = { totalDistance: 0, totalSessions: 0, totalDuration: 0, totalCalories: 0 }

export function useCardioStats(userId: string | null) {
  const [weeklyStats, setWeeklyStats] = useState<CardioAggregateStats>(emptyStats)
  const [monthlyStats, setMonthlyStats] = useState<CardioAggregateStats>(emptyStats)
  const [records, setRecords] = useState<PersonalRecords>({})
  const [lastSession, setLastSession] = useState<CardioSession | null>(null)
  const [weeklyTrend, setWeeklyTrend] = useState<WeeklyTrendPoint[]>([])
  const [loading, setLoading] = useState(false)
  const lastFetchRef = useRef<number>(0)
  const CACHE_TTL = 30_000 // 30 seconds

  const aggregate = (sessions: CardioSession[]): CardioAggregateStats => ({
    totalDistance: Math.round(sessions.reduce((a, s) => a + s.distance_km, 0) * 100) / 100,
    totalSessions: sessions.length,
    totalDuration: sessions.reduce((a, s) => a + s.duration_seconds, 0),
    totalCalories: sessions.reduce((a, s) => a + (s.calories_burned || 0), 0),
  })

  const loadStats = useCallback(async (force = false) => {
    if (!userId) return
    // Skip if recently fetched (prevents duplicate calls from App + page)
    if (!force && Date.now() - lastFetchRef.current < CACHE_TTL) return
    setLoading(true)
    lastFetchRef.current = Date.now()
    try {
      // Single fetch: all sessions this month (superset of weekly)
      // This eliminates 2 redundant API calls (was: weekly + monthly + all-time = 3)
      const allSessions = await (async (): Promise<CardioSession[]> => {
        try {
          const res = await pb.collection('cardio_sessions').getList(1, 500, {
            filter: pb.filter('user = {:userId}', { userId }),
            sort: '-started_at',
            fields: 'id,activity_type,distance_km,duration_seconds,avg_pace,elevation_gain,started_at,finished_at,note,calories_burned,max_pace,avg_speed_kmh,max_speed_kmh,splits',
          })
          return res.items.map((r: any) => ({
            id: r.id,
            user: userId,
            activity_type: r.activity_type,
            gps_points: [],
            distance_km: r.distance_km,
            duration_seconds: r.duration_seconds,
            avg_pace: r.avg_pace,
            elevation_gain: r.elevation_gain,
            started_at: r.started_at,
            finished_at: r.finished_at,
            note: r.note,
            calories_burned: r.calories_burned,
            max_pace: r.max_pace,
            avg_speed_kmh: r.avg_speed_kmh,
            max_speed_kmh: r.max_speed_kmh,
            splits: r.splits,
          }))
        } catch { return [] }
      })()

      // Partition into time ranges client-side (one pass)
      const tz = getTimezone()
      const nowLocal = dayjs().tz(tz)
      const weekStartMs = nowLocal.isoWeekday(1).startOf('day').valueOf()
      const monthStartMs = nowLocal.startOf('month').valueOf()

      const weeklySessions: CardioSession[] = []
      const monthlySessions: CardioSession[] = []

      for (const s of allSessions) {
        const t = new Date(s.started_at).getTime()
        if (t >= monthStartMs) monthlySessions.push(s)
        if (t >= weekStartMs) weeklySessions.push(s)
      }

      setWeeklyStats(aggregate(weeklySessions))
      setMonthlyStats(aggregate(monthlySessions))

      if (weeklySessions.length > 0) {
        setLastSession(weeklySessions[0])
      } else if (monthlySessions.length > 0) {
        setLastSession(monthlySessions[0])
      } else if (allSessions.length > 0) {
        setLastSession(allSessions[0])
      }

      // Personal records from all data (already fetched)
      const pr: PersonalRecords = {}
      let bestPace = Infinity
      let longestDist = 0
      let highestElev = 0

      for (const session of allSessions) {
        if (session.distance_km > longestDist) longestDist = session.distance_km
        if (session.elevation_gain > highestElev) highestElev = session.elevation_gain
        if (session.max_pace && session.max_pace > 0 && session.max_pace < bestPace) {
          bestPace = session.max_pace
        }

        if (session.splits && Array.isArray(session.splits)) {
          for (const split of session.splits as KmSplit[]) {
            if (split.km === 1 || (split.km >= 0.9 && split.km <= 1.1)) {
              if (!pr.best1km || split.pace < pr.best1km) pr.best1km = split.pace
            }
          }

          if (session.splits.length >= 5) {
            const first5 = (session.splits as KmSplit[]).slice(0, 5)
            const avg5pace = first5.reduce((a, s) => a + s.pace, 0) / 5
            if (!pr.best5km || avg5pace < pr.best5km) pr.best5km = Math.round(avg5pace * 100) / 100
          }

          if (session.splits.length >= 10) {
            const first10 = (session.splits as KmSplit[]).slice(0, 10)
            const avg10pace = first10.reduce((a, s) => a + s.pace, 0) / 10
            if (!pr.best10km || avg10pace < pr.best10km) pr.best10km = Math.round(avg10pace * 100) / 100
          }
        }
      }

      if (longestDist > 0) pr.longestDistance = Math.round(longestDist * 100) / 100
      if (highestElev > 0) pr.highestElevation = Math.round(highestElev)
      if (bestPace < Infinity) pr.bestPace = bestPace

      setRecords(pr)

      // Weekly trend: aggregate distance per week for the last 8 weeks
      const WEEKS = 8
      const trend: WeeklyTrendPoint[] = []
      for (let w = WEEKS - 1; w >= 0; w--) {
        const wStartDay = nowLocal.isoWeekday(1).subtract(w, 'week').startOf('day')
        const wStartMs = wStartDay.valueOf()
        const wEndMs = wStartDay.add(7, 'day').valueOf()

        let dist = 0
        let count = 0
        for (const s of allSessions) {
          const t = new Date(s.started_at).getTime()
          if (t >= wStartMs && t < wEndMs) {
            dist += s.distance_km
            count++
          }
        }
        trend.push({
          weekLabel: wStartDay.toDate().toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' }),
          distance: Math.round(dist * 10) / 10,
          sessions: count,
        })
      }
      setWeeklyTrend(trend)
    } finally {
      setLoading(false)
    }
  }, [userId])

  return { weeklyStats, monthlyStats, records, lastSession, weeklyTrend, loading, loadStats }
}

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import dayjs from 'dayjs'
import i18n from 'i18next'
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

/** Suma distancia, sesiones, duración y calorías de un array de sesiones. */
function aggregate(sessions: CardioSession[]): CardioAggregateStats {
  return {
    totalDistance: Math.round(sessions.reduce((a, s) => a + s.distance_km, 0) * 100) / 100,
    totalSessions: sessions.length,
    totalDuration: sessions.reduce((a, s) => a + s.duration_seconds, 0),
    totalCalories: sessions.reduce((a, s) => a + (s.calories_burned || 0), 0),
  }
}

/**
 * queryFn: obtiene todas las sesiones cardio del usuario desde PocketBase.
 * Devuelve el array crudo para que los derivados se calculen en useMemo.
 */
async function fetchCardioSessions(userId: string): Promise<CardioSession[]> {
  try {
    // getFullList elimina el límite implícito de 500: obtiene todas las sesiones del usuario
    const res = await pb.collection('cardio_sessions').getFullList({
      filter: pb.filter('user = {:userId}', { userId }),
      sort: '-started_at',
      fields: 'id,activity_type,distance_km,duration_seconds,avg_pace,elevation_gain,started_at,finished_at,note,calories_burned,max_pace,avg_speed_kmh,max_speed_kmh,splits',
    })
    return res.map((r: any) => ({
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
  } catch {
    return []
  }
}

export function useCardioStats(userId: string | null) {
  // Timezone y locale leídos en render para que entren en la query key.
  // BUGFIX: si tz o locale cambian, la key cambia y TanStack Query recalcula.
  const userTz = getTimezone()
  const locale = i18n.language

  const query = useQuery({
    queryKey: qk.cardioStats(userId, userTz, locale),
    staleTime: 30_000,
    enabled: !!userId,
    queryFn: () => fetchCardioSessions(userId!),
  })

  const allSessions = query.data ?? []

  // — weeklyStats —
  const weeklyStats = useMemo((): CardioAggregateStats => {
    if (allSessions.length === 0) return emptyStats
    const nowLocal = dayjs().tz(userTz)
    const weekStartMs = nowLocal.isoWeekday(1).startOf('day').valueOf()
    const weeklySessions = allSessions.filter(s => new Date(s.started_at).getTime() >= weekStartMs)
    return aggregate(weeklySessions)
  }, [allSessions, userTz])

  // — monthlyStats —
  const monthlyStats = useMemo((): CardioAggregateStats => {
    if (allSessions.length === 0) return emptyStats
    const nowLocal = dayjs().tz(userTz)
    const monthStartMs = nowLocal.startOf('month').valueOf()
    const monthlySessions = allSessions.filter(s => new Date(s.started_at).getTime() >= monthStartMs)
    return aggregate(monthlySessions)
  }, [allSessions, userTz])

  // — records (PRs personales) —
  const records = useMemo((): PersonalRecords => {
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

    return pr
  }, [allSessions])

  // — lastSession: primera sesión del array (ya viene ordenado por -started_at) —
  const lastSession = useMemo((): CardioSession | null => {
    if (allSessions.length === 0) return null
    const nowLocal = dayjs().tz(userTz)
    const weekStartMs = nowLocal.isoWeekday(1).startOf('day').valueOf()
    const monthStartMs = nowLocal.startOf('month').valueOf()

    const weeklyFirst = allSessions.find(s => new Date(s.started_at).getTime() >= weekStartMs)
    if (weeklyFirst) return weeklyFirst

    const monthlyFirst = allSessions.find(s => new Date(s.started_at).getTime() >= monthStartMs)
    if (monthlyFirst) return monthlyFirst

    return allSessions[0]
  }, [allSessions, userTz])

  // — weeklyTrend: distancia acumulada por semana, últimas 8 semanas —
  const weeklyTrend = useMemo((): WeeklyTrendPoint[] => {
    const WEEKS = 8
    const nowLocal = dayjs().tz(userTz)
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
        weekLabel: wStartDay.toDate().toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
        distance: Math.round(dist * 10) / 10,
        sessions: count,
      })
    }
    return trend
  }, [allSessions, userTz, locale])

  // — loadStats: compatibilidad con llamadores que invocan loadStats() manualmente —
  const loadStats = async (force = false) => {
    // force se ignora: TanStack Query gestiona el TTL vía staleTime.
    // Una invalidación explícita del caller es la alternativa idiomática;
    // aquí se expone refetch() para no romper la interfaz pública.
    if (!userId) return
    await query.refetch()
  }

  return {
    weeklyStats,
    monthlyStats,
    records,
    lastSession,
    weeklyTrend,
    loading: query.isLoading,
    loadStats,
  }
}

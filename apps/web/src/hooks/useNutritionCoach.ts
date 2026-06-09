import { useState, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { AI_API_URL } from '../lib/ai-api'
import { todayStr, utcToLocalDateStr } from '../lib/dateUtils'
import type {
  NutritionCoachInsight,
  NutritionBadge,
  NutritionEntry,
  QualityScore,
  BadgeType,
} from '../types'
import { BADGE_DEFINITIONS } from '../lib/badge-definitions'

const SCORE_MAP: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 }
const REVERSE_MAP: Record<number, QualityScore> = { 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'E' }

export function useNutritionCoach(userId: string | null) {
  const [dailyInsight, setDailyInsight] = useState<NutritionCoachInsight | null>(null)
  const [weeklyInsight, setWeeklyInsight] = useState<NutritionCoachInsight | null>(null)
  const [badges, setBadges] = useState<NutritionBadge[]>([])
  const [generatingWeekly, setGeneratingWeekly] = useState(false)
  const loadedBadges = useRef(false)

  // ─── Load badges ────────────────────────────────────────────────────────
  const loadBadges = useCallback(async () => {
    if (!userId || loadedBadges.current) return
    loadedBadges.current = true
    try {
      const res = await pb.collection('nutrition_badges').getList(1, 50, {
        filter: pb.filter('user = {:uid}', { uid: userId }),
        sort: '-earned_at',
        $autoCancel: false,
      })
      setBadges(res.items.map((r: any) => ({
        id: r.id,
        user: r.user,
        badgeType: r.badge_type as BadgeType,
        earnedAt: r.earned_at,
        metadata: r.metadata || {},
      })))
    } catch {
      loadedBadges.current = false
    }
  }, [userId])

  // ─── Get daily insight ──────────────────────────────────────────────────
  const getDailyInsight = useCallback(async (date: string): Promise<NutritionCoachInsight | null> => {
    if (!userId) return null
    try {
      const res = await pb.collection('nutrition_coach_insights').getFirstListItem(
        pb.filter('user = {:uid} && type = "daily" && period_start = {:date}', {
          uid: userId,
          date: `${date} 00:00:00.000Z`,
        }),
        { $autoCancel: false }
      )
      const insight: NutritionCoachInsight = {
        id: res.id,
        user: res.user as string,
        type: 'daily',
        periodStart: date,
        overallScore: (res.overall_score as QualityScore) || undefined,
        insights: res.insights as any || undefined,
        coachMessage: res.coach_message as string || undefined,
        streaks: res.streaks as any || undefined,
        generatedAt: res.generated_at as string || undefined,
      }
      setDailyInsight(insight)
      return insight
    } catch {
      return null
    }
  }, [userId])

  // ─── Upsert daily insight ───────────────────────────────────────────────
  const upsertDailyInsight = useCallback(async (
    date: string,
    overallScore: QualityScore,
    entries: NutritionEntry[],
  ): Promise<{ insight: NutritionCoachInsight; newBadges: BadgeType[] }> => {
    if (!userId) return { insight: { type: 'daily', periodStart: date, overallScore }, newBadges: [] }

    // Compute streaks by checking previous day
    let streaks = { currentGood: 0, bestGood: 0, currentBad: 0 }
    try {
      const yesterday = new Date(date)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().slice(0, 10)
      const prev = await getDailyInsight(yesterdayStr)
      if (prev?.streaks) {
        const prevScore = prev.overallScore
        const isGood = overallScore === 'A' || overallScore === 'B'
        const prevWasGood = prevScore === 'A' || prevScore === 'B'
        const isBad = overallScore === 'D' || overallScore === 'E'
        const prevWasBad = prevScore === 'D' || prevScore === 'E'

        streaks.currentGood = isGood ? (prevWasGood ? prev.streaks.currentGood + 1 : 1) : 0
        streaks.currentBad = isBad ? (prevWasBad ? prev.streaks.currentBad + 1 : 1) : 0
        streaks.bestGood = Math.max(streaks.currentGood, prev.streaks.bestGood)
      } else {
        // No previous data — start fresh
        streaks.currentGood = (overallScore === 'A' || overallScore === 'B') ? 1 : 0
        streaks.currentBad = (overallScore === 'D' || overallScore === 'E') ? 1 : 0
        streaks.bestGood = streaks.currentGood
      }
    } catch {
      streaks.currentGood = (overallScore === 'A' || overallScore === 'B') ? 1 : 0
      streaks.currentBad = (overallScore === 'D' || overallScore === 'E') ? 1 : 0
      streaks.bestGood = streaks.currentGood
    }

    const data = {
      user: userId,
      type: 'daily',
      period_start: `${date} 00:00:00.000Z`,
      overall_score: overallScore,
      streaks,
    }

    let insight: NutritionCoachInsight = {
      type: 'daily',
      periodStart: date,
      overallScore,
      streaks,
    }

    try {
      // Try update existing
      const existing = await pb.collection('nutrition_coach_insights').getFirstListItem(
        pb.filter('user = {:uid} && type = "daily" && period_start = {:date}', {
          uid: userId,
          date: `${date} 00:00:00.000Z`,
        }),
        { $autoCancel: false }
      )
      await pb.collection('nutrition_coach_insights').update(existing.id, data)
      insight.id = existing.id
    } catch {
      // Create new
      try {
        const rec = await pb.collection('nutrition_coach_insights').create(data)
        insight.id = rec.id
      } catch { /* unique constraint — race condition, ignore */ }
    }

    setDailyInsight(insight)

    // Check badges
    const newBadges = await checkAndAwardBadges(overallScore, entries, streaks)
    return { insight, newBadges }
  }, [userId, getDailyInsight])

  // ─── Get weekly insight ─────────────────────────────────────────────────
  const getWeeklyInsight = useCallback(async (weekStart: string): Promise<NutritionCoachInsight | null> => {
    if (!userId) return null
    try {
      const res = await pb.collection('nutrition_coach_insights').getFirstListItem(
        pb.filter('user = {:uid} && type = "weekly" && period_start = {:date}', {
          uid: userId,
          date: `${weekStart} 00:00:00.000Z`,
        }),
        { $autoCancel: false }
      )
      const insight: NutritionCoachInsight = {
        id: res.id,
        user: res.user as string,
        type: 'weekly',
        periodStart: weekStart,
        overallScore: (res.overall_score as QualityScore) || undefined,
        insights: res.insights as any || undefined,
        coachMessage: res.coach_message as string || undefined,
        streaks: res.streaks as any || undefined,
        generatedAt: res.generated_at as string || undefined,
      }
      setWeeklyInsight(insight)
      return insight
    } catch {
      return null
    }
  }, [userId])

  // ─── Generate weekly insight ────────────────────────────────────────────
  const generateWeeklyInsight = useCallback(async (
    weekStart: string,
    entries: NutritionEntry[],
    goal?: string,
    previousWeekScore?: string,
  ): Promise<NutritionCoachInsight | null> => {
    if (!userId) return null
    setGeneratingWeekly(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (pb.authStore.token) {
        headers['Authorization'] = `Bearer ${pb.authStore.token}`
      }

      const meals = entries.map(e => ({
        mealType: e.mealType,
        foods: e.foods.map(f => f.name).join(', '),
        totalCalories: e.totalCalories,
        qualityScore: e.qualityScore,
        loggedAt: e.loggedAt,
      }))

      const res = await fetch(`${AI_API_URL}/api/generate-weekly-insight`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ meals, goal, previous_week_score: previousWeekScore }),
      })

      if (!res.ok) return null
      const data = await res.json()

      const insightData = {
        user: userId,
        type: 'weekly',
        period_start: `${weekStart} 00:00:00.000Z`,
        overall_score: data.overall_score,
        insights: { patterns: data.patterns, highlights: data.highlights, concerns: data.concerns },
        coach_message: data.coach_message,
      }

      let insight: NutritionCoachInsight = {
        type: 'weekly',
        periodStart: weekStart,
        overallScore: data.overall_score,
        insights: { patterns: data.patterns, highlights: data.highlights, concerns: data.concerns },
        coachMessage: data.coach_message,
      }

      // Save to PB
      try {
        const existing = await pb.collection('nutrition_coach_insights').getFirstListItem(
          pb.filter('user = {:uid} && type = "weekly" && period_start = {:date}', {
            uid: userId,
            date: `${weekStart} 00:00:00.000Z`,
          }),
          { $autoCancel: false }
        )
        await pb.collection('nutrition_coach_insights').update(existing.id, insightData)
        insight.id = existing.id
      } catch {
        try {
          const rec = await pb.collection('nutrition_coach_insights').create(insightData)
          insight.id = rec.id
        } catch { /* unique constraint race */ }
      }

      setWeeklyInsight(insight)
      return insight
    } catch {
      return null
    } finally {
      setGeneratingWeekly(false)
    }
  }, [userId])

  // ─── Badge checking ─────────────────────────────────────────────────────
  const checkAndAwardBadges = useCallback(async (
    dailyScore: QualityScore,
    entries: NutritionEntry[],
    streaks: { currentGood: number; bestGood: number; currentBad: number },
  ): Promise<BadgeType[]> => {
    if (!userId) return []
    const awarded: BadgeType[] = []
    const existingTypes = new Set(badges.map(b => b.badgeType))

    const tryAward = async (type: BadgeType, metadata: Record<string, unknown> = {}) => {
      // One-time badges: check if already awarded
      if (BADGE_DEFINITIONS[type].oneTime && existingTypes.has(type)) return
      try {
        await pb.collection('nutrition_badges').create({
          user: userId,
          badge_type: type,
          metadata,
        })
        awarded.push(type)
        setBadges(prev => [{
          user: userId,
          badgeType: type,
          metadata,
        } as NutritionBadge, ...prev])
      } catch { /* ignore duplicate / error */ }
    }

    // first_a: any meal with score A today
    if (entries.some(e => e.qualityScore === 'A')) {
      await tryAward('first_a')
    }

    // balanced_day: all scored entries are A or B
    const scored = entries.filter(e => e.qualityScore)
    if (scored.length >= 2 && scored.every(e => e.qualityScore === 'A' || e.qualityScore === 'B')) {
      await tryAward('balanced_day', { date: todayStr(), mealCount: scored.length })
    }

    // streak badges
    if (streaks.currentGood >= 3) await tryAward('streak_3', { endDate: todayStr() })
    if (streaks.currentGood >= 7) await tryAward('streak_7', { endDate: todayStr() })
    if (streaks.currentGood >= 30) await tryAward('streak_30', { endDate: todayStr() })

    return awarded
  }, [userId, badges])

  return {
    dailyInsight,
    weeklyInsight,
    badges,
    generatingWeekly,

    loadBadges,
    getDailyInsight,
    upsertDailyInsight,
    getWeeklyInsight,
    generateWeeklyInsight,
    checkAndAwardBadges,
  }
}

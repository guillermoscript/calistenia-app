import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { AI_API_URL } from '../lib/ai-api'
import { todayStr } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import type {
  NutritionCoachInsight,
  NutritionBadge,
  NutritionEntry,
  QualityScore,
  BadgeType,
} from '../types'
import { BADGE_DEFINITIONS } from '../lib/badge-definitions'

// ─── Helpers de mapeo ────────────────────────────────────────────────────────

/** Convierte un registro PB a NutritionCoachInsight tipado. */
function mapInsight(res: any, type: 'daily' | 'weekly', periodStart: string): NutritionCoachInsight {
  return {
    id: res.id,
    user: res.user as string,
    type,
    periodStart,
    overallScore: (res.overall_score as QualityScore) || undefined,
    insights: res.insights || undefined,
    coachMessage: res.coach_message as string || undefined,
    streaks: res.streaks || undefined,
    generatedAt: res.generated_at as string || undefined,
  }
}

// ─── Query fns reutilizables (fuera del hook para estabilidad referencial) ───

async function fetchBadges(userId: string): Promise<NutritionBadge[]> {
  const res = await pb.collection('nutrition_badges').getList(1, 50, {
    filter: pb.filter('user = {:uid}', { uid: userId }),
    sort: '-earned_at',
    $autoCancel: false,
  })
  return res.items.map((r: any) => ({
    id: r.id,
    user: r.user,
    badgeType: r.badge_type as BadgeType,
    earnedAt: r.earned_at,
    metadata: r.metadata || {},
  }))
}

async function fetchDailyInsight(userId: string, date: string): Promise<NutritionCoachInsight | null> {
  try {
    const res = await pb.collection('nutrition_coach_insights').getFirstListItem(
      pb.filter('user = {:uid} && type = "daily" && period_start = {:date}', {
        uid: userId,
        date: `${date} 00:00:00.000Z`,
      }),
      { $autoCancel: false }
    )
    return mapInsight(res, 'daily', date)
  } catch {
    return null
  }
}

async function fetchWeeklyInsight(userId: string, weekStart: string): Promise<NutritionCoachInsight | null> {
  try {
    const res = await pb.collection('nutrition_coach_insights').getFirstListItem(
      pb.filter('user = {:uid} && type = "weekly" && period_start = {:date}', {
        uid: userId,
        date: `${weekStart} 00:00:00.000Z`,
      }),
      { $autoCancel: false }
    )
    return mapInsight(res, 'weekly', weekStart)
  } catch {
    return null
  }
}

// ─── Hook principal ──────────────────────────────────────────────────────────

export function useNutritionCoach(userId: string | null) {
  const qc = useQueryClient()

  // Estado local para la fecha activa de cada insight — permite que useQuery
  // reaccione cuando getDailyInsight / getWeeklyInsight cambian la fecha consultada.
  const [currentDate, setCurrentDate] = useState<string | null>(null)
  const [currentWeekStart, setCurrentWeekStart] = useState<string | null>(null)

  // ─── Badges: staleTime Infinity — no cambian a menos que se ganen nuevos ──
  const badgesKey = qk.nutrition.badges(userId)
  const { data: badges = [] } = useQuery<NutritionBadge[]>({
    queryKey: badgesKey,
    queryFn: () => fetchBadges(userId!),
    enabled: !!userId,
    staleTime: Infinity,
  })

  // ─── Daily insight: reactivo a currentDate ────────────────────────────────
  const dailyKey = qk.nutrition.insightDaily(userId, currentDate ?? '')
  const { data: dailyInsight = null } = useQuery<NutritionCoachInsight | null>({
    queryKey: dailyKey,
    queryFn: () => fetchDailyInsight(userId!, currentDate!),
    enabled: !!userId && !!currentDate,
    staleTime: 5 * 60 * 1000,
  })

  // ─── Weekly insight: reactivo a currentWeekStart ──────────────────────────
  const weeklyKey = qk.nutrition.insightWeekly(userId, currentWeekStart ?? '')
  const { data: weeklyInsight = null } = useQuery<NutritionCoachInsight | null>({
    queryKey: weeklyKey,
    queryFn: () => fetchWeeklyInsight(userId!, currentWeekStart!),
    enabled: !!userId && !!currentWeekStart,
    staleTime: 5 * 60 * 1000,
  })

  // ─── loadBadges: dispara refetch de la query de badges ───────────────────
  // Mantiene la firma pública () => Promise<void> del hook original.
  // OJO: la key se construye inline — badgesKey es un array nuevo en cada
  // render y como dep haría inestable a loadBadges. NutritionPage lo usa en un
  // useEffect([loadBadges]): con la dep inestable, cada refetch re-renderiza y
  // re-dispara el efecto → invalidate → refetch → bucle infinito de requests
  // a nutrition_badges (lo cazó la suite E2E: ERR_INSUFFICIENT_RESOURCES).
  const loadBadges = useCallback(async () => {
    if (!userId) return
    await qc.invalidateQueries({ queryKey: qk.nutrition.badges(userId) })
  }, [userId, qc])

  // ─── getDailyInsight: activa la fecha y devuelve el resultado de caché ────
  const getDailyInsight = useCallback(async (date: string): Promise<NutritionCoachInsight | null> => {
    if (!userId) return null
    setCurrentDate(date)
    // Fuerza carga inmediata y devuelve resultado; setQueryData lo deja en caché.
    const key = qk.nutrition.insightDaily(userId, date)
    const result = await qc.fetchQuery<NutritionCoachInsight | null>({
      queryKey: key,
      queryFn: () => fetchDailyInsight(userId, date),
      staleTime: 5 * 60 * 1000,
    })
    return result
  }, [userId, qc])

  // ─── upsertDailyInsight ───────────────────────────────────────────────────
  // mutationFn calcula rachas, persiste en PB y otorga badges; devuelve
  // { insight, newBadges } con los mismos datos que el hook original.
  // onSuccess actualiza la caché directamente con el resultado conocido.
  const upsertMutation = useMutation({
    mutationFn: async ({
      date,
      overallScore,
      entries,
      _badgesSnapshot,
    }: {
      date: string
      overallScore: QualityScore
      entries: NutritionEntry[]
      _badgesSnapshot: NutritionBadge[]
    }): Promise<{ insight: NutritionCoachInsight; newBadges: BadgeType[] }> => {
      if (!userId) return { insight: { type: 'daily', periodStart: date, overallScore }, newBadges: [] }

      // Calcula rachas consultando el día anterior
      let streaks = { currentGood: 0, bestGood: 0, currentBad: 0 }
      try {
        const yesterday = new Date(date)
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toISOString().slice(0, 10)
        const prev = await fetchDailyInsight(userId, yesterdayStr)
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
          streaks.currentGood = (overallScore === 'A' || overallScore === 'B') ? 1 : 0
          streaks.currentBad = (overallScore === 'D' || overallScore === 'E') ? 1 : 0
          streaks.bestGood = streaks.currentGood
        }
      } catch {
        streaks.currentGood = (overallScore === 'A' || overallScore === 'B') ? 1 : 0
        streaks.currentBad = (overallScore === 'D' || overallScore === 'E') ? 1 : 0
        streaks.bestGood = streaks.currentGood
      }

      const pbData = {
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
        // Intenta actualizar registro existente
        const existing = await pb.collection('nutrition_coach_insights').getFirstListItem(
          pb.filter('user = {:uid} && type = "daily" && period_start = {:date}', {
            uid: userId,
            date: `${date} 00:00:00.000Z`,
          }),
          { $autoCancel: false }
        )
        await pb.collection('nutrition_coach_insights').update(existing.id, pbData)
        insight.id = existing.id
      } catch {
        try {
          const rec = await pb.collection('nutrition_coach_insights').create(pbData)
          insight.id = rec.id
        } catch { /* restricción unique por condición de carrera — ignorar */ }
      }

      // Verifica y otorga badges dentro de mutationFn para poder devolver
      // newBadges en el resultado (misma firma que el hook original).
      const existingTypes = new Set(_badgesSnapshot.map(b => b.badgeType))
      const awarded: BadgeType[] = []
      const newBadgeRecords: NutritionBadge[] = []

      const tryAward = async (type: BadgeType, metadata: Record<string, unknown> = {}) => {
        if (BADGE_DEFINITIONS[type].oneTime && existingTypes.has(type)) return
        try {
          await pb.collection('nutrition_badges').create({ user: userId, badge_type: type, metadata })
          awarded.push(type)
          newBadgeRecords.push({ user: userId, badgeType: type, metadata } as NutritionBadge)
        } catch { /* ignorar duplicado */ }
      }

      if (entries.some(e => e.qualityScore === 'A')) await tryAward('first_a')
      const scored = entries.filter(e => e.qualityScore)
      if (scored.length >= 2 && scored.every(e => e.qualityScore === 'A' || e.qualityScore === 'B')) {
        await tryAward('balanced_day', { date: todayStr(), mealCount: scored.length })
      }
      if (streaks.currentGood >= 3) await tryAward('streak_3', { endDate: todayStr() })
      if (streaks.currentGood >= 7) await tryAward('streak_7', { endDate: todayStr() })
      if (streaks.currentGood >= 30) await tryAward('streak_30', { endDate: todayStr() })

      return { insight, newBadges: awarded, _newBadgeRecords: newBadgeRecords } as any
    },
    onSuccess: (result: any, { date }) => {
      // Actualiza caché del daily insight directamente (resultado conocido)
      const key = qk.nutrition.insightDaily(userId, date)
      qc.setQueryData(key, result.insight)
      setCurrentDate(date)

      // Prepende los nuevos badges al caché — evita round-trip al servidor
      if (result._newBadgeRecords?.length > 0) {
        qc.setQueryData<NutritionBadge[]>(badgesKey, prev =>
          [...(result._newBadgeRecords as NutritionBadge[]), ...(prev ?? [])]
        )
      }
    },
  })

  const upsertDailyInsight = useCallback(async (
    date: string,
    overallScore: QualityScore,
    entries: NutritionEntry[],
  ): Promise<{ insight: NutritionCoachInsight; newBadges: BadgeType[] }> => {
    if (!userId) return { insight: { type: 'daily', periodStart: date, overallScore }, newBadges: [] }
    // Captura snapshot de badges actuales para la lógica de one-time dentro de mutationFn
    const result = await upsertMutation.mutateAsync({ date, overallScore, entries, _badgesSnapshot: badges })
    return { insight: (result as any).insight, newBadges: (result as any).newBadges }
  }, [userId, upsertMutation, badges])

  // ─── getWeeklyInsight: activa la semana y devuelve resultado de caché ─────
  const getWeeklyInsight = useCallback(async (weekStart: string): Promise<NutritionCoachInsight | null> => {
    if (!userId) return null
    setCurrentWeekStart(weekStart)
    const key = qk.nutrition.insightWeekly(userId, weekStart)
    const result = await qc.fetchQuery<NutritionCoachInsight | null>({
      queryKey: key,
      queryFn: () => fetchWeeklyInsight(userId, weekStart),
      staleTime: 5 * 60 * 1000,
    })
    return result
  }, [userId, qc])

  // ─── generateWeeklyInsight ────────────────────────────────────────────────
  const generateWeeklyMutation = useMutation({
    mutationFn: async ({
      weekStart,
      entries,
      goal,
      previousWeekScore,
    }: {
      weekStart: string
      entries: NutritionEntry[]
      goal?: string
      previousWeekScore?: string
    }): Promise<NutritionCoachInsight | null> => {
      if (!userId) return null

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

      // Persiste en PB
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
        } catch { /* restricción unique por condición de carrera */ }
      }

      return insight
    },
    onSuccess: (insight, { weekStart }) => {
      if (!insight || !userId) return
      // Actualiza caché del weekly insight directamente (resultado conocido)
      const key = qk.nutrition.insightWeekly(userId, weekStart)
      qc.setQueryData(key, insight)
      setCurrentWeekStart(weekStart)
    },
  })

  const generateWeeklyInsight = useCallback(async (
    weekStart: string,
    entries: NutritionEntry[],
    goal?: string,
    previousWeekScore?: string,
  ): Promise<NutritionCoachInsight | null> => {
    if (!userId) return null
    return generateWeeklyMutation.mutateAsync({ weekStart, entries, goal, previousWeekScore })
      .catch(() => null)
  }, [userId, generateWeeklyMutation])

  // ─── checkAndAwardBadges público (misma firma que el original) ────────────
  // También usado internamente desde upsertDailyInsight cuando el llamador externo
  // necesita gestionar badges de forma independiente.
  const checkAndAwardBadges = useCallback(async (
    dailyScore: QualityScore,
    entries: NutritionEntry[],
    streaks: { currentGood: number; bestGood: number; currentBad: number },
  ): Promise<BadgeType[]> => {
    if (!userId) return []
    const awarded: BadgeType[] = []
    const existingTypes = new Set(badges.map(b => b.badgeType))

    const tryAward = async (type: BadgeType, metadata: Record<string, unknown> = {}) => {
      // Badges de una sola vez: verificar si ya fue otorgado
      if (BADGE_DEFINITIONS[type].oneTime && existingTypes.has(type)) return
      try {
        await pb.collection('nutrition_badges').create({ user: userId, badge_type: type, metadata })
        awarded.push(type)
        // Actualiza caché de badges con el nuevo badge (setQueryData directo)
        qc.setQueryData<NutritionBadge[]>(badgesKey, prev => [
          { user: userId, badgeType: type, metadata } as NutritionBadge,
          ...(prev ?? []),
        ])
      } catch { /* ignorar duplicado / error */ }
    }

    // first_a: cualquier comida con score A hoy
    if (entries.some(e => e.qualityScore === 'A')) await tryAward('first_a')

    // balanced_day: todas las entradas puntuadas son A o B
    const scored = entries.filter(e => e.qualityScore)
    if (scored.length >= 2 && scored.every(e => e.qualityScore === 'A' || e.qualityScore === 'B')) {
      await tryAward('balanced_day', { date: todayStr(), mealCount: scored.length })
    }

    // Badges de racha
    if (streaks.currentGood >= 3) await tryAward('streak_3', { endDate: todayStr() })
    if (streaks.currentGood >= 7) await tryAward('streak_7', { endDate: todayStr() })
    if (streaks.currentGood >= 30) await tryAward('streak_30', { endDate: todayStr() })

    return awarded
  }, [userId, badges, qc, badgesKey])

  // ─── Forma pública — byte-idéntica al hook original ───────────────────────
  return {
    dailyInsight,
    weeklyInsight,
    badges,
    // !isPaused: offline RQ pausa la mutación con isPending=true → el spinner
    // quedaría colgado. Tratamos la mutación pausada como no-activa.
    generatingWeekly: generateWeeklyMutation.isPending && !generateWeeklyMutation.isPaused,

    loadBadges,
    getDailyInsight,
    upsertDailyInsight,
    getWeeklyInsight,
    generateWeeklyInsight,
    checkAndAwardBadges,
  }
}

import { storage } from '../platform'
import { useCallback, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import i18n from 'i18next'
import { pb } from '../lib/pocketbase'
import { AI_API_URL } from '../lib/ai-api'
import { op } from '../lib/analytics'
import { qk } from '../lib/query-keys'
import { todayStr, daysAgoStr, addDays, localMidnightAsUTC, utcToLocalDateStr, nowLocalForPB } from '../lib/dateUtils'
import type {
  NutritionEntry,
  NutritionSource,
  NutritionGoal,
  NutritionGoalType,
  ActivityLevel,
  Sex,
  DailyTotals,
  FoodItem,
  QualityScore,
  QualityBreakdown,
  QualitySuggestion,
} from '../types'

/** Resolve photo URLs from a PocketBase record */
function resolvePhotoUrls(rec: any): string[] {
  const urls: string[] = []
  if (Array.isArray(rec.photos) && rec.photos.length > 0) {
    for (const filename of rec.photos) {
      urls.push(pb.files.getURL(rec, filename))
    }
  }
  return urls
}

/** Map a PocketBase nutrition_entries record to a NutritionEntry */
function mapPBToEntry(r: any): NutritionEntry {
  return {
    id: r.id,
    user: r.user,
    photoUrls: resolvePhotoUrls(r),
    mealType: r.meal_type,
    foods: Array.isArray(r.foods) ? r.foods : [],
    totalCalories: Number(r.total_calories) || 0,
    totalProtein: Number(r.total_protein) || 0,
    totalCarbs: Number(r.total_carbs) || 0,
    totalFat: Number(r.total_fat) || 0,
    aiModel: r.ai_model || undefined,
    source: (r.source as NutritionSource) || undefined,
    loggedAt: r.logged_at,
    eatenAt: r.eaten_at || undefined,
    durationMin: r.duration_min != null && r.duration_min !== '' ? Number(r.duration_min) : undefined,
    qualityScore: r.quality_score || undefined,
    qualityBreakdown: r.quality_breakdown || undefined,
    qualityMessage: r.quality_message || undefined,
    qualitySuggestion: r.quality_suggestion ?? undefined,
  }
}

const LS_ENTRIES = 'calistenia_nutrition_entries'
const LS_GOALS = 'calistenia_nutrition_goals'

// ─── localStorage helpers ────────────────────────────────────────────────────
const lsGetEntries = (): NutritionEntry[] => {
  try { return JSON.parse(storage.getItem(LS_ENTRIES) || '[]') } catch { return [] }
}
const lsSetEntries = (d: NutritionEntry[]): void => {
  storage.setItem(LS_ENTRIES, JSON.stringify(d))
}
const lsGetGoals = (): NutritionGoal | null => {
  try { return JSON.parse(storage.getItem(LS_GOALS) || 'null') } catch { return null }
}
const lsSetGoals = (d: NutritionGoal | null): void => {
  storage.setItem(LS_GOALS, JSON.stringify(d))
}

const sortByLoggedDesc = (a: NutritionEntry, b: NutritionEntry) =>
  new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()

// ─── Activity-level multipliers (Mifflin-St Jeor) ───────────────────────────
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

const isTransient = (e: any) => {
  const status = e?.status
  return status === 0 || status === 429 || (typeof status === 'number' && status >= 500)
}

/**
 * useNutrition — registro de nutrición. Migrado a TanStack Query conservando la
 * API pública completa.
 *
 * `entries` es un acumulador (hoy + fechas/ranges cargados a demanda) respaldado
 * por la query qk.nutrition.today(userId); fetchEntriesForDate/Range añaden a la
 * caché vía setQueryData (dedup por id) + localStorage. `goals` es una query
 * aparte. Las mutaciones escriben a caché + LS y sincronizan a PB. Las funciones
 * de IA y los selectores derivados quedan iguales.
 */
export function useNutrition(userId: string | null) {
  const qc = useQueryClient()
  const usePB = !!userId
  const entriesKey = qk.nutrition.today(userId)
  const goalsKey = qk.nutrition.goals(userId)
  const loadedDates = useRef<Set<string>>(new Set())

  // ─── Query: entries (acumulador, arranca con merge hoy+LS) ────────────────
  const entriesQuery = useQuery<NutritionEntry[]>({
    queryKey: entriesKey,
    enabled: !!userId,
    initialData: lsGetEntries,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    retry: (n, e) => isTransient(e) && n < 3,
    retryDelay: (n) => 400 * (n + 1),
    queryFn: async (): Promise<NutritionEntry[]> => {
      const todayStart = localMidnightAsUTC()
      const entriesRes = await pb.collection('nutrition_entries').getList(1, 200, {
        filter: pb.filter('user = {:uid} && logged_at >= {:start}', { uid: userId!, start: todayStart }),
        sort: '-logged_at',
        $autoCancel: false,
      })
      const mapped = entriesRes.items.map(mapPBToEntry)
      // Merge con entradas cacheadas de OTROS días (no reemplazar el acumulador).
      const cachedEntries = lsGetEntries()
      const todayIds = new Set(mapped.map(e => e.id))
      const todayDateStr = todayStr()
      const otherDayEntries = cachedEntries.filter(
        e => !todayIds.has(e.id) && utcToLocalDateStr(e.loggedAt) !== todayDateStr,
      )
      const merged = [...mapped, ...otherDayEntries].sort(sortByLoggedDesc)
      lsSetEntries(merged)
      loadedDates.current.add(todayDateStr)
      return merged
    },
  })

  // ─── Query: goals ──────────────────────────────────────────────────────────
  const goalsQuery = useQuery<NutritionGoal | null>({
    queryKey: goalsKey,
    enabled: !!userId,
    initialData: lsGetGoals,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
    retry: (n, e) => isTransient(e) && n < 3,
    queryFn: async (): Promise<NutritionGoal | null> => {
      const goalsRes = await pb.collection('nutrition_goals').getList(1, 1, {
        filter: pb.filter('user = {:uid}', { uid: userId! }), $autoCancel: false,
      })
      if (goalsRes.items.length > 0) {
        const g: any = goalsRes.items[0]
        const goalObj: NutritionGoal = {
          id: g.id, user: g.user,
          dailyCalories: g.daily_calories, dailyProtein: g.daily_protein,
          dailyCarbs: g.daily_carbs, dailyFat: g.daily_fat,
          goal: g.goal, weight: g.weight, height: g.height, age: g.age,
          sex: g.sex, activityLevel: g.activity_level,
        }
        lsSetGoals(goalObj)
        return goalObj
      }
      return lsGetGoals()
    },
  })

  const entries = entriesQuery.data ?? []
  const goals = goalsQuery.data ?? null
  const isReady = !userId || entriesQuery.isFetched

  // Mirror entries into a ref so identity-stable callbacks (e.g. getRecentEntries)
  // can read the latest cache without listing `entries` in their deps — otherwise
  // every save/edit/delete churns their identity and re-fires dependent effects.
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  // ─── Helpers de escritura sobre la caché + LS ─────────────────────────────
  const patchEntries = useCallback((updater: (prev: NutritionEntry[]) => NutritionEntry[]) => {
    qc.setQueryData<NutritionEntry[]>(entriesKey, (prev) => {
      const next = updater(prev ?? lsGetEntries())
      lsSetEntries(next)
      return next
    })
  }, [qc, entriesKey])

  const appendEntries = useCallback((mapped: NutritionEntry[]) => {
    patchEntries(prev => {
      const existingIds = new Set(prev.map(e => e.id))
      const fresh = mapped.filter(e => !existingIds.has(e.id))
      if (fresh.length === 0) return prev
      return [...prev, ...fresh].sort(sortByLoggedDesc)
    })
  }, [patchEntries])

  // ─── On-demand fetch para una fecha ───────────────────────────────────────
  const fetchEntriesForDate = useCallback(async (date: string): Promise<void> => {
    if (loadedDates.current.has(date)) return
    if (!usePB || !userId) return
    loadedDates.current.add(date)
    try {
      const dayStart = localMidnightAsUTC(date)
      const dayEnd = localMidnightAsUTC(addDays(date, 1))
      const res = await pb.collection('nutrition_entries').getList(1, 200, {
        filter: pb.filter('user = {:uid} && logged_at >= {:start} && logged_at < {:end}', { uid: userId, start: dayStart, end: dayEnd }),
        sort: '-logged_at', $autoCancel: false,
      })
      if (res.items.length === 0) return
      appendEntries(res.items.map(mapPBToEntry))
    } catch {
      loadedDates.current.delete(date)
    }
  }, [usePB, userId, appendEntries])

  // ─── Batch fetch para un rango ────────────────────────────────────────────
  const fetchEntriesForDateRange = useCallback(async (startDate: string, endDate: string): Promise<void> => {
    if (!usePB || !userId) return
    const needsFetch: string[] = []
    let d = startDate
    while (d <= endDate) {
      if (!loadedDates.current.has(d)) needsFetch.push(d)
      d = addDays(d, 1)
    }
    if (needsFetch.length === 0) return
    for (const dt of needsFetch) loadedDates.current.add(dt)
    try {
      const rangeStart = localMidnightAsUTC(needsFetch[0])
      const rangeEnd = localMidnightAsUTC(addDays(needsFetch[needsFetch.length - 1], 1))
      const res = await pb.collection('nutrition_entries').getList(1, 500, {
        filter: pb.filter('user = {:uid} && logged_at >= {:start} && logged_at < {:end}', { uid: userId, start: rangeStart, end: rangeEnd }),
        sort: '-logged_at', $autoCancel: false,
      })
      if (res.items.length === 0) return
      appendEntries(res.items.map(mapPBToEntry))
    } catch {
      for (const dt of needsFetch) loadedDates.current.delete(dt)
    }
  }, [usePB, userId, appendEntries])

  // ─── AI analysis (sin estado — igual que antes) ───────────────────────────
  const analyzeMeal = useCallback(async (
    imageFiles: File | File[],
    mealType: string,
    description?: string,
    userContext?: { goal?: string; remainingMacros?: DailyTotals; recentScores?: { mealType: string; score: string; loggedAt: string }[]; topFoods?: string[]; logHour?: number },
  ): Promise<{ foods: FoodItem[]; totals: DailyTotals; meal_description: string; ai_model: string; quality?: { score: QualityScore; breakdown: QualityBreakdown; message: string; suggestion: QualitySuggestion | null } }> => {
    const formData = new FormData()
    const files = Array.isArray(imageFiles) ? imageFiles : [imageFiles]
    for (const file of files) formData.append('images', file)
    formData.append('meal_type', mealType)
    if (description) formData.append('description', description)
    if (userContext) {
      if (userContext.goal) formData.append('goal', userContext.goal)
      if (userContext.logHour != null) formData.append('log_hour', String(userContext.logHour))
      if (userContext.remainingMacros) {
        formData.append('remaining_calories', String(userContext.remainingMacros.calories))
        formData.append('remaining_protein', String(userContext.remainingMacros.protein))
        formData.append('remaining_carbs', String(userContext.remainingMacros.carbs))
        formData.append('remaining_fat', String(userContext.remainingMacros.fat))
      }
      if (userContext.recentScores) formData.append('recent_scores', JSON.stringify(userContext.recentScores))
      if (userContext.topFoods) formData.append('top_foods', JSON.stringify(userContext.topFoods))
    }
    const headers: Record<string, string> = {}
    if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`
    const res = await fetch(`${AI_API_URL}/api/analyze-meal`, { method: 'POST', headers, body: formData })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.error || `Analyze meal failed: ${res.status}`)
    }
    const data = await res.json()
    const foods = data.analysis?.foods ?? []
    op.track('meal_analyzed', { food_count: foods.length, ai_model: data.model_used || 'unknown' })
    return {
      foods,
      totals: data.analysis?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
      meal_description: data.analysis?.meal_description || '',
      ai_model: data.model_used || 'unknown',
      quality: data.analysis?.quality || undefined,
    }
  }, [])

  const scoreMealQuality = useCallback(async (
    foods: { name: string; calories: number; protein: number; carbs: number; fat: number }[],
    totals: DailyTotals,
    mealType: string,
    userContext?: { goal?: string; remainingMacros?: DailyTotals; recentScores?: { mealType: string; score: string; loggedAt: string }[]; topFoods?: string[]; logHour?: number },
  ): Promise<{ score: QualityScore; breakdown: QualityBreakdown; message: string; suggestion: QualitySuggestion | null } | null> => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`
      const res = await fetch(`${AI_API_URL}/api/score-meal-quality`, {
        method: 'POST', headers,
        body: JSON.stringify({
          foods, totals, meal_type: mealType,
          ...(userContext?.goal && { goal: userContext.goal }),
          ...(userContext?.logHour != null && { log_hour: userContext.logHour }),
          ...(userContext?.remainingMacros && { remaining_macros: userContext.remainingMacros }),
          ...(userContext?.recentScores && { recent_scores: userContext.recentScores }),
          ...(userContext?.topFoods && { top_foods: userContext.topFoods }),
        }),
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.quality || null
    } catch {
      return null
    }
  }, [])

  // ─── CRUD: saveEntry ──────────────────────────────────────────────────────
  const saveEntry = useCallback(async (
    entry: Omit<NutritionEntry, 'id'>,
    photoFiles?: File[],
  ): Promise<NutritionEntry> => {
    let saved: NutritionEntry = { ...entry, id: `local_${Date.now()}`, loggedAt: entry.loggedAt || nowLocalForPB() }
    if (usePB && userId) {
      try {
        let body: FormData | Record<string, any>
        if (photoFiles && photoFiles.length > 0) {
          const formData = new FormData()
          formData.append('user', userId)
          formData.append('meal_type', entry.mealType)
          formData.append('foods', JSON.stringify(entry.foods))
          formData.append('total_calories', String(entry.totalCalories || 0))
          formData.append('total_protein', String(entry.totalProtein || 0))
          formData.append('total_carbs', String(entry.totalCarbs || 0))
          formData.append('total_fat', String(entry.totalFat || 0))
          if (entry.aiModel) formData.append('ai_model', entry.aiModel)
          if (entry.source) formData.append('source', entry.source)
          if (entry.eatenAt) formData.append('eaten_at', entry.eatenAt)
          if (entry.durationMin != null) formData.append('duration_min', String(entry.durationMin))
          for (const file of photoFiles) formData.append('photos', file)
          body = formData
        } else {
          body = {
            user: userId, meal_type: entry.mealType, foods: entry.foods,
            total_calories: entry.totalCalories || 0, total_protein: entry.totalProtein || 0,
            total_carbs: entry.totalCarbs || 0, total_fat: entry.totalFat || 0,
            ...(entry.aiModel ? { ai_model: entry.aiModel } : {}),
            ...(entry.source ? { source: entry.source } : {}),
            ...(entry.eatenAt ? { eaten_at: entry.eatenAt } : {}),
            ...(entry.durationMin != null ? { duration_min: entry.durationMin } : {}),
          }
        }
        if (entry.qualityScore) {
          if (body instanceof FormData) {
            body.append('quality_score', entry.qualityScore)
            if (entry.qualityBreakdown) body.append('quality_breakdown', JSON.stringify(entry.qualityBreakdown))
            if (entry.qualityMessage) body.append('quality_message', entry.qualityMessage)
            if (entry.qualitySuggestion !== undefined) body.append('quality_suggestion', JSON.stringify(entry.qualitySuggestion))
          } else {
            body.quality_score = entry.qualityScore
            if (entry.qualityBreakdown) body.quality_breakdown = entry.qualityBreakdown
            if (entry.qualityMessage) body.quality_message = entry.qualityMessage
            if (entry.qualitySuggestion !== undefined) body.quality_suggestion = entry.qualitySuggestion
          }
        }
        const created: any = await pb.collection('nutrition_entries').create(body)
        const rec: any = await pb.collection('nutrition_entries').getOne(created.id, { $autoCancel: false })
        saved = mapPBToEntry(rec)
      } catch (e) {
        // Surface the failure instead of masquerading a doomed local_ entry as a
        // success: a today-dated local_ entry is silently dropped on the next
        // accumulator refetch (the merge keeps only OTHER-day cached entries), so
        // swallowing here = silent data loss. The caller (meal logger) shows a
        // save error and lets the user retry. The local_ fallback stays valid only
        // in logged-out / no-PB mode, where there is nothing to persist to.
        console.warn('PB nutrition_entries create error:', e)
        if (usePB && userId) throw e
      }
    }
    patchEntries(prev => [saved, ...prev])
    return saved
  }, [usePB, userId, patchEntries])

  // ─── CRUD: deleteEntry ────────────────────────────────────────────────────
  const deleteEntry = useCallback(async (entryId: string): Promise<void> => {
    if (usePB && userId && !entryId.startsWith('local_')) {
      try { await pb.collection('nutrition_entries').delete(entryId) }
      catch (e) { console.warn('PB nutrition_entries delete error:', e) }
    }
    patchEntries(prev => prev.filter(e => e.id !== entryId))
  }, [usePB, userId, patchEntries])

  // ─── CRUD: updateEntry ────────────────────────────────────────────────────
  const updateEntry = useCallback(async (entryId: string, data: Partial<NutritionEntry>): Promise<void> => {
    if (usePB && userId && !entryId.startsWith('local_')) {
      const pbData: Record<string, any> = {}
      if (data.mealType !== undefined) pbData.meal_type = data.mealType
      if (data.foods !== undefined) pbData.foods = JSON.stringify(data.foods)
      if (data.totalCalories !== undefined) pbData.total_calories = data.totalCalories
      if (data.totalProtein !== undefined) pbData.total_protein = data.totalProtein
      if (data.totalCarbs !== undefined) pbData.total_carbs = data.totalCarbs
      if (data.totalFat !== undefined) pbData.total_fat = data.totalFat
      if (data.aiModel !== undefined) pbData.ai_model = data.aiModel
      if (data.source !== undefined) pbData.source = data.source
      if (data.eatenAt !== undefined) pbData.eaten_at = data.eatenAt
      if (data.durationMin !== undefined) pbData.duration_min = data.durationMin
      if (data.qualityScore !== undefined) pbData.quality_score = data.qualityScore
      if (data.qualityBreakdown !== undefined) pbData.quality_breakdown = data.qualityBreakdown
      if (data.qualityMessage !== undefined) pbData.quality_message = data.qualityMessage
      if (data.qualitySuggestion !== undefined) pbData.quality_suggestion = data.qualitySuggestion
      await pb.collection('nutrition_entries').update(entryId, pbData)
    }
    patchEntries(prev => prev.map(e => e.id === entryId ? { ...e, ...data } : e))
  }, [usePB, userId, patchEntries])

  // ─── Goals: saveGoals ─────────────────────────────────────────────────────
  const saveGoals = useCallback(async (goalsData: Omit<NutritionGoal, 'id' | 'user'>): Promise<void> => {
    const newGoal: NutritionGoal = { ...goalsData, user: userId || undefined }
    if (usePB && userId) {
      try {
        const pbData = {
          user: userId,
          daily_calories: goalsData.dailyCalories, daily_protein: goalsData.dailyProtein,
          daily_carbs: goalsData.dailyCarbs, daily_fat: goalsData.dailyFat,
          goal: goalsData.goal, weight: goalsData.weight, height: goalsData.height,
          age: goalsData.age, sex: goalsData.sex, activity_level: goalsData.activityLevel,
        }
        try {
          const existing = await pb.collection('nutrition_goals').getFirstListItem(pb.filter('user = {:uid}', { uid: userId }))
          const rec: any = await pb.collection('nutrition_goals').update(existing.id, pbData)
          newGoal.id = rec.id
        } catch {
          const rec: any = await pb.collection('nutrition_goals').create(pbData)
          newGoal.id = rec.id
        }
      } catch (e) {
        console.warn('PB nutrition_goals save error:', e)
      }
    } else {
      newGoal.id = `local_${Date.now()}`
    }
    qc.setQueryData<NutritionGoal | null>(goalsKey, newGoal)
    lsSetGoals(newGoal)
  }, [usePB, userId, qc, goalsKey])

  // ─── calculateMacros (puro) ───────────────────────────────────────────────
  const calculateMacros = useCallback((
    weight: number, height: number, age: number, sex: Sex,
    activityLevel: ActivityLevel, goal: NutritionGoalType,
    pace?: 'gradual' | 'balanced' | 'aggressive',
  ): NutritionGoal => {
    const bmr = sex === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161
    const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel]
    const paceFactor = pace === 'gradual' ? 0.5 : pace === 'aggressive' ? 1.5 : 1.0
    let dailyCalories: number
    switch (goal) {
      case 'muscle_gain': dailyCalories = tdee + 300 * paceFactor; break
      case 'fat_loss':    dailyCalories = tdee - 500 * paceFactor; break
      default:            dailyCalories = tdee; break
    }
    dailyCalories = Math.round(dailyCalories)
    let proteinPerKg: number
    switch (goal) {
      case 'muscle_gain': proteinPerKg = 2.0; break
      case 'fat_loss':    proteinPerKg = 2.2; break
      default:            proteinPerKg = 1.8; break
    }
    const dailyProtein = Math.round(proteinPerKg * weight)
    const dailyFat = Math.round((dailyCalories * 0.25) / 9)
    const proteinCals = dailyProtein * 4
    const fatCals = dailyFat * 9
    const dailyCarbs = Math.round((dailyCalories - proteinCals - fatCals) / 4)
    return { dailyCalories, dailyProtein, dailyCarbs, dailyFat, goal, weight, height, age, sex, activityLevel }
  }, [])

  // ─── Índice de totales diarios (se recomputa solo cuando entries cambia) ───
  const dailyTotalsMap = useMemo((): Map<string, DailyTotals> => {
    const map = new Map<string, DailyTotals>()
    for (const e of entries) {
      const dateStr = utcToLocalDateStr(e.loggedAt)
      const prev = map.get(dateStr) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
      map.set(dateStr, {
        calories: prev.calories + e.totalCalories,
        protein: prev.protein + e.totalProtein,
        carbs:   prev.carbs   + e.totalCarbs,
        fat:     prev.fat     + e.totalFat,
      })
    }
    return map
  }, [entries])

  // ─── Selectores derivados ─────────────────────────────────────────────────
  const getDailyTotals = useCallback((date?: string): DailyTotals => {
    const target = date || todayStr()
    return dailyTotalsMap.get(target) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
  }, [dailyTotalsMap])

  const getWeeklyAverages = useCallback((): DailyTotals => {
    const totals: DailyTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
    let daysWithEntries = 0
    for (let i = 0; i < 7; i++) {
      const dateStr = daysAgoStr(i)
      const dayTotals = getDailyTotals(dateStr)
      if (dayTotals.calories > 0) {
        totals.calories += dayTotals.calories
        totals.protein += dayTotals.protein
        totals.carbs += dayTotals.carbs
        totals.fat += dayTotals.fat
        daysWithEntries++
      }
    }
    if (daysWithEntries === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 }
    return {
      calories: Math.round(totals.calories / daysWithEntries),
      protein: Math.round(totals.protein / daysWithEntries),
      carbs: Math.round(totals.carbs / daysWithEntries),
      fat: Math.round(totals.fat / daysWithEntries),
    }
  }, [getDailyTotals])

  const getEntriesForDate = useCallback((date: string): NutritionEntry[] => {
    return entries.filter(e => utcToLocalDateStr(e.loggedAt) === date)
  }, [entries])

  const getWeeklyHistory = useCallback((): Array<{
    date: string; dayLabel: string; calories: number; protein: number; carbs: number; fat: number
  }> => {
    const dayKeys = ['day.shortSun', 'day.shortMon', 'day.shortTue', 'day.shortWed', 'day.shortThu', 'day.shortFri', 'day.shortSat']
    const days = dayKeys.map(k => i18n.t(k))
    const result = []
    for (let i = 6; i >= 0; i--) {
      const dateStr = daysAgoStr(i)
      const d = new Date(`${dateStr}T12:00:00`)
      const totals = getDailyTotals(dateStr)
      result.push({
        date: dateStr,
        dayLabel: days[d.getDay()],
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat),
      })
    }
    return result
  }, [getDailyTotals])

  const getRecentEntries = useCallback(async (limit = 10): Promise<NutritionEntry[]> => {
    if (usePB && userId) {
      try {
        const res = await pb.collection('nutrition_entries').getList(1, limit, {
          filter: pb.filter('user = {:uid}', { uid: userId }),
          sort: '-logged_at',
        })
        return res.items.map(mapPBToEntry)
      } catch {
        return entriesRef.current.slice(0, limit)
      }
    }
    return entriesRef.current.slice(0, limit)
  }, [usePB, userId])

  const getRemainingMacros = useCallback((date?: string): DailyTotals => {
    const totals = getDailyTotals(date)
    if (!goals) return { calories: 0, protein: 0, carbs: 0, fat: 0 }
    return {
      calories: Math.max(0, goals.dailyCalories - totals.calories),
      protein: Math.max(0, goals.dailyProtein - totals.protein),
      carbs: Math.max(0, goals.dailyCarbs - totals.carbs),
      fat: Math.max(0, goals.dailyFat - totals.fat),
    }
  }, [getDailyTotals, goals])

  return {
    entries,
    goals,
    isReady,

    // AI analysis
    analyzeMeal,
    scoreMealQuality,

    // CRUD
    saveEntry,
    deleteEntry,
    updateEntry,

    // Goals
    saveGoals,
    calculateMacros,

    // Computed
    getDailyTotals,
    getWeeklyAverages,
    getWeeklyHistory,
    getEntriesForDate,
    fetchEntriesForDate,
    fetchEntriesForDateRange,
    getRemainingMacros,
    getRecentEntries,
  }
}

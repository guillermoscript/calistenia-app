import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { AI_API_URL } from '../lib/ai-api'
import { todayStr, toLocalDateStr, daysAgoStr, addDays, localMidnightAsUTC, utcToLocalDateStr } from '../lib/dateUtils'
import type {
  NutritionEntry,
  NutritionGoal,
  NutritionGoalType,
  ActivityLevel,
  Sex,
  DailyTotals,
  FoodItem,
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

const LS_ENTRIES = 'calistenia_nutrition_entries'
const LS_GOALS = 'calistenia_nutrition_goals'

// ─── localStorage helpers ────────────────────────────────────────────────────
const lsGetEntries = (): NutritionEntry[] => {
  try { return JSON.parse(localStorage.getItem(LS_ENTRIES) || '[]') } catch { return [] }
}
const lsSetEntries = (d: NutritionEntry[]): void => {
  localStorage.setItem(LS_ENTRIES, JSON.stringify(d))
}
const lsGetGoals = (): NutritionGoal | null => {
  try { return JSON.parse(localStorage.getItem(LS_GOALS) || 'null') } catch { return null }
}
const lsSetGoals = (d: NutritionGoal | null): void => {
  localStorage.setItem(LS_GOALS, JSON.stringify(d))
}

// todayStr is now imported from ../lib/dateUtils

// ─── Activity-level multipliers (Mifflin-St Jeor) ───────────────────────────
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

export function useNutrition(userId: string | null) {
  const [entries, setEntries] = useState<NutritionEntry[]>([])
  const [goals, setGoals] = useState<NutritionGoal | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [usePB, setUsePB] = useState(false)

  const initialized = useRef(false)
  const lastUserId = useRef<string | null>(null)
  const loadedDates = useRef<Set<string>>(new Set())

  // ─── Init / re-init cuando cambia el userId ─────────────────────────────
  useEffect(() => {
    if (lastUserId.current !== userId) {
      lastUserId.current = userId
      initialized.current = false
      loadedDates.current = new Set()
      setEntries([])
      setGoals(null)
      setIsReady(false)
    }

    if (initialized.current) return
    initialized.current = true

    const init = async () => {
      const available = userId ? await isPocketBaseAvailable() : false
      setUsePB(available && !!userId)
      if (available && userId) {
        await loadFromPB(userId)
      } else {
        loadFromLS()
      }
      setIsReady(true)
    }
    init()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Carga desde localStorage ──────────────────────────────────────────────
  const loadFromLS = (): void => {
    setEntries(lsGetEntries())
    setGoals(lsGetGoals())
  }

  // ─── Carga desde PocketBase ────────────────────────────────────────────────
  const loadFromPB = async (uid: string): Promise<void> => {
    try {
      const todayStart = localMidnightAsUTC()
      const [entriesRes, goalsRes] = await Promise.all([
        pb.collection('nutrition_entries').getList(1, 200, {
          filter: pb.filter('user = {:uid} && logged_at >= {:start}', {
            uid,
            start: todayStart,
          }),
          sort: '-logged_at',
          $autoCancel: false,
        }),
        pb.collection('nutrition_goals').getList(1, 1, {
          filter: pb.filter('user = {:uid}', { uid }),
          $autoCancel: false,
        }),
      ])

      const mapped: NutritionEntry[] = entriesRes.items.map((r: any) => ({
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
        loggedAt: r.logged_at,
      }))

      // Merge with cached entries from other days instead of replacing
      const cachedEntries = lsGetEntries()
      const todayIds = new Set(mapped.map(e => e.id))
      const todayDateStr = todayStr()
      const otherDayEntries = cachedEntries.filter(
        e => !todayIds.has(e.id) && utcToLocalDateStr(e.loggedAt) !== todayDateStr
      )
      const merged = [...mapped, ...otherDayEntries].sort(
        (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
      )
      setEntries(merged)
      lsSetEntries(merged)
      loadedDates.current.add(todayDateStr)

      if (goalsRes.items.length > 0) {
        const g: any = goalsRes.items[0]
        const goalObj: NutritionGoal = {
          id: g.id,
          user: g.user,
          dailyCalories: g.daily_calories,
          dailyProtein: g.daily_protein,
          dailyCarbs: g.daily_carbs,
          dailyFat: g.daily_fat,
          goal: g.goal,
          weight: g.weight,
          height: g.height,
          age: g.age,
          sex: g.sex,
          activityLevel: g.activity_level,
        }
        setGoals(goalObj)
        lsSetGoals(goalObj)
      } else {
        const lsGoal = lsGetGoals()
        setGoals(lsGoal)
      }
    } catch (e: any) {
      if (e?.code === 0) return // auto-cancelled, ignore
      console.error('PocketBase nutrition load error, falling back to localStorage', e)
      loadFromLS()
    }
  }

  // ─── On-demand fetch for a specific date ──────────────────────────────────
  const fetchAbortRef = useRef<AbortController | null>(null)

  const fetchEntriesForDate = useCallback(async (date: string): Promise<void> => {
    if (loadedDates.current.has(date)) return
    if (!usePB || !userId) return
    loadedDates.current.add(date) // mark early to prevent duplicate requests

    // Cancel previous in-flight fetch (rapid date navigation)
    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller

    try {
      const dayStart = localMidnightAsUTC(date)
      const dayEnd = localMidnightAsUTC(addDays(date, 1))
      const res = await pb.collection('nutrition_entries').getList(1, 200, {
        filter: pb.filter('user = {:uid} && logged_at >= {:start} && logged_at < {:end}', {
          uid: userId,
          start: dayStart,
          end: dayEnd,
        }),
        sort: '-logged_at',
        $autoCancel: false,
      })

      if (controller.signal.aborted) return
      if (res.items.length === 0) return

      const mapped: NutritionEntry[] = res.items.map((r: any) => ({
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
        loggedAt: r.logged_at,
      }))

      setEntries(prev => {
        const existingIds = new Set(prev.map(e => e.id))
        const newEntries = mapped.filter(e => !existingIds.has(e.id))
        if (newEntries.length === 0) return prev
        const updated = [...prev, ...newEntries].sort(
          (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
        )
        lsSetEntries(updated)
        return updated
      })
    } catch {
      if (!controller.signal.aborted) {
        loadedDates.current.delete(date) // allow retry on error
      }
    }
  }, [usePB, userId])

  // ─── AI analysis ──────────────────────────────────────────────────────────
  const analyzeMeal = useCallback(async (
    imageFiles: File | File[],
    mealType: string,
    description?: string,
  ): Promise<{ foods: FoodItem[]; totals: DailyTotals; meal_description: string; ai_model: string }> => {
    const formData = new FormData()
    const files = Array.isArray(imageFiles) ? imageFiles : [imageFiles]
    for (const file of files) {
      formData.append('images', file)
    }
    formData.append('meal_type', mealType)
    if (description) formData.append('description', description)

    const headers: Record<string, string> = {}
    if (pb.authStore.token) {
      headers['Authorization'] = `Bearer ${pb.authStore.token}`
    }

    const res = await fetch(`${AI_API_URL}/api/analyze-meal`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.error || `Analyze meal failed: ${res.status}`)
    }
    const data = await res.json()
    // AI SDK v6 returns { analysis: { foods, totals, meal_description }, model_used, usage }
    return {
      foods: data.analysis?.foods ?? [],
      totals: data.analysis?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
      meal_description: data.analysis?.meal_description || '',
      ai_model: data.model_used || 'unknown',
    }
  }, [])

  // ─── CRUD: saveEntry ──────────────────────────────────────────────────────
  const saveEntry = useCallback(async (
    entry: Omit<NutritionEntry, 'id'>,
    photoFiles?: File[],
  ): Promise<NutritionEntry> => {
    let saved: NutritionEntry = { ...entry, id: `local_${Date.now()}`, loggedAt: entry.loggedAt || new Date().toISOString() }

    if (usePB && userId) {
      try {
        let body: FormData | Record<string, any>
        if (photoFiles && photoFiles.length > 0) {
          // Use FormData when there are photos to upload
          const formData = new FormData()
          formData.append('user', userId)
          formData.append('meal_type', entry.mealType)
          formData.append('foods', JSON.stringify(entry.foods))
          formData.append('total_calories', String(entry.totalCalories || 0))
          formData.append('total_protein', String(entry.totalProtein || 0))
          formData.append('total_carbs', String(entry.totalCarbs || 0))
          formData.append('total_fat', String(entry.totalFat || 0))
          if (entry.aiModel) formData.append('ai_model', entry.aiModel)
          for (const file of photoFiles) {
            formData.append('photos', file)
          }
          body = formData
        } else {
          // Use JSON for non-photo entries — PB treats "0" as blank in FormData
          body = {
            user: userId,
            meal_type: entry.mealType,
            foods: entry.foods,
            total_calories: entry.totalCalories || 0,
            total_protein: entry.totalProtein || 0,
            total_carbs: entry.totalCarbs || 0,
            total_fat: entry.totalFat || 0,
            ...(entry.aiModel ? { ai_model: entry.aiModel } : {}),
          }
        }

        const created: any = await pb.collection('nutrition_entries').create(body)
        // Re-fetch to ensure file fields are fully populated
        const rec: any = await pb.collection('nutrition_entries').getOne(created.id, { $autoCancel: false })
        saved = {
          id: rec.id,
          user: rec.user,
          photoUrls: resolvePhotoUrls(rec),
          mealType: rec.meal_type,
          foods: rec.foods || [],
          totalCalories: rec.total_calories,
          totalProtein: rec.total_protein,
          totalCarbs: rec.total_carbs,
          totalFat: rec.total_fat,
          aiModel: rec.ai_model || undefined,
          loggedAt: rec.logged_at,
        }
      } catch (e) {
        console.warn('PB nutrition_entries create error:', e)
      }
    }

    setEntries(prev => {
      const updated = [saved, ...prev]
      lsSetEntries(updated)
      return updated
    })

    return saved
  }, [usePB, userId])

  // ─── CRUD: deleteEntry ────────────────────────────────────────────────────
  const deleteEntry = useCallback(async (entryId: string): Promise<void> => {
    if (usePB && userId && !entryId.startsWith('local_')) {
      try {
        await pb.collection('nutrition_entries').delete(entryId)
      } catch (e) {
        console.warn('PB nutrition_entries delete error:', e)
      }
    }

    setEntries(prev => {
      const updated = prev.filter(e => e.id !== entryId)
      lsSetEntries(updated)
      return updated
    })
  }, [usePB, userId])

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
      await pb.collection('nutrition_entries').update(entryId, pbData)
    }

    setEntries(prev => {
      const updated = prev.map(e => e.id === entryId ? { ...e, ...data } : e)
      lsSetEntries(updated)
      return updated
    })
  }, [usePB, userId])

  // ─── Goals: saveGoals ─────────────────────────────────────────────────────
  const saveGoals = useCallback(async (goalsData: Omit<NutritionGoal, 'id' | 'user'>): Promise<void> => {
    const newGoal: NutritionGoal = { ...goalsData, user: userId || undefined }

    if (usePB && userId) {
      try {
        const pbData = {
          user: userId,
          daily_calories: goalsData.dailyCalories,
          daily_protein: goalsData.dailyProtein,
          daily_carbs: goalsData.dailyCarbs,
          daily_fat: goalsData.dailyFat,
          goal: goalsData.goal,
          weight: goalsData.weight,
          height: goalsData.height,
          age: goalsData.age,
          sex: goalsData.sex,
          activity_level: goalsData.activityLevel,
        }

        try {
          // Try to find existing record and update
          const existing = await pb.collection('nutrition_goals').getFirstListItem(
            pb.filter('user = {:uid}', { uid: userId })
          )
          const rec: any = await pb.collection('nutrition_goals').update(existing.id, pbData)
          newGoal.id = rec.id
        } catch {
          // No existing record, create new
          const rec: any = await pb.collection('nutrition_goals').create(pbData)
          newGoal.id = rec.id
        }
      } catch (e) {
        console.warn('PB nutrition_goals save error:', e)
      }
    } else {
      newGoal.id = `local_${Date.now()}`
    }

    setGoals(newGoal)
    lsSetGoals(newGoal)
  }, [usePB, userId])

  // ─── calculateMacros ─────────────────────────────────────────────────────
  const calculateMacros = useCallback((
    weight: number,
    height: number,
    age: number,
    sex: Sex,
    activityLevel: ActivityLevel,
    goal: NutritionGoalType,
  ): NutritionGoal => {
    // Mifflin-St Jeor formula
    const bmr = sex === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161

    const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel]

    // Calorie adjustment based on goal
    let dailyCalories: number
    switch (goal) {
      case 'muscle_gain': dailyCalories = tdee + 300; break
      case 'fat_loss':    dailyCalories = tdee - 500; break
      default:            dailyCalories = tdee; break // recomp, maintain
    }
    dailyCalories = Math.round(dailyCalories)

    // Protein: g/kg based on goal
    let proteinPerKg: number
    switch (goal) {
      case 'muscle_gain': proteinPerKg = 2.0; break
      case 'fat_loss':    proteinPerKg = 2.2; break
      default:            proteinPerKg = 1.8; break
    }
    const dailyProtein = Math.round(proteinPerKg * weight)

    // Fat: 25% of calories (9 cal/g)
    const dailyFat = Math.round((dailyCalories * 0.25) / 9)

    // Carbs: remainder (4 cal/g)
    const proteinCals = dailyProtein * 4
    const fatCals = dailyFat * 9
    const dailyCarbs = Math.round((dailyCalories - proteinCals - fatCals) / 4)

    return {
      dailyCalories,
      dailyProtein,
      dailyCarbs,
      dailyFat,
      goal,
      weight,
      height,
      age,
      sex,
      activityLevel,
    }
  }, [])

  // ─── Computed: getDailyTotals ─────────────────────────────────────────────
  const getDailyTotals = useCallback((date?: string): DailyTotals => {
    const target = date || todayStr()
    const dayEntries = entries.filter(e => utcToLocalDateStr(e.loggedAt) === target)
    return dayEntries.reduce<DailyTotals>(
      (acc, e) => ({
        calories: acc.calories + e.totalCalories,
        protein: acc.protein + e.totalProtein,
        carbs: acc.carbs + e.totalCarbs,
        fat: acc.fat + e.totalFat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    )
  }, [entries])

  // ─── Computed: getWeeklyAverages ──────────────────────────────────────────
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

  // ─── Computed: getEntriesForDate ──────────────────────────────────────────
  const getEntriesForDate = useCallback((date: string): NutritionEntry[] => {
    return entries.filter(e => utcToLocalDateStr(e.loggedAt) === date)
  }, [entries])

  // ─── Computed: getWeeklyHistory ──────────────────────────────────────────
  const getWeeklyHistory = useCallback((): Array<{
    date: string
    dayLabel: string
    calories: number
    protein: number
    carbs: number
    fat: number
  }> => {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
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

  // ─── getRecentEntries ────────────────────────────────────────────────────
  const getRecentEntries = useCallback(async (limit = 10): Promise<NutritionEntry[]> => {
    if (usePB && userId) {
      try {
        const res = await pb.collection('nutrition_entries').getList(1, limit, {
          filter: pb.filter('user = {:uid}', { uid: userId }),
          sort: '-logged_at',
        })
        return res.items.map((r: any) => ({
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
          loggedAt: r.logged_at,
        }))
      } catch {
        return entries.slice(0, limit)
      }
    }
    return entries.slice(0, limit)
  }, [usePB, userId, entries])

  // ─── Computed: getRemainingMacros ─────────────────────────────────────────
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
    getRemainingMacros,
    getRecentEntries,
  }
}

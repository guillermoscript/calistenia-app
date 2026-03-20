import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { AI_API_URL } from '../lib/ai-api'
import type {
  NutritionEntry,
  NutritionGoal,
  NutritionGoalType,
  ActivityLevel,
  Sex,
  DailyTotals,
  FoodItem,
} from '../types'

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

const todayStr = (): string => new Date().toISOString().split('T')[0]

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

  // ─── Init / re-init cuando cambia el userId ─────────────────────────────
  useEffect(() => {
    if (lastUserId.current !== userId) {
      lastUserId.current = userId
      initialized.current = false
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
      const today = todayStr()
      const [entriesRes, goalsRes] = await Promise.all([
        pb.collection('nutrition_entries').getList(1, 200, {
          filter: pb.filter('user = {:uid} && logged_at >= {:start}', {
            uid,
            start: `${today} 00:00:00`,
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
        photoUrl: r.photo ? pb.files.getUrl(r, r.photo) : undefined,
        mealType: r.meal_type,
        foods: r.foods || [],
        totalCalories: r.total_calories,
        totalProtein: r.total_protein,
        totalCarbs: r.total_carbs,
        totalFat: r.total_fat,
        aiModel: r.ai_model || undefined,
        loggedAt: r.logged_at,
      }))

      setEntries(mapped)
      lsSetEntries(mapped)

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

  // ─── AI analysis ──────────────────────────────────────────────────────────
  const analyzeMeal = useCallback(async (
    imageFile: File,
    mealType: string,
    description?: string,
  ): Promise<{ foods: FoodItem[]; totals: DailyTotals; ai_model: string }> => {
    const formData = new FormData()
    formData.append('image', imageFile)
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
      ai_model: data.model_used || 'unknown',
    }
  }, [])

  // ─── CRUD: saveEntry ──────────────────────────────────────────────────────
  const saveEntry = useCallback(async (
    entry: Omit<NutritionEntry, 'id'>,
    photoFile?: File,
  ): Promise<NutritionEntry> => {
    let saved: NutritionEntry = { ...entry, id: `local_${Date.now()}`, loggedAt: entry.loggedAt || new Date().toISOString() }

    if (usePB && userId) {
      try {
        const formData = new FormData()
        formData.append('user', userId)
        formData.append('meal_type', entry.mealType)
        formData.append('foods', JSON.stringify(entry.foods))
        formData.append('total_calories', String(entry.totalCalories))
        formData.append('total_protein', String(entry.totalProtein))
        formData.append('total_carbs', String(entry.totalCarbs))
        formData.append('total_fat', String(entry.totalFat))
        if (entry.aiModel) formData.append('ai_model', entry.aiModel)
        if (photoFile) formData.append('photo', photoFile)

        const rec: any = await pb.collection('nutrition_entries').create(formData)
        saved = {
          id: rec.id,
          user: rec.user,
          photoUrl: rec.photo ? pb.files.getUrl(rec, rec.photo) : undefined,
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
      try {
        const pbData: Record<string, any> = {}
        if (data.mealType !== undefined) pbData.meal_type = data.mealType
        if (data.foods !== undefined) pbData.foods = JSON.stringify(data.foods)
        if (data.totalCalories !== undefined) pbData.total_calories = data.totalCalories
        if (data.totalProtein !== undefined) pbData.total_protein = data.totalProtein
        if (data.totalCarbs !== undefined) pbData.total_carbs = data.totalCarbs
        if (data.totalFat !== undefined) pbData.total_fat = data.totalFat
        if (data.aiModel !== undefined) pbData.ai_model = data.aiModel
        await pb.collection('nutrition_entries').update(entryId, pbData)
      } catch (e) {
        console.warn('PB nutrition_entries update error:', e)
      }
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
    const dayEntries = entries.filter(e => e.loggedAt.startsWith(target))
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
    const today = new Date()
    const totals: DailyTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
    let daysWithEntries = 0

    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
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
    return entries.filter(e => e.loggedAt.startsWith(date))
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
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
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
          photoUrl: r.photo ? pb.files.getUrl(r, r.photo) : undefined,
          mealType: r.meal_type,
          foods: r.foods || [],
          totalCalories: r.total_calories,
          totalProtein: r.total_protein,
          totalCarbs: r.total_carbs,
          totalFat: r.total_fat,
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
    getRemainingMacros,
    getRecentEntries,
  }
}

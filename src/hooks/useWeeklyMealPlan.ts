import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { submitWeeklyMealPlanJob, regeneratePlanDay } from '../lib/ai-jobs-api'
import type { WeeklyMealPlan, WeeklyPlanDay, WeeklyPlannedMeal, NutritionGoal, FoodItem } from '../types'

const LS_KEY = 'calistenia_weekly_plan'

interface CachedPlan {
  plan: WeeklyMealPlan | null
  days: WeeklyPlanDay[]
}

function lsGet(): CachedPlan {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{"plan":null,"days":[]}')
  } catch {
    return { plan: null, days: [] }
  }
}

function lsSet(data: CachedPlan) {
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

function mapPlanRecord(rec: any): WeeklyMealPlan {
  return {
    id: rec.id,
    user: rec.user,
    week_start: rec.week_start,
    status: rec.status,
    goal_snapshot: typeof rec.goal_snapshot === 'string'
      ? JSON.parse(rec.goal_snapshot)
      : rec.goal_snapshot,
    ai_model: rec.ai_model ?? '',
    created: rec.created,
    updated: rec.updated,
  }
}

function mapDayRecord(rec: any): WeeklyPlanDay {
  return {
    id: rec.id,
    plan: rec.plan,
    user: rec.user,
    date: rec.date,
    day_index: rec.day_index,
    meals: typeof rec.meals === 'string' ? JSON.parse(rec.meals) : (rec.meals ?? []),
    notes: rec.notes ?? '',
  }
}

export function useWeeklyMealPlan(userId: string | null) {
  const [activePlan, setActivePlan] = useState<WeeklyMealPlan | null>(null)
  const [planDays, setPlanDays] = useState<WeeklyPlanDay[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const initialized = useRef(false)

  // Load active plan + days
  useEffect(() => {
    if (!userId || initialized.current) return
    initialized.current = true

    const load = async () => {
      const available = await isPocketBaseAvailable()
      if (available) {
        try {
          const planRec = await pb.collection('weekly_meal_plans').getFirstListItem(
            pb.filter('user = {:uid} && status = "active"', { uid: userId })
          )
          const plan = mapPlanRecord(planRec)
          const dayRecs = await pb.collection('weekly_plan_days').getFullList({
            filter: pb.filter('plan = {:pid}', { pid: plan.id }),
            sort: 'day_index',
          })
          const days = dayRecs.map(mapDayRecord)
          setActivePlan(plan)
          setPlanDays(days)
          lsSet({ plan, days })
        } catch {
          // No active plan — try localStorage cache
          const cached = lsGet()
          if (cached.plan) {
            setActivePlan(cached.plan)
            setPlanDays(cached.days)
          }
        }
      } else {
        const cached = lsGet()
        if (cached.plan) {
          setActivePlan(cached.plan)
          setPlanDays(cached.days)
        }
      }
      setIsLoading(false)
    }

    load()
  }, [userId])

  // Refresh from PB (used after job completion)
  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      const planRec = await pb.collection('weekly_meal_plans').getFirstListItem(
        pb.filter('user = {:uid} && status = "active"', { uid: userId })
      )
      const plan = mapPlanRecord(planRec)
      const dayRecs = await pb.collection('weekly_plan_days').getFullList({
        filter: pb.filter('plan = {:pid}', { pid: plan.id }),
        sort: 'day_index',
      })
      const days = dayRecs.map(mapDayRecord)
      setActivePlan(plan)
      setPlanDays(days)
      lsSet({ plan, days })
    } catch {
      setActivePlan(null)
      setPlanDays([])
      lsSet({ plan: null, days: [] })
    }
  }, [userId])

  // Generate a new weekly plan (returns job ID for polling)
  const generatePlan = useCallback(async (goals: NutritionGoal): Promise<string> => {
    const jobId = await submitWeeklyMealPlanJob({
      daily_calories: goals.dailyCalories,
      daily_protein: goals.dailyProtein,
      daily_carbs: goals.dailyCarbs,
      daily_fat: goals.dailyFat,
      goal: goals.goal,
    })
    return jobId
  }, [])

  // Regenerate a single day
  const regenerateDay = useCallback(async (dayId: string) => {
    const result = await regeneratePlanDay(dayId)
    setPlanDays(prev => {
      const updated = prev.map(d =>
        d.id === dayId ? { ...d, meals: result.meals, notes: result.notes } : d
      )
      const plan = activePlan
      lsSet({ plan, days: updated })
      return updated
    })
  }, [activePlan])

  // Log a planned meal (creates nutrition_entry + marks as logged)
  const logMeal = useCallback(async (dayId: string, mealId: string) => {
    const day = planDays.find(d => d.id === dayId)
    if (!day) return
    const meal = day.meals.find(m => m.id === mealId)
    if (!meal || meal.logged) return

    // Create a nutrition entry from the planned meal
    const food: FoodItem = {
      name: meal.label,
      portionAmount: 1,
      portionUnit: 'unidad',
      unitWeightInGrams: 100,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      baseCal100: meal.calories,
      baseProt100: meal.protein,
      baseCarbs100: meal.carbs,
      baseFat100: meal.fat,
    }

    const entryData = {
      user: userId,
      meal_type: meal.meal_type,
      foods: [food],
      total_calories: meal.calories,
      total_protein: meal.protein,
      total_carbs: meal.carbs,
      total_fat: meal.fat,
      ai_model: 'weekly-plan',
      source: 'ai_weekly_plan',
      logged_at: new Date().toISOString(),
    }

    const entryRecord = await pb.collection('nutrition_entries').create(entryData)

    // Update the meal as logged in the day record
    const updatedMeals = day.meals.map(m =>
      m.id === mealId ? { ...m, logged: true, logged_entry_id: entryRecord.id } : m
    )

    await pb.collection('weekly_plan_days').update(dayId, { meals: updatedMeals })

    setPlanDays(prev => {
      const updated = prev.map(d =>
        d.id === dayId ? { ...d, meals: updatedMeals } : d
      )
      lsSet({ plan: activePlan, days: updated })
      return updated
    })
  }, [userId, planDays, activePlan])

  // Delete a meal from a day
  const deleteMeal = useCallback(async (dayId: string, mealId: string) => {
    const day = planDays.find(d => d.id === dayId)
    if (!day) return

    const updatedMeals = day.meals.filter(m => m.id !== mealId)
    await pb.collection('weekly_plan_days').update(dayId, { meals: updatedMeals })

    setPlanDays(prev => {
      const updated = prev.map(d =>
        d.id === dayId ? { ...d, meals: updatedMeals } : d
      )
      lsSet({ plan: activePlan, days: updated })
      return updated
    })
  }, [planDays, activePlan])

  // Archive the current plan
  const archivePlan = useCallback(async () => {
    if (!activePlan) return
    await pb.collection('weekly_meal_plans').update(activePlan.id, { status: 'archived' })
    setActivePlan(null)
    setPlanDays([])
    lsSet({ plan: null, days: [] })
  }, [activePlan])

  // Get a specific day by date string (YYYY-MM-DD)
  const getDayByDate = useCallback((date: string): WeeklyPlanDay | undefined => {
    return planDays.find(d => d.date.startsWith(date))
  }, [planDays])

  return {
    activePlan,
    planDays,
    isLoading,
    generatePlan,
    regenerateDay,
    logMeal,
    deleteMeal,
    archivePlan,
    getDayByDate,
    refresh,
  }
}

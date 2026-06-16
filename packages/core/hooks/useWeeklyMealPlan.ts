import { storage } from '../platform'
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { submitWeeklyMealPlanJob, regeneratePlanDay } from '../lib/ai-jobs-api'
import { qk } from '../lib/query-keys'
import type { WeeklyMealPlan, WeeklyPlanDay, NutritionGoal, FoodItem } from '../types'

const LS_KEY = 'calistenia_weekly_plan'

interface CachedPlan {
  plan: WeeklyMealPlan | null
  days: WeeklyPlanDay[]
}

function lsGet(): CachedPlan {
  try {
    return JSON.parse(storage.getItem(LS_KEY) || '{"plan":null,"days":[]}')
  } catch {
    return { plan: null, days: [] }
  }
}

function lsSet(data: CachedPlan) {
  storage.setItem(LS_KEY, JSON.stringify(data))
}

function mapPlanRecord(rec: any): WeeklyMealPlan {
  return {
    id: rec.id,
    user: rec.user,
    week_start: rec.week_start,
    status: rec.status,
    goal_snapshot: typeof rec.goal_snapshot === 'string' ? JSON.parse(rec.goal_snapshot) : rec.goal_snapshot,
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

/** Carga el plan activo + sus días desde PB (cae a caché local en error). */
async function fetchActivePlan(uid: string): Promise<CachedPlan> {
  try {
    const planRec = await pb.collection('weekly_meal_plans').getFirstListItem(
      pb.filter('user = {:uid} && status = "active"', { uid }),
    )
    const plan = mapPlanRecord(planRec)
    const dayRecs = await pb.collection('weekly_plan_days').getFullList({
      filter: pb.filter('plan = {:pid}', { pid: plan.id }), sort: 'day_index',
    })
    const days = dayRecs.map(mapDayRecord)
    const result = { plan, days }
    lsSet(result)
    return result
  } catch {
    return lsGet()
  }
}

/**
 * Plan semanal de comidas. Migrado a TanStack Query: una query
 * (qk.weeklyMealPlan.active) mantiene { plan, days } con initialData desde
 * localStorage. Las mutaciones parchean la caché + LS. Forma pública estable.
 */
export function useWeeklyMealPlan(userId: string | null) {
  const qc = useQueryClient()
  const key = qk.weeklyMealPlan.active(userId)

  const query = useQuery<CachedPlan>({
    queryKey: key,
    enabled: !!userId,
    initialData: lsGet,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchActivePlan(userId!),
  })

  const activePlan = query.data?.plan ?? null
  const planDays = query.data?.days ?? []
  const isLoading = !!userId && !query.isFetched

  const patch = useCallback((updater: (prev: CachedPlan) => CachedPlan) => {
    qc.setQueryData<CachedPlan>(key, (prev) => {
      const next = updater(prev ?? lsGet())
      lsSet(next)
      return next
    })
  }, [qc, key])

  const refresh = useCallback(async () => {
    if (!userId) return
    await query.refetch()
  }, [userId, query])

  const generatePlan = useCallback(async (goals: NutritionGoal): Promise<string> => {
    return submitWeeklyMealPlanJob({
      daily_calories: goals.dailyCalories,
      daily_protein: goals.dailyProtein,
      daily_carbs: goals.dailyCarbs,
      daily_fat: goals.dailyFat,
      goal: goals.goal,
    })
  }, [])

  const regenerateDay = useCallback(async (dayId: string) => {
    const result = await regeneratePlanDay(dayId)
    patch(prev => ({
      plan: prev.plan,
      days: prev.days.map(d => d.id === dayId ? { ...d, meals: result.meals, notes: result.notes } : d),
    }))
  }, [patch])

  const logMeal = useCallback(async (dayId: string, mealId: string) => {
    const day = planDays.find(d => d.id === dayId)
    if (!day) return
    const meal = day.meals.find(m => m.id === mealId)
    if (!meal || meal.logged) return

    const food: FoodItem = {
      name: meal.label, portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 100,
      calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat,
      baseCal100: meal.calories, baseProt100: meal.protein, baseCarbs100: meal.carbs, baseFat100: meal.fat,
    }
    const entryData = {
      user: userId, meal_type: meal.meal_type, foods: [food],
      total_calories: meal.calories, total_protein: meal.protein,
      total_carbs: meal.carbs, total_fat: meal.fat,
      ai_model: 'weekly-plan', source: 'ai_weekly_plan', logged_at: new Date().toISOString(),
    }
    const entryRecord = await pb.collection('nutrition_entries').create(entryData)

    const updatedMeals = day.meals.map(m =>
      m.id === mealId ? { ...m, logged: true, logged_entry_id: entryRecord.id } : m,
    )
    await pb.collection('weekly_plan_days').update(dayId, { meals: updatedMeals })
    patch(prev => ({ plan: prev.plan, days: prev.days.map(d => d.id === dayId ? { ...d, meals: updatedMeals } : d) }))
    // Invalida el acumulador de nutrición para que los totales del día
    // reflejen la comida recién registrada sin esperar el staleTime de 30s.
    void qc.invalidateQueries({ queryKey: qk.nutrition.today(userId) })
  }, [userId, planDays, patch, qc])

  const deleteMeal = useCallback(async (dayId: string, mealId: string) => {
    const day = planDays.find(d => d.id === dayId)
    if (!day) return
    const updatedMeals = day.meals.filter(m => m.id !== mealId)
    await pb.collection('weekly_plan_days').update(dayId, { meals: updatedMeals })
    patch(prev => ({ plan: prev.plan, days: prev.days.map(d => d.id === dayId ? { ...d, meals: updatedMeals } : d) }))
  }, [planDays, patch])

  const archivePlan = useCallback(async () => {
    if (!activePlan) return
    await pb.collection('weekly_meal_plans').update(activePlan.id, { status: 'archived' })
    patch(() => ({ plan: null, days: [] }))
  }, [activePlan, patch])

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

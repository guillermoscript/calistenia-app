import { storage } from '../platform'
import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { addDays, localDateForPB, todayStr } from '../lib/dateUtils'
import { planDateKey } from '../lib/plan-shopping'
import { qk } from '../lib/query-keys'
import type {
  DailyTotals,
  FoodItem,
  MealDayPlan,
  PantryPlannedMeal,
  PantrySnapshotItem,
  PlanSource,
  WeeklyPlannedMeal,
} from '../types'

const LS_KEY = 'calistenia_day_plans'

/**
 * Cuántos días hacia atrás se traen. Se conserva el de ayer para que un plan
 * generado a las 23:50 no desaparezca de golpe al cruzar medianoche mientras
 * el usuario todavía lo está mirando.
 */
const KEEP_BACK_DAYS = 1

function lsGet(): MealDayPlan[] {
  try {
    const raw = JSON.parse(storage.getItem(LS_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function lsSet(plans: MealDayPlan[]) {
  storage.setItem(LS_KEY, JSON.stringify(plans))
}

const parseJson = <T,>(value: unknown, fallback: T): T => {
  if (value == null) return fallback
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapPlanRecord(rec: Record<string, any>): MealDayPlan {
  return {
    id: rec.id,
    user: rec.user,
    target_date: planDateKey(rec.target_date),
    source: rec.source,
    macro_basis: rec.macro_basis,
    status: rec.status,
    goal_snapshot: parseJson<DailyTotals>(rec.goal_snapshot, { calories: 0, protein: 0, carbs: 0, fat: 0 }),
    pantry_snapshot: parseJson<PantrySnapshotItem[]>(rec.pantry_snapshot, []),
    meals: parseJson<WeeklyPlannedMeal[]>(rec.meals, []),
    notes: rec.notes ?? '',
    ai_model: rec.ai_model ?? '',
    created: rec.created,
    updated: rec.updated,
  }
}

/** Planes de día activos desde ayer en adelante (cae a caché local en error). */
async function fetchDayPlans(uid: string): Promise<MealDayPlan[]> {
  try {
    const fromStr = localDateForPB(addDays(todayStr(), -KEEP_BACK_DAYS))
    const recs = await pb.collection('meal_day_plans').getFullList({
      filter: pb.filter('user = {:uid} && status = "active" && target_date >= {:from}', { uid, from: fromStr }),
      sort: 'target_date',
    })
    const plans = recs.map(mapPlanRecord)
    lsSet(plans)
    return plans
  } catch {
    return lsGet()
  }
}

export interface SaveDayPlanInput {
  targetDate: string
  source: PlanSource
  macroBasis: 'full' | 'remaining'
  goalSnapshot: DailyTotals
  pantrySnapshot: PantrySnapshotItem[]
  meals: PantryPlannedMeal[]
  notes: string
  aiModel: string
}

/**
 * Planes de UN día, sincronizados vía PocketBase (colección meal_day_plans).
 *
 * Se guardan en el servidor y no solo en local a petición explícita: generar el
 * plan en el móvil y verlo en la web (y al revés) es el caso de uso normal.
 * Forma pública alineada con useWeeklyMealPlan para que la UI trate ambos
 * planes igual.
 */
export function useMealPlans(userId: string | null) {
  const qc = useQueryClient()
  const key = qk.mealDayPlans.active(userId)

  const query = useQuery<MealDayPlan[]>({
    queryKey: key,
    enabled: !!userId,
    initialData: lsGet,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchDayPlans(userId!),
  })

  const dayPlans = query.data ?? []
  const isLoading = !!userId && !query.isFetched

  const patch = useCallback((updater: (prev: MealDayPlan[]) => MealDayPlan[]) => {
    qc.setQueryData<MealDayPlan[]>(key, (prev) => {
      const next = updater(prev ?? lsGet())
      lsSet(next)
      return next
    })
  }, [qc, key])

  const planForDate = useCallback(
    (date: string): MealDayPlan | undefined => dayPlans.find((p) => p.target_date === date),
    [dayPlans],
  )

  /**
   * Crea el plan y DESPUÉS archiva los que cubrían el mismo día. En ese orden
   * a propósito: si la creación falla, el usuario se queda con el plan viejo en
   * vez de con nada.
   */
  const saveDayPlan = useCallback(async (input: SaveDayPlanInput): Promise<MealDayPlan> => {
    if (!userId) throw new Error('Sesión requerida')

    const meals: WeeklyPlannedMeal[] = input.meals.map((m, i) => ({
      ...m,
      id: `${input.targetDate}_${i}_${input.source}`,
      logged: false,
    }))

    const rec = await pb.collection('meal_day_plans').create({
      user: userId,
      target_date: localDateForPB(input.targetDate),
      source: input.source,
      macro_basis: input.macroBasis,
      status: 'active',
      goal_snapshot: input.goalSnapshot,
      pantry_snapshot: input.pantrySnapshot,
      meals,
      notes: input.notes,
      ai_model: input.aiModel,
    })
    const created = mapPlanRecord(rec)

    const superseded = dayPlans.filter((p) => p.target_date === input.targetDate && p.id !== created.id)
    for (const old of superseded) {
      await pb.collection('meal_day_plans').update(old.id, { status: 'archived' }).catch(() => {})
    }

    patch((prev) => [
      ...prev.filter((p) => p.target_date !== input.targetDate),
      created,
    ].sort((a, b) => a.target_date.localeCompare(b.target_date)))

    return created
  }, [userId, dayPlans, patch])

  const archivePlan = useCallback(async (planId: string) => {
    await pb.collection('meal_day_plans').update(planId, { status: 'archived' })
    patch((prev) => prev.filter((p) => p.id !== planId))
  }, [patch])

  const writeMeals = useCallback(async (planId: string, meals: WeeklyPlannedMeal[]) => {
    await pb.collection('meal_day_plans').update(planId, { meals })
    patch((prev) => prev.map((p) => (p.id === planId ? { ...p, meals } : p)))
  }, [patch])

  /** Registra una comida del plan como entrada de nutrición (igual que el semanal). */
  const logMeal = useCallback(async (planId: string, mealId: string) => {
    const plan = dayPlans.find((p) => p.id === planId)
    if (!plan) return
    const meal = plan.meals.find((m) => m.id === mealId)
    if (!meal || meal.logged) return

    const food: FoodItem = {
      name: meal.label, portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 100,
      calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat,
      baseCal100: meal.calories, baseProt100: meal.protein, baseCarbs100: meal.carbs, baseFat100: meal.fat,
    }
    const entryRecord = await pb.collection('nutrition_entries').create({
      user: userId, meal_type: meal.meal_type, foods: [food],
      total_calories: meal.calories, total_protein: meal.protein,
      total_carbs: meal.carbs, total_fat: meal.fat,
      ai_model: 'day-plan', source: 'ai_day_plan', logged_at: new Date().toISOString(),
    })

    await writeMeals(
      planId,
      plan.meals.map((m) => (m.id === mealId ? { ...m, logged: true, logged_entry_id: entryRecord.id } : m)),
    )
    // Los totales de hoy deben incluir ya esta comida sin esperar el staleTime.
    void qc.invalidateQueries({ queryKey: qk.nutrition.today(userId) })
  }, [userId, dayPlans, writeMeals, qc])

  const deleteMeal = useCallback(async (planId: string, mealId: string) => {
    const plan = dayPlans.find((p) => p.id === planId)
    if (!plan) return
    await writeMeals(planId, plan.meals.filter((m) => m.id !== mealId))
  }, [dayPlans, writeMeals])

  const refresh = useCallback(async () => {
    if (!userId) return
    await query.refetch()
  }, [userId, query])

  return useMemo(() => ({
    dayPlans,
    isLoading,
    planForDate,
    saveDayPlan,
    archivePlan,
    logMeal,
    deleteMeal,
    refresh,
  }), [dayPlans, isLoading, planForDate, saveDayPlan, archivePlan, logMeal, deleteMeal, refresh])
}

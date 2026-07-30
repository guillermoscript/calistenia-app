/**
 * PLANIFICAR: el reducer puro que traduce las dos decisiones del usuario
 * (¿cuándo? ¿con qué?) en el presupuesto de macros y la llamada exacta al AI API.
 *
 * Existe porque la pantalla anterior tenía 11 botones para 6 capacidades reales,
 * y dos de ellos mandaban presupuestos que se contradecían: "plan del día"
 * (macros RESTANTES) y "plan desde despensa" (macros del día COMPLETO) vivían
 * uno al lado del otro y el segundo planificaba un día entero encima de lo ya
 * comido. Aquí la distinción es explícita y viaja al backend como `budget_kind`.
 *
 * TODO ES PURO: cero I/O, cero React, cero `new Date()`. Las fechas entran como
 * parámetro (`PlanDates`) para que el dispatch sea testeable con el reloj
 * congelado; `planDates()` es el único punto que consulta el calendario y lo
 * hace vía dateUtils (zona horaria del usuario), nunca con toISOString().
 */
import { addDays, startOfWeekStr, todayStr } from './dateUtils'
import type {
  DailyTotals,
  NutritionGoalType,
  PantrySnapshotItem,
} from '../types'

// ── Los dos ejes ─────────────────────────────────────────────────────────────

/** Eje CUÁNDO. */
export type PlanHorizon = 'today' | 'tomorrow' | 'week'
/** Eje CON QUÉ: 'pantry' = solo lo que ya tengo · 'buy' = libre, dime qué comprar. */
export type PlanBase = 'pantry' | 'buy'

export const PLAN_HORIZONS: readonly PlanHorizon[] = ['today', 'tomorrow', 'week']
export const PLAN_BASES: readonly PlanBase[] = ['pantry', 'buy']

/** Mismo tope que MAX_PENDING_JOBS en mcp-server (api-routes.ts + job-processor.ts). */
export const MAX_PENDING_JOBS = 2

/** Un día se considera cubierto cuando quedan ≤ 50 kcal: no vale gastar una llamada. */
export const COVERED_KCAL_THRESHOLD = 50

// ── Presupuesto ──────────────────────────────────────────────────────────────

export interface PlanBudget {
  /**
   * 'remaining' = lo que le queda al usuario HOY (ya comió el resto).
   * 'full'      = un día entero. Viaja al backend como `budget_kind`.
   */
  kind: 'full' | 'remaining'
  calories: number
  protein: number
  carbs: number
  fat: number
  /** Comidas ya registradas que el generador NO debe volver a proponer. */
  loggedMealTypes: string[]
}

export interface BudgetInput {
  horizon: PlanHorizon
  /** Metas diarias del usuario. null = sin metas configuradas. */
  goals: DailyTotals | null
  /** Lo consumido hoy. Solo cuenta para horizon 'today'. */
  todayTotals: DailyTotals
  /** Tipos de comida ya registrados hoy. Solo cuenta para horizon 'today'. */
  loggedMealTypes: string[]
}

const clamp0 = (n: number) => Math.max(0, Math.round(n))

/**
 * Presupuesto real de la generación.
 *
 * 'today' descuenta lo ya comido — planificar a media tarde debe llenar el
 * hueco que queda, no repetir el día. 'tomorrow' y 'week' son días completos y
 * arrancan sin comidas registradas: lo que el usuario comió HOY no restringe
 * lo que se planifica para MAÑANA.
 */
export function resolveBudget(input: BudgetInput): PlanBudget | null {
  const { horizon, goals, todayTotals, loggedMealTypes } = input
  if (!goals) return null

  if (horizon === 'today') {
    return {
      kind: 'remaining',
      calories: clamp0(goals.calories - todayTotals.calories),
      protein: clamp0(goals.protein - todayTotals.protein),
      carbs: clamp0(goals.carbs - todayTotals.carbs),
      fat: clamp0(goals.fat - todayTotals.fat),
      loggedMealTypes,
    }
  }

  return {
    kind: 'full',
    calories: clamp0(goals.calories),
    protein: clamp0(goals.protein),
    carbs: clamp0(goals.carbs),
    fat: clamp0(goals.fat),
    loggedMealTypes: [],
  }
}

// ── Base efectiva ────────────────────────────────────────────────────────────

/**
 * Con la despensa vacía no existe "planificar con lo que tengo": los endpoints
 * pantry responden 400 con `pantry_items: []`. La base cae a 'buy' en vez de
 * emitir una llamada que sabemos que falla.
 */
export function effectiveBase(requested: PlanBase, pantryCount: number): PlanBase {
  if (requested === 'pantry' && pantryCount === 0) return 'buy'
  return requested
}

// ── Fechas ───────────────────────────────────────────────────────────────────

export interface PlanDates {
  today: string
  tomorrow: string
  /** Lunes de la semana en curso: `weekly_plan_days.day_index` 0 = lunes. */
  weekStart: string
}

/** Único punto que consulta el calendario. Zona horaria del usuario, vía dateUtils. */
export function planDates(): PlanDates {
  const today = todayStr()
  return { today, tomorrow: addDays(today, 1), weekStart: startOfWeekStr() }
}

/** Fecha objetivo de un horizonte de día. 'week' no tiene una: usa weekStart. */
export function targetDateFor(horizon: PlanHorizon, dates: PlanDates): string {
  return horizon === 'tomorrow' ? dates.tomorrow : dates.today
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export interface PantryPlanGoalsBody {
  calories: number
  protein: number
  carbs: number
  fat: number
}

/** Cuerpo exacto de POST /api/generate-pantry-plan (horizon: 'day'). */
export interface PantryDayBody {
  horizon: 'day'
  target_date: string
  pantry_items: PantrySnapshotItem[]
  goals: PantryPlanGoalsBody
  budget_kind: 'full' | 'remaining'
}

/** Cuerpo exacto de POST /api/generate-meal-plan. */
export interface FreeDayBody {
  remaining_calories: number
  remaining_protein: number
  remaining_carbs: number
  remaining_fat: number
  logged_meal_types: string[]
  /** NO restrictivo: solo etiqueta cada ingrediente 'pantry' o 'buy'. */
  pantry_items: PantrySnapshotItem[]
}

/** Cuerpo exacto de POST /api/jobs/generate-pantry-plan. */
export interface PantryWeekBody {
  week_start: string
  pantry_items: PantrySnapshotItem[]
  goals: PantryPlanGoalsBody
}

/** Cuerpo exacto de POST /api/jobs/generate-weekly-meal-plan. */
export interface FreeWeekBody {
  daily_calories: number
  daily_protein: number
  daily_carbs: number
  daily_fat: number
  goal: NutritionGoalType
  week_start: string
  pantry_items: PantrySnapshotItem[]
}

export type PlanDispatch =
  | { mode: 'sync'; endpoint: 'pantry-day'; base: 'pantry'; horizon: PlanHorizon; targetDate: string; body: PantryDayBody }
  | { mode: 'sync'; endpoint: 'free-day'; base: 'buy'; horizon: PlanHorizon; targetDate: string; body: FreeDayBody }
  | { mode: 'job'; endpoint: 'pantry-week'; base: 'pantry'; horizon: 'week'; weekStart: string; body: PantryWeekBody }
  | { mode: 'job'; endpoint: 'free-week'; base: 'buy'; horizon: 'week'; weekStart: string; body: FreeWeekBody }

export interface DispatchInput {
  horizon: PlanHorizon
  /** Base PEDIDA por el usuario; se resuelve a la efectiva aquí dentro. */
  base: PlanBase
  budget: PlanBudget
  /** Objetivo del usuario (bulk/déficit/...) — solo lo pide el semanal libre. */
  goalType: NutritionGoalType
  pantryItems: PantrySnapshotItem[]
  dates: PlanDates
}

/**
 * Las 6 celdas de la matriz → 4 endpoints. Un solo sitio decide, así que la UI
 * no puede volver a ofrecer dos botones que hacen exactamente lo mismo.
 *
 * Nota sobre 'tomorrow' + 'buy': /api/generate-meal-plan no tiene parámetro de
 * fecha — el servidor solo recibe macros. La fecha la pone el cliente al
 * persistir, y por eso el presupuesto va COMPLETO y sin logged_meal_types.
 */
export function resolveDispatch(input: DispatchInput): PlanDispatch {
  const { horizon, budget, goalType, pantryItems, dates } = input
  const base = effectiveBase(input.base, pantryItems.length)
  const goals: PantryPlanGoalsBody = {
    calories: budget.calories,
    protein: budget.protein,
    carbs: budget.carbs,
    fat: budget.fat,
  }

  if (horizon === 'week') {
    if (base === 'pantry') {
      return {
        mode: 'job',
        endpoint: 'pantry-week',
        base: 'pantry',
        horizon: 'week',
        weekStart: dates.weekStart,
        body: { week_start: dates.weekStart, pantry_items: pantryItems, goals },
      }
    }
    return {
      mode: 'job',
      endpoint: 'free-week',
      base: 'buy',
      horizon: 'week',
      weekStart: dates.weekStart,
      body: {
        daily_calories: budget.calories,
        daily_protein: budget.protein,
        daily_carbs: budget.carbs,
        daily_fat: budget.fat,
        goal: goalType,
        week_start: dates.weekStart,
        pantry_items: pantryItems,
      },
    }
  }

  const targetDate = targetDateFor(horizon, dates)

  if (base === 'pantry') {
    return {
      mode: 'sync',
      endpoint: 'pantry-day',
      base: 'pantry',
      horizon,
      targetDate,
      body: {
        horizon: 'day',
        target_date: targetDate,
        pantry_items: pantryItems,
        goals,
        budget_kind: budget.kind,
      },
    }
  }

  return {
    mode: 'sync',
    endpoint: 'free-day',
    base: 'buy',
    horizon,
    targetDate,
    body: {
      remaining_calories: budget.calories,
      remaining_protein: budget.protein,
      remaining_carbs: budget.carbs,
      remaining_fat: budget.fat,
      logged_meal_types: budget.loggedMealTypes,
      pantry_items: pantryItems,
    },
  }
}

// ── Por qué no se puede generar ──────────────────────────────────────────────

export type PlanBlocker =
  | 'noGoals'
  | 'jobPending'
  | 'queueFull'
  | 'todayCovered'
  | 'emptyPantry'

export interface BlockerInput {
  horizon: PlanHorizon
  /** Base PEDIDA (no la efectiva): queremos poder explicar la despensa vacía. */
  base: PlanBase
  budget: PlanBudget | null
  pantryCount: number
  /** Ya hay un job de plan de este usuario en vuelo. */
  planJobPending: boolean
  /** Jobs de IA pendientes/procesando en total. */
  pendingJobs: number
  maxPendingJobs?: number
}

/**
 * Un único motivo, en orden de precedencia: sin metas no hay presupuesto que
 * calcular; con un job en vuelo el botón duplicaría trabajo; con la cola llena
 * el POST se rechazaría con 429; el día ya cubierto no vale una llamada; y
 * "con lo que tengo" sin despensa no existe.
 *
 * Devolver el motivo en vez de un booleano es deliberado: la pantalla anterior
 * hacía `return null` cuando no quedaban macros y el bloque entero desaparecía
 * sin explicación.
 */
export function disabledReason(input: BlockerInput): PlanBlocker | null {
  const { horizon, base, budget, pantryCount, planJobPending, pendingJobs } = input
  const max = input.maxPendingJobs ?? MAX_PENDING_JOBS

  if (!budget) return 'noGoals'

  // Solo el horizonte semanal pasa por la cola de jobs; los planes de día son
  // peticiones síncronas y no compiten por ese cupo.
  if (horizon === 'week') {
    if (planJobPending) return 'jobPending'
    if (pendingJobs >= max) return 'queueFull'
  }

  if (horizon === 'today' && budget.kind === 'remaining' && budget.calories <= COVERED_KCAL_THRESHOLD) {
    return 'todayCovered'
  }

  if (base === 'pantry' && pantryCount === 0) return 'emptyPantry'

  return null
}

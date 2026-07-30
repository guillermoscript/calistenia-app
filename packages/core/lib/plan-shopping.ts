/**
 * Puente entre los planes de comida y la lista de compras.
 *
 * Existía un agujero: `ShoppingListView` derivaba los ingredientes SOLO de
 * `planDays` (el plan semanal), así que un plan de día — el que más se usa —
 * nunca llegaba a la lista y "planificar comprando" no servía para comprar.
 * Aquí se juntan ambas fuentes en una sola lista de ingredientes.
 *
 * TODO ES PURO: cero I/O, cero React, cero `new Date()` (hoy entra como
 * parámetro). El diff contra el inventario NO se hace aquí — de eso ya se
 * encarga `buildShoppingList` en shopping.ts, que resta lo que hay en despensa
 * incluso a los ingredientes marcados 'pantry' (el inventario pudo cambiar
 * desde que se generó el plan).
 */
import type { MealDayPlan, Recipe, RecipeIngredient, WeeklyPlanDay } from '../types'

/** Lo mínimo que necesita una comida para aportar ingredientes. */
export interface PlannedMealLike {
  logged?: boolean
  recipe?: Recipe | null
}

export interface PlanIngredientSource {
  /** YYYY-MM-DD que cubre este set de comidas. */
  date: string
  meals: PlannedMealLike[]
}

/** PB devuelve las fechas como "YYYY-MM-DD 00:00:00.000Z"; aquí solo el día. */
export function planDateKey(raw: string | null | undefined): string {
  return (raw ?? '').slice(0, 10)
}

/**
 * Une planes de día y días del plan semanal en una sola lista de fuentes.
 * Si un día está cubierto por ambos, gana el plan de día: es el más reciente y
 * el más específico, y contar los dos duplicaría la compra.
 */
export function planSources(
  dayPlans: MealDayPlan[],
  weekDays: WeeklyPlanDay[],
): PlanIngredientSource[] {
  const byDate = new Map<string, PlanIngredientSource>()

  for (const d of weekDays) {
    const date = planDateKey(d.date)
    if (!date) continue
    byDate.set(date, { date, meals: d.meals ?? [] })
  }

  for (const p of dayPlans) {
    if (p.status !== 'active') continue
    const date = planDateKey(p.target_date)
    if (!date) continue
    byDate.set(date, { date, meals: p.meals ?? [] })
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Ingredientes de todo lo planificado de hoy en adelante.
 *
 * Se saltan los días pasados (no se compra para ayer) y las comidas ya
 * registradas (ya te la comiste: no vuelve a la lista). Devuelve TODOS los
 * ingredientes, incluidos los marcados 'pantry' — restar el inventario es
 * trabajo de buildShoppingList, que lo hace contra la despensa de AHORA.
 */
export function collectPlanIngredients(
  sources: PlanIngredientSource[],
  today: string,
): RecipeIngredient[] {
  const out: RecipeIngredient[] = []
  for (const src of sources) {
    if (src.date < today) continue
    for (const meal of src.meals) {
      if (meal.logged) continue
      for (const ing of meal.recipe?.ingredients ?? []) {
        if (!ing?.name_normalized) continue
        out.push(ing)
      }
    }
  }
  return out
}

/**
 * Cuántos ingredientes distintos hay que comprar según el propio plan
 * (`from: 'buy'`). Es la señal que la UI muestra junto al plan ("N por
 * comprar") — una pista barata, no la lista real: esa sale del diff contra el
 * inventario en buildShoppingList.
 */
export function buyIngredientNames(
  sources: PlanIngredientSource[],
  today: string,
): string[] {
  const seen = new Set<string>()
  for (const ing of collectPlanIngredients(sources, today)) {
    if (ing.from === 'buy') seen.add(ing.name_normalized)
  }
  return [...seen]
}

/** Atajo sobre buyIngredientNames para badges. */
export function buyIngredientCount(sources: PlanIngredientSource[], today: string): number {
  return buyIngredientNames(sources, today).length
}

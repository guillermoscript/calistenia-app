/**
 * Despensa F5 (issue #174): atribución de costo real por comida y resumen
 * semanal de gasto. CÓDIGO PURO — cero LLM, cero I/O. Fuente: eventos consume
 * con linked_entry (F4) × unitCost (F3). Regla de dinero: acumular en
 * precisión completa; redondear SOLO al presentar (formatMoney).
 */
import type { PantryEvent, PantryItem } from '../types'
import { addDaysISO, normalizeQty, unitCost } from './shopping'

export type SpendCoverage = 'full' | 'partial' | 'none'

export interface EntryCost {
  total: number
  currency: string
  /** partial = algún food sin evento o sin precio → la UI antepone "≥". */
  coverage: SpendCoverage
}

/** Subset de nutrition_entry que necesita el cálculo. date = YYYY-MM-DD LOCAL. */
export interface SpendEntryLite {
  id: string
  date: string
  foodsCount: number
}

export interface SpendSummary {
  weekTotal: number
  byDay: { date: string; total: number }[]
  avgPerMeal: number
  mealsWithCost: number
  currency: string
  hasPartial: boolean
}

/**
 * Costo real de un nutrition_entry: Σ |delta_qty| × unitCost(item) de sus
 * eventos consume (linked_entry). delta_qty viene en la UNIDAD del item
 * (contrato F4) → se normaliza a base antes de multiplicar por costPerBase.
 * Cobertura (proxy determinista, F4 crea un evento por food matcheado):
 * - none: sin eventos, o ningún evento con precio (no mostrar $0 falso)
 * - partial: menos eventos que foods, o algún evento sin precio
 * - full: todos los eventos con precio y eventos ≥ foods
 */
export function computeEntryCost(
  entryId: string,
  foodsCount: number,
  events: PantryEvent[],
  itemsById: Map<string, PantryItem>,
): EntryCost {
  const evs = events.filter(
    (e) => e.type === 'consume' && e.linkedEntry === entryId && e.deltaQty != null && e.deltaQty < 0,
  )
  if (evs.length === 0) return { total: 0, currency: 'USD', coverage: 'none' }

  let total = 0
  let currency = 'USD'
  let priced = 0
  for (const e of evs) {
    const item = itemsById.get(e.item)
    const uc = item ? unitCost(item) : null
    if (!item || !uc || item.unit == null) continue
    total += normalizeQty(Math.abs(e.deltaQty as number), item.unit).qty * uc.costPerBase
    currency = uc.currency
    priced++
  }
  if (priced === 0) return { total: 0, currency, coverage: 'none' }
  const coverage: SpendCoverage = priced === evs.length && evs.length >= foodsCount ? 'full' : 'partial'
  return { total, currency, coverage }
}

/** Resumen de la semana [weekStart, weekStart+6]. Entries fuera se ignoran. */
export function computeSpendSummary(
  entries: SpendEntryLite[],
  events: PantryEvent[],
  itemsById: Map<string, PantryItem>,
  weekStart: string,
): SpendSummary {
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i))
  const byDay = days.map((date) => ({ date, total: 0 }))
  let weekTotal = 0
  let mealsWithCost = 0
  let hasPartial = false
  let currency = 'USD'

  for (const entry of entries) {
    const di = days.indexOf(entry.date)
    if (di === -1) continue
    const cost = computeEntryCost(entry.id, entry.foodsCount, events, itemsById)
    if (cost.coverage === 'none') continue
    weekTotal += cost.total
    byDay[di].total += cost.total
    mealsWithCost++
    currency = cost.currency
    if (cost.coverage === 'partial') hasPartial = true
  }

  return {
    weekTotal,
    byDay,
    avgPerMeal: mealsWithCost > 0 ? weekTotal / mealsWithCost : 0,
    mealsWithCost,
    currency,
    hasPartial,
  }
}

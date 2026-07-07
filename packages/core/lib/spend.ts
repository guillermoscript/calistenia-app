/**
 * Despensa F5 (issue #174): atribución de costo real por comida y resumen
 * semanal de gasto. CÓDIGO PURO — cero LLM, cero I/O. Fuente: eventos consume
 * con linked_entry (F4) × unitCost (F3). Regla de dinero: acumular en
 * precisión completa; redondear SOLO al presentar (formatMoney).
 */
import type { PantryEvent, PantryItem } from '../types'
import { addDaysISO, normalizeQty, unitCost, type UnitCost } from './shopping'

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
  /** hasPartial por día — el "≥" de "Hoy" no debe heredar parciales de otros días. */
  byDay: { date: string; total: number; hasPartial: boolean }[]
  avgPerMeal: number
  mealsWithCost: number
  currency: string
  hasPartial: boolean
}

/**
 * Costo por unidad base de cada item usando la CANTIDAD ORIGINAL comprada
 * (evento add del ledger), NO la quantity actual: F4 decrementa quantity tras
 * cada consumo, así que price_total / quantity-actual inflaría el costo comida
 * a comida y lo perdería del todo al agotarse el item (quantity 0 → null).
 * Sin evento add con qty > 0 → fallback a unitCost(item) (quantity actual).
 */
export function buildUnitCosts(
  events: PantryEvent[],
  itemsById: Map<string, PantryItem>,
): Map<string, UnitCost> {
  const out = new Map<string, UnitCost>()
  for (const [id, item] of itemsById) {
    if (item.priceTotal == null || item.unit == null) continue
    const addEv = events.find((e) => e.type === 'add' && e.item === id && e.deltaQty != null && e.deltaQty > 0)
    if (addEv) {
      const { qty, baseUnit } = normalizeQty(addEv.deltaQty as number, item.unit)
      if (qty > 0) {
        out.set(id, { costPerBase: item.priceTotal / qty, currency: item.currency || 'USD', baseUnit })
        continue
      }
    }
    const uc = unitCost(item)
    if (uc) out.set(id, uc)
  }
  return out
}

/**
 * Costo real de un nutrition_entry: Σ |delta_qty| × costo/base ORIGINAL del
 * item (buildUnitCosts) de sus eventos consume (linked_entry). delta_qty viene en la UNIDAD del item
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
  unitCosts?: Map<string, UnitCost>,
): EntryCost {
  const evs = events.filter(
    (e) => e.type === 'consume' && e.linkedEntry === entryId && e.deltaQty != null && e.deltaQty < 0,
  )
  if (evs.length === 0) return { total: 0, currency: 'USD', coverage: 'none' }

  const ucs = unitCosts ?? buildUnitCosts(events, itemsById)
  let total = 0
  let currency = 'USD'
  let priced = 0
  for (const e of evs) {
    const item = itemsById.get(e.item)
    const uc = ucs.get(e.item)
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
  const byDay = days.map((date) => ({ date, total: 0, hasPartial: false }))
  const unitCosts = buildUnitCosts(events, itemsById)
  let weekTotal = 0
  let mealsWithCost = 0
  let hasPartial = false
  let currency = 'USD'

  for (const entry of entries) {
    const di = days.indexOf(entry.date)
    if (di === -1) continue
    const cost = computeEntryCost(entry.id, entry.foodsCount, events, itemsById, unitCosts)
    if (cost.coverage === 'none') continue
    weekTotal += cost.total
    byDay[di].total += cost.total
    mealsWithCost++
    currency = cost.currency
    if (cost.coverage === 'partial') {
      hasPartial = true
      byDay[di].hasPartial = true
    }
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

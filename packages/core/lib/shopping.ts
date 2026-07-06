/**
 * Despensa F3 (issue #172): shopping list determinista + costos.
 * TODO ES CÓDIGO PURO — cero LLM, cero I/O. Regla de dinero: acumular en
 * precisión completa; redondear SOLO al presentar (formatMoney).
 */
import type {
  PantryItem,
  PantryUnit,
  RecipeIngredient,
  ShoppingListItem,
  ShoppingReason,
} from '../types'
import { daysUntil } from './pantry'

export type BaseUnit = 'g' | 'ml' | 'unidad' | 'paquete'

const TO_BASE: Record<PantryUnit, { base: BaseUnit; factor: number }> = {
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  unidad: { base: 'unidad', factor: 1 },
  paquete: { base: 'paquete', factor: 1 },
}

export function normalizeQty(qty: number, unit: PantryUnit): { qty: number; baseUnit: BaseUnit } {
  const { base, factor } = TO_BASE[unit]
  return { qty: qty * factor, baseUnit: base }
}

const trimNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** qty viene en unidad base; ≥1000 g/ml se humaniza a kg/l. */
export function formatQty(qty: number | null, unit: PantryUnit | null): string {
  if (qty == null) return ''
  if (unit === 'g' && qty >= 1000) return `${trimNum(qty / 1000)} kg`
  if (unit === 'ml' && qty >= 1000) return `${trimNum(qty / 1000)} l`
  return unit ? `${trimNum(qty)} ${unit}` : trimNum(qty)
}

/** Suma días a un ISO date usando date parts locales (nada de UTC — lección F2). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

export interface UnitCost {
  costPerBase: number
  currency: string
  baseUnit: BaseUnit
}

/** Costo unitario real de un item comprado: price_total / quantity en unidad base. */
export function unitCost(item: PantryItem): UnitCost | null {
  if (item.priceTotal == null || item.quantity == null || item.quantity <= 0 || item.unit == null) {
    return null
  }
  const { qty, baseUnit } = normalizeQty(item.quantity, item.unit)
  if (qty <= 0) return null
  return { costPerBase: item.priceTotal / qty, currency: item.currency || 'USD', baseUnit }
}

/**
 * Precio estimado determinista: costo unitario de la compra más reciente del
 * mismo name_normalized con unidad compatible, × qty faltante. qty en unidad
 * TAL CUAL (se normaliza adentro). Sin histórico compatible → null.
 */
export function estimateItemPrice(
  nameNormalized: string,
  qty: number | null,
  unit: PantryUnit | null,
  pantryItems: PantryItem[],
): number | null {
  if (qty == null || unit == null) return null
  const need = normalizeQty(qty, unit)
  const candidates = pantryItems
    .map((p) => ({ p, uc: unitCost(p) }))
    .filter((c): c is { p: PantryItem; uc: UnitCost } =>
      c.uc != null && c.p.nameNormalized === nameNormalized && c.uc.baseUnit === need.baseUnit,
    )
    .sort((a, b) => (b.p.purchaseDate ?? '').localeCompare(a.p.purchaseDate ?? ''))
  const best = candidates[0]
  return best ? best.uc.costPerBase * need.qty : null
}

function mkItem(
  name: string,
  nameNormalized: string,
  qty: number | null,
  unit: PantryUnit | null,
  reasons: ShoppingReason[],
  incompatibleHave: { qty: number; unit: PantryUnit } | null,
): ShoppingListItem {
  return {
    name,
    name_normalized: nameNormalized,
    qty,
    unit,
    est_price: null,
    currency: 'USD',
    checked: false,
    actual_price: null,
    reasons,
    incompatible_have: incompatibleHave,
  }
}

/**
 * Diff determinista: ingredientes del plan (TODOS, incl. from:'pantry' — la
 * despensa puede haber cambiado desde que se generó el plan) − inventario
 * activo. Merge por name_normalized + unidad base compatible. Unidades no
 * convertibles NUNCA se restan: línea con incompatible_have para que el
 * usuario verifique.
 */
export function buildShoppingList(
  planIngredients: RecipeIngredient[],
  pantryItems: PantryItem[],
): ShoppingListItem[] {
  interface Need {
    name: string
    name_normalized: string
    baseUnit: BaseUnit | null
    qty: number | null
  }
  const needs = new Map<string, Need>()
  for (const ing of planIngredients) {
    const norm = ing.qty != null && ing.unit != null ? normalizeQty(ing.qty, ing.unit) : null
    const key = `${ing.name_normalized}|${norm ? norm.baseUnit : '?'}`
    const prev = needs.get(key)
    if (prev) {
      if (prev.qty != null && norm) prev.qty += norm.qty
      else prev.qty = null // sin dato en alguna receta → no inventamos el total
    } else {
      needs.set(key, {
        name: ing.name,
        name_normalized: ing.name_normalized,
        baseUnit: norm ? norm.baseUnit : null,
        qty: norm ? norm.qty : null,
      })
    }
  }

  const out: ShoppingListItem[] = []
  for (const need of needs.values()) {
    const matches = pantryItems.filter(
      (p) => p.status === 'active' && p.nameNormalized === need.name_normalized,
    )
    const compatible = matches.filter(
      (p) => p.quantity != null && p.unit != null && TO_BASE[p.unit].base === need.baseUnit,
    )

    if (need.qty == null) {
      if (matches.length === 0) {
        out.push(mkItem(need.name, need.name_normalized, null, null, ['plan'], null))
      }
      continue
    }

    const have = compatible.reduce(
      (acc, p) => acc + normalizeQty(p.quantity as number, p.unit as PantryUnit).qty,
      0,
    )
    const missing = need.qty - have
    if (missing <= 0) continue

    const incomp = matches.find((p) => !compatible.includes(p) && p.quantity != null && p.unit != null)
    out.push(
      mkItem(
        need.name,
        need.name_normalized,
        missing,
        need.baseUnit as PantryUnit,
        ['plan'],
        incomp ? { qty: incomp.quantity as number, unit: incomp.unit as PantryUnit } : null,
      ),
    )
  }
  return out
}

export interface NextPurchase {
  nextDate: string
  daysLeft: number
}

/** Bloque "PRÓXIMA COMPRA · en N días". Sin compra previa: hoy + cadencia. */
export function nextPurchaseInfo(
  lastPurchaseDate: string | null,
  cadenceDays: number,
  today: string,
): NextPurchase {
  let next = addDaysISO(lastPurchaseDate ?? today, cadenceDays)
  if (next < today) next = today
  return { nextDate: next, daysLeft: Math.max(0, daysUntil(next, today) ?? 0) }
}

export interface CycleParams {
  planIngredients: RecipeIngredient[]
  pantryItems: PantryItem[]
  /** Días hasta la próxima compra (proyección VENCE). */
  horizonDays: number
  /** YYYY-MM-DD local. */
  today: string
  /** Ventana SE ACABÓ: depleted desde esta fecha. Default hoy − 14d. */
  sinceDate?: string | null
}

/**
 * Ciclo de compra (comentario de #172): lista = faltantes del plan (PLAN)
 * + activos que vencen antes de la próxima compra (VENCE, sugiere recomprar
 * la qty actual) + agotados recientes del ledger (SE ACABÓ, qty null — V1
 * heurística sin tasas de consumo, no espera F4). est_price determinista
 * desde el histórico de precios de la despensa.
 */
export function buildCycleShoppingList(params: CycleParams): ShoppingListItem[] {
  const { planIngredients, pantryItems, horizonDays, today } = params
  const since = params.sinceDate ?? addDaysISO(today, -14)

  const items = buildShoppingList(planIngredients, pantryItems)

  // Fusiona por nombre Y unidad compatible: el plan puede tener 2 líneas del
  // mismo ingrediente en unidades no convertibles (unidad vs paquete) — la
  // razón vence/se_acabo debe caer en la línea correcta, no en la última
  const findLine = (nameNormalized: string, unit: PantryUnit | null) =>
    items.find(
      (it) =>
        it.name_normalized === nameNormalized &&
        (unit == null || it.unit == null || TO_BASE[it.unit].base === TO_BASE[unit].base),
    )

  const addReason = (
    p: PantryItem,
    reason: ShoppingReason,
    qty: number | null,
    unit: PantryUnit | null,
  ) => {
    const existing = findLine(p.nameNormalized, unit)
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
      return
    }
    items.push(mkItem(p.name, p.nameNormalized, qty, unit, [reason], null))
  }

  for (const p of pantryItems) {
    if (p.status === 'active') {
      const d = daysUntil(p.expiryEstimate, today)
      if (d != null && d <= horizonDays) {
        const norm = p.quantity != null && p.unit != null ? normalizeQty(p.quantity, p.unit) : null
        addReason(p, 'vence', norm?.qty ?? null, (norm?.baseUnit as PantryUnit) ?? null)
      }
    } else if (p.status === 'depleted') {
      if ((p.updated ?? '').slice(0, 10) >= since) addReason(p, 'se_acabo', null, null)
    }
  }

  for (const it of items) {
    it.est_price = estimateItemPrice(it.name_normalized, it.qty, it.unit, pantryItems)
  }
  return items
}

export interface RecipeCostBreakdownRow {
  name: string
  cost: number | null
  source: 'real' | 'estimada' | 'sin_precio'
}

export interface RecipeCost {
  total: number
  perServing: number
  currency: string
  hasEstimates: boolean
  breakdown: RecipeCostBreakdownRow[]
}

/**
 * Costo de receta: Σ qty × costo unitario del item de despensa matcheado
 * (preferencia: price_source real > estimada; luego compra más reciente).
 * Sin match → estFallback[name_normalized] marcado estimada; sin nada →
 * sin_precio (excluido del total, listado en breakdown por transparencia).
 * hasEstimates: true ⇒ la UI SIEMPRE muestra ~ antes del monto.
 */
export function computeRecipeCost(
  ingredients: RecipeIngredient[],
  pantryItems: PantryItem[],
  servings: number,
  estFallback?: Record<string, number>,
): RecipeCost {
  let total = 0
  let hasEstimates = false
  let currency = 'USD'
  const breakdown: RecipeCostBreakdownRow[] = []

  for (const ing of ingredients) {
    let cost: number | null = null
    let source: RecipeCostBreakdownRow['source'] = 'sin_precio'

    if (ing.qty != null && ing.unit != null) {
      const need = normalizeQty(ing.qty, ing.unit)
      const best = pantryItems
        .map((p) => ({ p, uc: unitCost(p) }))
        .filter((c): c is { p: PantryItem; uc: UnitCost } =>
          c.uc != null && c.p.nameNormalized === ing.name_normalized && c.uc.baseUnit === need.baseUnit,
        )
        .sort((a, b) => {
          const rank = (x: { p: PantryItem }) => (x.p.priceSource === 'real' ? 0 : 1)
          return rank(a) - rank(b) || (b.p.purchaseDate ?? '').localeCompare(a.p.purchaseDate ?? '')
        })[0]
      if (best) {
        cost = best.uc.costPerBase * need.qty
        source = best.p.priceSource === 'real' ? 'real' : 'estimada'
        currency = best.uc.currency
      }
    }

    if (cost == null && estFallback && estFallback[ing.name_normalized] != null) {
      cost = estFallback[ing.name_normalized]
      source = 'estimada'
    }

    if (cost != null) total += cost
    // sin_precio también fuerza ~: el total está incompleto, no es "real"
    if (source !== 'real') hasEstimates = true
    breakdown.push({ name: ing.name, cost, source })
  }

  return {
    total,
    perServing: servings > 0 ? total / servings : total,
    currency,
    hasEstimates,
    breakdown,
  }
}

/** est = Σ est_price; actual = Σ (actual_price ?? est_price) de los checked. */
export function shoppingTotals(items: ShoppingListItem[]): { est: number; actual: number } {
  let est = 0
  let actual = 0
  for (const it of items) {
    if (it.est_price != null) est += it.est_price
    if (it.checked) actual += it.actual_price ?? it.est_price ?? 0
  }
  return { est, actual }
}

/** Redondeo a 2 decimales SOLO aquí, nunca en acumuladores. */
export function formatMoney(n: number): string {
  return n.toFixed(2)
}

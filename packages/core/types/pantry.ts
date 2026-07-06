export type PantryCategory =
  | 'proteina' | 'vegetal' | 'fruta' | 'carbohidrato' | 'lacteo'
  | 'grasa' | 'condimento' | 'bebida' | 'otro'
export type PantryUnit = 'g' | 'kg' | 'ml' | 'l' | 'unidad' | 'paquete'
export type PantryConfidence = 'high' | 'med' | 'low'
export type PantryStatus = 'active' | 'depleted' | 'discarded'
export type PantrySource = 'chat' | 'receipt' | 'shopping' | 'manual'
export type PantryEventType = 'add' | 'consume' | 'adjust' | 'discard'
export type PantryIntent = 'add' | 'consume' | 'discard' | 'query' | 'unknown'

export interface PantryItem {
  id: string
  user?: string
  name: string
  nameNormalized: string
  category: PantryCategory
  quantity: number | null
  unit: PantryUnit | null
  priceTotal: number | null
  currency: string
  priceSource: 'real' | 'estimada' | null
  purchaseDate: string | null       // YYYY-MM-DD
  expiryEstimate: string | null     // YYYY-MM-DD
  confidence: PantryConfidence
  status: PantryStatus
  source: PantrySource
  /** Autodate de PB — usado por la ventana SE ACABÓ del ciclo de compra. */
  updated?: string | null
}

export interface PantryEvent {
  id: string
  user?: string
  item: string
  type: PantryEventType
  deltaQty: number | null
  linkedEntry?: string | null
}

// Shape que devuelve POST /api/pantry/parse (snake_case: viene del wire)
export interface PantryParsedItem {
  name: string
  name_normalized: string
  category: PantryCategory
  quantity: number | null
  unit: PantryUnit | null
  price_total: number | null
  expiry_days: number | null
  confidence: PantryConfidence
}

export interface PantryParseResult {
  intent: PantryIntent
  items: PantryParsedItem[]
  reply: string
  model_used?: string
}

// ─── F2: plan pantry-aware (#171) ────────────────────────────────────────────

export interface RecipeIngredient {
  name: string
  name_normalized: string
  qty: number | null
  unit: PantryUnit | null
  from: 'pantry' | 'buy'
}

export interface Recipe {
  steps: string[]
  ingredients: RecipeIngredient[]
  prep_minutes: number | null
  /** Porciones que rinde la receta tal como está escrita (normalmente 1). Opcional: planes viejos no lo traen. */
  servings?: number | null
  /** Nombre del plato en inglés para buscar foto (TheMealDB). Opcional: planes viejos no lo traen. */
  photo_query?: string | null
}

// Subset de PantryItem que viaja al AI API al generar (snake_case: wire)
export interface PantrySnapshotItem {
  name: string
  name_normalized: string
  category: PantryCategory
  quantity: number | null
  unit: PantryUnit | null
  expiry_estimate: string | null
}

export interface HowManyMealsBreakdownRow {
  meal_label: string
  times_possible: number
  limiting_ingredient: string
}

export interface HowManyMealsResult {
  total_meals: number
  days_covered: number
  breakdown: HowManyMealsBreakdownRow[]
  summary: string
  model_used?: string
}

// ── Shopping list (F3, issue #172) ──────────────────────────────────────────

/** Razón por la que un item está en la lista (ciclo de compra). */
export type ShoppingReason = 'plan' | 'se_acabo' | 'vence'

export interface ShoppingListItem {
  name: string
  name_normalized: string
  /** Cantidad faltante en unidad BASE (g/ml/unidad/paquete). null = sin dato, el usuario decide. */
  qty: number | null
  unit: PantryUnit | null
  /** Derivado del histórico de precios de la despensa. Nunca de un LLM. */
  est_price: number | null
  currency: string
  checked: boolean
  actual_price: number | null
  /** true = ya ingresado a despensa por "compra hecha" (progreso persistido; un retry no lo re-crea). */
  purchased?: boolean
  reasons: ShoppingReason[]
  /** Existe el item en despensa pero en unidad no convertible (ej. plan pide 200 g, hay 4 unidad). */
  incompatible_have: { qty: number; unit: PantryUnit } | null
}

export interface ShoppingList {
  id: string
  user?: string
  status: 'active' | 'done'
  items: ShoppingListItem[]
  linked_plan: string | null
  total_est: number | null
  total_actual: number | null
  updated?: string
}

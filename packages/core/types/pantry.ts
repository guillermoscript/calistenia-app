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

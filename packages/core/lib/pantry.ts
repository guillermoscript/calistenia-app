import { addDays } from './dateUtils'
import type { PantryCategory, PantryItem } from '../types'

export const PANTRY_CATEGORY_ORDER: PantryCategory[] = [
  'proteina', 'vegetal', 'fruta', 'carbohidrato', 'lacteo',
  'grasa', 'condimento', 'bebida', 'otro',
]

/**
 * El parser devuelve expiry_days relativos; PB guarda fecha absoluta.
 * base = purchase_date si vino, sino hoy (inyectado por el caller, testeable).
 */
export function expiryFromDays(days: number | null, base: string): string | null {
  if (days == null || !base) return null
  return addDays(base, days)
}

export interface PantrySection {
  category: PantryCategory
  data: PantryItem[]
}

export function groupPantryByCategory(items: PantryItem[]): PantrySection[] {
  const byCat = new Map<PantryCategory, PantryItem[]>()
  for (const it of items) {
    const cat = PANTRY_CATEGORY_ORDER.includes(it.category) ? it.category : 'otro'
    const bucket = byCat.get(cat)
    if (bucket) bucket.push(it)
    else byCat.set(cat, [it])
  }
  return PANTRY_CATEGORY_ORDER.filter(c => byCat.has(c)).map(c => ({
    category: c,
    data: byCat.get(c)!.slice().sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

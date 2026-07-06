import { addDays } from './dateUtils'
import type { PantryCategory, PantryConfidence, PantryItem, PantrySnapshotItem } from '../types'

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

/** Días enteros desde `today` hasta `date`; negativo = vencido. null si falta dato. */
export function daysUntil(date: string | null, today: string): number | null {
  if (!date || !today) return null
  const a = new Date(`${today}T00:00:00`)
  const b = new Date(`${date}T00:00:00`)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

const CONF_RANK: Record<PantryConfidence, number> = { high: 2, med: 1, low: 0 }

/**
 * Confianza mostrada = computada con decay temporal desde la última actividad
 * del ITEM (`lastEventDate` = proxy `item.updated`: los flujos de consumo/ajuste
 * SIEMPRE tocan el record, no solo el ledger). Reglas:
 * - Vencido → low, salvo actividad POSTERIOR al vencimiento (el usuario lo confirmó).
 * - La computada nunca SUPERA la guardada: un parseo dudoso no se vuelve high solo
 *   por ser reciente; verificación/consumo suben la guardada a high explícitamente.
 * - Sin fecha válida → confianza guardada tal cual.
 * Pura: `today` inyectado (YYYY-MM-DD), sin Date.now().
 */
export function computePantryConfidence(
  item: PantryItem,
  lastEventDate: string | null,
  today: string,
): PantryConfidence {
  const untilExpiry = daysUntil(item.expiryEstimate, today)
  const expired = untilExpiry != null && untilExpiry < 0
  if (expired && (!lastEventDate || lastEventDate <= item.expiryEstimate!)) return 'low'
  const since = lastEventDate ? daysUntil(today, lastEventDate) : null
  if (since == null) return item.confidence
  const decayed: PantryConfidence = since < 4 ? 'high' : since <= 10 ? 'med' : 'low'
  return CONF_RANK[decayed] < CONF_RANK[item.confidence] ? decayed : item.confidence
}

/** lowercase, sin acentos, trim — mismo criterio que name_normalized del parser. */
export function normalizePantryName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Proyecta los items activos al shape wire que consume el AI API (#171). */
export function buildPantrySnapshot(items: PantryItem[]): PantrySnapshotItem[] {
  return items
    .filter((it) => it.status === 'active')
    .map((it) => ({
      name: it.name,
      name_normalized: it.nameNormalized,
      category: it.category,
      quantity: it.quantity,
      unit: it.unit,
      expiry_estimate: it.expiryEstimate,
      confidence: it.confidence,
    }))
}

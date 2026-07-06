import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { todayStr, utcToLocalDateStr } from '../lib/dateUtils'
import { computePantryConfidence, expiryFromDays } from '../lib/pantry'
import type { PantryEventType, PantryItem, PantryParsedItem } from '../types'

// PB devuelve 0 para numbers vacíos: 0 se trata como "sin dato" (F1 no distingue
// qty 0 real de blank; un item agotado se marca por status, no por qty).
export function mapPantryRecord(r: Record<string, unknown>): PantryItem {
  const rec = r as Record<string, any>
  return {
    id: rec.id,
    user: rec.user,
    name: rec.name,
    nameNormalized: rec.name_normalized,
    category: rec.category || 'otro',
    quantity: rec.quantity ? Number(rec.quantity) : null,
    unit: rec.unit || null,
    priceTotal: rec.price_total ? Number(rec.price_total) : null,
    currency: rec.currency || 'USD',
    priceSource: rec.price_source || null,
    purchaseDate: rec.purchase_date ? String(rec.purchase_date).slice(0, 10) : null,
    expiryEstimate: rec.expiry_estimate ? String(rec.expiry_estimate).slice(0, 10) : null,
    confidence: rec.confidence || 'med',
    status: rec.status || 'active',
    source: rec.source || 'manual',
    updated: rec.updated ?? null,
  }
}

/** Lee items activos y aplica la confianza computada (decay F4) al vuelo. */
export async function fetchActivePantryItems(userId: string): Promise<PantryItem[]> {
  const res = await pb.collection('pantry_items').getFullList({
    filter: pb.filter('user = {:uid} && status = "active"', { uid: userId }),
    sort: '-created',
  })
  const today = todayStr()
  return res.map((r) => {
    const it = mapPantryRecord(r)
    // updated es UTC de PB → convertir a fecha LOCAL antes de comparar con todayStr()
    const lastEvent = it.updated ? utcToLocalDateStr(String(it.updated)) : null
    return { ...it, confidence: computePantryConfidence(it, lastEvent, today) }
  })
}

export function usePantryItems(userId: string | null) {
  return useQuery({
    queryKey: qk.pantry.list(userId),
    enabled: !!userId,
    queryFn: () => fetchActivePantryItems(userId!),
  })
}

/** Historial dedupe por name_normalized (todas las status) para quick re-add. */
export function usePantryHistory(userId: string | null) {
  return useQuery({
    queryKey: qk.pantry.history(userId),
    enabled: !!userId,
    queryFn: async (): Promise<PantryItem[]> => {
      const res = await pb.collection('pantry_items').getFullList({
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: '-created',
      })
      const seen = new Set<string>()
      const out: PantryItem[] = []
      for (const r of res) {
        const it = mapPantryRecord(r)
        if (seen.has(it.nameNormalized)) continue
        seen.add(it.nameNormalized)
        out.push(it)
        if (out.length >= 8) break
      }
      return out
    },
  })
}

/** Batch: crea items + su evento add. REGLA DE ORO: nunca qty sin evento. */
export function useAddPantryItems(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: PantryParsedItem[]): Promise<PantryItem[]> => {
      if (!userId) throw new Error('No user')
      const today = todayStr()
      const created: PantryItem[] = []
      for (const it of items) {
        const rec = await pb.collection('pantry_items').create({
          user: userId,
          name: it.name,
          name_normalized: it.name_normalized,
          category: it.category,
          quantity: it.quantity ?? undefined,
          unit: it.unit ?? undefined,
          price_total: it.price_total ?? undefined,
          currency: 'USD',
          price_source: it.price_total != null ? 'real' : undefined,
          purchase_date: today,
          expiry_estimate: expiryFromDays(it.expiry_days, today) ?? undefined,
          confidence: it.confidence,
          status: 'active',
          source: 'chat',
        })
        await pb.collection('pantry_events').create({
          user: userId,
          item: rec.id,
          type: 'add',
          delta_qty: it.quantity ?? 0,
        })
        created.push(mapPantryRecord(rec))
      }
      return created
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.pantry.list(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.history(userId) })
    },
  })
}

interface AdjustInput {
  item: PantryItem
  type: Exclude<PantryEventType, 'add'>   // 'consume' | 'adjust' | 'discard'
  newQuantity?: number | null              // solo para adjust
  newPriceTotal?: number | null            // edición de precio (sin evento propio)
  /**
   * F4 "¿Sigue habiendo?": fuerza evento adjust aun con delta 0 y sube la
   * confianza GUARDADA a high (verificación explícita del usuario; la computada
   * nunca supera la guardada, así que sin esto el reset no surtiría efecto).
   */
  forceEvent?: boolean
}

export function useAdjustPantryItem(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ item, type, newQuantity, newPriceTotal, forceEvent }: AdjustInput): Promise<PantryItem> => {
      if (!userId) throw new Error('No user')
      const prevQty = item.quantity ?? 0
      const patch: Record<string, unknown> = {}
      let delta = 0
      if (type === 'adjust') {
        const next = newQuantity ?? 0
        delta = next - prevQty
        patch.quantity = next
      } else {
        // consume / discard: sale todo lo que queda
        delta = -prevQty
        patch.quantity = 0
        patch.status = type === 'discard' ? 'discarded' : 'depleted'
      }
      if (newPriceTotal !== undefined) patch.price_total = newPriceTotal ?? 0
      if (forceEvent) patch.confidence = 'high'
      // Evento SIEMPRE antes de tocar quantity (ledger = fuente de historial).
      // adjust con delta 0 (solo cambió precio) no genera evento.
      if (type !== 'adjust' || delta !== 0 || forceEvent) {
        await pb.collection('pantry_events').create({
          user: userId, item: item.id, type, delta_qty: delta,
        })
      }
      const rec = await pb.collection('pantry_items').update(item.id, patch)
      return mapPantryRecord(rec)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.pantry.list(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.history(userId) })
    },
  })
}

export interface ConsumeMatchesInput {
  matches: { item: PantryItem; qtyConsumed: number }[]
  /** id del nutrition_entry — atribución $/comida F5. NUNCA omitir. */
  linkedEntry: string
}

/**
 * Descuento parcial batch post meal-log (F4). Distinto del consume manual
 * (que vacía el item): aquí delta = -qtyConsumed y el item queda active
 * mientras tenga qty. REGLA DE ORO: evento SIEMPRE antes de tocar quantity.
 * - Matches duplicados al mismo item se AGREGAN (un evento por match, un solo
 *   update de quantity con el total) — sin esto se pisarían entre sí.
 * - El update SIEMPRE toca el item (aun con qty null) para bumpear `updated`
 *   (proxy del decay) y sube confidence a high (el usuario confirmó consumo).
 * - Fallos por item se aíslan (los demás siguen); si alguno falló, throw al
 *   final para que el caller avise.
 */
export function useConsumePantryMatches(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ matches, linkedEntry }: ConsumeMatchesInput): Promise<void> => {
      if (!userId) throw new Error('No user')
      const byItem = new Map<string, { item: PantryItem; total: number }>()
      for (const { item, qtyConsumed } of matches) {
        if (!(qtyConsumed > 0)) continue
        const acc = byItem.get(item.id)
        if (acc) acc.total += qtyConsumed
        else byItem.set(item.id, { item, total: qtyConsumed })
      }
      const errors: unknown[] = []
      for (const { item, total } of byItem.values()) {
        try {
          // Un evento por match original (granularidad del ledger para F5)
          for (const m of matches) {
            if (m.item.id !== item.id || !(m.qtyConsumed > 0)) continue
            await pb.collection('pantry_events').create({
              user: userId, item: item.id, type: 'consume',
              delta_qty: -m.qtyConsumed, linked_entry: linkedEntry,
            })
          }
          // qty null = "sin dato": no inventamos depleción, pero igual tocamos el
          // record (bump de updated = reset del decay) y confirmamos existencia.
          const patch: Record<string, unknown> = { confidence: 'high' }
          if (item.quantity != null) {
            const next = Math.max(0, item.quantity - total)
            patch.quantity = next
            if (next <= 0) patch.status = 'depleted'
          }
          await pb.collection('pantry_items').update(item.id, patch)
        } catch (e) {
          errors.push(e)
        }
      }
      if (errors.length > 0) throw errors[0]
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.pantry.list(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.history(userId) })
    },
  })
}

export function useDeletePantryItem(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string): Promise<void> => {
      await pb.collection('pantry_items').delete(itemId)  // events cascadean
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.pantry.list(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.history(userId) })
    },
  })
}

/** Borrado multi-select: fallos aislados por item, se borra lo posible y se reporta al final. */
export function useDeletePantryItems(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (itemIds: string[]): Promise<void> => {
      const errors: unknown[] = []
      for (const id of itemIds) {
        try {
          await pb.collection('pantry_items').delete(id)  // events cascadean
        } catch (e) {
          errors.push(e)
        }
      }
      if (errors.length > 0) throw errors[0]
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.pantry.list(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.history(userId) })
    },
  })
}

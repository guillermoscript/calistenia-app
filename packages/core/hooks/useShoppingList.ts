import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { todayStr } from '../lib/dateUtils'
import { buildCycleShoppingList, convertQty, shoppingTotals } from '../lib/shopping'
import { daysUntil, expiryFromDays, normalizePantryName } from '../lib/pantry'
import { mapPantryRecord } from './usePantry'
import type { RecipeIngredient, ShoppingList, ShoppingListItem } from '../types'

const DEFAULT_CADENCE = 7

function mapList(r: Record<string, unknown>): ShoppingList {
  const rec = r as Record<string, any>
  return {
    id: rec.id,
    user: rec.user,
    status: rec.status || 'active',
    items: (typeof rec.items === 'string' ? JSON.parse(rec.items) : rec.items) ?? [],
    linked_plan: rec.linked_plan || null,
    total_est: rec.total_est ? Number(rec.total_est) : null,
    total_actual: rec.total_actual ? Number(rec.total_actual) : null,
    updated: rec.updated,
  }
}

/** Lista activa del usuario (a lo sumo una). null si no hay. */
export function useActiveShoppingList(userId: string | null) {
  return useQuery({
    queryKey: qk.shopping.active(userId),
    enabled: !!userId,
    queryFn: async (): Promise<ShoppingList | null> => {
      try {
        const rec = await pb.collection('shopping_lists').getFirstListItem(
          pb.filter('user = {:uid} && status = "active"', { uid: userId! }),
        )
        return mapList(rec)
      } catch (err) {
        // Solo 404 = no hay lista activa; otros errores (auth/red) deben subir,
        // no disfrazarse de "sin lista" (patrón useCrossInsights)
        if ((err as { status?: number })?.status === 404) return null
        throw err
      }
    },
  })
}

/** Fecha (YYYY-MM-DD) de la última compra hecha. null si nunca. */
export function useLastPurchaseDate(userId: string | null) {
  return useQuery({
    queryKey: qk.shopping.lastDone(userId),
    enabled: !!userId,
    queryFn: async (): Promise<string | null> => {
      const res = await pb.collection('shopping_lists').getList(1, 1, {
        filter: pb.filter('user = {:uid} && status = "done"', { uid: userId! }),
        sort: '-updated',
      })
      const rec = res.items[0] as Record<string, any> | undefined
      return rec?.updated ? String(rec.updated).slice(0, 10) : null
    },
  })
}

/** Cadencia "compro cada N días" (campo shopping_cadence_days en users; 0/blank → 7). */
export function useShoppingCadence(userId: string | null) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: qk.shopping.cadence(userId),
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const rec = (await pb.collection('users').getOne(userId!)) as Record<string, any>
      const n = Number(rec.shopping_cadence_days)
      return n > 0 ? n : DEFAULT_CADENCE
    },
  })
  const mutation = useMutation({
    mutationFn: async (days: number): Promise<number> => {
      await pb.collection('users').update(userId!, { shopping_cadence_days: days })
      return days
    },
    onMutate: async (days) => {
      qc.setQueryData(qk.shopping.cadence(userId), days)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.shopping.cadence(userId) })
    },
  })
  return { cadence: query.data ?? DEFAULT_CADENCE, isLoading: query.isLoading, setCadence: mutation.mutate }
}

interface GenerateInput {
  planIngredients: RecipeIngredient[]
  linkedPlan: string | null
  horizonDays: number
  lastPurchaseDate: string | null
}

/**
 * Genera (o regenera) la lista activa con buildCycleShoppingList — 100%
 * client-side, cero LLM. Si ya hay lista activa la REEMPLAZA (update), si no
 * crea el record.
 */
export function useGenerateShoppingList(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ planIngredients, linkedPlan, horizonDays, lastPurchaseDate }: GenerateInput): Promise<ShoppingList> => {
      if (!userId) throw new Error('No user')
      const pantryAll = (await pb.collection('pantry_items').getFullList({
        filter: pb.filter('user = {:uid}', { uid: userId }),
        sort: '-created',
      })) as Record<string, any>[]
      const items = buildCycleShoppingList({
        planIngredients,
        pantryItems: pantryAll.map(mapPantryRecord),
        horizonDays,
        today: todayStr(),
        sinceDate: lastPurchaseDate,
      })
      // Los items agregados A MANO (reasons vacío) sobreviven al regenerar
      const prev = qc.getQueryData<ShoppingList | null>(qk.shopping.active(userId))
      if (prev) {
        const seen = new Set(items.map((it) => `${it.name_normalized}|${it.unit ?? '?'}`))
        for (const it of prev.items) {
          if (it.reasons.length === 0 && !seen.has(`${it.name_normalized}|${it.unit ?? '?'}`)) {
            items.push(it)
          }
        }
      }
      const totals = shoppingTotals(items)
      const payload = {
        user: userId,
        status: 'active',
        items,
        linked_plan: linkedPlan ?? undefined,
        total_est: totals.est,
        total_actual: 0,
      }
      // Invariante: a lo sumo UNA lista active. Solo un 404 real cae a create;
      // un error transitorio (auth/red) sube en vez de crear una duplicada.
      let existing: { id: string } | null = null
      try {
        existing = await pb.collection('shopping_lists').getFirstListItem(
          pb.filter('user = {:uid} && status = "active"', { uid: userId }),
        )
      } catch (err) {
        if ((err as { status?: number })?.status !== 404) throw err
      }
      const rec = existing
        ? await pb.collection('shopping_lists').update(existing.id, payload)
        : await pb.collection('shopping_lists').create(payload)
      return mapList(rec)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.shopping.active(userId) })
    },
  })
}

/**
 * Alta manual a la lista (sin razón: badges vacíos, sobrevive al regenerar).
 * Si no hay lista activa la crea con ese único item.
 */
export function useAddShoppingItem(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name }: { name: string }): Promise<ShoppingList> => {
      if (!userId) throw new Error('No user')
      const item: ShoppingListItem = {
        name: name.trim(),
        name_normalized: normalizePantryName(name),
        qty: null,
        unit: null,
        est_price: null,
        currency: 'USD',
        checked: false,
        actual_price: null,
        reasons: [],
        incompatible_have: null,
      }
      const current = qc.getQueryData<ShoppingList | null>(qk.shopping.active(userId))
      if (current) {
        const rec = await pb.collection('shopping_lists').update(current.id, {
          items: [...current.items, item],
        })
        return mapList(rec)
      }
      const rec = await pb.collection('shopping_lists').create({
        user: userId,
        status: 'active',
        items: [item],
        total_est: 0,
        total_actual: 0,
      })
      return mapList(rec)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.shopping.active(userId) })
    },
  })
}

interface ToggleInput {
  listId: string
  index: number
  checked: boolean
  actualPrice?: number | null
}

/**
 * Marca/desmarca un item y opcionalmente fija precio real; recalcula total_actual.
 * Los PATCH van SERIALIZADOS y cada uno persiste el estado ACUMULADO de la cache
 * (onMutate corre antes que mutationFn): dos toggles rápidos no se pisan, y el
 * invalidate solo dispara cuando no queda otro toggle en vuelo (si no, el
 * refetch intermedio revertiría los optimistas pendientes).
 */
export function useToggleShoppingItem(userId: string | null) {
  const qc = useQueryClient()
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  return useMutation({
    mutationKey: ['shopping-toggle', userId],
    mutationFn: async ({ listId }: ToggleInput): Promise<void> => {
      const run = async () => {
        const current = qc.getQueryData<ShoppingList | null>(qk.shopping.active(userId))
        if (!current || current.id !== listId) return
        await pb.collection('shopping_lists').update(listId, {
          items: current.items,
          total_actual: shoppingTotals(current.items).actual,
        })
      }
      const p = chain.current.then(run, run)
      chain.current = p
      await p
    },
    onMutate: async ({ index, checked, actualPrice }) => {
      // Optimista: la UI de checklist no puede esperar el roundtrip
      qc.setQueryData<ShoppingList | null>(qk.shopping.active(userId), (prev) => {
        if (!prev) return prev
        const items = prev.items.map((it, i) =>
          i === index
            ? { ...it, checked, actual_price: actualPrice === undefined ? it.actual_price : actualPrice }
            : it,
        )
        return { ...prev, items, total_actual: shoppingTotals(items).actual }
      })
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ['shopping-toggle', userId] }) === 1) {
        qc.invalidateQueries({ queryKey: qk.shopping.active(userId) })
      }
    },
  })
}

/** Quita una línea de la lista activa. */
export function useRemoveShoppingItem(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ listId, index }: { listId: string; index: number }): Promise<void> => {
      const current = qc.getQueryData<ShoppingList | null>(qk.shopping.active(userId))
      if (!current || current.id !== listId) return
      const items = current.items.filter((_, i) => i !== index)
      await pb.collection('shopping_lists').update(listId, {
        items,
        total_actual: shoppingTotals(items).actual,
      })
    },
    onMutate: async ({ index }) => {
      qc.setQueryData<ShoppingList | null>(qk.shopping.active(userId), (prev) => {
        if (!prev) return prev
        const items = prev.items.filter((_, i) => i !== index)
        return { ...prev, items, total_actual: shoppingTotals(items).actual }
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.shopping.active(userId) })
    },
  })
}

/**
 * Compra hecha — transaccional en orden (issue #172): (1) mete cada item
 * checked a la despensa, (2) SOLO al final marca la lista done. Si algo falla
 * a mitad, la lista queda active (reintentable sin duplicar vía `purchased`).
 *
 * Anti-datos-chapuceros (feedback device 2026-07-06):
 * - Si YA existe un item ACTIVO con mismo nombre y unidad convertible → se le
 *   SUMA la cantidad (evento add + update), no se crea un duplicado.
 * - Si se crea nuevo → hereda categoría y vida útil del histórico del mismo
 *   nombre (nada de category 'otro' si ya compraste arroz antes).
 */
export function useCompletePurchase(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (list: ShoppingList): Promise<number> => {
      if (!userId) throw new Error('No user')
      const today = todayStr()
      const pantryAll = (
        await pb.collection('pantry_items').getFullList({
          filter: pb.filter('user = {:uid}', { uid: userId }),
          sort: '-created',
        })
      ).map(mapPantryRecord)
      // purchased persiste el progreso item a item: un retry tras fallo a mitad
      // NO re-crea (ni re-eventúa) lo que ya entró a la despensa
      const items = list.items.map((it) => ({ ...it }))
      const pending = items.filter((it) => it.checked && !it.purchased)
      for (const it of pending) {
        const price = it.actual_price ?? it.est_price
        const priceSource = it.actual_price != null ? 'real' : price != null ? 'estimada' : undefined
        const match = pantryAll.find((p) => p.status === 'active' && p.nameNormalized === it.name_normalized)
        const delta =
          match && it.qty != null && it.unit != null && match.quantity != null && match.unit != null
            ? convertQty(it.qty, it.unit, match.unit)
            : null
        if (match && delta != null) {
          // Merge: sumar al item existente (evento SIEMPRE antes de tocar qty)
          await pb.collection('pantry_events').create({
            user: userId, item: match.id, type: 'add', delta_qty: delta,
          })
          await pb.collection('pantry_items').update(match.id, {
            quantity: (match.quantity as number) + delta,
            price_total: price ?? undefined,
            price_source: priceSource,
            purchase_date: today,
          })
          match.quantity = (match.quantity as number) + delta
        } else {
          // Nuevo: heredar categoría y vida útil del histórico (como el re-add de F1)
          const hist = pantryAll.find((p) => p.nameNormalized === it.name_normalized)
          const span =
            hist?.purchaseDate && hist?.expiryEstimate
              ? daysUntil(hist.expiryEstimate, hist.purchaseDate)
              : null
          const rec = await pb.collection('pantry_items').create({
            user: userId,
            name: it.name,
            name_normalized: it.name_normalized,
            category: hist?.category ?? 'otro',
            quantity: it.qty ?? undefined,
            unit: it.unit ?? undefined,
            price_total: price ?? undefined,
            currency: it.currency || 'USD',
            price_source: priceSource,
            purchase_date: today,
            expiry_estimate: span != null && span > 0 ? expiryFromDays(span, today) ?? undefined : undefined,
            confidence: 'high',
            status: 'active',
            source: 'shopping',
          })
          await pb.collection('pantry_events').create({
            user: userId, item: rec.id, type: 'add', delta_qty: it.qty ?? 0,
          })
        }
        it.purchased = true
        await pb.collection('shopping_lists').update(list.id, { items })
      }
      const totals = shoppingTotals(items)
      await pb.collection('shopping_lists').update(list.id, {
        status: 'done',
        total_actual: totals.actual,
      })
      return pending.length
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.shopping.active(userId) })
      qc.invalidateQueries({ queryKey: qk.shopping.lastDone(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.list(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.history(userId) })
    },
  })
}

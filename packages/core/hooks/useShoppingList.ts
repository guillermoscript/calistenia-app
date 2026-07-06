import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { todayStr } from '../lib/dateUtils'
import { buildCycleShoppingList, shoppingTotals } from '../lib/shopping'
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
      } catch {
        return null // 404 = no hay lista activa
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
      const totals = shoppingTotals(items)
      const payload = {
        user: userId,
        status: 'active',
        items,
        linked_plan: linkedPlan ?? undefined,
        total_est: totals.est,
        total_actual: 0,
      }
      let rec: Record<string, unknown>
      try {
        const existing = await pb.collection('shopping_lists').getFirstListItem(
          pb.filter('user = {:uid} && status = "active"', { uid: userId }),
        )
        rec = await pb.collection('shopping_lists').update(existing.id, payload)
      } catch {
        rec = await pb.collection('shopping_lists').create(payload)
      }
      return mapList(rec)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.shopping.active(userId) })
    },
  })
}

interface ToggleInput {
  list: ShoppingList
  index: number
  checked: boolean
  actualPrice?: number | null
}

/** Marca/desmarca un item y opcionalmente fija precio real; recalcula total_actual. */
export function useToggleShoppingItem(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ list, index, checked, actualPrice }: ToggleInput): Promise<ShoppingList> => {
      const items: ShoppingListItem[] = list.items.map((it, i) =>
        i === index
          ? { ...it, checked, actual_price: actualPrice === undefined ? it.actual_price : actualPrice }
          : it,
      )
      const totals = shoppingTotals(items)
      const rec = await pb.collection('shopping_lists').update(list.id, {
        items,
        total_actual: totals.actual,
      })
      return mapList(rec)
    },
    onMutate: async ({ list, index, checked, actualPrice }) => {
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
      qc.invalidateQueries({ queryKey: qk.shopping.active(userId) })
    },
  })
}

/**
 * Compra hecha — transaccional en orden (issue #172): (1) crea pantry_items +
 * evento add por cada item checked, (2) SOLO al final marca la lista done con
 * total_actual. Si algo falla a mitad, la lista queda active (reintentable;
 * los items ya creados quedan en despensa — aceptado V1, single-user).
 */
export function useCompletePurchase(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (list: ShoppingList): Promise<number> => {
      if (!userId) throw new Error('No user')
      const today = todayStr()
      const bought = list.items.filter((it) => it.checked)
      for (const it of bought) {
        const price = it.actual_price ?? it.est_price
        const rec = await pb.collection('pantry_items').create({
          user: userId,
          name: it.name,
          name_normalized: it.name_normalized,
          category: 'otro',
          quantity: it.qty ?? undefined,
          unit: it.unit ?? undefined,
          price_total: price ?? undefined,
          currency: it.currency || 'USD',
          price_source: it.actual_price != null ? 'real' : price != null ? 'estimada' : undefined,
          purchase_date: today,
          confidence: 'high',
          status: 'active',
          source: 'shopping',
        })
        await pb.collection('pantry_events').create({
          user: userId,
          item: rec.id,
          type: 'add',
          delta_qty: it.qty ?? 0,
        })
      }
      const totals = shoppingTotals(list.items)
      await pb.collection('shopping_lists').update(list.id, {
        status: 'done',
        total_actual: totals.actual,
      })
      return bought.length
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.shopping.active(userId) })
      qc.invalidateQueries({ queryKey: qk.shopping.lastDone(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.list(userId) })
      qc.invalidateQueries({ queryKey: qk.pantry.history(userId) })
    },
  })
}

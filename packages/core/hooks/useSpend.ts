/**
 * useSpendSummary — F5 (#174). Junta entries de la semana + eventos consume
 * (expand item, así los items depleted/discarded siguen aportando su precio)
 * y computa gasto determinista en el cliente.
 */
import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { utcToLocalDateStr } from '../lib/dateUtils'
import { addDaysISO } from '../lib/shopping'
import { mapPantryRecord } from './usePantry'
import {
  computeEntryCost, computeSpendSummary,
  type EntryCost, type SpendEntryLite, type SpendSummary,
} from '../lib/spend'
import type { PantryEvent, PantryItem } from '../types'

export interface SpendData {
  summary: SpendSummary
  /** Costo por nutrition_entry id — para el badge $ en las tarjetas de comida. */
  costByEntry: Record<string, EntryCost>
}

export function useSpendSummary(userId: string | null, weekStart: string) {
  return useQuery({
    queryKey: qk.pantry.spend(userId, weekStart),
    enabled: !!userId,
    queryFn: async (): Promise<SpendData> => {
      // Pad ±1 día: logged_at/created son UTC y la semana se bucketiza en fecha LOCAL
      const from = addDaysISO(weekStart, -1)
      const to = addDaysISO(weekStart, 8)

      const entryRecs = await pb.collection('nutrition_entries').getFullList({
        filter: pb.filter('user = {:uid} && logged_at >= {:from} && logged_at < {:to}', {
          uid: userId!, from: `${from} 00:00:00`, to: `${to} 00:00:00`,
        }),
        fields: 'id,logged_at,foods',
      })
      const entries: SpendEntryLite[] = entryRecs.map((r: Record<string, any>) => ({
        id: r.id,
        date: utcToLocalDateStr(r.logged_at),
        foodsCount: Array.isArray(r.foods) ? r.foods.length : 0,
      }))

      const evRecs = await pb.collection('pantry_events').getFullList({
        filter: pb.filter('user = {:uid} && type = "consume" && linked_entry != "" && created >= {:from}', {
          uid: userId!, from: `${from} 00:00:00`,
        }),
        expand: 'item',
      })
      const itemsById = new Map<string, PantryItem>()
      const events: PantryEvent[] = evRecs.map((r: Record<string, any>) => {
        if (r.expand?.item) itemsById.set(r.item, mapPantryRecord(r.expand.item))
        return {
          id: r.id, user: r.user, item: r.item, type: r.type,
          deltaQty: r.delta_qty != null ? Number(r.delta_qty) : null,
          linkedEntry: r.linked_entry || null,
        }
      })

      const costByEntry: Record<string, EntryCost> = {}
      for (const e of entries) costByEntry[e.id] = computeEntryCost(e.id, e.foodsCount, events, itemsById)

      const weekEnd = addDaysISO(weekStart, 7)
      const weekEntries = entries.filter((e) => e.date >= weekStart && e.date < weekEnd)
      return { summary: computeSpendSummary(weekEntries, events, itemsById, weekStart), costByEntry }
    },
  })
}

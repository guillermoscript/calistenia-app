/**
 * usePantryDepletion — F4 (#173). Tras guardar un meal log, matchea los foods
 * contra la despensa (AI, stateless) y expone rows para el diálogo/sheet de
 * descuento.
 * REGLAS: despensa vacía = no llamar al endpoint; cualquier fallo = silencioso
 * a Sentry (el log de comida NUNCA se ve afectado); nunca descuento sin confirmar.
 *
 * Lo específico de plataforma se inyecta (#468): `captureException` (el Sentry
 * de cada app, que no es el mismo paquete en web y en móvil) y las hápticas de
 * confirmación, que solo existen en móvil.
 */
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { qk } from '../lib/query-keys'
import { matchConsumption } from '../lib/pantry-api'
import { fetchActivePantryItems, useConsumePantryMatches } from './usePantry'
import type { FoodItem, PantryConfidence, PantryItem } from '../types'

export interface DepleteRow {
  item: PantryItem
  matchedFood: string
  qtyConsumed: number | null
  confidence: PantryConfidence
  /** high/med CON qty pre-marcado; low o sin qty des-marcado (regla de la issue). */
  checked: boolean
}

/** La operación que falló, tal cual viajaba en el tag `op` de Sentry. */
export type PantryDepletionOp = 'match-consumption' | 'deplete-confirm'

export interface PantryDepletionOptions {
  /** Reporta la excepción al Sentry de la plataforma, con la operación que falló. */
  captureException?: (e: unknown, op: PantryDepletionOp) => void
  /** Feedback extra al descontar con éxito (haptics en móvil). */
  onConfirmSuccess?: () => void
  /** Feedback extra al fallar el descuento (haptics en móvil). */
  onConfirmError?: () => void
}

export function usePantryDepletion(userId: string | null, options: PantryDepletionOptions = {}) {
  const { captureException, onConfirmSuccess, onConfirmError } = options
  const qc = useQueryClient()
  const consumeMatches = useConsumePantryMatches(userId)
  const [pending, setPending] = useState<{ rows: DepleteRow[]; entryId: string } | null>(null)

  const runMatch = useCallback(async (entryId: string, foods: FoodItem[]) => {
    if (!userId || foods.length === 0) return
    try {
      const items = await qc.fetchQuery({
        queryKey: qk.pantry.list(userId),
        queryFn: () => fetchActivePantryItems(userId),
        staleTime: 60_000,
      })
      if (!items || items.length === 0) return // despensa vacía: cero costo
      const result = await matchConsumption(
        foods.map((f) => ({ name: f.name, quantity: f.portionAmount ?? null, unit: f.portionUnit ?? null })),
        items.map((it) => ({ id: it.id, name_normalized: it.nameNormalized, quantity: it.quantity, unit: it.unit })),
      )
      const byId = new Map(items.map((it) => [it.id, it]))
      const rows = result.matches.flatMap((m): DepleteRow[] => {
        const item = byId.get(m.pantry_item_id)
        if (!item) return []
        return [{
          item,
          matchedFood: m.matched_food,
          qtyConsumed: m.qty_consumed,
          confidence: m.confidence,
          // Sin qty estimada no hay descuento posible: exige input explícito del usuario
          checked: m.confidence !== 'low' && m.qty_consumed != null,
        }]
      })
      if (rows.length > 0) setPending({ rows, entryId })
    } catch (e) {
      captureException?.(e, 'match-consumption')
    }
  }, [userId, qc, captureException])

  const confirm = useCallback(async (selected: { item: PantryItem; qtyConsumed: number }[]) => {
    if (!pending) return
    const entryId = pending.entryId
    setPending(null)
    try {
      await consumeMatches.mutateAsync({ matches: selected, linkedEntry: entryId })
      onConfirmSuccess?.()
    } catch (e) {
      // Descuento parcial posible (la mutation aísla fallos por item): avisar con haptic
      onConfirmError?.()
      captureException?.(e, 'deplete-confirm')
    }
  }, [pending, consumeMatches, captureException, onConfirmSuccess, onConfirmError])

  const dismiss = useCallback(() => setPending(null), [])

  return { rows: pending?.rows ?? null, runMatch, confirm, dismiss }
}

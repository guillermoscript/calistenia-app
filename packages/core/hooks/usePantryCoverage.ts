import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePantryItems } from './usePantry'
import { buildPantrySnapshot } from '../lib/pantry'
import { fetchHowManyMeals, type PantryPlanGoals } from '../lib/pantry-api'
import { qk } from '../lib/query-keys'
import type { HowManyMealsResult } from '../types'

/**
 * Firma del inventario: cambia solo si cambia lo que afecta al cálculo
 * (qué hay y cuánto). Sirve de query key para no volver a gastar una llamada
 * al modelo cada vez que se abre el panel con la misma despensa.
 */
export function pantrySignature(items: { nameNormalized: string; quantity: number | null; unit: string | null }[]): string {
  return items
    .map((i) => `${i.nameNormalized}:${i.quantity ?? '?'}:${i.unit ?? '?'}`)
    .sort()
    .join('|')
}

/**
 * "¿Cuántas comidas me alcanzan?" — una LECTURA de la despensa, no un plan.
 *
 * Antes era un botón más entre los generadores y su resultado se borraba solo
 * al pulsar cualquier otro (`setDayPlan(null)` / `setHowMany(null)` se
 * destruían mutuamente). Como query con clave propia convive con el plan en
 * pantalla y se cachea mientras el inventario no cambie.
 */
export function usePantryCoverage(
  userId: string | null,
  goals: PantryPlanGoals | null,
  enabled: boolean,
) {
  const { data: items = [] } = usePantryItems(userId)
  const signature = useMemo(() => pantrySignature(items), [items])

  const query = useQuery<HowManyMealsResult>({
    queryKey: qk.pantryCoverage(userId, signature),
    enabled: enabled && !!userId && items.length > 0,
    // La despensa no cambia sola: mientras la firma sea la misma, la respuesta
    // guardada vale y no se re-pide al modelo.
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
    queryFn: () => fetchHowManyMeals(buildPantrySnapshot(items), goals),
  })

  return {
    coverage: query.data ?? null,
    isLoading: query.isFetching,
    error: query.error?.message ?? null,
    hasPantry: items.length > 0,
    refetch: query.refetch,
  }
}

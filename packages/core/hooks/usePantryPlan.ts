import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePantryItems } from './usePantry'
import { buildPantrySnapshot } from '../lib/pantry'
import {
  generatePantryDayPlan,
  fetchHowManyMeals,
  submitPantryWeekPlanJob,
  type PantryPlanGoals,
} from '../lib/pantry-api'
import { fetchJobStatus } from '../lib/ai-jobs-api'
import { qk } from '../lib/query-keys'
import type { HowManyMealsResult, PantryDayPlanResult } from '../types'

const POLL_INTERVAL_MS = 3000
const MAX_POLL_MS = 180_000

/**
 * #171 F2: generación de planes desde la despensa.
 * day / how_many_meals: síncronos. week: job async — este hook SÍ pollea
 * (a diferencia del flujo weekly clásico) y refresca el plan activo al completar.
 */
export function usePantryPlan(userId: string | null) {
  const { data: items = [] } = usePantryItems(userId)
  const qc = useQueryClient()

  // Corta el polling de generateWeek si el componente se desmonta a mitad.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const generateDay = useCallback(
    (targetDate: string, goals: PantryPlanGoals | null): Promise<PantryDayPlanResult> =>
      generatePantryDayPlan({ targetDate, items: buildPantrySnapshot(items), goals }),
    [items]
  )

  const howManyMeals = useCallback(
    (goals: PantryPlanGoals | null): Promise<HowManyMealsResult> =>
      fetchHowManyMeals(buildPantrySnapshot(items), goals),
    [items]
  )

  const generateWeek = useCallback(
    async (goals: PantryPlanGoals, weekStart: string | null = null): Promise<void> => {
      const jobId = await submitPantryWeekPlanJob({
        weekStart,
        items: buildPantrySnapshot(items),
        goals,
      })
      const started = Date.now()
      while (Date.now() - started < MAX_POLL_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        if (!alive.current) return
        const job = await fetchJobStatus(jobId)
        if (job.status === 'completed') {
          await qc.invalidateQueries({ queryKey: qk.weeklyMealPlan.active(userId) })
          return
        }
        if (job.status === 'failed') throw new Error(job.error || 'La generación del plan falló')
      }
      throw new Error('Tiempo de espera agotado generando el plan')
    },
    [items, qc, userId]
  )

  return {
    hasPantry: items.length > 0,
    pantryCount: items.length,
    generateDay,
    howManyMeals,
    generateWeek,
  }
}

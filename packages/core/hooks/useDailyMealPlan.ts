import { useCallback, useEffect, useRef, useState } from 'react'
import { submitMealPlanJob, pollJob } from '../lib/ai-jobs-api'
import type { DailyTotals, MealType } from '../types'

export interface DailyPlannedMeal {
  meal_type: MealType
  label: string
  calories: number
  protein: number
  carbs: number
  fat: number
  description?: string
}

const POLL_INTERVAL_MS = 3000
const MAX_POLL_MS = 60_000

interface UseDailyMealPlanDeps {
  /** Macros que quedan HOY — el plan rellena el hueco. */
  remaining: DailyTotals
  /** Tipos de comida ya registrados hoy (el plan los evita). */
  loggedMealTypes: string[]
  /** Mensajes traducidos por el llamador; el hook no conoce i18n. */
  messages: { timeout: string; failed: string }
}

/**
 * Plan IA del día (#470): envía el job `generate-meal-plan` y pollea con
 * `pollJob` hasta 60 s. Alive-guarded: si la pantalla se desmonta a mitad no
 * toca estado. Sustituye al `setInterval` que vivía en `DailyMealPlan.tsx`.
 */
export function useDailyMealPlan({ remaining, loggedMealTypes, messages }: UseDailyMealPlanDeps) {
  const [plan, setPlan] = useState<DailyPlannedMeal[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  // Un solo generate "vivo" a la vez: si el usuario pulsa Regenerar mientras
  // el anterior pollea, el resultado viejo se descarta.
  const runId = useRef(0)

  const generate = useCallback(async () => {
    const id = ++runId.current
    const isCurrent = () => alive.current && runId.current === id
    setLoading(true)
    setError(null)
    try {
      const jobId = await submitMealPlanJob({
        remaining_calories: Math.round(remaining.calories),
        remaining_protein: Math.round(remaining.protein),
        remaining_carbs: Math.round(remaining.carbs),
        remaining_fat: Math.round(remaining.fat),
        logged_meal_types: loggedMealTypes,
      })
      const job = await pollJob(jobId, {
        intervalMs: POLL_INTERVAL_MS,
        maxMs: MAX_POLL_MS,
        isAlive: isCurrent,
        timeoutMessage: messages.timeout,
        failedMessage: messages.failed,
      })
      if (!job || !isCurrent()) return
      setPlan((job.result?.meals as DailyPlannedMeal[] | undefined) ?? [])
      setLoading(false)
    } catch (e) {
      if (!isCurrent()) return
      setError(e instanceof Error && e.message ? e.message : messages.failed)
      setLoading(false)
    }
  }, [remaining, loggedMealTypes, messages])

  return { plan, loading, error, generate, setError }
}

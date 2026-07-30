import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePantryItems } from './usePantry'
import { useMealPlans } from './useMealPlans'
import { buildPantrySnapshot } from '../lib/pantry'
import { runPlanDispatch, type PlanRunResult } from '../lib/plan-api'
import {
  disabledReason,
  effectiveBase,
  planDates,
  resolveBudget,
  resolveDispatch,
  type PlanBase,
  type PlanBlocker,
  type PlanDispatch,
  type PlanHorizon,
} from '../lib/meal-plan-spec'
import { qk } from '../lib/query-keys'
import type { DailyTotals, NutritionGoalType } from '../types'

export interface PlanGenerationParams {
  userId: string | null
  /** Metas diarias. null = el usuario no las configuró todavía. */
  goals: DailyTotals | null
  goalType: NutritionGoalType
  /** Consumido hoy — solo descuenta en el horizonte 'today'. */
  todayTotals: DailyTotals
  loggedMealTypes: string[]
  /** Jobs de IA pendientes/procesando (de BackgroundJobs). */
  pendingJobs?: number
  /** Ya hay un job de plan de este usuario en vuelo. */
  planJobPending?: boolean
  /** Se llama al encolar un plan semanal, para registrarlo en BackgroundJobs. */
  onJobSubmitted?: (jobId: string, dispatch: PlanDispatch) => void
}

/**
 * La máquina de estados de PLANIFICAR: dos ejes (cuándo × con qué), un
 * presupuesto derivado y una sola acción de generar.
 *
 * Vive en core porque web y móvil deben comportarse idéntico — la versión
 * anterior tenía la lógica duplicada en cinco componentes y las dos plataformas
 * ya habían divergido (el semanal nativo descartaba el job id y nunca
 * refrescaba).
 */
export function usePlanGeneration(params: PlanGenerationParams) {
  const {
    userId, goals, goalType, todayTotals, loggedMealTypes,
    pendingJobs = 0, planJobPending = false, onJobSubmitted,
  } = params

  const qc = useQueryClient()
  const { data: pantryItems = [] } = usePantryItems(userId)
  const { saveDayPlan } = useMealPlans(userId)

  const [horizon, setHorizon] = useState<PlanHorizon>('today')
  const [requestedBase, setBase] = useState<PlanBase>('pantry')

  const pantryCount = pantryItems.length
  const base = effectiveBase(requestedBase, pantryCount)

  const budget = useMemo(
    () => resolveBudget({ horizon, goals, todayTotals, loggedMealTypes }),
    [horizon, goals, todayTotals, loggedMealTypes],
  )

  const blocker: PlanBlocker | null = useMemo(
    () => disabledReason({
      horizon,
      base: requestedBase,
      budget,
      pantryCount,
      planJobPending,
      pendingJobs,
    }),
    [horizon, requestedBase, budget, pantryCount, planJobPending, pendingJobs],
  )

  const mutation = useMutation<PlanRunResult, Error, void>({
    mutationFn: async () => {
      if (!budget) throw new Error('Configura tus metas de nutrición primero')

      const snapshot = buildPantrySnapshot(pantryItems)
      const dispatch = resolveDispatch({
        horizon,
        base: requestedBase,
        budget,
        goalType,
        pantryItems: snapshot,
        dates: planDates(),
      })

      if (dispatch.mode === 'job') {
        const job = await runPlanDispatch(dispatch)
        onJobSubmitted?.(job.jobId, dispatch)
        return job
      }

      // Plan de día: la respuesta viene completa, se persiste aquí mismo para
      // que aparezca igual en el otro dispositivo.
      const result = await runPlanDispatch(dispatch)
      await saveDayPlan({
        targetDate: dispatch.targetDate,
        source: dispatch.base,
        macroBasis: budget.kind,
        goalSnapshot: {
          calories: budget.calories,
          protein: budget.protein,
          carbs: budget.carbs,
          fat: budget.fat,
        },
        pantrySnapshot: dispatch.base === 'pantry' ? snapshot : [],
        meals: result.meals,
        notes: result.notes,
        aiModel: result.model_used,
      })
      return result
    },
    onSuccess: (result) => {
      if (result.mode === 'sync') {
        void qc.invalidateQueries({ queryKey: qk.mealDayPlans.active(userId) })
      }
    },
  })

  const { mutateAsync } = mutation
  const generate = useCallback(() => mutateAsync(), [mutateAsync])

  return {
    horizon,
    setHorizon,
    /** Lo que el usuario pulsó (para pintar el segmento activo). */
    requestedBase,
    setBase,
    /** Lo que se va a usar de verdad: sin despensa, 'pantry' cae a 'buy'. */
    base,
    pantryCount,
    budget,
    blocker,
    canGenerate: blocker === null && !mutation.isPending,
    generate,
    isGenerating: mutation.isPending,
    error: mutation.error?.message ?? null,
    reset: mutation.reset,
  }
}

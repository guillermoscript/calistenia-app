import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { op } from '../lib/analytics'
import { qk } from '../lib/query-keys'
import { parseRepsForPR, estimate1RM } from '../lib/pr-utils'
import { legacyPrKey } from '../lib/challenge-scoring'
import { lsGetSettings, type ProgressData } from '../lib/progress-cache'
import { useProgressMutations } from './useProgressMutations'
import type { Settings, WeightPR } from '../types'

export interface PREvent {
  exerciseId: string
  prKey: string
  oldValue: number
  newValue: number
  /** 'reps' (default, bodyweight) or 'weight' (gym/weighted: values are kg). */
  kind?: 'reps' | 'weight'
  /** For kind 'weight': reps performed at newValue kg and its estimated 1RM. */
  reps?: number
  e1rm?: number
}

export interface UsePRsReturn {
  checkAndUpdatePR: (exerciseId: string, reps: string, weight?: number) => Promise<PREvent | null>
}

/**
 * usePRs — detección automática de récords personales (parte de la
 * descomposición de useProgress, #476).
 *
 * Lee los settings actuales de la caché de `qk.sessions(...)` y persiste el
 * nuevo PR vía `updateSettings` (caché + localStorage + PocketBase).
 */
export function usePRs(userId: string | null = null, activeProgramId: string | null = null): UsePRsReturn {
  const qc = useQueryClient()
  const key = useMemo(() => qk.sessions(userId, activeProgramId), [userId, activeProgramId])
  const { updateSettings } = useProgressMutations(userId, activeProgramId)

  const checkAndUpdatePR = useCallback(async (exerciseId: string, reps: string, weight?: number): Promise<PREvent | null> => {
    if (!exerciseId) return null
    const n = parseRepsForPR(reps)
    // La query escribe su initialData (localStorage) en la caché, así que esto
    // casi siempre resuelve por la caché; el fallback cubre usePRs montado solo.
    const cur = qc.getQueryData<ProgressData>(key)?.settings ?? lsGetSettings()

    // Weighted set → weight PR by estimated 1RM (kg). Takes precedence over
    // the reps PR: with load, more reps at the same weight is already captured
    // by the e1rm, and celebrating kg is the meaningful signal for gym work.
    const e1rm = estimate1RM(weight, n)
    if (e1rm != null) {
      const prevW = cur.weight_prs?.[exerciseId]
      if (e1rm > (prevW?.e1rm ?? 0)) {
        const entry: WeightPR = { weight: weight as number, reps: n ?? 1, e1rm }
        const patch: Partial<Settings> = { weight_prs: { ...(cur.weight_prs ?? {}), [exerciseId]: entry } }
        await updateSettings(patch)
        op.track('pr_achieved', { exercise_id: exerciseId, pr_key: exerciseId, kind: 'weight', old_value: prevW?.weight ?? 0, new_value: weight, e1rm })
        return { exerciseId, prKey: exerciseId, oldValue: prevW?.weight ?? 0, newValue: weight as number, kind: 'weight', reps: n ?? 1, e1rm }
      }
      return null
    }

    if (n == null) return null
    const prevBest = (cur.prs?.[exerciseId]) ?? 0
    if (n <= prevBest) return null
    const lk = legacyPrKey(exerciseId)
    const patch: Partial<Settings> = { prs: { ...(cur.prs ?? {}), [exerciseId]: n } }
    if (lk && n > ((cur as unknown as Record<string, number>)[lk] || 0)) {
      (patch as any)[lk] = n
    }
    await updateSettings(patch)
    op.track('pr_achieved', { exercise_id: exerciseId, pr_key: String(lk ?? exerciseId), old_value: prevBest, new_value: n })
    return { exerciseId, prKey: String(lk ?? exerciseId), oldValue: prevBest, newValue: n, kind: 'reps' }
  }, [updateSettings, qc, key])

  return { checkAndUpdatePR }
}

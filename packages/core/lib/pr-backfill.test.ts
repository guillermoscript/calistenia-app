/**
 * Backfill de PRs desde `sets_log` (extraído de useProgress en #476).
 *
 * Función pura: reconstruye `prs`/`weight_prs` y refleja el mejor valor en los
 * 5 campos `pr_*` heredados, devolviendo null cuando no hay nada que subir.
 */
import { describe, expect, it } from 'vitest'
import { computePRBackfill } from './pr-backfill'
import type { Settings } from '../types'

const base: Settings = { phase: 1, startDate: null, weeklyGoal: 5 }

const set = (exercise_id: string, reps: string, weight_kg?: number) =>
  ({ exercise_id, workout_key: 'p1_lun', reps, weight_kg })

describe('computePRBackfill', () => {
  it('devuelve null cuando ningún set supera lo ya guardado', () => {
    const settings: Settings = { ...base, prs: { pullups: 12 }, pr_pullups: 12 }
    expect(computePRBackfill([set('pullups', '10')], settings)).toBeNull()
  })

  it('reconstruye prs por ejercicio y refleja el legacy pr_*', () => {
    const updates = computePRBackfill([set('pullups', '8'), set('pullups', '8-12'), set('squats', '20')], base)
    expect(updates?.prs).toMatchObject({ pullups: 12, squats: 20 })
    // "8-12" → 12 vía parseRepsForPR; pullups mapea al campo heredado.
    expect(updates?.pr_pullups).toBe(12)
    // squats no es una de las 5 familias heredadas.
    expect(updates).not.toHaveProperty('pr_squats')
  })

  it('ignora reps no numéricas ("max") y sets sin exercise_id', () => {
    expect(computePRBackfill([set('pullups', 'max'), { exercise_id: '', workout_key: 'k', reps: '9' }], base)).toBeNull()
  })

  it('calcula weight_prs por mejor 1RM estimado', () => {
    const updates = computePRBackfill([set('bench', '5', 80), set('bench', '10', 70)], base)
    // 80×(1+5/30)=93.3 < 70×(1+10/30)=93.3… — usa el mejor e1rm.
    expect(updates?.weight_prs?.bench.e1rm).toBeGreaterThan(0)
    expect(updates?.weight_prs?.bench.reps).toBeGreaterThan(0)
  })

  it('no rebaja un legacy pr_* ya superior en settings', () => {
    const settings: Settings = { ...base, pr_pushups: 50 }
    const updates = computePRBackfill([set('pushups', '30')], settings)
    // prs (mapa nuevo) sí se puebla, pero el campo heredado no baja de 50.
    expect(updates?.prs).toMatchObject({ pushups: 30 })
    expect(updates).not.toHaveProperty('pr_pushups')
  })
})

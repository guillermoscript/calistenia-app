import { parseRepsForPR, estimate1RM } from './pr-utils'
import { legacyPrKey } from './challenge-scoring'
import type { Settings, WeightPR } from '../types'
import type { ProgressSetRow } from './progress-map'

/**
 * Scan all logged sets and rebuild the full `prs` map (every exercise id) plus
 * mirror updates into the 5 legacy pr_* fields. Uses parseRepsForPR so
 * "8-12"→12, "max"→null, etc.
 */
export function computePRBackfill(sets: ProgressSetRow[], currentSettings: Settings): Partial<Settings> | null {
  const bestById: Record<string, number> = { ...(currentSettings.prs ?? {}) }
  const bestWeightById: Record<string, WeightPR> = { ...(currentSettings.weight_prs ?? {}) }
  let changed = false
  let weightChanged = false
  for (const s of sets) {
    const id = s.exercise_id
    if (!id) continue
    const n = parseRepsForPR(s.reps)
    if (n != null && n > (bestById[id] ?? 0)) { bestById[id] = n; changed = true }
    // Weight PR: best set by estimated 1RM (sets_log.weight_kg)
    const e1rm = estimate1RM(s.weight_kg, n)
    if (e1rm != null && e1rm > (bestWeightById[id]?.e1rm ?? 0)) {
      bestWeightById[id] = { weight: s.weight_kg as number, reps: n ?? 1, e1rm }
      weightChanged = true
    }
  }
  // Mirror into the 5 legacy fields from the best matching id(s).
  const legacy: Partial<Record<keyof Settings, number>> = {}
  for (const [id, n] of Object.entries(bestById)) {
    const lk = legacyPrKey(id)
    if (lk && n > ((legacy[lk] as number) ?? 0)) legacy[lk] = n
  }
  const updates: Partial<Settings> = {}
  let hasUpdates = false
  if (changed) { (updates as any).prs = bestById; hasUpdates = true }
  if (weightChanged) { (updates as any).weight_prs = bestWeightById; hasUpdates = true }
  for (const [k, v] of Object.entries(legacy)) {
    const stored = (currentSettings as unknown as Record<string, number>)[k] || 0
    if ((v as number) > stored) { (updates as any)[k] = v; hasUpdates = true }
  }
  return hasUpdates ? updates : null
}

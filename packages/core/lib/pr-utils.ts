/**
 * Best achieved rep count from a free-text reps string, for PR computation.
 * Extracts the LARGEST integer present. Returns null when there is no positive
 * integer (e.g. "max", "", "AMRAP"), so callers skip non-numeric entries.
 *   "12" → 12 · "8-12" → 12 · "3x10" → 10 · "max" → null · "" → null
 */
export function parseRepsForPR(reps: string | null | undefined): number | null {
  if (!reps) return null
  const nums = String(reps).match(/\d+/g)
  if (!nums) return null
  const max = Math.max(...nums.map(Number))
  return max > 0 ? max : null
}

/**
 * Estimated 1-rep max (Epley): weight × (1 + reps/30), 1 decimal.
 * reps ≤ 1 returns the weight itself. Returns null for non-positive weight.
 */
export function estimate1RM(weight: number | null | undefined, reps: number | null | undefined): number | null {
  if (!weight || weight <= 0) return null
  if (!reps || reps <= 1) return Math.round(weight * 10) / 10
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

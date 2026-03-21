import type { CardioActivityType } from '../types'

const MET_VALUES: Record<CardioActivityType, number> = {
  running: 9.8,
  walking: 3.8,
  cycling: 7.5,
}

const DEFAULT_WEIGHT_KG = 70

/**
 * Estimate calories burned using MET formula.
 * MET × weightKg × (durationSeconds / 3600)
 */
export function estimateCalories(
  activityType: CardioActivityType,
  durationSeconds: number,
  weightKg?: number,
): number {
  const met = MET_VALUES[activityType] || MET_VALUES.running
  const weight = weightKg || DEFAULT_WEIGHT_KG
  return Math.round(met * weight * (durationSeconds / 3600))
}

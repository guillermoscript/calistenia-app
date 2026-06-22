/**
 * Shared nutrition-quality aggregation. Single source of truth for the
 * calorie-weighted daily quality letter (A–E), previously duplicated verbatim
 * across the web/native NutritionPage and NutritionDashboard components.
 */
import type { NutritionEntry, QualityScore } from '../types'

const SCORE_MAP: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 }
const REVERSE_MAP: Record<number, QualityScore> = { 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'E' }

/**
 * Calorie-weighted average of the per-meal quality scores for a set of entries.
 * Returns `undefined` until at least two scored meals exist (a single meal is
 * not representative of the day) or when the scored calories sum to zero.
 */
export function computeDailyQualityScore(entries: NutritionEntry[]): QualityScore | undefined {
  const scored = entries.filter((e) => e.qualityScore)
  if (scored.length < 2) return undefined
  const totalWeight = scored.reduce((s, e) => s + e.totalCalories, 0)
  if (totalWeight === 0) return undefined
  const weightedAvg =
    scored.reduce((s, e) => s + SCORE_MAP[e.qualityScore!] * e.totalCalories, 0) / totalWeight
  return REVERSE_MAP[Math.round(weightedAvg)]
}

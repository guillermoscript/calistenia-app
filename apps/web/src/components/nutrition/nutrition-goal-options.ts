/**
 * Objetivos de nutrición: etiquetas, iconos y descripciones (#477).
 *
 * Estaban duplicados entre `NutritionGoalSetup` (wizard) y `NutritionPage`
 * (picker inline), con un comentario admitiéndolo. Fuente única: el wizard usa
 * la lista entera y el picker se queda con lo que necesita.
 */
import type { NutritionGoalType } from '@calistenia/core/types'

export const NUTRITION_GOALS: { id: NutritionGoalType; labelKey: string; icon: string; descKey: string }[] = [
  { id: 'muscle_gain', labelKey: 'nutrition.goal.muscleGain', icon: '💪', descKey: 'nutrition.goal.muscleGainDesc' },
  { id: 'fat_loss', labelKey: 'nutrition.goal.fatLoss', icon: '🔥', descKey: 'nutrition.goal.fatLossDesc' },
  { id: 'recomp', labelKey: 'nutrition.goal.recomp', icon: '⚖️', descKey: 'nutrition.goal.recompDesc' },
  { id: 'maintain', labelKey: 'nutrition.goal.maintain', icon: '✅', descKey: 'nutrition.goal.maintainDesc' },
]

export const GOAL_LABEL_KEYS = Object.fromEntries(
  NUTRITION_GOALS.map(g => [g.id, g.labelKey]),
) as Record<NutritionGoalType, string>

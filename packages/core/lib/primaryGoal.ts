/**
 * Mapeos puros del objetivo principal estructurado (`primary_goal`) a los
 * tipos de objetivo que consumen el matching de programas y nutrición.
 *
 * Issue #226: el objetivo explícito del usuario manda; el delta de peso queda
 * solo como fallback (ver inferGoalType en matchPrograms.ts).
 */

import type { PrimaryGoal } from '../types/onboarding'
import { PRIMARY_GOAL_IDS } from '../types/onboarding'
import type { ProgramGoalType, NutritionGoalType } from '../types'

/** Type guard para valores que llegan sin tipar desde el record de PocketBase. */
export function isPrimaryGoal(v: unknown): v is PrimaryGoal {
  return typeof v === 'string' && (PRIMARY_GOAL_IDS as readonly string[]).includes(v)
}

/**
 * primary_goal → goal_type del catálogo de programas.
 * recomposición y resistencia caen en 'maintain' (no hay programas endurance
 * todavía); habilidades también → 'maintain' como primario, porque los skill
 * tracks se recomiendan como programa secundario vía focus_areas.
 */
export function primaryGoalToProgramGoalType(goal: PrimaryGoal): ProgramGoalType {
  switch (goal) {
    case 'ganar_musculo': return 'muscle_gain'
    case 'perder_grasa': return 'fat_loss'
    default: return 'maintain'
  }
}

/** primary_goal → objetivo de nutrición (superávit/déficit/recomp). */
export function primaryGoalToNutritionGoalType(goal: PrimaryGoal): NutritionGoalType {
  switch (goal) {
    case 'ganar_musculo': return 'muscle_gain'
    case 'perder_grasa': return 'fat_loss'
    case 'recomposicion': return 'recomp'
    default: return 'maintain'
  }
}

/** Si el objetivo implica cambio de peso corporal, el peso objetivo es relevante; para el resto es opcional. */
export function primaryGoalImpliesWeightChange(goal: PrimaryGoal): boolean {
  return goal === 'ganar_musculo' || goal === 'perder_grasa'
}

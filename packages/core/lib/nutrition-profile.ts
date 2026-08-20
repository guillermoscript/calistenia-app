/**
 * I/O de `users` que necesita la pantalla de nutrición (#470): prefill del
 * wizard de objetivos y sincronización best-effort de `primary_goal`. Antes
 * vivía inline en las pantallas (web y móvil).
 */
import { pb, isPocketBaseAvailable } from './pocketbase'
import {
  ONBOARDING_ACTIVITY_TO_NUTRITION,
  inferNutritionGoalType,
  nutritionGoalTypeToPrimaryGoal,
  type NutritionPace,
} from './nutritionGoal'
import type { ActivityLevel, NutritionGoalType, Sex } from '../types'

/**
 * Datos del perfil con los que se pre-rellena `NutritionGoalSetup`. Edad y
 * sexo NO salen de `users` (PII, campos `hidden`); el wizard los pide y los
 * guarda en `nutrition_goals`. Se dejan en el tipo para que el llamador pueda
 * completarlos desde otra fuente.
 */
export interface NutritionProfilePrefill {
  weight?: number
  height?: number
  age?: number
  sex?: Sex
  goalWeight?: number
  activityLevel?: ActivityLevel
  pace?: NutritionPace
  goalType?: NutritionGoalType
}

const PACES: readonly NutritionPace[] = ['gradual', 'balanced', 'aggressive']
export function isNutritionPace(v: unknown): v is NutritionPace {
  return typeof v === 'string' && (PACES as readonly string[]).includes(v)
}

/**
 * Lee `users/{id}` y lo mapea al prefill. Devuelve `{}` si PB no está
 * disponible o la lectura falla: el wizard arranca vacío, nunca rompe.
 */
export async function fetchNutritionProfilePrefill(userId: string): Promise<NutritionProfilePrefill> {
  const available = await isPocketBaseAvailable()
  if (!available) return {}
  try {
    const user = await pb.collection('users').getOne(userId, { requestKey: null })
    const weight = Number(user.weight) || undefined
    const goalWeight = Number(user.goal_weight) || undefined
    return {
      weight,
      height: Number(user.height) || undefined,
      goalWeight,
      activityLevel: user.activity_level ? ONBOARDING_ACTIVITY_TO_NUTRITION[user.activity_level] : undefined,
      pace: isNutritionPace(user.pace) ? user.pace : undefined,
      goalType: inferNutritionGoalType(weight, goalWeight, user.primary_goal),
    }
  } catch {
    return {}
  }
}

/**
 * Espeja el objetivo de nutrición en `users.primary_goal` (#226). Best-effort:
 * nunca lanza ni bloquea el guardado del goal. `maintain` no tiene
 * primary_goal equivalente → no-op.
 */
export async function syncUserPrimaryGoal(userId: string | null, goal: NutritionGoalType): Promise<void> {
  const pg = nutritionGoalTypeToPrimaryGoal(goal)
  if (!pg || !userId) return
  try {
    await pb.collection('users').update(userId, { primary_goal: pg })
  } catch {
    /* best-effort */
  }
}

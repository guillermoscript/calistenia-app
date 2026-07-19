/**
 * Cálculo puro de objetivos de nutrición (calorías + macros) a partir del perfil
 * del usuario y su objetivo.
 *
 * Extraído de useNutrition/NutritionPage (#243) para que web, mobile y mcp-server
 * compartan una sola fuente de verdad, y para que el objetivo pueda recalcularse
 * bajo demanda cuando el usuario decida cambiarlo (perder grasa ↔ ganar músculo…).
 */

import type { ActivityLevel, NutritionGoal, NutritionGoalType, Sex } from '../types'
import type { PrimaryGoal } from '../types/onboarding'
import { isPrimaryGoal, primaryGoalToNutritionGoalType } from './primaryGoal'

export type NutritionPace = 'gradual' | 'balanced' | 'aggressive'

// ─── Multiplicadores de actividad (Mifflin-St Jeor) ─────────────────────────
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

/**
 * El onboarding captura 4 niveles de actividad; nutrición usa 5. Mapea el valor
 * del onboarding al nivel de nutrición correspondiente.
 */
export const ONBOARDING_ACTIVITY_TO_NUTRITION: Record<string, ActivityLevel> = {
  sedentary: 'sedentary',
  light: 'light',
  active: 'moderate',
  very_active: 'active',
}

/**
 * Objetivo de nutrición del usuario: el `primary_goal` explícito (#226) manda;
 * el delta de peso queda solo como fallback.
 */
export function inferNutritionGoalType(
  weight?: number,
  goalWeight?: number,
  primaryGoal?: unknown,
): NutritionGoalType | undefined {
  if (isPrimaryGoal(primaryGoal)) return primaryGoalToNutritionGoalType(primaryGoal)
  if (!weight || !goalWeight) return undefined
  const delta = goalWeight - weight
  if (delta > 2) return 'muscle_gain'
  if (delta < -2) return 'fat_loss'
  return 'maintain'
}

/**
 * Fórmula pura: BMR (Mifflin-St Jeor) → TDEE → ajuste por objetivo/ritmo → macros.
 * Devuelve el objetivo completo (sin `id`/`user`/`source`).
 */
export function calculateMacros(
  weight: number,
  height: number,
  age: number,
  sex: Sex,
  activityLevel: ActivityLevel,
  goal: NutritionGoalType,
  pace?: NutritionPace,
): NutritionGoal {
  const bmr = sex === 'male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161
  const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel]
  const paceFactor = pace === 'gradual' ? 0.5 : pace === 'aggressive' ? 1.5 : 1.0
  let dailyCalories: number
  switch (goal) {
    case 'muscle_gain': dailyCalories = tdee + 300 * paceFactor; break
    case 'fat_loss':    dailyCalories = tdee - 500 * paceFactor; break
    // Recomposición: déficit ligero fijo (no escala con pace) + proteína alta.
    case 'recomp':      dailyCalories = tdee - 200; break
    default:            dailyCalories = tdee; break
  }
  dailyCalories = Math.round(dailyCalories)
  let proteinPerKg: number
  switch (goal) {
    case 'muscle_gain': proteinPerKg = 2.0; break
    case 'fat_loss':    proteinPerKg = 2.2; break
    case 'recomp':      proteinPerKg = 2.2; break
    default:            proteinPerKg = 1.8; break
  }
  const dailyProtein = Math.round(proteinPerKg * weight)
  const dailyFat = Math.round((dailyCalories * 0.25) / 9)
  const proteinCals = dailyProtein * 4
  const fatCals = dailyFat * 9
  const dailyCarbs = Math.round((dailyCalories - proteinCals - fatCals) / 4)
  return { dailyCalories, dailyProtein, dailyCarbs, dailyFat, goal, weight, height, age, sex, activityLevel }
}

/** Perfil mínimo para derivar un objetivo recomendado. */
export interface NutritionProfileInput {
  weight: number
  height: number
  age: number
  sex: Sex
  activityLevel: ActivityLevel
  pace?: NutritionPace
}

/**
 * Deriva el objetivo recomendado (calorías + macros) para un perfil y un objetivo
 * dados. Envoltorio orientado a objeto sobre `calculateMacros`, pensado para el
 * flujo "cambiar de objetivo → previsualizar nuevo rango" (#243 F2).
 */
export function previewNutritionGoal(
  profile: NutritionProfileInput,
  goal: NutritionGoalType,
): NutritionGoal {
  return calculateMacros(
    profile.weight,
    profile.height,
    profile.age,
    profile.sex,
    profile.activityLevel,
    goal,
    profile.pace,
  )
}

/**
 * Objetivo de nutrición → `primary_goal` estructurado, para sincronizar
 * `users.primary_goal` cuando el usuario cambia su objetivo de nutrición
 * desde la web (#243 F2). 'maintain' es ambiguo (puede venir de
 * salud_general/resistencia/habilidades) → no se sobrescribe.
 */
export function nutritionGoalTypeToPrimaryGoal(goal: NutritionGoalType): PrimaryGoal | null {
  switch (goal) {
    case 'muscle_gain': return 'ganar_musculo'
    case 'fat_loss': return 'perder_grasa'
    case 'recomp': return 'recomposicion'
    default: return null
  }
}

/**
 * I/O de `users` que necesita la pantalla de nutrición (#470): prefill del
 * wizard de objetivos y sincronización best-effort de `primary_goal`. Antes
 * vivía inline en las pantallas (web y móvil).
 */
import type { QueryClient } from '@tanstack/react-query'
import { storage } from '../platform'
import { pb, isPocketBaseAvailable } from './pocketbase'
import { qk } from './query-keys'
import {
  ONBOARDING_ACTIVITY_TO_NUTRITION,
  inferNutritionGoalType,
  nutritionGoalTypeToPrimaryGoal,
  previewNutritionGoal,
  type NutritionPace,
} from './nutritionGoal'
import type { ActivityLevel, NutritionGoal, NutritionGoalType, Sex } from '../types'

/**
 * Espejo local del objetivo, leído por `useNutrition` como `initialData` para
 * pintar sin esperar a la red. Vive aquí (y no en `useNutrition`) para que
 * quien siembre el objetivo pueda dejarlo caliente sin arrastrar el hook
 * entero — y con él el módulo de IA — a su grafo de imports.
 */
export const LS_NUTRITION_GOALS = 'calistenia_nutrition_goals'

export const readCachedNutritionGoal = (): NutritionGoal | null => {
  try { return JSON.parse(storage.getItem(LS_NUTRITION_GOALS) || 'null') } catch { return null }
}

export const cacheNutritionGoal = (d: NutritionGoal | null): void => {
  storage.setItem(LS_NUTRITION_GOALS, JSON.stringify(d))
}

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

/** Perfil completo necesario para derivar un objetivo sin preguntar nada al usuario. */
export interface SeedNutritionGoalInput {
  weight: number
  height: number
  age: number
  sex: Sex
  activityLevel: ActivityLevel
  goal: NutritionGoalType
  pace?: NutritionPace
}

/**
 * Siembra el objetivo de nutrición 'auto' de quien acaba de completar el
 * onboarding: ahí ya se preguntó todo lo que necesita la fórmula (peso, altura,
 * edad, sexo, actividad, objetivo y ritmo), así que volver a pedirlo en el
 * wizard de `/nutrition` era teclear dos veces lo mismo.
 *
 * Es además el único sitio donde edad y sexo llegan a persistirse: en `users`
 * son PII que se borró (migración 1781800000, GHSA-wwj3-9h95-wcpf) y su hogar
 * canónico es la fila de `nutrition_goals`, protegida per-user. Sin esta
 * siembra el onboarding los pregunta y los tira.
 *
 * Nunca pisa un objetivo existente — un `manual` es un override del usuario y
 * un `auto` ya está al día — así que rehacer el onboarding es idempotente.
 * Standalone, como `recomputeAutoNutritionGoal`: no exige montar `useNutrition`
 * (y por eso vive aquí, para no arrastrar ese hook al onboarding). Sincroniza
 * la caché si se le pasa el `queryClient`.
 *
 * Devuelve el goal creado, o `null` si ya había uno o si falló la escritura: es
 * un extra sobre el onboarding, así que nunca propaga el error — el wizard
 * sigue estando ahí como red de seguridad.
 */
export async function seedAutoNutritionGoal(
  userId: string,
  input: SeedNutritionGoalInput,
  queryClient?: QueryClient,
): Promise<NutritionGoal | null> {
  try {
    try {
      await pb.collection('nutrition_goals').getFirstListItem(
        pb.filter('user = {:uid}', { uid: userId }),
        { requestKey: null },
      )
      return null // ya tiene objetivo: no tocarlo
    } catch { /* no hay fila todavía: seguimos y la creamos */ }

    const seeded = previewNutritionGoal({
      weight: input.weight, height: input.height, age: input.age,
      sex: input.sex, activityLevel: input.activityLevel, pace: input.pace,
    }, input.goal)

    const rec: any = await pb.collection('nutrition_goals').create({
      user: userId,
      daily_calories: seeded.dailyCalories, daily_protein: seeded.dailyProtein,
      daily_carbs: seeded.dailyCarbs, daily_fat: seeded.dailyFat,
      goal: seeded.goal, weight: seeded.weight, height: seeded.height,
      age: seeded.age, sex: seeded.sex, activity_level: seeded.activityLevel,
      source: 'auto',
    })
    const newGoal: NutritionGoal = { ...seeded, id: rec.id, user: userId, source: 'auto' }

    if (queryClient) queryClient.setQueryData<NutritionGoal | null>(qk.nutrition.goals(userId), newGoal)
    cacheNutritionGoal(newGoal)
    return newGoal
  } catch (e) {
    console.warn('seedAutoNutritionGoal error:', e)
    return null
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

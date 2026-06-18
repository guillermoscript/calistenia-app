/**
 * Claves de localStorage vinculadas al usuario activo.
 * Se limpian en signOut para evitar que datos del usuario anterior
 * persistan en el nuevo usuario tras un cambio de cuenta.
 *
 * IMPORTANTE: si añades una nueva clave global en un hook offline-first,
 * agrégala aquí también.
 */
import { storage } from '../platform'

export const USER_SCOPED_STORAGE_KEYS: readonly string[] = [
  // useProgress
  'calistenia_progress',
  'calistenia_settings',
  // useWater
  'calistenia_water',
  'calistenia_water_goal',
  // useWeight
  'calistenia_weight_entries',
  // useSleep
  'calistenia_sleep_entries',
  // useBodyMeasurements
  'calistenia_body_measurements',
  // useRestPreferences
  'calistenia_rest_prefs',
  // useMealReminders
  'calistenia_meal_reminders',
  // useWorkoutReminders
  'calistenia_workout_reminders',
  // useWeeklyMealPlan
  'calistenia_weekly_plan',
  // useNutrition
  'calistenia_nutrition_entries',
  'calistenia_nutrition_goals',
  // useFavorites
  'calistenia_exercise_favorites',
  // React Query persister (caché serializado offline)
  'calistenia_rq_cache',
]

/**
 * Prefijos de claves per-usuario (clave = prefijo + userId).
 * Se limpian en signOut buscando la clave exacta con el userId dado.
 */
const USER_SCOPED_KEY_PREFIXES = [
  // onboarding-state
  'calistenia_onboarding_done_',
] as const

/** Elimina todas las entradas de localStorage vinculadas al usuario activo. */
export function clearUserStorage(userId?: string): void {
  USER_SCOPED_STORAGE_KEYS.forEach((key) => storage.removeItem(key))
  if (userId) {
    USER_SCOPED_KEY_PREFIXES.forEach((prefix) => storage.removeItem(`${prefix}${userId}`))
  }
}

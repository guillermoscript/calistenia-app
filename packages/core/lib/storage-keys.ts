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
  // meal logger — last meal type chosen (seeds the picker on next open)
  'calistenia_last_meal_type',
  // useFavorites
  'calistenia_exercise_favorites',
  // useHealthSync — last successful health-hub (Health Connect/HealthKit) sync, per data type
  'calistenia_health_last_sync',
  // React Query persister (caché serializado offline)
  'calistenia_rq_cache',
]

/**
 * NOTA: las claves ya suffijadas por userId (p.ej. `calistenia_onboarding_done_<id>`,
 * `calistenia_tour_*_<id>`) NO se limpian aquí: no filtran datos a otro usuario
 * (cada quien lee solo su clave) y borrarlas re-mostraba el onboarding/tours a
 * usuarios que ya los completaron cada vez que cerraban sesión.
 */

/** Elimina todas las entradas de localStorage vinculadas al usuario activo. */
export function clearUserStorage(_userId?: string): void {
  USER_SCOPED_STORAGE_KEYS.forEach((key) => storage.removeItem(key))
}

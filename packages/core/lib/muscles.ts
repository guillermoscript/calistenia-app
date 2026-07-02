/**
 * Canonical muscle-group taxonomy.
 *
 * Every catalog entry carries `muscle_groups: string[]` (baked at build time
 * by scripts/build-exercise-catalog.mjs from target_muscle/secondary_muscles
 * enums plus the free-text `muscles` field). Apps filter on these ids and
 * label them via i18n — use t(getMuscleGroupLabelKey(id)) in consumers.
 *
 * Keep the id list in sync with MUSCLE_GROUP_ORDER in the build script.
 */

export const MUSCLE_GROUPS = [
  'pecho', 'hombros', 'triceps', 'biceps', 'antebrazos', 'espalda', 'core',
  'lumbar', 'gluteos', 'cuadriceps', 'isquios', 'pantorrillas', 'cadera',
  'cuello', 'cardio',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export function getMuscleGroupLabelKey(id: string): string {
  return `muscleGroup.${id}`
}

/** muscle_groups of a catalog entry, [] when the field is absent (e.g. old
 *  PB records or user-created exercises). */
export function getMuscleGroups(exercise: { muscle_groups?: string[] }): string[] {
  return Array.isArray(exercise.muscle_groups) ? exercise.muscle_groups : []
}

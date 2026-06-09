/**
 * Constantes y tipos de dominio del onboarding (salud + entrenamiento).
 * Viven en core porque los usan las heurísticas puras (injuryMatch,
 * matchPrograms); los componentes del flujo en cada app los re-exportan.
 */

export const CONDITION_IDS = ['heart', 'hypertension', 'diabetes', 'asthma', 'joint', 'back', 'other'] as const
export const INJURY_IDS = ['shoulder', 'wrist', 'elbow', 'knee', 'ankle', 'lower_back', 'other'] as const

export type ConditionId = typeof CONDITION_IDS[number]
export type InjuryId = typeof INJURY_IDS[number]

export interface HealthValues {
  medical_conditions: ConditionId[]
  injuries: InjuryId[]
}

export const FOCUS_AREA_IDS = [
  'full_body', 'upper_body', 'core', 'legs',
  'pull_up', 'handstand', 'planche', 'muscle_up',
] as const

export const DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayId = typeof DAY_IDS[number]

export type FocusAreaId = typeof FOCUS_AREA_IDS[number]
export type Intensity = 'light' | 'moderate' | 'intense'

export interface TrainingValues {
  level: string  // principiante | intermedio | avanzado
  focus_areas: FocusAreaId[]
  training_days: DayId[]
  intensity: Intensity | ''
  goal: string
}

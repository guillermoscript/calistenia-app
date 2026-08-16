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

/** Objetivo principal estructurado del usuario (campo select `primary_goal` en `users`). */
export const PRIMARY_GOAL_IDS = [
  'ganar_musculo', 'perder_grasa', 'recomposicion',
  'resistencia', 'habilidades', 'salud_general',
] as const

export type PrimaryGoal = typeof PRIMARY_GOAL_IDS[number]

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

export type ActivityLevel = 'sedentary' | 'light' | 'active' | 'very_active'
export type Pace = 'gradual' | 'balanced' | 'aggressive'

/**
 * Valores del paso de datos básicos. Edad/sexo no se persisten en `users`
 * (PII; viven en `nutrition_goals`); solo alimentan heurísticas del flujo.
 */
export interface BasicsValues {
  weight: string
  height: string
  age: string
  sex: string
}

export interface GoalsValues {
  primary_goal: PrimaryGoal | ''
  goal_weight: string
  waist: string
  activity_level: ActivityLevel | ''
  pace: Pace | ''
}

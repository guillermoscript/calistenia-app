/**
 * The circuits a battle can be built from (#356).
 *
 * Deliberately a short, explicit list rather than "any circuit in the app". A battle is
 * a synchronized competition: every participant has to render the same exercise, round
 * and target from one server snapshot, and every rep has to be comparable across
 * people. Free-form circuits with per-user substitutions cannot promise that, so the
 * MVP ships three fixed formats and grows from evidence.
 *
 * `workout_template_id` is the stable key stored in `battles.config`; renaming one
 * would orphan existing battles, so treat these ids as permanent.
 */
import type { BattleConfiguration } from '../types/battle'

export interface BattlePreset {
  id: string
  name: { es: string; en: string }
  description: { es: string; en: string }
  /** Rough duration for the picker, in minutes. Not enforced anywhere. */
  estimatedMinutes: number
  config: BattleConfiguration
  /**
   * Display names per `exercise_id`, kept here rather than in `config` on purpose:
   * `config` is the server contract stored on every battle record, and putting UI
   * copy in it would freeze today's wording into old battles forever.
   */
  exerciseNames: Record<string, { es: string; en: string }>
}

export const BATTLE_PRESETS: BattlePreset[] = [
  {
    id: 'battle_sprint_3',
    name: { es: 'Sprint 3 rondas', en: '3-round sprint' },
    description: {
      es: '3 rondas de flexiones, sentadillas y burpees. Corto y brutal.',
      en: '3 rounds of push-ups, squats and burpees. Short and brutal.',
    },
    estimatedMinutes: 8,
    config: {
      workout_template_id: 'battle_sprint_3',
      rounds: 3,
      scoring_mode: 'rounds_then_reps_then_time',
      exercises: [
        { exercise_id: 'push_ups', position: 0, target: { kind: 'reps', value: 12 }, rest_seconds: 20 },
        { exercise_id: 'jump_squats', position: 1, target: { kind: 'reps', value: 15 }, rest_seconds: 20 },
        { exercise_id: 'burpees', position: 2, target: { kind: 'reps', value: 8 }, rest_seconds: 40 },
      ],
    },
    exerciseNames: {
      push_ups: { es: 'Flexiones', en: 'Push-ups' },
      jump_squats: { es: 'Sentadillas con salto', en: 'Jump squats' },
      burpees: { es: 'Burpees', en: 'Burpees' },
    },
  },
  {
    id: 'battle_core_5',
    name: { es: 'Core 5 rondas', en: '5-round core' },
    description: {
      es: '5 rondas de plancha, escaladores y abdominales.',
      en: '5 rounds of plank, mountain climbers and sit-ups.',
    },
    estimatedMinutes: 12,
    config: {
      workout_template_id: 'battle_core_5',
      rounds: 5,
      scoring_mode: 'rounds_then_reps_then_time',
      exercises: [
        { exercise_id: 'plank', position: 0, target: { kind: 'seconds', value: 30 }, rest_seconds: 15 },
        { exercise_id: 'mountain_climbers', position: 1, target: { kind: 'reps', value: 20 }, rest_seconds: 15 },
        { exercise_id: 'sit_ups', position: 2, target: { kind: 'reps', value: 15 }, rest_seconds: 30 },
      ],
    },
    exerciseNames: {
      plank: { es: 'Plancha', en: 'Plank' },
      mountain_climbers: { es: 'Escaladores', en: 'Mountain climbers' },
      sit_ups: { es: 'Abdominales', en: 'Sit-ups' },
    },
  },
  {
    id: 'battle_pull_4',
    name: { es: 'Tirón 4 rondas', en: '4-round pull' },
    description: {
      es: '4 rondas de dominadas, remo invertido y hollow hold. Necesitas barra.',
      en: '4 rounds of pull-ups, inverted rows and hollow hold. Bar required.',
    },
    estimatedMinutes: 14,
    config: {
      workout_template_id: 'battle_pull_4',
      rounds: 4,
      scoring_mode: 'rounds_then_reps_then_time',
      exercises: [
        { exercise_id: 'pull_ups', position: 0, target: { kind: 'reps', value: 6 }, rest_seconds: 45 },
        { exercise_id: 'inverted_rows', position: 1, target: { kind: 'reps', value: 10 }, rest_seconds: 30 },
        { exercise_id: 'hollow_hold', position: 2, target: { kind: 'seconds', value: 30 }, rest_seconds: 45 },
      ],
    },
    exerciseNames: {
      pull_ups: { es: 'Dominadas', en: 'Pull-ups' },
      inverted_rows: { es: 'Remo invertido', en: 'Inverted rows' },
      hollow_hold: { es: 'Hollow hold', en: 'Hollow hold' },
    },
  },
]

export function findBattlePreset(id: string): BattlePreset | null {
  return BATTLE_PRESETS.find(preset => preset.id === id) ?? null
}

/**
 * Human name for an exercise inside a battle.
 *
 * Falls back to a prettified id rather than showing `mountain_climbers` raw, so a
 * battle created by a newer client that ships an exercise this build has never heard of
 * still renders something readable instead of breaking the screen.
 */
export function battleExerciseName(
  templateId: string,
  exerciseId: string,
  language: string,
): string {
  const lang = language.startsWith('en') ? 'en' : 'es'
  const named = findBattlePreset(templateId)?.exerciseNames[exerciseId]
  if (named) return named[lang]
  return exerciseId
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Total target reps/seconds for one round, used by the UI to show a per-round goal. */
export function battleRoundTargets(config: BattleConfiguration): { reps: number; seconds: number } {
  return config.exercises.reduce(
    (totals, exercise) => exercise.target.kind === 'reps'
      ? { ...totals, reps: totals.reps + exercise.target.value }
      : { ...totals, seconds: totals.seconds + exercise.target.value },
    { reps: 0, seconds: 0 },
  )
}

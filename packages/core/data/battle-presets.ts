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
import type { BattleConfiguration, BattleSource } from '../types/battle'

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
  // #882: más formatos rápidos. Ids de catálogo donde existen.
  {
    id: 'battle_legs_4',
    name: { es: 'Piernas 4 rondas', en: '4-round legs' },
    description: {
      es: '4 rondas de sentadillas con salto, zancadas, gemelos y sentadilla en pared. Sin material.',
      en: '4 rounds of jump squats, lunges, calf raises and wall sit. No equipment.',
    },
    estimatedMinutes: 14,
    config: {
      workout_template_id: 'battle_legs_4',
      rounds: 4,
      scoring_mode: 'rounds_then_reps_then_time',
      exercises: [
        { exercise_id: 'jump_squat', position: 0, target: { kind: 'reps', value: 12 }, rest_seconds: 20 },
        { exercise_id: 'reverse_lunge', position: 1, target: { kind: 'reps', value: 16 }, rest_seconds: 20 },
        { exercise_id: 'calf_raise', position: 2, target: { kind: 'reps', value: 20 }, rest_seconds: 20 },
        { exercise_id: 'wall_sit', position: 3, target: { kind: 'seconds', value: 40 }, rest_seconds: 45 },
      ],
    },
    exerciseNames: {
      jump_squat: { es: 'Sentadillas con salto', en: 'Jump squats' },
      reverse_lunge: { es: 'Zancadas atrás', en: 'Reverse lunges' },
      calf_raise: { es: 'Elevación de gemelos', en: 'Calf raises' },
      wall_sit: { es: 'Sentadilla en pared', en: 'Wall sit' },
    },
  },
  {
    id: 'battle_push_4',
    name: { es: 'Empuje 4 rondas', en: '4-round push' },
    description: {
      es: '4 rondas de flexiones, flexiones diamante, pike push-ups y fondos en silla.',
      en: '4 rounds of push-ups, diamond push-ups, pike push-ups and chair dips.',
    },
    estimatedMinutes: 12,
    config: {
      workout_template_id: 'battle_push_4',
      rounds: 4,
      scoring_mode: 'rounds_then_reps_then_time',
      exercises: [
        { exercise_id: 'pushup_std', position: 0, target: { kind: 'reps', value: 12 }, rest_seconds: 30 },
        { exercise_id: 'diamond_pushup', position: 1, target: { kind: 'reps', value: 8 }, rest_seconds: 30 },
        { exercise_id: 'pike_pushup', position: 2, target: { kind: 'reps', value: 8 }, rest_seconds: 30 },
        { exercise_id: 'dips_chair', position: 3, target: { kind: 'reps', value: 12 }, rest_seconds: 45 },
      ],
    },
    exerciseNames: {
      pushup_std: { es: 'Flexiones', en: 'Push-ups' },
      diamond_pushup: { es: 'Flexiones diamante', en: 'Diamond push-ups' },
      pike_pushup: { es: 'Pike push-ups', en: 'Pike push-ups' },
      dips_chair: { es: 'Fondos en silla', en: 'Chair dips' },
    },
  },
  {
    id: 'battle_fullbody_5',
    name: { es: 'Full body 5 rondas', en: '5-round full body' },
    description: {
      es: '5 rondas de burpees, flexiones, sentadillas con salto, escaladores y plancha. Sin material.',
      en: '5 rounds of burpees, push-ups, jump squats, mountain climbers and plank. No equipment.',
    },
    estimatedMinutes: 18,
    config: {
      workout_template_id: 'battle_fullbody_5',
      rounds: 5,
      scoring_mode: 'rounds_then_reps_then_time',
      exercises: [
        { exercise_id: 'burpees', position: 0, target: { kind: 'reps', value: 8 }, rest_seconds: 20 },
        { exercise_id: 'pushup_std', position: 1, target: { kind: 'reps', value: 10 }, rest_seconds: 20 },
        { exercise_id: 'jump_squat', position: 2, target: { kind: 'reps', value: 12 }, rest_seconds: 20 },
        { exercise_id: 'mountain_climbers', position: 3, target: { kind: 'reps', value: 20 }, rest_seconds: 20 },
        { exercise_id: 'plank', position: 4, target: { kind: 'seconds', value: 30 }, rest_seconds: 45 },
      ],
    },
    exerciseNames: {
      burpees: { es: 'Burpees', en: 'Burpees' },
      pushup_std: { es: 'Flexiones', en: 'Push-ups' },
      jump_squat: { es: 'Sentadillas con salto', en: 'Jump squats' },
      mountain_climbers: { es: 'Escaladores', en: 'Mountain climbers' },
      plank: { es: 'Plancha', en: 'Plank' },
    },
  },
]

/** `workout_template_id` de una batalla montada a mano (#882). */
export const BATTLE_CUSTOM_TEMPLATE_ID = 'custom'

export function findBattlePreset(id: string): BattlePreset | null {
  return BATTLE_PRESETS.find(preset => preset.id === id) ?? null
}

const langOf = (language: string): 'es' | 'en' => (language.startsWith('en') ? 'en' : 'es')

function prettifyExerciseId(exerciseId: string): string {
  return exerciseId
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Human name for an exercise inside a battle. The ONE place every battle screen
 * (lobby, live, results, share card, history, web landing) asks for it.
 *
 * Chain: the preset's names (old battles and quick formats) → the names frozen in
 * `config.exercise_names` at creation (#882: program days and custom battles), in the
 * reader's language and then the other one → a prettified id, so a battle created by a
 * newer client still renders something readable instead of `mountain_climbers` raw.
 */
export function battleExerciseLabel(
  config: Pick<BattleConfiguration, 'workout_template_id' | 'exercise_names'>,
  exerciseId: string,
  language: string,
): string {
  const lang = langOf(language)
  const named = findBattlePreset(config.workout_template_id)?.exerciseNames[exerciseId]
  if (named) return named[lang]
  const frozen = config.exercise_names?.[exerciseId]
  const other = lang === 'es' ? 'en' : 'es'
  const fromConfig = frozen?.[lang]?.trim() || frozen?.[other]?.trim()
  if (fromConfig) return fromConfig
  return prettifyExerciseId(exerciseId)
}

/**
 * Title of a battle: the one written (or generated) at creation, then the preset's
 * name. `null` when there is neither — the caller picks its generic copy.
 */
export function battleTitle(
  config: Pick<BattleConfiguration, 'workout_template_id' | 'title'> | null | undefined,
  language: string,
): string | null {
  if (!config) return null
  const title = typeof config.title === 'string' ? config.title.trim() : ''
  if (title) return title
  const preset = findBattlePreset(config.workout_template_id)
  return preset ? preset.name[langOf(language)] : null
}

/** Where a battle's circuit came from; battles before #882 only know their template. */
export function battleSourceOf(config: Pick<BattleConfiguration, 'workout_template_id' | 'source'>): BattleSource {
  if (config.source) return config.source
  if (findBattlePreset(config.workout_template_id)) return 'preset'
  return config.workout_template_id === 'program_day' ? 'program_day' : 'custom'
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

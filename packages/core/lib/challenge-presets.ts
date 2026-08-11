import i18n from 'i18next'
import { addDays, todayStr } from './dateUtils'
import { getMetricUnit } from './challenges'
import type { ChallengeMetric } from '../types'

export type BeginnerChallengePresetId =
  | 'starter_7_day'
  | 'consistency_30_day'
  | 'first_10_workouts'
  | 'pushup_builder'

export interface BeginnerChallengePreset {
  id: BeginnerChallengePresetId
  titleKey: string
  descriptionKey: string
  metric: ChallengeMetric
  goal: number
  durationDays: number
  difficulty: 'beginner'
  enabled: boolean
  disabledReasonKey?: string
}

export const BEGINNER_CHALLENGE_PRESETS: readonly BeginnerChallengePreset[] = [
  {
    id: 'starter_7_day',
    titleKey: 'challenge.preset.starter7.title',
    descriptionKey: 'challenge.preset.starter7.description',
    metric: 'most_sessions',
    goal: 3,
    durationDays: 7,
    difficulty: 'beginner',
    enabled: true,
  },
  {
    id: 'consistency_30_day',
    titleKey: 'challenge.preset.consistency30.title',
    descriptionKey: 'challenge.preset.consistency30.description',
    metric: 'most_sessions',
    goal: 12,
    durationDays: 30,
    difficulty: 'beginner',
    enabled: true,
  },
  {
    id: 'first_10_workouts',
    titleKey: 'challenge.preset.first10.title',
    descriptionKey: 'challenge.preset.first10.description',
    metric: 'most_sessions',
    goal: 10,
    durationDays: 365,
    difficulty: 'beginner',
    enabled: true,
  },
  {
    id: 'pushup_builder',
    titleKey: 'challenge.preset.pushup.title',
    descriptionKey: 'challenge.preset.pushup.description',
    metric: 'most_pushups',
    goal: 100,
    durationDays: 30,
    difficulty: 'beginner',
    enabled: false,
    disabledReasonKey: 'challenge.preset.pushup.disabled',
  },
] as const

export function getBeginnerChallengePreset(id: string): BeginnerChallengePreset | null {
  return BEGINNER_CHALLENGE_PRESETS.find((preset) => preset.id === id) ?? null
}

export interface PresetChallengeRecord {
  id: string
  preset_key?: string
  starts_at?: string
  ends_at?: string
  status?: string
}

export interface PresetParticipantRecord {
  expand?: { challenge?: PresetChallengeRecord }
}

/**
 * Return the enrollment **activa** para que un tap repetido sea un no-op seguro.
 *
 * Solo cuentan los retos activos: un preset terminado debe poder empezarse de
 * nuevo (son retos de 7/30 días pensados para repetirse), así que una ronda
 * pasada no puede bloquear la siguiente.
 */
export function findExistingPresetChallenge(
  records: readonly PresetParticipantRecord[],
  presetId: string,
): PresetChallengeRecord | null {
  return records.find((record) => {
    const challenge = record.expand?.challenge
    return challenge?.preset_key === presetId && challenge?.status === 'active'
  })?.expand?.challenge ?? null
}

/**
 * Título/descripción del reto resueltos en el idioma ACTUAL.
 *
 * El `title` guardado en BD se resolvió con el idioma que tenía quien se unió y
 * queda congelado ahí para siempre. Como `preset_key` sí se persiste, podemos
 * re-resolver el texto del catálogo al pintar; el valor de BD solo hace de
 * fallback para retos que no vienen de un preset.
 */
function translatedOr(key: string, fallback: string): string {
  // Si falta la traducción, i18next devuelve la clave (o undefined si aún no se
  // ha inicializado); en ese caso vale más el texto guardado que un hueco.
  const translated = i18n.t(key)
  return translated && translated !== key ? translated : fallback
}

export function resolvePresetChallengeTitle(challenge: { title?: string; preset_key?: string }): string {
  const preset = challenge.preset_key ? getBeginnerChallengePreset(challenge.preset_key) : null
  const stored = challenge.title ?? ''
  return preset ? translatedOr(preset.titleKey, stored) : stored
}

export function resolvePresetChallengeDescription(challenge: { description?: string; preset_key?: string }): string {
  const preset = challenge.preset_key ? getBeginnerChallengePreset(challenge.preset_key) : null
  const stored = challenge.description ?? ''
  return preset ? translatedOr(preset.descriptionKey, stored) : stored
}

/**
 * Meta del preset con su unidad real. `challenge.preset.target` habla de
 * entrenamientos, así que solo vale para métricas de sesiones; con push-ups
 * diría "100 entrenamientos" cuando la meta son 100 reps.
 */
export function getPresetTargetLabel(preset: BeginnerChallengePreset): string {
  const unit = getMetricUnit(preset.metric)
  return unit
    ? i18n.t('challenge.preset.targetUnit', { count: preset.goal, unit })
    : i18n.t('challenge.preset.target', { count: preset.goal })
}

export function getPresetDateRange(
  preset: BeginnerChallengePreset,
  startsAt = todayStr(),
): { startsAt: string; endsAt: string } {
  return { startsAt, endsAt: addDays(startsAt, preset.durationDays - 1) }
}

export function getPresetTitle(preset: BeginnerChallengePreset): string {
  return i18n.t(preset.titleKey)
}

export function getPresetDescription(preset: BeginnerChallengePreset): string {
  return i18n.t(preset.descriptionKey)
}

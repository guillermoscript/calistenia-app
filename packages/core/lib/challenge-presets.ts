import i18n from 'i18next'
import { addDays, todayStr } from './dateUtils'
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
}

export interface PresetParticipantRecord {
  expand?: { challenge?: PresetChallengeRecord }
}

/** Return an existing enrollment so a repeated tap is a safe no-op. */
export function findExistingPresetChallenge(
  records: readonly PresetParticipantRecord[],
  presetId: string,
): PresetChallengeRecord | null {
  return records.find((record) => record.expand?.challenge?.preset_key === presetId)?.expand?.challenge ?? null
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

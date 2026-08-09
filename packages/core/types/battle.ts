/**
 * Shared contract for collaborative circuit battles.
 *
 * Battles intentionally do not reuse the GPS race records. A battle is a
 * workout session whose server owns lifecycle, timestamps, progress and score.
 */

export const BATTLE_STATUSES = [
  'draft',
  'lobby',
  'ready',
  'live',
  'finished',
  'expired',
  'cancelled',
] as const

export type BattleStatus = typeof BATTLE_STATUSES[number]

export const BATTLE_PARTICIPANT_STATUSES = [
  'invited',
  'joined',
  'ready',
  'active',
  'finished',
  'left',
] as const

export type BattleParticipantStatus = typeof BATTLE_PARTICIPANT_STATUSES[number]

export type BattleTarget =
  | { kind: 'reps'; value: number }
  | { kind: 'seconds'; value: number }

export interface BattleExerciseTarget {
  exercise_id: string
  position: number
  target: BattleTarget
  rest_seconds: number
}

export type BattleScoringMode = 'rounds_then_reps_then_time'

export interface BattleConfiguration {
  workout_template_id: string
  rounds: number
  exercises: BattleExerciseTarget[]
  scoring_mode: BattleScoringMode
}

export interface Battle {
  id: string
  creator: string
  status: BattleStatus
  config: BattleConfiguration
  revision: number
  invite_expires_at: string | null
  invite_revoked_at: string | null
  starts_at: string | null
  ends_at: string | null
  finished_at: string | null
  created: string
  updated: string
}

export interface BattleProgress {
  completed_rounds: number
  completed_reps: number
  completed_time_seconds: number
  current_exercise_position: number | null
  last_activity_at: string | null
}

export interface BattleParticipant {
  id: string
  battle: string
  user: string | null
  status: BattleParticipantStatus
  progress: BattleProgress
  joined_at: string | null
  ready_at: string | null
  active_at: string | null
  finished_at: string | null
  left_at: string | null
  last_seen_at: string | null
  created: string
  updated: string
}

export interface BattleInvite {
  id: string
  battle: string
  created_by: string
  invitee_user: string | null
  token_hash: string
  status: 'active' | 'consumed' | 'revoked' | 'expired'
  expires_at: string
  used_at: string | null
  used_by: string | null
  created: string
  updated: string
}

export interface BattleScoreInput {
  completed_rounds: number
  completed_reps: number
  completed_time_seconds: number
  tie_break_key: string
}

export interface BattleScore {
  completed_rounds: number
  completed_reps: number
  completed_time_seconds: number
  tie_break_key: string
}

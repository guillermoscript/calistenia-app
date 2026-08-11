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
  /**
   * Last accepted lobby mutation. The expiry sweep measures staleness against this
   * rather than `updated`, which moves on unrelated writes. Server-owned (#356).
   */
  last_activity_at: string | null
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
  /** When this participant finished, or null if they have not. Ranks ties (#387). */
  finished_at?: string | null
  tie_break_key: string
}

export interface BattleScore {
  completed_rounds: number
  completed_reps: number
  completed_time_seconds: number
  finished_at: string | null
  tie_break_key: string
}

/** One row of the server-computed ranking. Includes `left` participants. */
export interface BattleStanding {
  participant_id: string
  user: string | null
  display_name: string
  status: BattleParticipantStatus
  score: BattleScore
  rank: number
}

/**
 * A participant as seen inside a battle the caller is authorized for. `display_name` is
 * added by the snapshot endpoint because `battle_participants` read rules only expose a
 * user their own row — it is never present on the pre-join invite landing.
 */
export interface BattleParticipantView extends BattleParticipant {
  display_name: string
}

/**
 * The authoritative view of a battle at one instant, as returned by every battle API
 * endpoint. Clients **replace** their local state with this; they never merge into it.
 */
export interface BattleSnapshot {
  battle: Battle
  participants: BattleParticipantView[]
  /** The caller's own participant row, or null if they are the creator watching only. */
  me: BattleParticipantView | null
  standings: BattleStanding[]
  /** Server time at the moment the snapshot was built, for clock-offset correction. */
  server_time: string
  /** Present when an idempotency key short-circuited the mutation. */
  replayed?: boolean
  /** Present on `join` when the caller already had a seat. */
  already_joined?: boolean
}

/** Raw invite token, returned by the API exactly once and never persisted server-side. */
export interface BattleInviteIssued {
  token: string
  invite_id: string
  expires_at: string
}

/** Why an invite link cannot be used. Deliberately coarse: it must not be an oracle. */
export type BattleInviteRejection = 'invalid' | 'expired' | 'closed'

/** Public landing metadata. Contains counts only — never participant identities. */
export interface BattleInvitePreview {
  ok: boolean
  reason: BattleInviteRejection | ''
  battle: {
    id: string
    status: BattleStatus
    rounds: number
    exercise_count: number
    workout_template_id: string
    participant_count: number
    expires_at: string
  } | null
}

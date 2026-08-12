import type {
  Battle,
  BattleConfiguration,
  BattleParticipant,
  BattleParticipantStatus,
  BattleScore,
  BattleScoreInput,
  BattleStanding,
  BattleStatus,
} from '../types/battle'

export const BATTLE_STATUS_TRANSITIONS: Readonly<Record<BattleStatus, readonly BattleStatus[]>> = {
  draft: ['lobby', 'cancelled'],
  lobby: ['ready', 'expired', 'cancelled'],
  ready: ['lobby', 'live', 'expired', 'cancelled'],
  live: ['finished', 'expired', 'cancelled'],
  finished: [],
  expired: [],
  cancelled: [],
}

export const BATTLE_PARTICIPANT_TRANSITIONS: Readonly<Record<BattleParticipantStatus, readonly BattleParticipantStatus[]>> = {
  invited: ['joined', 'left'],
  joined: ['ready', 'left'],
  ready: ['joined', 'active', 'left'],
  active: ['finished', 'left'],
  finished: [],
  left: [],
}

export class BattleContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BattleContractError'
  }
}

export function canTransitionBattle(from: BattleStatus, to: BattleStatus): boolean {
  return BATTLE_STATUS_TRANSITIONS[from].includes(to)
}

export function assertBattleTransition(from: BattleStatus, to: BattleStatus): void {
  if (!canTransitionBattle(from, to)) {
    throw new BattleContractError(`Invalid battle transition: ${from} -> ${to}`)
  }
}

export function canTransitionBattleParticipant(
  from: BattleParticipantStatus,
  to: BattleParticipantStatus,
): boolean {
  return BATTLE_PARTICIPANT_TRANSITIONS[from].includes(to)
}

export function assertBattleParticipantTransition(
  from: BattleParticipantStatus,
  to: BattleParticipantStatus,
): void {
  if (!canTransitionBattleParticipant(from, to)) {
    throw new BattleContractError(`Invalid participant transition: ${from} -> ${to}`)
  }
}

/** New invite acceptances are only allowed while the battle is still in lobby. */
export function canAcceptBattleJoin(status: BattleStatus): boolean {
  return status === 'lobby'
}

export function validateBattleConfiguration(config: BattleConfiguration): string[] {
  const errors: string[] = []
  if (!config || typeof config !== 'object') return ['configuration is required']
  if (typeof config.workout_template_id !== 'string' || !config.workout_template_id.trim()) {
    errors.push('workout_template_id is required')
  }
  if (!Number.isInteger(config.rounds) || config.rounds < 1) errors.push('rounds must be a positive integer')
  if (config.scoring_mode !== 'rounds_then_reps_then_time') {
    errors.push('unsupported scoring_mode')
  }
  if (!Array.isArray(config.exercises) || config.exercises.length === 0) {
    errors.push('at least one exercise is required')
    return errors
  }

  const positions = new Set<number>()
  const exerciseIds = new Set<string>()
  for (const exercise of config.exercises) {
    if (!Number.isInteger(exercise.position) || exercise.position < 0) {
      errors.push(`invalid exercise position: ${exercise.position}`)
    } else if (positions.has(exercise.position)) {
      errors.push(`duplicate exercise position: ${exercise.position}`)
    } else {
      positions.add(exercise.position)
    }
    const exerciseId = typeof exercise.exercise_id === 'string' ? exercise.exercise_id.trim() : ''
    if (!exerciseId) errors.push('exercise_id is required')
    if (exerciseIds.has(exerciseId)) errors.push(`duplicate exercise_id: ${exerciseId}`)
    exerciseIds.add(exerciseId)
    if (!Number.isInteger(exercise.rest_seconds) || exercise.rest_seconds < 0) {
      errors.push(`invalid rest_seconds for ${exercise.exercise_id}`)
    }
    if (exercise.target?.kind !== 'reps' && exercise.target?.kind !== 'seconds') {
      errors.push(`invalid target kind for ${exerciseId}`)
    }
    if (!Number.isInteger(exercise.target?.value) || exercise.target.value <= 0) {
      errors.push(`invalid target for ${exercise.exercise_id}`)
    }
  }
  const orderedPositions = [...positions].sort((a, b) => a - b)
  if (orderedPositions.some((position, index) => position !== index)) {
    errors.push('exercise positions must be contiguous from 0')
  }
  return errors
}

export function createBattleScore(input: BattleScoreInput): BattleScore {
  const values = [input.completed_rounds, input.completed_reps, input.completed_time_seconds]
  if (values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new BattleContractError('Score values must be finite and non-negative')
  }
  if (!input.tie_break_key) throw new BattleContractError('tie_break_key is required')
  return {
    completed_rounds: Math.floor(input.completed_rounds),
    completed_reps: Math.floor(input.completed_reps),
    completed_time_seconds: Math.floor(input.completed_time_seconds),
    finished_at: input.finished_at ?? null,
    tie_break_key: input.tie_break_key,
  }
}

/**
 * PocketBase hands back `2026-08-11 20:38:14.658Z`; `Date.parse` wants the `T`.
 * Returns `null` for anything unparseable so a bad timestamp reads as "we do not know"
 * instead of as the epoch — which would rank a finisher last, or make a resting
 * participant look idle since 1970.
 */
function battleTimeMs(raw: string | null): number | null {
  if (!raw) return null
  const ms = Date.parse(raw.replace(' ', 'T'))
  return Number.isNaN(ms) ? null : ms
}

/** Returns a negative number when `a` ranks ahead of `b`. */
export function compareBattleScores(a: BattleScore, b: BattleScore): number {
  if (a.completed_rounds !== b.completed_rounds) return b.completed_rounds - a.completed_rounds
  if (a.completed_reps !== b.completed_reps) return b.completed_reps - a.completed_reps
  if (a.completed_time_seconds !== b.completed_time_seconds) {
    return b.completed_time_seconds - a.completed_time_seconds
  }

  // A battle is a race, so equal work is settled by who got there first. Without this the
  // two all-reps circuits rank everyone who completes them by record id, which is
  // arbitrary: in testing the participant who finished 25 minutes later won (#387).
  const aFinished = battleTimeMs(a.finished_at)
  const bFinished = battleTimeMs(b.finished_at)
  if (aFinished !== bFinished) {
    // Finishing beats not finishing at equal work; among finishers, earlier wins.
    if (aFinished === null) return 1
    if (bFinished === null) return -1
    return aFinished - bFinished
  }

  return a.tie_break_key < b.tie_break_key ? -1 : a.tie_break_key > b.tie_break_key ? 1 : 0
}

export type BattleMutation =
  | { kind: 'edit_config' }
  | { kind: 'transition'; to: BattleStatus }
  | { kind: 'join' }
  | { kind: 'mark_ready' }
  | { kind: 'update_progress' }
  | { kind: 'leave' }

/**
 * Client-side mirror of the server authorization contract. The server remains
 * authoritative; this helper prevents UI code from offering impossible writes.
 */
export function canMutateBattle(
  actorUserId: string,
  battle: Pick<Battle, 'creator' | 'status'>,
  participant: Pick<BattleParticipant, 'user' | 'status'> | null,
  mutation: BattleMutation,
): boolean {
  if (!actorUserId) return false
  if (mutation.kind === 'edit_config') return battle.creator === actorUserId && battle.status === 'draft'
  if (mutation.kind === 'transition') {
    return battle.creator === actorUserId && canTransitionBattle(battle.status, mutation.to)
  }
  if (mutation.kind === 'join') return canAcceptBattleJoin(battle.status)
  if (!participant || participant.user !== actorUserId) return false
  if (mutation.kind === 'mark_ready') return participant.status === 'joined'
  if (mutation.kind === 'update_progress') return participant.status === 'active'
  if (mutation.kind === 'leave') return ['invited', 'joined', 'ready', 'active'].includes(participant.status)
  return false
}

export function canViewBattle(
  actorUserId: string,
  battle: Pick<Battle, 'creator'>,
  participant: Pick<BattleParticipant, 'user'> | null,
): boolean {
  return Boolean(actorUserId) && (battle.creator === actorUserId || participant?.user === actorUserId)
}

/**
 * Whether a battle still has something in it *for me* — the question the floating bar
 * and the resume card are really asking.
 *
 * It is not the same question as "is the battle open". A battle stays `live` while any
 * opponent is still working, so the moment I finish my own run — or walk out of one —
 * the battle is still open but there is nothing left for me to go back to. Reading the
 * battle status alone left the bar nagging about a battle the user had already closed,
 * with no way to dismiss it.
 *
 * `mySeat` is null when I hold no participant row. That is the creator of an unpublished
 * draft (publishing is what seats them), so they keep the resume affordance; it is never
 * a reason to advertise a battle already under way.
 */
/**
 * What a participant is doing right now, as far as the server can honestly tell (#397).
 *
 * `idle` is the important one. A live board that only shows scores makes someone who is
 * resting look identical to someone who lost signal or quietly gave up — the counter
 * simply stops in both cases. Splitting them is the whole point: `resting` has a
 * deadline you can watch tick down, `idle` is "we have not heard from them in a while".
 */
export type BattleParticipantActivity = 'resting' | 'working' | 'idle' | 'finished' | 'left'

/**
 * How long a participant may go without confirming an exercise before the board stops
 * calling it work. Generous on purpose: a held plank plus getting set up for the next
 * exercise is a legitimately long silence, and calling a training partner idle while
 * they are mid-effort is worse than being slow to notice they stopped.
 */
export const BATTLE_IDLE_AFTER_MS = 180_000

export function battleParticipantActivity(
  standing: Pick<BattleStanding, 'status' | 'resting_until' | 'last_activity_at'>,
  nowMs: number,
): BattleParticipantActivity {
  if (standing.status === 'finished') return 'finished'
  if (standing.status === 'left') return 'left'

  const restingUntil = battleTimeMs(standing.resting_until)
  if (restingUntil !== null && restingUntil > nowMs) return 'resting'

  const lastActivity = battleTimeMs(standing.last_activity_at)
  if (lastActivity !== null && nowMs - lastActivity > BATTLE_IDLE_AFTER_MS) return 'idle'
  return 'working'
}

/** Whole seconds of rest left, floored at 0. */
export function battleRestSecondsLeft(restingUntil: string | null, nowMs: number): number {
  const until = battleTimeMs(restingUntil)
  if (until === null) return 0
  return Math.max(0, Math.ceil((until - nowMs) / 1000))
}

/**
 * How a closed battle went for one person (#398).
 *
 * `left` is deliberately not `lost`. Walking out is not the same as being beaten, and a
 * record that quietly counted it as a defeat would misstate what happened — though
 * hiding the battle entirely would misstate it just as badly, so it still appears in
 * history. `unknown` covers a battle with no stored ranking: everything that closed
 * before #398, where there is no honest way to reconstruct the result.
 */
export type BattleOutcome = 'won' | 'lost' | 'left' | 'unknown'

export function battleOutcomeFor(
  standings: BattleStanding[] | null,
  userId: string,
): BattleOutcome {
  if (!standings || standings.length === 0) return 'unknown'
  const mine = standings.find((entry) => entry.user === userId)
  if (!mine) return 'unknown'
  if (mine.status === 'left') return 'left'

  // Ranks are assigned across everyone including those who walked out, so "first" has to
  // be measured among the people who actually saw it through.
  const contenders = standings.filter((entry) => entry.status !== 'left')
  const best = contenders.reduce<BattleStanding | null>(
    (top, entry) => (top === null || entry.rank < top.rank ? entry : top),
    null,
  )
  return best && best.participant_id === mine.participant_id ? 'won' : 'lost'
}

export interface BattleRecord {
  fought: number
  won: number
  lost: number
  left: number
  /** Consecutive wins counting back from the most recent battle. */
  streak: number
}

/**
 * A person's battle record, from their closed battles **newest first**.
 *
 * The streak walks back from the newest battle and stops at the first loss. Battles you
 * left are stepped over rather than counted as either outcome — same reasoning as
 * `battleOutcomeFor`, and the alternative, a walk-out silently ending a run of wins, is
 * the kind of detail that makes a person stop trusting the number.
 */
export function battleRecordFrom(
  battles: Pick<Battle, 'final_standings'>[],
  userId: string,
): BattleRecord {
  const record: BattleRecord = { fought: 0, won: 0, lost: 0, left: 0, streak: 0 }
  let streakOpen = true

  for (const battle of battles) {
    const outcome = battleOutcomeFor(battle.final_standings, userId)
    if (outcome === 'unknown') continue

    record.fought += 1
    if (outcome === 'won') {
      record.won += 1
      if (streakOpen) record.streak += 1
    } else if (outcome === 'lost') {
      record.lost += 1
      streakOpen = false
    } else {
      record.left += 1
    }
  }
  return record
}

export function isBattleActiveForMe(
  status: BattleStatus,
  mySeat: BattleParticipantStatus | null,
  amCreator: boolean,
): boolean {
  if (status !== 'draft' && status !== 'lobby' && status !== 'ready' && status !== 'live') return false
  if (mySeat === null) return amCreator && status !== 'live'
  return mySeat !== 'finished' && mySeat !== 'left'
}

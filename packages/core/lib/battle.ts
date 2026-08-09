import type {
  Battle,
  BattleConfiguration,
  BattleParticipant,
  BattleParticipantStatus,
  BattleScore,
  BattleScoreInput,
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
    tie_break_key: input.tie_break_key,
  }
}

/** Returns a negative number when `a` ranks ahead of `b`. */
export function compareBattleScores(a: BattleScore, b: BattleScore): number {
  if (a.completed_rounds !== b.completed_rounds) return b.completed_rounds - a.completed_rounds
  if (a.completed_reps !== b.completed_reps) return b.completed_reps - a.completed_reps
  if (a.completed_time_seconds !== b.completed_time_seconds) {
    return b.completed_time_seconds - a.completed_time_seconds
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

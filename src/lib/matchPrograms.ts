/**
 * Pure functions for matching a user's onboarding signals to the program
 * catalog. Returns a primary match (Level × Goal) and an optional
 * secondary skill-track match. Also returns soft penalties per program.
 *
 * Spec: docs/superpowers/specs/2026-04-18-programs-catalog-personas-design.md
 */

import type { ProgramMeta, ProgramGoalType } from '../types'
import { FOCUS_AREA_IDS } from '../components/onboarding/StepTraining'

export const LEVEL_TO_DIFFICULTY: Record<string, string> = {
  principiante: 'beginner',
  intermedio:   'intermediate',
  avanzado:     'advanced',
}

/** Focus areas that correspond to skill-track programs. */
const SKILL_FOCUS_AREAS = ['pull_up', 'handstand', 'planche', 'muscle_up'] as const
type SkillFocus = typeof SKILL_FOCUS_AREAS[number]

export type MatchPenalty = 'high_frequency' | 'equipment_missing' | 'health_flag'

export interface MatchUserInput {
  level?: string
  weight?: number
  goal_weight?: number
  focus_areas?: string[]
  training_days?: string[]
  injuries?: string[]
  medical_conditions?: string[]
  /** Future field — user's available equipment. Unused today, reserved for Phase-2. */
  equipment?: string[]
}

export interface MatchResult {
  primary: ProgramMeta | null
  secondary: ProgramMeta | null
  penalties: Map<string, MatchPenalty[]>
}

export function inferGoalType(
  weight: number | undefined,
  goalWeight: number | undefined,
): ProgramGoalType {
  if (typeof weight !== 'number' || typeof goalWeight !== 'number') return 'maintain'
  const delta = goalWeight - weight
  if (delta > 2) return 'muscle_gain'
  if (delta < -2) return 'fat_loss'
  return 'maintain'
}

function computePenalties(
  program: ProgramMeta,
  user: MatchUserInput,
): MatchPenalty[] {
  const penalties: MatchPenalty[] = []
  const userDays = user.training_days?.length ?? 0
  if (typeof program.days_per_week === 'number' && program.days_per_week > userDays) {
    penalties.push('high_frequency')
  }
  if (program.equipment_required?.length) {
    const have = new Set(user.equipment ?? [])
    const missing = program.equipment_required.some(e => !have.has(e))
    if (missing && (user.equipment?.length ?? 0) > 0) {
      // Only flag equipment when the user has told us what they own.
      penalties.push('equipment_missing')
    }
  }
  if (program.contraindications?.length) {
    const userHealth = new Set<string>([
      ...(user.injuries ?? []),
      ...(user.medical_conditions ?? []),
    ])
    if (program.contraindications.some(c => userHealth.has(c))) {
      penalties.push('health_flag')
    }
  }
  return penalties
}

export function matchUserToPrograms(
  user: MatchUserInput,
  programs: ProgramMeta[],
): MatchResult {
  const penalties = new Map<string, MatchPenalty[]>()
  for (const p of programs) {
    const pen = computePenalties(p, user)
    if (pen.length) penalties.set(p.id, pen)
  }

  const userDifficulty = user.level ? LEVEL_TO_DIFFICULTY[user.level] : undefined
  if (!userDifficulty) {
    return { primary: null, secondary: null, penalties }
  }

  const goalType = inferGoalType(user.weight, user.goal_weight)

  const primary = programs.find(p =>
    p.difficulty === userDifficulty && p.goal_type === goalType
  ) ?? null

  // Secondary: iterate FOCUS_AREA_IDS in order; pick the first focus the user
  // selected that has a skill-track program. The skill program's own level
  // doesn't need to match the user's — skill tracks are self-progressing.
  let secondary: ProgramMeta | null = null
  const userFocus = new Set(user.focus_areas ?? [])
  for (const focus of FOCUS_AREA_IDS) {
    if (!userFocus.has(focus)) continue
    if (!SKILL_FOCUS_AREAS.includes(focus as SkillFocus)) continue
    const found = programs.find(p => p.goal_type === 'skill' && p.skill === focus)
    if (found && found.id !== primary?.id) {
      secondary = found
      break
    }
  }

  return { primary, secondary, penalties }
}

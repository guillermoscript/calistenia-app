/**
 * Pure functions for matching a user's onboarding signals to the program
 * catalog. Returns a primary match (Level × Goal) and an optional
 * secondary skill-track match. Also returns soft penalties per program.
 *
 * Spec: docs/superpowers/specs/2026-04-18-programs-catalog-personas-design.md
 */

import type { ProgramMeta, ProgramGoalType } from '../types'
import { FOCUS_AREA_IDS } from '../types/onboarding'
import { isPrimaryGoal, primaryGoalToProgramGoalType } from './primaryGoal'

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
  /** Objetivo principal estructurado (issue #226). Manda sobre el delta de peso. */
  primary_goal?: string
  /**
   * Sexo del paso de datos básicos (#717). `'female'` prefiere la variante
   * «Mujer ·» de su celda nivel × objetivo; cualquier otro valor, o ninguno,
   * prefiere el genérico. No vive en `users` (PII, #676): el onboarding lo
   * pasa desde el estado del formulario.
   */
  sex?: string
}

export interface MatchResult {
  primary: ProgramMeta | null
  secondary: ProgramMeta | null
  penalties: Map<string, MatchPenalty[]>
}

export function inferGoalType(
  weight: number | undefined,
  goalWeight: number | undefined,
  primaryGoal?: string,
): ProgramGoalType {
  // El objetivo explícito del usuario manda; el delta de peso es solo fallback.
  if (isPrimaryGoal(primaryGoal)) return primaryGoalToProgramGoalType(primaryGoal)
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

/** 1 si el programa es para el público que el usuario declaró; 0 si no. */
function sexAffinity(program: ProgramMeta, sex: string | undefined): number {
  const wantsWomen = sex === 'female'
  return (program.for_women ?? false) === wantsWomen ? 1 : 0
}

/** `sort_order` explícito (>0) del catálogo; sin él, al final. */
function catalogOrder(program: ProgramMeta): number {
  return typeof program.sort_order === 'number' && program.sort_order > 0
    ? program.sort_order
    : Number.MAX_SAFE_INTEGER
}

/**
 * Orden total de los candidatos de una celda (#717): oficial > afinidad de
 * sexo > destacado > `sort_order` del catálogo > nombre > id. Antes se cogía
 * el primero de la lista tal como llegaba (ordenada por el JSON del nombre en
 * PocketBase), así que «Mujer · …» nunca ganaba a su genérico y un renombre
 * cambiaba la recomendación. Devuelve una copia: no toca la lista de entrada.
 */
export function rankCandidates(candidates: ProgramMeta[], user: MatchUserInput): ProgramMeta[] {
  return [...candidates].sort((a, b) =>
    Number(b.is_official ?? false) - Number(a.is_official ?? false) ||
    sexAffinity(b, user.sex) - sexAffinity(a, user.sex) ||
    Number(b.is_featured ?? false) - Number(a.is_featured ?? false) ||
    catalogOrder(a) - catalogOrder(b) ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id),
  )
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

  const goalType = inferGoalType(user.weight, user.goal_weight, user.primary_goal)

  const primary = rankCandidates(
    programs.filter(p => p.difficulty === userDifficulty && p.goal_type === goalType),
    user,
  )[0] ?? null

  // Secondary: iterate FOCUS_AREA_IDS in order; pick the first focus the user
  // selected that has a skill-track program. The skill program's own level
  // doesn't need to match the user's — skill tracks are self-progressing.
  let secondary: ProgramMeta | null = null
  const userFocus = new Set(user.focus_areas ?? [])
  for (const focus of FOCUS_AREA_IDS) {
    if (!userFocus.has(focus)) continue
    if (!SKILL_FOCUS_AREAS.includes(focus as SkillFocus)) continue
    const found = rankCandidates(programs.filter(p => p.goal_type === 'skill' && p.skill === focus), user)[0]
    if (found && found.id !== primary?.id) {
      secondary = found
      break
    }
  }

  // Objetivo "habilidades" sin focus areas de skill: aún así merece un skill
  // track de secundario; preferimos el que coincida con la dificultad del user.
  if (!secondary && user.primary_goal === 'habilidades') {
    const skills = programs.filter(p => p.goal_type === 'skill' && p.id !== primary?.id)
    secondary =
      rankCandidates(skills.filter(p => p.difficulty === userDifficulty), user)[0] ??
      rankCandidates(skills, user)[0] ??
      null
  }

  return { primary, secondary, penalties }
}

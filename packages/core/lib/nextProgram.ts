/**
 * Qué programa recomendar a continuación (#933, épica #932).
 *
 * Lo usan la tarjeta «programa terminado» y la de «sin programa» del inicio, en
 * web y en móvil. Antes cada plataforma tenía lo suyo: la web ordenaba solo por
 * nivel (y podía recomendar uno del mismo nivel o más fácil) y el móvil no
 * recomendaba nada.
 *
 * Con programa terminado, el orden es:
 *   1. Su ruta `next_programs` (#935), en el orden declarado.
 *   2. El resto, por cercanía al terminado: mismo objetivo un nivel más arriba,
 *      mismo objetivo mismo nivel, otro objetivo un nivel más arriba, otro
 *      objetivo mismo nivel, dos niveles más arriba, sin dificultad declarada y,
 *      al final, los MÁS FÁCILES. Dentro de cada grupo van antes los oficiales y
 *      los de la misma variante («Mujer ·» o no) que el terminado.
 *
 * Sin programa terminado se mantiene el criterio de siempre: los del nivel del
 * usuario primero y luego el resto, en el orden en que llegan.
 *
 * Nunca devuelve el programa terminado ni los de `excludeIds`. El orden es
 * estable: a igualdad de criterio manda el orden de entrada (el catálogo llega
 * ordenado por nombre).
 */

import type { ProgramMeta } from '../types'
import { normalizeFirstWorkoutLevel } from './first-workout'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from './analytics'

const DIFFICULTY_RANK: Record<string, number> = {
  beginner: 0, principiante: 0,
  intermediate: 1, intermedio: 1,
  advanced: 2, avanzado: 2,
}

const LEVEL_RANK: Record<string, number> = { principiante: 0, intermedio: 1, avanzado: 2 }

function difficultyRank(p: Pick<ProgramMeta, 'difficulty'>): number | null {
  if (!p.difficulty) return null
  const r = DIFFICULTY_RANK[String(p.difficulty).toLowerCase()]
  return r === undefined ? null : r
}

/** Grupo de cercanía al programa terminado; menor = mejor. */
function closeness(candidate: ProgramMeta, completed: ProgramMeta): number {
  const from = difficultyRank(completed)
  const to = difficultyRank(candidate)
  if (from === null || to === null) return 5
  const d = to - from
  const sameGoal = !!completed.goal_type && candidate.goal_type === completed.goal_type
  if (d < 0) return 6
  if (d === 1) return sameGoal ? 0 : 2
  if (d === 0) return sameGoal ? 1 : 3
  return 4
}

export interface RecommendNextOptions {
  /** El programa que se acaba de terminar, o `null` si no hay programa. */
  completed?: ProgramMeta | null
  /** `users.level` tal cual (principiante/intermedio/avanzado o vacío). */
  level?: string | null
  /** Ids que no deben salir (p. ej. programas ya terminados antes). */
  excludeIds?: readonly string[]
}

export function recommendNextPrograms(
  programs: readonly ProgramMeta[] | null | undefined,
  { completed = null, level = null, excludeIds = [] }: RecommendNextOptions = {},
): ProgramMeta[] {
  const excluded = new Set(excludeIds)
  if (completed) excluded.add(completed.id)
  const list = (programs ?? []).filter(p => !excluded.has(p.id))

  if (!completed) {
    const wanted = LEVEL_RANK[normalizeFirstWorkoutLevel(level)]
    const matches = list.filter(p => difficultyRank(p) === wanted)
    return [...matches, ...list.filter(p => !matches.includes(p))]
  }

  // 1 ── La ruta declarada. Por slug: solo los oficiales lo llevan, y entre
  //      ellos es único (lo garantiza la resiembra de #712).
  const route: ProgramMeta[] = []
  for (const slug of completed.next_programs ?? []) {
    const hit = list.find(p => p.slug === slug && p.is_official && !route.includes(p))
    if (hit) route.push(hit)
  }

  // 2 ── El resto por cercanía. `map` + índice para un orden estable explícito.
  const rest = list
    .filter(p => !route.includes(p))
    .map((p, i) => ({
      p,
      i,
      group: closeness(p, completed),
      official: p.is_official ? 0 : 1,
      variant: !!p.for_women === !!completed.for_women ? 0 : 1,
    }))
    .sort((a, b) => a.group - b.group || a.official - b.official || a.variant - b.variant || a.i - b.i)
    .map(x => x.p)

  return [...route, ...rest]
}

/** Qué salida eligió en la tarjeta de programa terminado (#934). */
export type ProgramNextChoice = 'recommended' | 'recommended_detail' | 'other' | 'summary' | 'extend' | 'repeat'

/** Desde dónde se eligió: la tarjeta del inicio o la pantalla de cierre (#941). */
export type ProgramNextSource = 'program_complete' | 'program_recap'

/**
 * `program_next_chosen`: lo emiten las tarjetas de programa terminado de web y
 * móvil. `to_program_id` solo en las salidas que apuntan a un programa concreto.
 */
export function trackProgramNextChosen(
  choice: ProgramNextChoice,
  fromProgramId: string | null | undefined,
  toProgramId?: string | null,
  source: ProgramNextSource = 'program_complete',
): void {
  trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.programNextChosen, {
    surface: 'home',
    source,
    action: choice,
    from_program_id: fromProgramId ?? undefined,
    to_program_id: toProgramId ?? undefined,
  })
}

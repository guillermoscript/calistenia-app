/**
 * Lógica pura de «Crear batalla» (#882), sin React: lo que sale de un ejercicio del
 * selector, la configuración de una batalla propia y los avisos de la conversión de un
 * día de programa. Los params de la URL son los mismos que en móvil.
 */
import { BATTLE_CUSTOM_TEMPLATE_ID } from '@calistenia/core/data/battle-presets'
import { BATTLE_LIMITS } from '@calistenia/core/lib/battle'
import { parseRestSeconds, type BattleDayNote } from '@calistenia/core/lib/battle-from-program-day'
import type { EditorExercise } from '@calistenia/core/hooks/useProgramEditor'
import type { BattleConfiguration } from '@calistenia/core/types/battle'

/** Lo que una batalla propia lleva por ejercicio mientras se edita. */
export interface CustomItem {
  exerciseId: string
  name: string
  kind: 'reps' | 'seconds'
  value: number
  rest: number
}

export const CUSTOM_DEFAULT_REST = 30
export const CUSTOM_MAX_REST = 120

export type BattleOrigin = 'program_day' | 'custom' | 'preset'
export const BATTLE_ORIGINS: readonly BattleOrigin[] = ['program_day', 'custom', 'preset']

/** `?origin=` desconocido o ausente = formatos rápidos, como en móvil. */
export function parseOrigin(value: string | null | undefined): BattleOrigin {
  return (BATTLE_ORIGINS as readonly string[]).includes(value ?? '') ? (value as BattleOrigin) : 'preset'
}

/** `?phase=` positivo, o `null` para usar la fase actual. */
export function parsePhase(value: string | null | undefined): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function customItemFrom(ex: EditorExercise): CustomItem {
  const isTimer = !!ex.isTimer
  const reps = parseInt(ex.reps, 10)
  return {
    exerciseId: ex.exerciseId,
    name: ex.name,
    kind: isTimer ? 'seconds' : 'reps',
    value: isTimer
      ? Math.min(ex.timerSeconds > 0 ? Math.round(ex.timerSeconds) : 30, BATTLE_LIMITS.maxSeconds)
      : Math.min(reps > 0 ? reps : 10, BATTLE_LIMITS.maxReps),
    rest: Math.min(parseRestSeconds(ex.rest) || CUSTOM_DEFAULT_REST, CUSTOM_MAX_REST),
  }
}

/** Añade un ejercicio respetando el tope y los duplicados (la batalla no admite ids repetidos). */
export function addCustomItem(items: CustomItem[], ex: EditorExercise): CustomItem[] {
  if (items.length >= BATTLE_LIMITS.maxExercises || items.some(p => p.exerciseId === ex.exerciseId)) return items
  return [...items, customItemFrom(ex)]
}

export function customBattleConfig(items: CustomItem[], rounds: number, title: string): BattleConfiguration | null {
  if (items.length === 0) return null
  const trimmed = title.trim()
  return {
    workout_template_id: BATTLE_CUSTOM_TEMPLATE_ID,
    source: 'custom',
    rounds,
    scoring_mode: 'rounds_then_reps_then_time',
    ...(trimmed ? { title: trimmed } : {}),
    exercises: items.map((it, position) => ({
      exercise_id: it.exerciseId,
      position,
      target: { kind: it.kind, value: it.value },
      rest_seconds: it.rest,
    })),
  }
}

/** Clave i18n del aviso de conversión, o `null` si no hay que decir nada. */
export function noteKey(note: BattleDayNote): string | null {
  switch (note.code) {
    case 'rounds_flattened': return 'battle.note.roundsFlattened'
    case 'non_numeric_sets': return 'battle.note.nonNumericSets'
    case 'truncated': return 'battle.note.truncated'
    case 'duplicates_removed': return 'battle.note.duplicatesRemoved'
    case 'rest_capped': return 'battle.note.restCapped'
    case 'targets_capped': return 'battle.note.targetsCapped'
    case 'targets_defaulted': return 'battle.note.targetsDefaulted'
    // Lo ha elegido el propio creador: no hace falta avisarle.
    case 'rounds_overridden': return null
  }
}

export function noteParams(note: BattleDayNote): Record<string, unknown> {
  switch (note.code) {
    case 'rounds_flattened': return { min: note.min, max: note.max }
    case 'truncated': return { dropped: note.dropped, max: note.max }
    default: return {}
  }
}

/** Enlace de «Retar» desde un día de programa (mismos params que `train.tsx` en móvil). */
export function battleChallengeHref(phase: number, dayId: string): string {
  return `/battle-create?origin=program_day&phase=${phase}&day=${encodeURIComponent(dayId)}`
}

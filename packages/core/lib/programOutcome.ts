/**
 * ¿«Completado» o «finalizado»? (#938, épica #932)
 *
 * Un programa termina por CALENDARIO: al pasar su última semana. Hasta #938 eso
 * bastaba para decir «completado», así que quien hizo 3 de 48 entrenos recibía
 * la misma celebración que quien los hizo todos. Ahora:
 *
 * - adherencia ≥ 70 % → `completed`: celebración.
 * - adherencia < 70 % → `finished`: tono amable y, UNA vez por inscripción, la
 *   opción de extender el programa para ponerse al día.
 *
 * Decisión de producto anotada en #938. El umbral es una constante para poder
 * ajustarlo cuando haya datos reales de `program_completed.adherence_pct`.
 */

import { daysPastProgramEnd, programAdherencePct, type ProgramProgress } from './programProgress'

/** % de entrenos hechos a partir del cual un programa cuenta como completado. */
export const COMPLETION_ADHERENCE_THRESHOLD = 70

/** Semanas que se dan, como mínimo desde hoy, al extender un programa. */
export const EXTENSION_WEEKS = 2

export type ProgramOutcome = 'completed' | 'finished'

/**
 * Resultado de un programa por su adherencia. Sin nada que medir (programa sin
 * días entrenables o sin duración) cuenta como completado: no hay vara con la
 * que decir que no se hizo.
 */
export function programOutcome(
  p: Pick<ProgramProgress, 'programSessionsDone' | 'programSessionsPlanned'>,
): ProgramOutcome {
  const pct = programAdherencePct(p)
  return pct === null || pct >= COMPLETION_ADHERENCE_THRESHOLD ? 'completed' : 'finished'
}

/**
 * ¿Se le ofrece extender? Solo con el programa ya terminado, «finalizado» (no
 * completado), con duración declarada y si la inscripción no se extendió antes:
 * una sola extensión por inscripción.
 */
export function canExtendProgram(
  p: Pick<ProgramProgress, 'isCompleted' | 'baseWeeks' | 'programSessionsDone' | 'programSessionsPlanned'>,
  extendedWeeks: number | null | undefined,
): boolean {
  if (!p.isCompleted || p.baseWeeks <= 0) return false
  if ((extendedWeeks ?? 0) > 0) return false
  return programOutcome(p) === 'finished'
}

/**
 * Cuántas semanas guardar en `user_programs.extended_weeks` para que, desde
 * HOY, queden al menos `EXTENSION_WEEKS` semanas. El calendario se construye en
 * semanas enteras desde `started_at`, así que quien vuelve 5 semanas tarde
 * necesita 5 + 2: si solo se sumaran 2, la extensión ya habría caducado.
 * Las semanas «de hueco» no suben lo pedido (ver `programSessionsPlanned`).
 */
export function extensionWeeksFor(endDay: string | null, today: string): number {
  const late = daysPastProgramEnd(endDay, today)
  return Math.ceil(late / 7) + EXTENSION_WEEKS
}

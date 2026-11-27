/**
 * Vueltas de un programa: «Repetir con más carga» (#939, épica #932).
 *
 * Repetir un programa que funciona es el patrón más estándar del sector, pero
 * repetirlo con las cargas de la semana 1 es retroceder. En la vuelta N (≥ 2)
 * cada ejercicio arranca desde más arriba:
 *
 * - **Con rampa semanal (#755):** la rampa sigue por donde acabó. La semana de
 *   la fase se desplaza `(N - 1) × semanas de la fase`, así que la semana 1 de
 *   la vuelta 2 es la que habría venido DESPUÉS de la última de la vuelta 1. Una
 *   rampa lineal sigue sumando (con su `max`); una explícita (`values`) se queda
 *   en su último valor, que es lo que el autor declaró como techo.
 * - **Sin rampa:** un escalón fijo por vuelta: +1 repetición (y +1 a los dos
 *   extremos de un rango) o +5 s en lo que es tiempo. Las series no se tocan,
 *   ni el calentamiento ni la vuelta a la calma.
 *
 * Se basa en lo PRESCRITO, no en lo hecho (`sets_log`): es determinista y no
 * castiga a quien no registró series (decisión anotada en #939).
 *
 * Tope: hasta la vuelta `MAX_PROGRAM_CYCLE`. Pasada esa, la tarjeta deja de
 * ofrecer repetir y propone otro programa.
 */

import { parsePhaseWeeks } from './programProgress'
import { applyWeeklyProgression, progressionList, shiftDurationReps, shiftReps } from './weeklyProgression'
import type { Phase, Workout } from '../types'

/** Última vuelta a la que se puede llegar repitiendo. */
export const MAX_PROGRAM_CYCLE = 3

/** Segundos que sube por vuelta un ejercicio de tiempo sin rampa. */
export const CYCLE_SECONDS_STEP = 5

/** `user_programs.cycle` → vuelta real (0, vacío o basura = 1). */
export function normalizeCycle(raw: number | null | undefined): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
}

/** ¿Se puede repetir desde esta vuelta? */
export function canRepeatProgram(cycle: number | null | undefined): boolean {
  return normalizeCycle(cycle) < MAX_PROGRAM_CYCLE
}

/** Semanas de una fase según su rango («5-8» → 4); `null` si no se puede leer. */
export function phaseLength(phases: readonly Phase[], phaseNumber: number): number | null {
  const phase = phases.find(p => p.id === phaseNumber)
  const range = phase ? parsePhaseWeeks(phase.weeks) : null
  return range ? range.to - range.from + 1 : null
}

/**
 * Escalón fijo para los ejercicios SIN rampa. Devuelve el mismo `Workout` si no
 * cambia nada (vuelta 1 o nada que subir): la identidad importa, ver
 * `applyWeeklyProgression`.
 */
export function applyCycleStep(workout: Workout, cycle: number): Workout {
  const steps = normalizeCycle(cycle) - 1
  if (steps <= 0) return workout
  let changed = false
  const exercises = workout.exercises.map(ex => {
    if (progressionList(ex.weeklyProgression).length > 0) return ex
    // Calentamiento y vuelta a la calma no suben: no son la carga del día.
    if (ex.section && ex.section !== 'main') return ex
    // `timerSeconds: 0` es «sin temporizador» (filas sembradas con 0), no un
    // ejercicio de tiempo: sumarle 5 dejaba las reps sin subir (QA #939).
    if (typeof ex.timerSeconds === 'number' && Number.isFinite(ex.timerSeconds) && ex.timerSeconds > 0) {
      const delta = CYCLE_SECONDS_STEP * steps
      const reps = shiftDurationReps(ex.reps, delta)
      changed = true
      return { ...ex, timerSeconds: ex.timerSeconds + delta, ...(reps !== null ? { reps } : {}) }
    }
    const duration = shiftDurationReps(ex.reps, CYCLE_SECONDS_STEP * steps)
    if (duration !== null) {
      changed = true
      return { ...ex, reps: duration }
    }
    const reps = shiftReps(ex.reps, steps)
    if (reps !== null) {
      changed = true
      return { ...ex, reps }
    }
    return ex
  })
  return changed ? { ...workout, exercises } : workout
}

/**
 * La rampa semanal con el desplazamiento de la vuelta, y el escalón fijo para
 * lo que no tiene rampa. Es la pieza que `useWeekAwareGetWorkout` aplica ANTES
 * de la descarga, como hasta ahora la rampa sola.
 */
export function applyCycleProgression(
  workout: Workout,
  phases: readonly Phase[],
  phaseNumber: number,
  weekInPhase: number | null,
  isDeload: boolean,
  cycle: number,
): Workout {
  const steps = normalizeCycle(cycle) - 1
  const length = phaseLength(phases, phaseNumber)
  const shifted = weekInPhase !== null && steps > 0 && length !== null
    ? weekInPhase + steps * length
    : weekInPhase
  return applyCycleStep(applyWeeklyProgression(workout, shifted, isDeload), cycle)
}

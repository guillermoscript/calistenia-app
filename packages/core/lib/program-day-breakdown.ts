/**
 * Un día de programa con la forma del detalle de sesión, para verlo en la
 * misma pantalla que una sesión propia o la de un amigo (`SessionDetailBody`).
 *
 * La ficha de móvil solo enseñaba el nombre y el foco de cada día; para saber
 * qué tocaba había que arrancar la sesión. En vez de otra vista, la pauta del
 * programa se traduce a «series» de la sesión: cada serie planificada es una
 * fila con sus repeticiones objetivo.
 */

import { localize } from './i18n-db'
import type { SessionExercise, SessionSet } from '../hooks/useSessionDetail'
import type { CircuitDefinition, Exercise, Phase } from '../types'

export type ExerciseSection = NonNullable<Exercise['section']>

/** Orden en que se hacen las secciones dentro de una sesión. */
const SECTION_ORDER: readonly ExerciseSection[] = ['warmup', 'main', 'cooldown']

function plannedSets(count: number, reps: string): SessionSet[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => ({ setNumber: i + 1, reps, loggedAt: 0 }))
}

/**
 * Ejercicios de un día → `SessionExercise[]`, ordenados calentamiento →
 * principal → vuelta a la calma y respetando el orden dentro de cada sección.
 * Un ejercicio sin `section` es del bloque principal, como en `buildSteps`.
 *
 * `reps` gana al `timerSeconds` aunque sea de tiempo: «30-45 seg» dice más que
 * los segundos deducidos de ese texto (#690).
 */
export function programDayToSessionExercises(exercises: readonly Exercise[]): SessionExercise[] {
  const sectionOf = (ex: Exercise): ExerciseSection =>
    ex.section && SECTION_ORDER.includes(ex.section) ? ex.section : 'main'
  const ordered = [...exercises].sort(
    (a, b) => SECTION_ORDER.indexOf(sectionOf(a)) - SECTION_ORDER.indexOf(sectionOf(b)),
  )
  return ordered.map(ex => {
    const reps = (ex.reps ?? '').trim() || (ex.isTimer && ex.timerSeconds ? `${ex.timerSeconds}s` : '—')
    // «múltiples», «intentos»…: sin número no hay filas que contar, va una.
    const count = typeof ex.sets === 'number' ? ex.sets : 1
    return {
      exerciseId: ex.id,
      name: ex.name,
      muscles: ex.muscles,
      sets: plannedSets(count, typeof ex.sets === 'number' ? reps : `${ex.sets} × ${reps}`),
      bestSet: null,
      hasWeight: false,
      hasRpe: false,
      hasNotes: false,
      section: sectionOf(ex),
      restSeconds: ex.rest > 0 ? ex.rest : undefined,
      note: ex.note || undefined,
    }
  })
}

/** Circuito → `SessionExercise[]`: cada ronda es una «serie» del ejercicio. */
export function circuitToSessionExercises(circuit: CircuitDefinition, locale: string): SessionExercise[] {
  return circuit.exercises.map(ce => {
    const workSeconds = ce.workSecondsOverride ?? circuit.workSeconds
    const reps = ce.reps || (workSeconds ? `${workSeconds}s` : '—')
    return {
      exerciseId: ce.exerciseId,
      name: localize(ce.name, locale),
      muscles: '',
      sets: plannedSets(circuit.rounds, reps),
      bestSet: null,
      hasWeight: false,
      hasRpe: false,
      hasNotes: false,
    }
  })
}

/**
 * Fase que la ficha enseña al abrirse: la fase en curso si el programa es el
 * activo y existe, y si no la primera. Nunca devuelve una fase que el programa
 * no tenga, porque la clave `p{fase}_{día}` quedaría vacía.
 */
export function defaultBreakdownPhase(phases: readonly Pick<Phase, 'id'>[], currentPhase?: number | null): number {
  if (currentPhase && phases.some(p => p.id === currentPhase)) return currentPhase
  return phases.length > 0 ? Math.min(...phases.map(p => p.id)) : 1
}

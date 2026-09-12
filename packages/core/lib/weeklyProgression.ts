/**
 * Progresión semanal DENTRO de una fase (#755).
 *
 * El contenido de los programas ya sabía progresar semana a semana; el motor
 * no. Una fila de `program_exercises` es fija por fase, así que la única forma
 * de escribir «suma 5 s cada semana» era la prosa de la `note`, y la pantalla
 * acabó contradiciendo al texto: en la semana 3 la nota pedía 30 s de colgado y
 * el cronómetro arrancaba en 20, que es lo prescrito y no lo que toca.
 *
 * Esto es la otra mitad: una fila puede declarar CÓMO cambia dentro de su fase
 * y aquí se aplica. Función pura sobre un `Workout` ya construido, hermana de
 * `deload.ts` y `programOverrides.ts`: sin React, sin PocketBase, sin catálogo.
 * Quién sabe en qué semana de la fase estamos es `weekInPhase`
 * (`programProgress.ts`); aquí solo se aplica.
 *
 * Orden de las transformaciones (en `useWeekAwareGetWorkout`):
 *
 *     construir el Workout → applyWeeklyProgression → applyDeload
 *
 * Primero la rampa y después la descarga a propósito: la descarga parte las
 * series de LO QUE TOCA esa semana, no de lo que tocaba la primera.
 *
 * Retrocompatible por construcción: un ejercicio sin `weeklyProgression` se
 * devuelve por IDENTIDAD, igual que en `applyDeload`. No es cosmética —
 * `WorkoutPage` llama a `getWorkout` en cada render y varios efectos dependen
 * de la identidad del `Workout`; devolver objetos nuevos los dispararía en
 * bucle.
 */

import { PROGRESSION_FIELDS } from '../types'
import type {
  Exercise,
  ProgressionField,
  WeeklyProgression,
  WeeklyProgressionSpec,
  Workout,
} from '../types'

/**
 * Las dos formas de una rampa, excluyentes (ver `WeeklyProgression` en
 * `../types`):
 *
 * - **Lineal** (`step`): el valor de la primera semana más `step` por cada
 *   semana transcurrida, acotado por `min`/`max`. Cubre «suma 5 s cada semana».
 * - **Explícita** (`values`): un valor por semana, índice 0 = primera semana de
 *   la fase. Cubre los saltos que no son lineales y, sobre todo, la vuelta
 *   atrás de la semana de descarga: `[20, 25, 30, 20]`.
 *
 * Fuera de rango se usa el último valor declarado: una fase con más semanas que
 * valores se queda en el techo de la rampa, que es lo que dice cualquier nota
 * («…y de ahí en adelante mantén»). `min`/`max` solo acotan la forma lineal:
 * en la explícita el autor ya ha escrito el valor exacto.
 */

/**
 * `reps` que es una duración y solo una duración, con los mismos límites que
 * `PURE_DURATION_RE` en `exercise-timer-inference.ts`.
 *
 * Se duplica el patrón en vez de importarlo porque aquí se necesita CAPTURANDO
 * los trozos para reescribirlos, no solo para decidir si casa. Cualquier cambio
 * en uno tiene que ir al otro; el test lo fija con los mismos ejemplos.
 */
const DURATION_RE =
  /^(\d+)(\s*[-–]\s*)?(\d+)?(\s*)(s|seg|segs|sec|secs|segundos|min|mins|minutos)\b(.*)$/i

/** `reps` numérico puro: «6». */
const REPS_NUMBER_RE = /^(\d+)$/

/** `reps` que es un rango: «8-12». El mismo dialecto que asume `quickReps`. */
const REPS_RANGE_RE = /^(\d+)\s*-\s*(\d+)$/

/** Normaliza la declaración a lista. Una sola rampa es el caso común. */
export function progressionList(spec: WeeklyProgressionSpec | undefined): readonly WeeklyProgression[] {
  if (!spec) return []
  return Array.isArray(spec) ? spec : [spec as WeeklyProgression]
}

/**
 * `program_exercises.weekly_progression` crudo → la declaración tipada, o
 * `undefined` si la fila no trae nada utilizable.
 *
 * Lo que llega de PocketBase no está garantizado: un campo `json` puede venir
 * como lista, como objeto suelto, como la cadena JSON sin parsear (según por
 * dónde se haya leído la fila) o como `""` en las filas anteriores a #755. Se
 * valida la forma mínima —un `field` conocido y `step` o `values`— y lo que no
 * encaja se descarta EN SILENCIO: el escritor ya revienta en
 * `normalizeWeeklyProgression` (`scripts/lib/program-exercise-fields.mjs`), y
 * aquí, en tiempo de lectura, tirar la sesión entera por una rampa mal formada
 * sería mucho peor que enseñar la dosis de la primera semana.
 */
export function parseWeeklyProgression(raw: unknown): WeeklyProgressionSpec | undefined {
  let value = raw
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return undefined
    try {
      value = JSON.parse(trimmed)
    } catch {
      return undefined
    }
  }
  if (!value || typeof value !== 'object') return undefined

  const list = (Array.isArray(value) ? value : [value]).filter(isWeeklyProgression)
  return list.length > 0 ? list : undefined
}

function isWeeklyProgression(entry: unknown): entry is WeeklyProgression {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
  const e = entry as Record<string, unknown>
  if (!PROGRESSION_FIELDS.includes(e.field as ProgressionField)) return false
  const hasStep = typeof e.step === 'number' && Number.isFinite(e.step) && e.step !== 0
  const hasValues = Array.isArray(e.values) && e.values.length > 0
  return hasStep || hasValues
}

function clamp(n: number, min: number | undefined, max: number | undefined): number {
  let out = n
  if (typeof min === 'number' && Number.isFinite(min)) out = Math.max(out, min)
  if (typeof max === 'number' && Number.isFinite(max)) out = Math.min(out, max)
  return out
}

/**
 * ¿Qué semana de la rampa se usa de verdad?
 *
 * En la semana de descarga (#716) la rampa VUELVE al valor de la primera
 * semana: es lo que dicen hoy las notas («y la semana 4 vuelve a 20») y lo que
 * significa descargar. La excepción es una rampa `values` que declare
 * explícitamente un valor para esa semana: si el autor escribió
 * `[4, 5, 6, 4]`, la vuelta atrás ya está en el dato y mandar el índice a 0
 * sería pisarle la decisión. Una rampa `[20, 25, 30]` en una fase de cuatro
 * semanas con descarga, en cambio, sí se reinicia, en vez de quedarse clavada
 * en 30 justo la semana que toca aflojar.
 */
export function effectiveWeek(
  prog: WeeklyProgression,
  weekInPhase: number,
  isDeload: boolean,
): number {
  if (!isDeload) return weekInPhase
  const declared = prog.values && prog.values.length >= weekInPhase
  return declared ? weekInPhase : 1
}

/**
 * Desplaza los números de un `reps` que es una duración pura («20 s» → «30 s»,
 * «30-45 seg» → «40-55 seg»), o `null` si no lo es.
 *
 * Existe para que el BOTÓN RÁPIDO no mienta. `quickReps` registra el `reps`
 * tal cual, así que ramear solo `timerSeconds` arreglaría el cronómetro y
 * dejaría el historial guardando los segundos de la primera semana. El `reps`
 * de un ejercicio por tiempo es el espejo del cronómetro y tiene que moverse
 * con él.
 */
export function shiftDurationReps(reps: string, delta: number): string | null {
  const m = DURATION_RE.exec(String(reps ?? '').trim())
  if (!m) return null
  const [, lowRaw, dash, highRaw, space, unit, tail] = m
  // «20-30s por lado» es una duración con sufijo de lateralidad; «6x10s hold»
  // no casa el ancla inicial y no llega hasta aquí. Un resto con dígitos sí:
  // sería otro número que no sabemos si hay que mover.
  if (tail && /\d/.test(tail)) return null
  const shift = (v: string): string => String(Math.max(0, Number(v) + delta))
  const low = shift(lowRaw)
  const high = highRaw ? shift(highRaw) : ''
  return `${low}${dash ?? ''}${high}${space ?? ''}${unit}${tail ?? ''}`
}

/** `reps` lineal: «6» → «7», «4-6» → «5-7». `null` si el texto no es ninguno. */
export function shiftReps(reps: string, delta: number): string | null {
  const raw = String(reps ?? '').trim()
  const single = REPS_NUMBER_RE.exec(raw)
  if (single) return String(Math.max(0, Number(single[1]) + delta))
  const range = REPS_RANGE_RE.exec(raw)
  if (range) {
    const lo = Math.max(0, Number(range[1]) + delta)
    const hi = Math.max(0, Number(range[2]) + delta)
    return `${lo}-${hi}`
  }
  return null
}

/** El valor explícito de `values` para esa semana; el último si se pasa. */
function valueForWeek(values: readonly (number | string)[], week: number): number | string | undefined {
  if (values.length === 0) return undefined
  const idx = Math.min(Math.max(week, 1), values.length) - 1
  return values[idx]
}

/**
 * Una rampa aplicada a un ejercicio. Devuelve el MISMO objeto si no cambia
 * nada: es lo que mantiene la identidad cuando la rampa está en su semana 1.
 */
export function applyProgressionToExercise(
  exercise: Exercise,
  prog: WeeklyProgression,
  weekInPhase: number,
  isDeload: boolean,
): Exercise {
  const week = effectiveWeek(prog, weekInPhase, isDeload)

  // ── Forma explícita ───────────────────────────────────────────────────────
  if (prog.values && prog.values.length > 0) {
    const raw = valueForWeek(prog.values, week)
    if (raw === undefined) return exercise
    return setField(exercise, prog.field, raw)
  }

  // ── Forma lineal ──────────────────────────────────────────────────────────
  if (typeof prog.step !== 'number' || !Number.isFinite(prog.step)) return exercise
  // La identidad de la primera semana no necesita atajo: `setField` devuelve el
  // mismo objeto cuando el valor no cambia, y con `weeksElapsed` a 0 no cambia.
  const weeksElapsed = Math.max(week, 1) - 1
  const delta = prog.step * weeksElapsed

  switch (prog.field) {
    case 'timerSeconds': {
      const base = exercise.timerSeconds
      if (typeof base !== 'number' || !Number.isFinite(base)) return exercise
      const next = clamp(Math.max(0, base + delta), prog.min, prog.max)
      return setField(exercise, 'timerSeconds', next)
    }
    case 'rest': {
      const base = exercise.rest
      if (typeof base !== 'number' || !Number.isFinite(base)) return exercise
      return setField(exercise, 'rest', clamp(Math.max(0, base + delta), prog.min, prog.max))
    }
    case 'sets': {
      const base = exercise.sets
      // `sets` en texto («múltiples», «intentos») no tiene número que ramear,
      // igual que en `deloadSets`.
      if (typeof base !== 'number' || !Number.isFinite(base)) return exercise
      return setField(exercise, 'sets', clamp(Math.max(0, base + delta), prog.min, prog.max))
    }
    case 'reps': {
      const shifted = shiftReps(exercise.reps, delta)
      if (shifted === null) return exercise
      return setField(exercise, 'reps', shifted)
    }
    default:
      return exercise
  }
}

/**
 * Escribe el campo y arrastra lo que tenga que arrastrar.
 *
 * El único arrastre es `timerSeconds` → `reps`: ver `shiftDurationReps`.
 */
function setField(exercise: Exercise, field: ProgressionField, value: number | string): Exercise {
  switch (field) {
    case 'timerSeconds': {
      const next = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(next) || next === exercise.timerSeconds) return exercise
      const delta = next - (exercise.timerSeconds ?? 0)
      const reps = typeof exercise.timerSeconds === 'number'
        ? shiftDurationReps(exercise.reps, delta)
        : null
      return reps === null
        ? { ...exercise, timerSeconds: next }
        : { ...exercise, timerSeconds: next, reps }
    }
    case 'rest': {
      const next = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(next) || next === exercise.rest) return exercise
      return { ...exercise, rest: next }
    }
    case 'sets': {
      if (value === exercise.sets) return exercise
      return { ...exercise, sets: value }
    }
    case 'reps': {
      const next = String(value)
      if (next === exercise.reps) return exercise
      return { ...exercise, reps: next }
    }
    default:
      return exercise
  }
}

/**
 * El mismo `Workout` con cada rampa aplicada a la semana `weekInPhase`.
 *
 * `weekInPhase` a `null` (programa sin empezar, ya terminado, o una fase cuyo
 * rango de semanas no se puede leer) devuelve la sesión SIN TOCAR y por
 * identidad: enseñar la primera semana es lo correcto cuando no se sabe en qué
 * semana estamos, y nunca es peor que inventarse una.
 */
export function applyWeeklyProgression(
  workout: Workout,
  weekInPhase: number | null,
  isDeload = false,
): Workout {
  if (weekInPhase === null || !Number.isFinite(weekInPhase)) return workout

  let changed = false
  const exercises = workout.exercises.map(ex => {
    const progs = progressionList(ex.weeklyProgression)
    if (progs.length === 0) return ex
    const next = progs.reduce(
      (acc, prog) => applyProgressionToExercise(acc, prog, weekInPhase, isDeload),
      ex,
    )
    if (next !== ex) changed = true
    return next
  })

  return changed ? { ...workout, exercises } : workout
}

/**
 * autoProgression — «hiciste 3×10 dos sesiones seguidas, hoy 3×11», y cuando
 * ya no hay margen, la siguiente variante de la familia (#617).
 *
 * Función pura sobre filas ya descargadas, igual que `programProgress.ts` o
 * `training-stats.ts`: sin React, sin PocketBase, sin estado de módulo y sin
 * `Date.now()`. El catálogo tampoco se importa — la variante más dura entra
 * por un resolver inyectado (`harderVariant`), así que los tests corren en el
 * entorno node de vitest sin cargar el índice de ejercicios.
 *
 * Decisiones que fija este módulo:
 *
 * - **La unidad se decide UNA sola vez, en el borde.** Los ejercicios de
 *   temporizador guardan SEGUNDOS en la columna `reps` (misma convención que
 *   `training-stats.ts`), así que dentro de la función solo circulan números
 *   con una `unit` pegada, nunca la cadena cruda. La sugerencia devuelta lleva
 *   la unidad dentro para que la UI no pueda pintar «3×31» en una plancha.
 * - **Se exige la dosis COMPLETA, no la mejor serie.** Una sesión cumple si
 *   tiene al menos tantas series al objetivo como series prescritas. Quien
 *   prescribe 3×10 y hace una sola serie de 12 no ha cumplido 3×10, y
 *   `shouldSuggestProgression` (`useProgressions.ts:76`) —que sí se conforma
 *   con una serie— es justo lo que hace que hoy sugiera de más.
 * - **Ante la duda, `null`.** Objetivo no numérico («máximas», «al fallo»),
 *   series no numéricas («múltiples»), historial corto o familia sin variante
 *   más dura devuelven `null`. La UI no pinta chip, que es infinitamente mejor
 *   que pintar una sugerencia imposible de aceptar.
 * - **El tope no es el final del camino, es el disparador del cambio de
 *   variante.** Subir repeticiones indefinidamente en `pushup_knee` no es
 *   progresar: al llegar al tope se propone `pushup_std` y la dosis vuelve a
 *   la base.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Qué mide la columna `reps` de este ejercicio. */
export type ProgressionUnit = 'reps' | 'seconds'

/**
 * Lo prescrito por el programa. Es el subconjunto de `Exercise` que hace falta
 * — deliberadamente estructural, para poder pasar tanto un `Exercise` del
 * programa como una fila del catálogo.
 */
export interface ProgressionExercise {
  id: string
  /** Puede venir como cadena («múltiples»): en ese caso no se sugiere nada. */
  sets: number | string
  /** En temporizador son segundos. Admite rangos («8-12»). */
  reps: string
  isTimer?: boolean
  /** Si está, manda sobre `reps` en los ejercicios de temporizador. */
  timerSeconds?: number
}

/** Una sesión pasada de ESE ejercicio. El orden de entrada da igual. */
export interface ProgressionSession {
  /** `YYYY-MM-DD`. Solo se usa para ordenar de más reciente a más antigua. */
  date: string
  /** Valor de cada serie ejecutada: repeticiones, o SEGUNDOS si es temporizador. */
  values: number[]
}

/** La variante más dura de la misma familia, ya localizada. */
export interface VariantRef {
  id: string
  name: string
}

export interface SuggestProgressionOptions {
  /** Sesiones consecutivas que deben cumplir el objetivo. */
  sessionsAtTarget?: number
  /** Tope de repeticiones; al alcanzarlo se propone variante en vez de más reps. */
  repsCap?: number
  /** Tope de segundos; al alcanzarlo se propone variante. */
  secondsCap?: number
  /** Dosis de estreno al cambiar de variante. */
  variantBaseReps?: number
  variantBaseSeconds?: number
  /**
   * Variante `harder` de la misma `family`, o `null` si no hay.
   * En la app lo cablea `getVariantsByLevel(id).harder[0]`; en los tests es un
   * stub, y por eso este módulo no importa el catálogo.
   */
  harderVariant?: (exerciseId: string) => VariantRef | null
}

interface SuggestionBase {
  unit: ProgressionUnit
  /** Series de la sugerencia. Igual que las prescritas: aquí no se tocan. */
  sets: number
  /** Objetivo actual, en `unit`. */
  from: number
  /** Objetivo propuesto, en `unit`. */
  to: number
}

export type ProgressionSuggestion =
  /** Misma variante, más dosis. */
  | (SuggestionBase & { kind: 'dose' })
  /** Variante más dura; `to` es la dosis de estreno, no la que venía haciendo. */
  | (SuggestionBase & { kind: 'variant'; exerciseId: string; exerciseName: string })

// ─── Constantes ──────────────────────────────────────────────────────────────

/**
 * Dos sesiones, no tres. Tres es lo que pide `exercise_progressions`
 * (`sessions_at_target`), y en un programa de 3 días por semana significan casi
 * dos semanas para subir una repetición: se percibe como que la app no se
 * entera de que estás mejorando.
 */
export const DEFAULT_SESSIONS_AT_TARGET = 2

/** Paso de subida por unidad. En temporizador, 5 s (el issue lo fija así). */
const STEP: Record<ProgressionUnit, number> = { reps: 1, seconds: 5 }

export const DEFAULT_REPS_CAP = 12
export const DEFAULT_SECONDS_CAP = 90
export const DEFAULT_VARIANT_BASE_REPS = 8
export const DEFAULT_VARIANT_BASE_SECONDS = 30

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Series prescritas como número, o `null` si no lo son.
 *
 * `Exercise.sets` admite cadenas («múltiples», «intentos»): esos ejercicios no
 * tienen una dosis que subir, así que la función entera se rinde.
 */
export function parseSets(sets: number | string): number | null {
  const n = typeof sets === 'number' ? sets : Number(String(sets).trim())
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

/**
 * Objetivo numérico de una prescripción de reps, o `null`.
 *
 * En un rango («8-12») el objetivo es el TOPE: es el número que hay que batir
 * para considerar la dosis cumplida, y es el mismo criterio que usa
 * `parseRepsForPR` para los récords. Una prescripción sin dígitos («máximas»,
 * «al fallo») no tiene objetivo que superar.
 */
export function parseTarget(reps: string): number | null {
  const nums = String(reps ?? '').match(/\d+/g)
  if (!nums) return null
  const max = Math.max(...nums.map(Number))
  return max > 0 ? max : null
}

/**
 * Unidad y objetivo actual del ejercicio.
 *
 * En temporizador `timerSeconds` manda sobre el texto: es el número con el que
 * la sesión arranca la cuenta atrás, y por tanto el que el usuario ha estado
 * batiendo de verdad.
 */
export function readTarget(
  exercise: ProgressionExercise,
): { unit: ProgressionUnit; target: number; sets: number } | null {
  const sets = parseSets(exercise.sets)
  if (sets === null) return null

  if (exercise.isTimer) {
    const target = exercise.timerSeconds && exercise.timerSeconds > 0
      ? Math.floor(exercise.timerSeconds)
      : parseTarget(exercise.reps)
    return target === null ? null : { unit: 'seconds', target, sets }
  }

  const target = parseTarget(exercise.reps)
  return target === null ? null : { unit: 'reps', target, sets }
}

// ─── Motor ───────────────────────────────────────────────────────────────────

/** Series de la sesión que alcanzan el objetivo. */
function qualifyingSets(session: ProgressionSession, target: number): number[] {
  return (session.values ?? []).filter(v => Number.isFinite(v) && v >= target)
}

/**
 * ¿Qué proponerle hoy a quien va a hacer este ejercicio?
 *
 * Devuelve `null` siempre que no haya una respuesta segura: es la respuesta
 * correcta la mayoría de las veces, y la UI la trata como «no pintes chip».
 *
 * @param exercise    Lo prescrito por el programa (o por el override vigente).
 * @param sessions    Sesiones pasadas DE ESE ejercicio, en cualquier orden.
 */
export function suggestProgression(
  exercise: ProgressionExercise,
  sessions: ProgressionSession[],
  options: SuggestProgressionOptions = {},
): ProgressionSuggestion | null {
  const {
    sessionsAtTarget = DEFAULT_SESSIONS_AT_TARGET,
    repsCap = DEFAULT_REPS_CAP,
    secondsCap = DEFAULT_SECONDS_CAP,
    variantBaseReps = DEFAULT_VARIANT_BASE_REPS,
    variantBaseSeconds = DEFAULT_VARIANT_BASE_SECONDS,
    harderVariant,
  } = options

  const read = readTarget(exercise)
  if (!read) return null
  const { unit, target, sets } = read

  // Las N más recientes. Se ordena aquí y no se confía en el orden de entrada:
  // el ProgressMap no garantiza ninguno.
  const recent = [...(sessions ?? [])]
    .filter(s => (s?.values?.length ?? 0) > 0)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, sessionsAtTarget)

  if (recent.length < sessionsAtTarget) return null

  // Cumplir es hacer la dosis COMPLETA: tantas series al objetivo como series
  // prescritas. Con menos, no se sube nada.
  const qualifying = recent.map(s => qualifyingSets(s, target))
  if (qualifying.some(q => q.length < sets)) return null

  const step = STEP[unit]
  const cap = unit === 'seconds' ? secondsCap : repsCap

  // ── Tope alcanzado → cambiar de variante ───────────────────────────────────
  if (target >= cap) {
    const next = harderVariant?.(exercise.id) ?? null
    // Sin familia o sin nada más duro: no hay progresión honesta que ofrecer.
    // Antes que inventar una, no se sugiere nada.
    if (!next) return null
    const base = unit === 'seconds' ? variantBaseSeconds : variantBaseReps
    return {
      kind: 'variant',
      unit,
      sets,
      from: target,
      to: base,
      exerciseId: next.id,
      exerciseName: next.name,
    }
  }

  // ── Subir la dosis ─────────────────────────────────────────────────────────
  // Doble paso solo si TODAS las series que contaron se fueron dos pasos por
  // encima del objetivo en las dos sesiones: eso ya no es «cumplió», es que la
  // prescripción se le ha quedado corta.
  const worstQualifying = Math.min(...qualifying.map(q => Math.min(...q)))
  const jump = worstQualifying >= target + step * 2 ? step * 2 : step

  return { kind: 'dose', unit, sets, from: target, to: Math.min(target + jump, cap) }
}

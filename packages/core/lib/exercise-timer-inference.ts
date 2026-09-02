/**
 * exercise-timer-inference — deducir un ejercicio POR TIEMPO cuando la fila no
 * lo dice.
 *
 * (Nombre largo a propósito: `exercise-timer.ts` ya es la máquina de fases del
 * cronómetro y no tiene nada que ver con esto.)
 *
 * Por qué existe (#690): las filas de `program_exercises` sembradas en
 * producción llegaron con `is_timer: false` y `timer_seconds: 0` aunque su
 * `reps` es una duración pura («30-45 seg», «45s», «20-30s por lado»). La
 * sesión pinta el cronómetro sólo cuando `isTimer` es cierto, así que el
 * usuario leía «30-45 seg» y no tenía nada que contara el tiempo. Una migración
 * de datos arregla las filas existentes; esto es el cinturón: cualquier fila
 * futura (una siembra vieja, un programa importado, un editor externo) que
 * vuelva a caer en lo mismo sigue enseñando el cronómetro.
 *
 * La regla es DELIBERADAMENTE estrecha: sólo cuenta un `reps` que sea una
 * duración y NADA MÁS. «6x10s hold» son 6 series de un aguante de 10 s —un
 * cronómetro de pantalla mediría la serie entera y mentiría—; «3-5 (descenso
 * lento 3-4s)» son repeticiones con una nota de tempo. Ante la duda, `null`: no
 * poner cronómetro es siempre menos malo que ponerlo donde estorba.
 *
 * `timerSeconds` es el EXTREMO ALTO del rango («30-45 seg» → 45): el número que
 * se pinta es el objetivo que la persona intenta aguantar, y quedarse corto
 * cortaría la serie antes de tiempo.
 *
 * Es puro y no toca `id` ni `name`: sólo responde por la duración.
 */

/**
 * `reps` que es una duración y sólo una duración.
 *
 * Los anclajes `^`/`$` son el corazón de la regla: cualquier texto extra
 * (series, notas, «AMRAP») deja de casar y el ejercicio se queda como está. El
 * sufijo opcional de lateralidad («por lado», «cada lado», «each side») no
 * cambia lo que dura UNA serie, así que se acepta y se ignora.
 */
const PURE_DURATION_RE =
  /^(\d+)(?:\s*[-–]\s*(\d+))?\s*(s|seg|segs|sec|secs|segundos|min|mins|minutos)\b\s*(?:(?:por|cada|c\/|\/)?\s*lado|each side|per side)?\s*$/i

/** Unidades que van en minutos; el resto se leen como segundos. */
const MINUTE_UNITS = new Set(['min', 'mins', 'minutos'])

export interface InferredTimer {
  isTimer: true
  timerSeconds: number
}

/**
 * Duración implícita en el `reps` de un ejercicio, o `null` si no la hay.
 *
 * También devuelve `null` para una duración de 0: un cronómetro sin tiempo es
 * peor que ninguno, porque la pantalla lo daría por terminado nada más abrirlo.
 */
export function inferTimerFromReps(reps: string | undefined | null): InferredTimer | null {
  if (!reps) return null
  const m = PURE_DURATION_RE.exec(reps.trim())
  if (!m) return null

  const [, low, high, unit] = m
  const value = parseInt(high ?? low, 10)
  if (!Number.isFinite(value) || value <= 0) return null

  return { isTimer: true, timerSeconds: MINUTE_UNITS.has(unit.toLowerCase()) ? value * 60 : value }
}

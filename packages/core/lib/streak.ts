/**
 * Cálculo de rachas a partir del conjunto de fechas con sesión completada.
 *
 * Puro a propósito (estrategia de testing del monorepo): opera sobre strings
 * 'YYYY-MM-DD' y hace la aritmética de días en UTC, sin leer la timezone del
 * módulo `dateUtils`. Sumar o restar un día a una fecha civil no tiene
 * ambigüedad de DST, así que el resultado coincide con `diffDays()`, pero
 * estas funciones se pueden testear sin llamar antes a `setTimezone()`.
 *
 * Qué fechas entran en el conjunto lo decide quien llama (hoy `useProgress`,
 * que excluye los días de cardio de programa para mantener la semántica
 * solo-fuerza/yoga del resto de estadísticas).
 */

/** 'YYYY-MM-DD' → epoch en días UTC. */
function toDayNumber(dateStr: string): number {
  const y = Number(dateStr.slice(0, 4))
  const m = Number(dateStr.slice(5, 7))
  const d = Number(dateStr.slice(8, 10))
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

/** epoch en días UTC → 'YYYY-MM-DD'. */
function toDateStr(dayNumber: number): string {
  return new Date(dayNumber * 86400000).toISOString().slice(0, 10)
}

function asSet(doneDates: Iterable<string>): Set<string> {
  return doneDates instanceof Set ? doneDates : new Set(doneDates)
}

/**
 * Racha más larga del historial: máximo de días consecutivos con sesión.
 * Devuelve 0 si no hay ninguna fecha.
 */
export function computeLongestStreak(doneDates: Iterable<string>): number {
  const sorted = [...asSet(doneDates)].sort()
  if (sorted.length === 0) return 0

  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (toDayNumber(sorted[i]) - toDayNumber(sorted[i - 1]) === 1) {
      run++
      longest = Math.max(longest, run)
    } else {
      run = 1
    }
  }
  return longest
}

/**
 * Racha activa: días consecutivos con sesión que terminan **hoy o ayer**.
 *
 * Que ayer cuente es deliberado. Si solo contase hoy, la racha se rompería
 * visualmente cada mañana hasta que el usuario entrenase, que es justo el
 * momento en el que el dato tiene que motivar. Si la última sesión es de
 * anteayer o anterior, la racha está rota y devuelve 0.
 */
export function computeCurrentStreak(doneDates: Iterable<string>, today: string): number {
  const set = asSet(doneDates)
  if (set.size === 0) return 0

  const todayNum = toDayNumber(today)
  // `today` inválido ('Invalid Date', '') → NaN → toDateStr lanzaría RangeError
  // y tumbaría el WorkoutProvider entero. Sin hoy no hay racha viva: 0.
  if (!Number.isFinite(todayNum)) return 0
  let cursor = set.has(today) ? todayNum : todayNum - 1
  if (!set.has(toDateStr(cursor))) return 0

  let streak = 0
  // El Set es finito, así que el bucle termina; el tope es defensa extra.
  while (streak <= set.size && set.has(toDateStr(cursor))) {
    streak++
    cursor--
  }
  return streak
}

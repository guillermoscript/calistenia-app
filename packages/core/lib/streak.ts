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

// ─── Racha semanal (#801) ─────────────────────────────────────────────────
//
// La racha que se enseña es SEMANAL: semanas naturales (lunes a domingo)
// seguidas en las que el usuario entrenó al menos `STREAK_WEEKLY_GOAL` días
// distintos. La diaria castigaba el patrón normal de fuerza — 3-4 sesiones
// con descansos, justo lo que siguen los programas oficiales — y un solo día
// libre la mandaba a 1. Es la misma regla que aplica el servidor en
// `pb_hooks/utils/workout_stats.js`; si cambia una, cambia la otra.

/** Días distintos con entreno que hacen falta para que la semana cuente. */
export const STREAK_WEEKLY_GOAL = 2

/** 'YYYY-MM-DD' → lunes de su semana, como epoch en días UTC. */
function weekNumberOf(dateStr: string): number {
  const day = toDayNumber(dateStr)
  // El epoch (1970-01-01) fue jueves: +3 deja el lunes en múltiplo de 7.
  return day - ((day + 3) % 7)
}

/** Días distintos con entreno por semana, clave = lunes en días UTC. */
function daysPerWeek(doneDates: Iterable<string>): Map<number, number> {
  const perWeek = new Map<number, number>()
  for (const date of asSet(doneDates)) {
    const week = weekNumberOf(date)
    if (!Number.isFinite(week)) continue
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
  }
  return perWeek
}

/**
 * Racha semanal más larga del historial: máximo de semanas seguidas que
 * alcanzaron el objetivo. Devuelve 0 si ninguna lo alcanzó.
 */
export function computeLongestWeeklyStreak(
  doneDates: Iterable<string>,
  goal: number = STREAK_WEEKLY_GOAL,
): number {
  const achieved = [...daysPerWeek(doneDates)]
    .filter(([, days]) => days >= goal)
    .map(([week]) => week)
    .sort((a, b) => a - b)
  if (achieved.length === 0) return 0

  let longest = 1
  let run = 1
  for (let i = 1; i < achieved.length; i++) {
    run = achieved[i] - achieved[i - 1] === 7 ? run + 1 : 1
    longest = Math.max(longest, run)
  }
  return longest
}

/**
 * Racha semanal viva: semanas seguidas con el objetivo cumplido que terminan
 * en **esta semana o la anterior**.
 *
 * Que la anterior cuente es el equivalente semanal del "hoy o ayer" de la
 * racha diaria: el lunes la semana nueva aún no se ha podido cumplir, y la
 * racha no puede aparecer rota justo el día en que tiene que motivar. Si esta
 * semana ya se cumplió, suma.
 */
export function computeCurrentWeeklyStreak(
  doneDates: Iterable<string>,
  today: string,
  goal: number = STREAK_WEEKLY_GOAL,
): number {
  const thisWeek = weekNumberOf(today)
  if (!Number.isFinite(thisWeek)) return 0
  const perWeek = daysPerWeek(doneDates)
  const achieved = (week: number) => (perWeek.get(week) ?? 0) >= goal

  let cursor = achieved(thisWeek) ? thisWeek : thisWeek - 7
  let streak = 0
  // Cada semana cumplida necesita al menos una fecha, así que el bucle
  // termina; el tope es defensa extra.
  while (streak <= perWeek.size && achieved(cursor)) {
    streak++
    cursor -= 7
  }
  return streak
}

/** Días distintos con entreno en la semana de `today` (para "1/2 esta semana"). */
export function daysTrainedThisWeek(doneDates: Iterable<string>, today: string): number {
  const thisWeek = weekNumberOf(today)
  if (!Number.isFinite(thisWeek)) return 0
  return daysPerWeek(doneDates).get(thisWeek) ?? 0
}

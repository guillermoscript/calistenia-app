/**
 * Aritmética de días y semanas de calendario sobre cadenas `YYYY-MM-DD` (#853).
 *
 * Todo con `Date.UTC`, que para una fecha sin hora es aritmética pura: no
 * depende de la zona del dispositivo ni se descuadra con el cambio de hora.
 * Las fechas ya llegan en el día LOCAL del usuario (`todayStr()`,
 * `utcToLocalDateStr()`); aquí solo se cuentan días.
 *
 * La semana es la de CALENDARIO, de lunes a domingo: la misma que usa la racha
 * semanal (#801) y el «Esta semana» del inicio. No confundir con la ventana del
 * programa de `programProgress.ts`, que arranca el día en que empezó el programa.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

/** `true` si `day` es una fecha `YYYY-MM-DD` real (no «2026-02-31»). */
export function isDayStr(day: unknown): day is string {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return false
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Número de día absoluto (días desde 1970-01-01). */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY)
}

/** Inverso de `dayNumber`. */
export function dayFromNumber(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10)
}

/** `day` desplazado `offset` días. */
export function shiftDay(day: string, offset: number): string {
  return dayFromNumber(dayNumber(day) + offset)
}

/** Días de `from` a `to` (`to - from`). Negativo si `to` es anterior. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from)
}

/** Lunes de la semana de calendario de `day`. */
export function mondayOf(day: string): string {
  const n = dayNumber(day)
  // 1970-01-01 fue jueves: (n + 3) % 7 da 0 = lunes … 6 = domingo.
  const isoIndex = (((n + 3) % 7) + 7) % 7
  return dayFromNumber(n - isoIndex)
}

/** Los 7 días (lunes → domingo) de la semana que empieza en `monday`. */
export function weekDaysFrom(monday: string): string[] {
  const start = dayNumber(monday)
  return Array.from({ length: 7 }, (_, i) => dayFromNumber(start + i))
}

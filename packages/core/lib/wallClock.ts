/**
 * wallClock — convención de `sessions.completed_at` y `sets_log.logged_at`.
 *
 * Ambos campos (y sus vistas públicas) son `date` de PocketBase, pero NO guardan
 * un instante UTC: guardan la HORA DE PARED LOCAL del usuario (la app escribe
 * `nowLocalForPB()` / `localDateForPB(d)` y PocketBase añade la «Z»). El día
 * correcto es, por tanto, sus 10 primeros caracteres. Pasarlos por
 * `utcToLocalDateStr`, `new Date(x)` o `dayjs.utc(x).tz(...)` desplaza el día
 * según el desfase de la zona (Madrid +1/+2, Caracas -4).
 *
 * Esto NO aplica a `created`, a `nutrition_entries`/`water_entries.logged_at`
 * (autodate, instante UTC real) ni a `cardio_sessions`/`circuit_sessions`
 * (`started_at`/`finished_at`, UTC real).
 *
 * Módulo sin singleton de zona: la zona viaja como argumento, así que sirve
 * igual al cliente y a mcp-server (muchos usuarios por proceso).
 */

import { isDayStr } from './calendarWeek'
import { utcToLocalDateStrIn, wallClock } from './tzDate'

/** Zona del dispositivo, solo para el caso (raro) de no recibir ninguna. */
function deviceTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Día `YYYY-MM-DD` de una marca de pared local: los 10 primeros caracteres.
 * Devuelve `null` si no es una fecha válida.
 */
export function wallClockDay(stamp: unknown): string | null {
  if (typeof stamp !== 'string' || stamp === '') return null
  const day = stamp.slice(0, 10)
  return isDayStr(day) ? day : null
}

/**
 * Día de una marca de pared local; si falta o es inválida, el día del instante
 * UTC real `fallbackUtc` (p. ej. `created`) convertido a `tz`.
 */
export function wallClockDayOf(
  stamp: unknown,
  fallbackUtc?: string | null,
  tz?: string,
): string | null {
  const day = wallClockDay(stamp)
  if (day) return day
  if (!fallbackUtc) return null
  return utcToLocalDateStrIn(fallbackUtc, tz || deviceTz())
}

/**
 * Milisegundos de una marca de pared local (interpretada en la zona del
 * DISPOSITIVO, que es la del usuario en cliente), o del instante UTC real
 * `fallbackUtc` si la marca no tiene forma de fecha-hora.
 */
export function wallClockMs(stamp: string | undefined | null, fallbackUtc?: string | null): number {
  const m = stamp ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(stamp) : null
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
  return new Date((stamp || fallbackUtc)!).getTime()
}

/**
 * Cotas de un filtro de PocketBase sobre un campo de hora de pared local, para
 * los días locales `fromDay`..`toDay` (ambos incluidos). NO usar
 * `localMidnightAsUTC*`: esos valen para instantes UTC reales.
 */
export function wallClockDayRange(fromDay: string, toDay: string): { from: string; to: string } {
  return { from: `${fromDay} 00:00:00`, to: `${toDay} 23:59:59.999` }
}

/** Hora de pared actual en `tz`, `YYYY-MM-DD HH:mm:ss` (para escribir en servidor). */
export function nowWallClockIn(tz: string, ms: number = Date.now()): string {
  return wallClock(tz, ms).format('YYYY-MM-DD HH:mm:ss')
}

/**
 * Hora de pared en `tz` de un instante dado (`Date`, ms o ISO con zona), con el
 * formato de escritura de PocketBase. Una cadena sin zona (`2026-05-01 09:00`)
 * ya es hora de pared y solo se normaliza.
 */
export function wallClockForPBIn(date: Date | number | string, tz: string): string {
  if (typeof date === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/i.test(date.trim())) {
    const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(date.trim())
    if (m) return `${m[1]} ${m[2] ?? '00'}:${m[3] ?? '00'}:${m[4] ?? '00'}`
  }
  const ms = date instanceof Date ? date.getTime() : typeof date === 'number' ? date : new Date(date).getTime()
  return nowWallClockIn(tz, ms)
}

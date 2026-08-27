/**
 * tzDate — helpers de fecha con la zona horaria como ARGUMENTO EXPLÍCITO.
 *
 * `dateUtils.ts` trabaja sobre un singleton de módulo (`_tz`, fijado en el
 * login) que vale para una app que sirve a UN usuario por proceso. El servidor
 * (mcp-server: cron de insights, recordatorios) atiende a MUCHOS usuarios,
 * cada uno con su zona, en el mismo proceso — ahí el singleton no sirve y la
 * zona tiene que viajar como parámetro. Este módulo es la implementación
 * única de esas operaciones; `dateUtils.ts` delega aquí pasando `_tz`, así
 * que cliente y servidor comparten la misma aritmética por construcción.
 *
 * Sin dependencias más allá de dayjs (+utc/timezone): importable desde
 * mcp-server, que no tiene i18next ni el runtime de la app.
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Hoy como YYYY-MM-DD en la zona `tz`.
 *
 * Blindado: si el plugin timezone devuelve una fecha inválida, cae a la hora
 * local del host en vez de propagar «Invalid Date». Pasó con dayjs 1.11.22+
 * en Hermes (Android): el nuevo cálculo de offset parsea
 * `Intl.DateTimeFormat().formatToParts` y sale NaN → `computeCurrentStreak`
 * hacía `new Date(NaN).toISOString()` → RangeError → la app no arrancaba
 * (v1.12.1/vc37). dayjs está pineado a 1.11.21 por eso; esto es la red.
 */
export function todayStrIn(tz: string): string {
  const s = dayjs().tz(tz).format('YYYY-MM-DD')
  if (YMD.test(s)) return s
  const local = dayjs().format('YYYY-MM-DD')
  console.warn(`[tzDate] todayStrIn(${tz}) devolvió «${s}»; usando hora local ${local}`)
  return local
}

/** Desplaza una fecha YYYY-MM-DD `offset` días (en la zona `tz`) y devuelve YYYY-MM-DD. */
export function addDaysIn(dateStr: string, offset: number, tz: string): string {
  return dayjs.tz(dateStr, tz).add(offset, 'day').format('YYYY-MM-DD')
}

/** Días entre dos YYYY-MM-DD (a - b), en la zona `tz`. */
export function diffDaysIn(a: string, b: string, tz: string): number {
  return dayjs.tz(a, tz).diff(dayjs.tz(b, tz), 'day')
}

/** Timestamp UTC (formato PocketBase o ISO) → YYYY-MM-DD en la zona `tz`. */
export function utcToLocalDateStrIn(utcTimestamp: string, tz: string): string {
  return dayjs.utc(utcTimestamp).tz(tz).format('YYYY-MM-DD')
}

/**
 * "Medianoche de `dateStr` en la zona `tz`" como datetime UTC para filtros de
 * PocketBase (que comparan en UTC). Ej.: EST (UTC-5), 2026-03-24 →
 * "2026-03-24 05:00:00".
 */
export function localMidnightAsUTCIn(dateStr: string, tz: string): string {
  return dayjs.tz(dateStr, tz).utc().format('YYYY-MM-DD HH:mm:ss')
}

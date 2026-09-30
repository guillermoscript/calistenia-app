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
 * La conversión de zona NO usa `dayjs.tz`: su plugin hace
 * `new Date(date.toLocaleString('en-US', {timeZone}))`, que en Hermes (Android)
 * es Invalid Date y deja todo en UTC (#880). Aquí se lee la hora de pared con
 * `Intl.DateTimeFormat(...).formatToParts()`, que sí funciona en Hermes.
 *
 * Sin dependencias más allá de dayjs (+utc): importable desde mcp-server, que
 * no tiene i18next ni el runtime de la app.
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

const YMD = /^\d{4}-\d{2}-\d{2}/
const DAY_MS = 86_400_000

export interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
  hour: number // 0-23
  minute: number
  second: number
  /** 0=domingo … 6=sábado */
  weekday: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(tz, f)
  }
  return f
}

/** Hora de pared (año, mes, día, hora…) del instante `ms` en la zona `tz`. */
export function zonedParts(ms: number, tz: string): ZonedParts {
  const p: Record<string, number> = {}
  for (const part of formatterFor(tz).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10)
  }
  const year = p.year, month = p.month, day = p.day
  return {
    year,
    month,
    day,
    hour: p.hour % 24, // algunos motores dan 24 a medianoche
    minute: p.minute,
    second: p.second,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  }
}

/** ms del instante «hora de pared de `ms` en `tz`, leída como si fuera UTC». */
function wallAsUtcMs(ms: number, tz: string): number {
  const z = zonedParts(ms, tz)
  return Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second)
}

/**
 * Reloj de pared de `tz` como dayjs en modo UTC: sus campos (`hour()`, `day()`,
 * `format('YYYY-MM-DD')`, `isoWeekday(1)`…) son los de la zona `tz`. Sustituye a
 * `dayjs().tz(tz)`. NO es un instante real: no uses `valueOf()` para comparar
 * con timestamps (usa `zonedMidnightMs`).
 */
export function wallClock(tz: string, ms: number = Date.now()): dayjs.Dayjs {
  return dayjs.utc(wallAsUtcMs(ms, tz))
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

function ymdOf(z: ZonedParts): string {
  return `${pad(z.year, 4)}-${pad(z.month)}-${pad(z.day)}`
}

/** Instante UTC (ms) en que empieza el día `dateStr` (YYYY-MM-DD) en la zona `tz`. */
export function zonedMidnightMs(dateStr: string, tz: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d)
  // Dos pasadas: la primera estima con el offset del propio `wall`; la segunda
  // corrige si al aplicarlo se cruzó un cambio de horario.
  const t1 = wall - (wallAsUtcMs(wall, tz) - wall)
  return wall - (wallAsUtcMs(t1, tz) - t1)
}

/**
 * Hoy como YYYY-MM-DD en la zona `tz`.
 *
 * Blindado: si `tz` no es válida (Intl lanza RangeError) cae a la hora local
 * del host en vez de propagar el error: un fallo aquí tumbó el arranque de la
 * app (v1.12.1/vc37).
 */
export function todayStrIn(tz: string): string {
  try {
    return ymdOf(zonedParts(Date.now(), tz))
  } catch {
    const local = dayjs().format('YYYY-MM-DD')
    console.warn(`[tzDate] todayStrIn(${tz}) falló; usando hora local ${local}`)
    return local
  }
}

/** Fecha de calendario (YYYY-MM-DD…) → ms UTC de su medianoche, o null si no es una fecha. */
function calendarMs(dateStr: string): number | null {
  if (typeof dateStr !== 'string' || !YMD.test(dateStr)) return null
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d)
  return Number.isNaN(ms) || new Date(ms).getUTCMonth() !== m - 1 ? null : ms
}

function warnInvalid(fn: string, value: unknown): void {
  console.warn(`[tzDate] ${fn}: fecha inválida «${String(value)}»`)
}

/**
 * Desplaza una fecha YYYY-MM-DD `offset` días y devuelve YYYY-MM-DD. Es
 * aritmética de calendario, sin zona (`tz` se conserva por compatibilidad de
 * firma). Con una fecha inválida devuelve la entrada tal cual.
 */
export function addDaysIn(dateStr: string, offset: number, _tz: string): string {
  const ms = calendarMs(dateStr)
  if (ms === null) {
    warnInvalid('addDaysIn', dateStr)
    return dateStr
  }
  return new Date(ms + offset * DAY_MS).toISOString().slice(0, 10)
}

/** Días entre dos YYYY-MM-DD (a - b). Con una fecha inválida devuelve 0. */
export function diffDaysIn(a: string, b: string, _tz: string): number {
  const ma = calendarMs(a)
  const mb = calendarMs(b)
  if (ma === null || mb === null) {
    warnInvalid('diffDaysIn', ma === null ? a : b)
    return 0
  }
  return Math.round((ma - mb) / DAY_MS)
}

/** Timestamp UTC (formato PocketBase o ISO) → YYYY-MM-DD en la zona `tz`. Inválido → ''. */
export function utcToLocalDateStrIn(utcTimestamp: string, tz: string): string {
  const d = dayjs.utc(utcTimestamp)
  if (!utcTimestamp || !d.isValid()) {
    warnInvalid('utcToLocalDateStrIn', utcTimestamp)
    return ''
  }
  return ymdOf(zonedParts(d.valueOf(), tz))
}

/**
 * "Medianoche de `dateStr` en la zona `tz`" como datetime UTC para filtros de
 * PocketBase (que comparan en UTC). Ej.: EST (UTC-5), 2026-03-24 →
 * "2026-03-24 05:00:00".
 */
export function localMidnightAsUTCIn(dateStr: string, tz: string): string {
  if (calendarMs(dateStr) === null) {
    warnInvalid('localMidnightAsUTCIn', dateStr)
    return ''
  }
  return dayjs.utc(zonedMidnightMs(dateStr, tz)).format('YYYY-MM-DD HH:mm:ss')
}

/**
 * Timezone-aware date utilities powered by dayjs.
 *
 * All date strings produced here respect the user's configured timezone
 * instead of UTC, so "today" means today in the user's wall-clock time.
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/es'
import 'dayjs/locale/en'
import i18n from './i18n'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)

// Sync dayjs locale with i18n language
dayjs.locale(i18n.language)
i18n.on('languageChanged', (lng: string) => {
  dayjs.locale(lng)
})

// Module-level timezone — defaults to browser detection, overridden on login.
let _tz: string = Intl.DateTimeFormat().resolvedOptions().timeZone

/** Set the active timezone (call on login / profile save). */
export function setTimezone(tz: string): void {
  _tz = tz
}

/** Get the active timezone. */
export function getTimezone(): string {
  return _tz
}

/** Get a dayjs instance in the user's timezone. */
function now() {
  return dayjs().tz(_tz)
}

/** Format a Date as YYYY-MM-DD in the user's timezone. */
export function toLocalDateStr(date: Date = new Date()): string {
  return dayjs(date).tz(_tz).format('YYYY-MM-DD')
}

/** Today as YYYY-MM-DD in the user's timezone. */
export function todayStr(): string {
  return now().format('YYYY-MM-DD')
}

/** N days ago as YYYY-MM-DD in the user's timezone. */
export function daysAgoStr(n: number): string {
  return now().subtract(n, 'day').format('YYYY-MM-DD')
}

/** Navigate a YYYY-MM-DD date by `offset` days and return YYYY-MM-DD. */
export function addDays(dateStr: string, offset: number): string {
  return dayjs.tz(dateStr, _tz).add(offset, 'day').format('YYYY-MM-DD')
}

/** Start of current week (Monday) as YYYY-MM-DD in user's timezone. */
export function startOfWeekStr(): string {
  return now().isoWeekday(1).format('YYYY-MM-DD')
}

/** Current hour (0-23) in the user's timezone. */
export function localHour(): number {
  return now().hour()
}

/** Current day of week (0=Sun, 1=Mon...6=Sat) in the user's timezone. */
export function localDay(): number {
  return now().day()
}

/** Current minutes since midnight in user's timezone (for reminder scheduling). */
export function localMinutesSinceMidnight(): number {
  const n = now()
  return n.hour() * 60 + n.minute()
}

/** Convert a UTC timestamp string to YYYY-MM-DD in user's timezone. */
export function utcToLocalDateStr(utcTimestamp: string): string {
  return dayjs.utc(utcTimestamp).tz(_tz).format('YYYY-MM-DD')
}

/**
 * Convert "midnight of dateStr in user's timezone" to a UTC datetime string
 * suitable for PocketBase filters (which compare in UTC).
 *
 * Example: for EST (UTC-5) on 2026-03-24 → "2026-03-24 05:00:00"
 */
export function localMidnightAsUTC(dateStr?: string): string {
  const target = dateStr || todayStr()
  return dayjs.tz(target, _tz).utc().format('YYYY-MM-DD HH:mm:ss')
}

/**
 * Current timestamp formatted for PocketBase datetime fields.
 * Uses the user's local time so that the date portion matches `todayStr()`.
 */
export function nowLocalForPB(): string {
  return now().format('YYYY-MM-DD HH:mm:ss')
}

/**
 * Format a local date string (YYYY-MM-DD) as a PocketBase date field value.
 * Appends midnight in local representation (not UTC).
 */
export function localDateForPB(dateStr: string): string {
  return `${dateStr} 00:00:00`
}

/** Number of days between two YYYY-MM-DD date strings (a - b), timezone-aware. */
export function diffDays(a: string, b: string): number {
  return dayjs.tz(a, _tz).diff(dayjs.tz(b, _tz), 'day')
}

/** Human-friendly relative date label (Today, Yesterday, N days ago, or short date). */
export function relativeDate(dateStr: string): string {
  const today = todayStr()
  if (dateStr === today) return i18n.t('common.today')
  const yesterday = daysAgoStr(1)
  if (dateStr === yesterday) return i18n.t('common.yesterday')
  const diff = dayjs.tz(today, _tz).diff(dayjs.tz(dateStr, _tz), 'day')
  if (diff >= 2 && diff <= 7) return i18n.t('common.daysAgo', { count: diff })
  return dayjs.tz(dateStr, _tz).toDate().toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })
}

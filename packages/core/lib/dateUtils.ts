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
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/es'
import 'dayjs/locale/en'
import i18n from 'i18next'
import { addDaysIn, diffDaysIn, localMidnightAsUTCIn, todayStrIn, utcToLocalDateStrIn } from './tzDate'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)
dayjs.extend(relativeTimePlugin)

// Sync dayjs locale with i18n language
dayjs.locale(i18n.language)
i18n.on('languageChanged', (lng: string) => {
  dayjs.locale(lng)
})

/** Validate an IANA timezone; fall back to UTC if invalid (e.g. Android's "Etc/Unknown"). */
function sanitizeTz(tz: string | undefined | null): string {
  try {
    if (!tz) return 'UTC'
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

// Module-level timezone — defaults to browser detection, overridden on login.
let _tz: string = sanitizeTz(Intl.DateTimeFormat().resolvedOptions().timeZone)

/** Set the active timezone (call on login / profile save). */
export function setTimezone(tz: string): void {
  _tz = sanitizeTz(tz)
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
  return todayStrIn(_tz)
}

/**
 * Today as YYYY-MM-DD in an explicit IANA timezone. Used by the headless
 * widget process, which does not run setTimezone() and so cannot rely on the
 * module-level `_tz` matching the app process. Falls back to local on bad tz.
 */
export function todayStrInTz(tz: string): string {
  try {
    return todayStrIn(tz)
  } catch {
    return dayjs().format('YYYY-MM-DD')
  }
}

/** N days ago as YYYY-MM-DD in the user's timezone. */
export function daysAgoStr(n: number): string {
  return now().subtract(n, 'day').format('YYYY-MM-DD')
}

/** Navigate a YYYY-MM-DD date by `offset` days and return YYYY-MM-DD. */
export function addDays(dateStr: string, offset: number): string {
  return addDaysIn(dateStr, offset, _tz)
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

/**
 * Format a PocketBase UTC timestamp (e.g. "2026-06-24 13:30:00.000Z") as a
 * 24-hour "HH:mm" label in the user's timezone. Returns '' on invalid input.
 */
export function formatTimeHHmm(pbTimestamp: string): string {
  const d = dayjs.utc(pbTimestamp.replace(' ', 'T'))
  return d.isValid() ? d.tz(_tz).format('HH:mm') : ''
}

/**
 * Extract { hour, minute } as zero-padded 2-char strings in the user's timezone
 * from a PocketBase UTC timestamp. Used to seed HH/MM editor inputs; null on bad input.
 */
export function localHMFromPB(pbTimestamp: string): { hour: string; minute: string } | null {
  const d = dayjs.utc(pbTimestamp.replace(' ', 'T'))
  if (!d.isValid()) return null
  const local = d.tz(_tz)
  return { hour: local.format('HH'), minute: local.format('mm') }
}

/** Convert a UTC timestamp string to YYYY-MM-DD in user's timezone. */
export function utcToLocalDateStr(utcTimestamp: string): string {
  return utcToLocalDateStrIn(utcTimestamp, _tz)
}

/**
 * Convert "midnight of dateStr in user's timezone" to a UTC datetime string
 * suitable for PocketBase filters (which compare in UTC).
 *
 * Example: for EST (UTC-5) on 2026-03-24 → "2026-03-24 05:00:00"
 */
export function localMidnightAsUTC(dateStr?: string): string {
  return localMidnightAsUTCIn(dateStr || todayStr(), _tz)
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
  return diffDaysIn(a, b, _tz)
}

/**
 * Parse a PocketBase timestamp (e.g. "2026-04-03 12:00:00.000Z") into a dayjs UTC instance.
 * Handles both space-separated and T-separated formats, with or without trailing Z.
 */
function parsePBTimestamp(dateStr: string): dayjs.Dayjs {
  return dayjs.utc(dateStr.replace(' ', 'T'))
}

/**
 * Human-friendly relative time from a PocketBase timestamp.
 * Uses dayjs relativeTime plugin with the current i18n locale.
 * Returns e.g. "hace 3 horas", "2 days ago", "3 abr" for older dates.
 */
export function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const d = parsePBTimestamp(dateStr)
  if (!d.isValid()) return ''
  const diffDaysVal = dayjs().diff(d, 'day')
  if (diffDaysVal > 7) {
    return d.tz(_tz).toDate().toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })
  }
  return d.tz(_tz).fromNow()
}

/**
 * Compact relative time for list rows and badges (notifications, activity
 * widget): "ahora", "hace 5 min", "hace 3 h", "ayer", "hace 3 días" / "now",
 * "5m ago", "3h ago", "yesterday", "3d ago". Falls back to a short date past
 * 7 days. Uses the `feed.*` i18n keys, so it follows the active language.
 * Shorter than `timeAgo` (dayjs `fromNow`), which reads as a sentence.
 */
export function timeAgoShort(dateStr: string): string {
  if (!dateStr) return ''
  const d = parsePBTimestamp(dateStr)
  if (!d.isValid()) return ''
  const diffMin = Math.floor(dayjs().diff(d, 'minute'))
  if (diffMin < 1) return i18n.t('feed.now')
  if (diffMin < 60) return i18n.t('feed.minutesAgo', { count: diffMin })
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return i18n.t('feed.hoursAgo', { count: diffH })
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return i18n.t('feed.yesterday')
  if (diffD <= 7) return i18n.t('feed.daysAgo', { count: diffD })
  return d.tz(_tz).toDate().toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })
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

/**
 * Build a short date formatter for the active locale. Not cached on purpose:
 * this renders once or twice per screen, so the allocation is irrelevant, and a
 * cached formatter would have to be invalidated on every language change.
 */
function rangeFormatter(withYear: boolean): Intl.DateTimeFormat {
  const locale = i18n.language || 'es'
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    // Calendar dates, not instants — see formatDateRange.
    timeZone: 'UTC',
    ...(withYear ? { year: 'numeric' as const } : {}),
  }
  try {
    return new Intl.DateTimeFormat(locale, options)
  } catch {
    // The browser language detector can hand us a tag Intl rejects.
    return new Intl.DateTimeFormat('es', options)
  }
}

/**
 * Format a start/end pair as a short, localized date range.
 *
 *   es → "9–23 ago", "30 ago – 5 sept", "28 dic 2026 – 4 ene 2027"
 *   en → "Aug 9 – 23", "Aug 30 – Sep 5", "Dec 28, 2026 – Jan 4, 2027"
 *
 * Intended for PocketBase date fields that mean a *calendar date* rather than
 * an instant — challenge `starts_at` / `ends_at` are stored at midnight UTC.
 * Those are formatted in UTC on purpose: shifting them into the user's
 * timezone would render the previous day for anyone west of UTC (midnight UTC
 * on Aug 9 is Aug 8 at UTC-5), so the day that was stored is the day shown.
 *
 * The year appears whenever either end falls outside the current year, which
 * covers ranges crossing new year as well as challenges from earlier years.
 */
export function formatDateRange(startTs: string, endTs: string): string {
  if (!startTs || !endTs) return ''
  const start = parsePBTimestamp(startTs)
  const end = parsePBTimestamp(endTs)
  if (!start.isValid() || !end.isValid()) return ''

  const currentYear = now().year()
  const withYear = start.year() !== currentYear || end.year() !== currentYear
  const fmt = rangeFormatter(withYear)

  const startDate = start.toDate()
  const endDate = end.toDate()

  // Same calendar day: a range would read "9 ago – 9 ago".
  if (start.isSame(end, 'day')) return fmt.format(startDate)

  // formatRange needs full ICU; Hermes builds may not have it, and core is
  // shared with the native app.
  if (typeof fmt.formatRange === 'function') {
    return fmt.formatRange(startDate, endDate)
  }
  return `${fmt.format(startDate)} – ${fmt.format(endDate)}`
}

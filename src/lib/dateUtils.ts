/**
 * Timezone-aware date utilities.
 *
 * All date strings produced here respect the user's configured timezone
 * instead of UTC, so "today" means today in the user's wall-clock time.
 */

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

/** Format a Date as YYYY-MM-DD in the user's timezone. */
export function toLocalDateStr(date: Date = new Date()): string {
  // sv-SE locale naturally produces ISO-format dates (YYYY-MM-DD)
  return date.toLocaleDateString('sv-SE', { timeZone: _tz })
}

/** Today as YYYY-MM-DD in the user's timezone. */
export function todayStr(): string {
  return toLocalDateStr(new Date())
}

/** N days ago as YYYY-MM-DD in the user's timezone. */
export function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toLocalDateStr(d)
}

/** Navigate a YYYY-MM-DD date by `offset` days and return YYYY-MM-DD. */
export function addDays(dateStr: string, offset: number): string {
  // Parse at noon to avoid DST edge-cases
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + offset)
  return toLocalDateStr(d)
}

/** Start of current week (Monday) as YYYY-MM-DD in user's timezone. */
export function startOfWeekStr(): string {
  const today = todayStr()
  const d = new Date(`${today}T12:00:00`)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  return toLocalDateStr(d)
}

/** Current hour (0-23) in the user's timezone. */
export function localHour(): number {
  return parseInt(
    new Date().toLocaleString('en-US', { timeZone: _tz, hour: 'numeric', hour12: false }),
    10,
  )
}

/** Current day of week (0=Sun, 1=Mon...6=Sat) in the user's timezone. */
export function localDay(): number {
  const todayDate = todayStr()
  return new Date(`${todayDate}T12:00:00`).getDay()
}

/** Current minutes since midnight in user's timezone (for reminder scheduling). */
export function localMinutesSinceMidnight(): number {
  const h = localHour()
  const m = parseInt(
    new Date().toLocaleString('en-US', { timeZone: _tz, minute: 'numeric' }),
    10,
  )
  return h * 60 + m
}

/** Convert a UTC timestamp string to YYYY-MM-DD in user's timezone. */
export function utcToLocalDateStr(utcTimestamp: string): string {
  return toLocalDateStr(new Date(utcTimestamp))
}

/**
 * Convert "midnight of dateStr in user's timezone" to a UTC datetime string
 * suitable for PocketBase filters (which compare in UTC).
 *
 * Example: for EST (UTC-5) on 2026-03-24 → "2026-03-24 05:00:00"
 */
export function localMidnightAsUTC(dateStr?: string): string {
  const target = dateStr || todayStr()
  // Create a formatter that tells us the UTC offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: _tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  // Build midnight in UTC, then figure out the offset
  const utcMidnight = new Date(`${target}T00:00:00Z`)

  // Format that UTC instant in the user's timezone to see what local time it maps to
  const parts = formatter.formatToParts(utcMidnight)
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0'
  const localYear = parseInt(get('year'))
  const localMonth = parseInt(get('month'))
  const localDay = parseInt(get('day'))
  const localHour = parseInt(get('hour'))
  const localMinute = parseInt(get('minute'))

  // The difference between "midnight local on target" and "what UTC midnight looks like locally"
  // tells us the offset.
  // If UTC midnight = 2026-03-24T00:00Z shows as 2026-03-23 19:00 in EST,
  // that means local is 5 hours behind UTC → midnight local = 05:00 UTC
  const targetParts = target.split('-').map(Number)
  const targetMidnightLocal = new Date(targetParts[0], targetParts[1] - 1, targetParts[2], 0, 0, 0)
  const utcMidnightAsLocal = new Date(localYear, localMonth - 1, localDay, localHour, localMinute, 0)

  const offsetMs = targetMidnightLocal.getTime() - utcMidnightAsLocal.getTime()
  const result = new Date(utcMidnight.getTime() + offsetMs)

  return result.toISOString().replace('T', ' ').slice(0, 19)
}

/** Human-friendly relative date label in Spanish (Hoy, Ayer, Hace N dias, or short date). */
export function relativeDate(dateStr: string): string {
  const today = todayStr()
  const yesterday = daysAgoStr(1)
  if (dateStr === today) return 'Hoy'
  if (dateStr === yesterday) return 'Ayer'
  const diff = Math.floor((new Date(today).getTime() - new Date(dateStr).getTime()) / 86400000)
  if (diff <= 7) return `Hace ${diff} dias`
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

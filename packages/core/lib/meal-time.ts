/**
 * Meal-time display helpers — shared across web and native.
 *
 * Key design decision: legacy/default NutritionEntry rows were saved with
 * eatenAt ending in "00:00:00", so slice(11,16) yields "00:00". A meal
 * genuinely eaten at exactly midnight is rare; treating "00:00" as the unset
 * sentinel and falling back to the creation time (loggedAt) is the correct
 * tradeoff and fixes the display of all legacy entries.
 *
 * These functions do NO Date/timezone parsing of the eatenAt slice — we read
 * it verbatim from the string to avoid reinterpreting a naive local timestamp
 * as UTC (which would shift the displayed time by the user's UTC offset).
 */

import { formatTimeHHmm } from './dateUtils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MealTimeEntry {
  eatenAt?: string | null
  loggedAt?: string | null
}

// ─── Public helpers ──────────────────────────────────────────────────────────

/**
 * Return an "HH:MM" display string for a NutritionEntry's meal time.
 *
 * Logic:
 *  1. If eatenAt is present, long enough, and NOT the midnight sentinel
 *     "00:00", return slice(11,16) verbatim (avoids tz reinterpretation).
 *  2. Otherwise fall back to the creation time (loggedAt), formatted via dayjs
 *     in the user's configured timezone + i18n locale as a 24h HH:mm label.
 *  3. If neither is usable, return "".
 */
export function getMealTimeLabel(entry: MealTimeEntry): string {
  if (entry.eatenAt && entry.eatenAt.length >= 16) {
    const hhmm = entry.eatenAt.slice(11, 16)
    if (hhmm !== '00:00') return hhmm
  }

  // Fall back to the creation time. loggedAt is a real UTC timestamp, so format
  // it through dayjs in the user's configured timezone + locale (24h HH:mm) —
  // not raw Date with device-tz / hardcoded locale.
  if (entry.loggedAt) {
    const label = formatTimeHHmm(entry.loggedAt)
    if (label) return label
  }

  return ''
}

/**
 * Parse a date-time string in any of these formats into { hour, minute }:
 *  - EXIF DateTimeOriginal: "YYYY:MM:DD HH:MM:SS"
 *  - ISO-ish:               "YYYY-MM-DDTHH:MM:SS" | "YYYY-MM-DD HH:MM:SS"
 *
 * Returns zero-padded 2-char strings, or null if the input is unparseable
 * or the hour/minute values are out of range.
 */
export function parseExifDateTimeToHM(
  raw?: string | null,
): { hour: string; minute: string } | null {
  if (!raw) return null

  // Matches date part (with : or - separators) then a space/T, then HH:MM.
  const m = raw.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return null

  const hour = parseInt(m[4], 10)
  const minute = parseInt(m[5], 10)

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null

  return {
    hour: String(hour).padStart(2, '0'),
    minute: String(minute).padStart(2, '0'),
  }
}

/**
 * Return true when eatenAt holds the midnight sentinel value "00:00".
 *
 * Use this in edit-prefill code to detect an unset eatenAt and seed a
 * sane default time instead of displaying 00:00 to the user.
 */
export function isMidnightEatenAt(eatenAt?: string | null): boolean {
  return Boolean(eatenAt && eatenAt.length >= 16 && eatenAt.slice(11, 16) === '00:00')
}

import dayjs from 'dayjs'
import { addDays, getTimezone, toLocalDateStr } from './dateUtils'
import { wallClock } from './tzDate'

export interface FastingSession {
  id: string
  userId: string
  startedAt: string
  endedAt: string | null
  goalHours: number
  notes: string
  revision?: number
}

export interface FastingSessionInput {
  id?: string
  startedAt: string
  endedAt: string | null
  goalHours: number
  notes?: string
  revision?: number
}

export interface FastingSettings {
  id?: string
  goalHours: number
  weeklyGoal: number
}

export const FASTING_PRESETS = [12, 14, 16, 18, 20, 24, 36, 48] as const
export const DEFAULT_FASTING_SETTINGS: FastingSettings = { goalHours: 16, weeklyGoal: 3 }
export const FASTING_HOUR_MS = 3_600_000

export class FastingError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'FastingError'
  }
}

/** PocketBase uses UTC dates with a space; never interpret them in device time. */
export function parseFastingTimestamp(value: string): number {
  const iso = value.replace(' ', 'T')
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`)
}

export function normalizeFastingTimestamp(value: string): string {
  const timestamp = parseFastingTimestamp(value)
  if (!Number.isFinite(timestamp)) throw new FastingError('invalidDate')
  return new Date(timestamp).toISOString()
}

/** Admitir coma decimal del teclado español sin aceptar separadores de miles. */
export function parseFastingGoalHours(value: string): number {
  const text = value.trim()
  return /^\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : NaN
}

export function validateFastingSettings(settings: Pick<FastingSettings, 'goalHours' | 'weeklyGoal'>): void {
  if (!Number.isFinite(settings.goalHours) || settings.goalHours < 1 || settings.goalHours > 48) {
    throw new FastingError('invalidGoal')
  }
  if (!Number.isInteger(settings.weeklyGoal) || settings.weeklyGoal < 1 || settings.weeklyGoal > 7) {
    throw new FastingError('invalidWeeklyGoal')
  }
}

/** Intervals are half-open: a fast can begin exactly when the previous one ended. */
export function validateFastingSession(input: FastingSessionInput, sessions: readonly FastingSession[], now = Date.now()): void {
  validateFastingSettings({ goalHours: input.goalHours, weeklyGoal: 1 })
  const start = parseFastingTimestamp(input.startedAt)
  const end = input.endedAt === null ? Infinity : parseFastingTimestamp(input.endedAt)
  if (!Number.isFinite(start) || Number.isNaN(end)) throw new FastingError('invalidDate')
  if (start > now || (end !== Infinity && end > now)) throw new FastingError('futureDate')
  if (end <= start) throw new FastingError('endBeforeStart')
  if ((input.notes ?? '').length > 2000) throw new FastingError('notesTooLong')
  for (const other of sessions) {
    if (other.id === input.id) continue
    if (input.endedAt === null && other.endedAt === null) throw new FastingError('alreadyActive')
    const otherStart = parseFastingTimestamp(other.startedAt)
    const otherEnd = other.endedAt === null ? Infinity : parseFastingTimestamp(other.endedAt)
    if (start < otherEnd && otherStart < end) throw new FastingError('overlap')
  }
}

export function getFastingProgress(session: FastingSession, now = Date.now()) {
  const start = parseFastingTimestamp(session.startedAt)
  const targetMs = session.goalHours * FASTING_HOUR_MS
  const end = session.endedAt ? parseFastingTimestamp(session.endedAt) : now
  const elapsedMs = Math.max(0, end - start)
  return {
    elapsedMs,
    remainingMs: Math.max(0, targetMs - elapsedMs),
    targetAt: new Date(start + targetMs).toISOString(),
    progress: Math.min(1, elapsedMs / targetMs),
    goalReached: elapsedMs >= targetMs,
  }
}

/** Count completed sessions by their end date; don't count a multi-day fast twice. */
export function getFastingSummary(sessions: readonly FastingSession[], now = Date.now()) {
  const today = toLocalDateStr(new Date(now))
  const weekday = dayjs(today).day()
  const weekStart = addDays(today, -(weekday === 0 ? 6 : weekday - 1))
  const nextWeek = addDays(weekStart, 7)
  const monthStart = `${today.slice(0, 7)}-01`
  const nextMonth = dayjs(monthStart).add(1, 'month').format('YYYY-MM-DD')
  let totalHours = 0, goalsReached = 0, weekCompleted = 0, monthCompleted = 0, weekHours = 0, monthHours = 0
  const completed = sessions.filter(s => s.endedAt !== null)
  for (const session of completed) {
    const { elapsedMs, goalReached } = getFastingProgress(session, now)
    const hours = elapsedMs / FASTING_HOUR_MS
    const date = toLocalDateStr(new Date(parseFastingTimestamp(session.endedAt!)))
    totalHours += hours
    if (goalReached) goalsReached++
    if (date >= weekStart && date < nextWeek && parseFastingTimestamp(session.endedAt!) <= now) {
      weekCompleted++
      weekHours += hours
    }
    if (date >= monthStart && date < nextMonth && parseFastingTimestamp(session.endedAt!) <= now) {
      monthCompleted++
      monthHours += hours
    }
  }
  return { completedCount: completed.length, totalHours, averageHours: completed.length ? totalHours / completed.length : 0, goalsReached, weekCompleted, monthCompleted, weekHours, monthHours }
}

export function formatFastingDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':')
}

export function toLocalDateTimeInput(iso: string, timezone = getTimezone()): string {
  return wallClock(timezone, parseFastingTimestamp(normalizeFastingTimestamp(iso))).format('YYYY-MM-DDTHH:mm')
}

/** Reject calendar rollovers and nonexistent local times instead of silently moving them. */
export function fromLocalDateTimeInput(value: string, timezone = getTimezone()): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new FastingError('invalidDate')
  try {
    const wall = Date.parse(`${value}:00.000Z`)
    if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) throw new FastingError('invalidDate')
    // Intl funciona en Hermes; dayjs.tz depende de parsear cadenas locales.
    // Considerar ambos lados de un cambio de hora y validar la vuelta exacta:
    // una hora inexistente no tiene candidato; una repetida usa la primera.
    const offsets = new Set([-86_400_000, 0, 86_400_000].map(delta => {
      const sample = wall + delta
      return wallClock(timezone, sample).valueOf() - sample
    }))
    for (const offset of offsets) {
      const instant = wall - offset
      if (wallClock(timezone, instant).format('YYYY-MM-DDTHH:mm') === value) return new Date(instant).toISOString()
    }
    throw new FastingError('invalidDate')
  } catch {
    throw new FastingError('invalidDate')
  }
}

const SERVER_ERROR_CODES: Record<string, string> = {
  fasting_conflict: 'conflict', fasting_date: 'invalidDate', fasting_future: 'futureDate', fasting_order: 'endBeforeStart',
  fasting_invalid_date: 'invalidDate', fasting_future_date: 'futureDate',
  fasting_end_before_start: 'endBeforeStart', fasting_overlap: 'overlap',
  fasting_already_active: 'alreadyActive', fasting_invalid_goal: 'invalidGoal',
  fasting_invalid_weekly_goal: 'invalidWeeklyGoal', fasting_notes_too_long: 'notesTooLong',
}

export function getFastingErrorKey(error: unknown): string {
  if (error instanceof FastingError) return `fasting.error.${error.code}`
  const e = error as { status?: number; response?: { data?: Record<string, { code?: string }> } } | null
  const codes = Object.values(e?.response?.data ?? {}).map(field => field?.code)
  for (const code of codes) if (code && SERVER_ERROR_CODES[code]) return `fasting.error.${SERVER_ERROR_CODES[code]}`
  // PocketBase number/text constraints emit generic validation_* codes. Their
  // field identifies the useful error when another client bypasses local guards.
  const fieldKeys: Record<string, string> = {
    goal_hours: 'invalidGoal', weekly_goal: 'invalidWeeklyGoal', notes: 'notesTooLong',
  }
  for (const [field, error] of Object.entries(e?.response?.data ?? {})) {
    if (error?.code?.startsWith('validation_') && fieldKeys[field]) return `fasting.error.${fieldKeys[field]}`
  }
  if (e?.status === 404) return 'fasting.error.unavailable'
  if (e?.status === 0) return 'fasting.error.offline'
  if (e?.status === 401 || e?.status === 403) return 'fasting.error.signIn'
  return 'fasting.error.save'
}

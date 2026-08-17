/**
 * Lógica pura compartida de la pantalla de recordatorios (web + móvil):
 * constantes, clamps de hora/minuto, expansión de la ventana de pausas,
 * ids del timeline y construcción del timeline ordenado.
 *
 * La capa de datos vive en useMealReminders/useWorkoutReminders; la
 * orquestación con i18n en hooks/useReminderTimeline. Aquí no hay React
 * ni dependencias de plataforma.
 */

import type { MealReminder } from '../types'
import type { WorkoutReminder } from '../hooks/useWorkoutReminders'

// ── Constantes compartidas ────────────────────────────────────────────────────

/** Claves i18n de los días en orden de display (day.lun … day.dom). */
export const REMINDER_DAY_KEYS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const

/** Ids JS de día en orden de display: Lun(1)…Sáb(6), Dom(0). */
export const REMINDER_DAYS = [
  { id: 1, label: 'L' },
  { id: 2, label: 'M' },
  { id: 3, label: 'X' },
  { id: 4, label: 'J' },
  { id: 5, label: 'V' },
  { id: 6, label: 'S' },
  { id: 0, label: 'D' },
] as const

export const MEAL_ICONS: Record<string, string> = {
  desayuno: '☀️',
  almuerzo: '🍽️',
  cena:     '🌙',
  snack:    '🍎',
}

export const MEAL_QUICK_TIMES = [['07', '00'], ['12', '00'], ['15', '00'], ['20', '00']]
export const WORKOUT_QUICK_TIMES = [['06', '00'], ['07', '00'], ['08', '00'], ['18', '00']]
export const PAUSE_INTERVALS = ['25', '30', '45', '60'] as const

// ── Clamps de hora y minuto ───────────────────────────────────────────────────

/** Formatea el input de hora a "HH" válido (00–23); entradas no numéricas → "00". */
export function clampHour(val: string): string {
  const n = parseInt(val)
  if (isNaN(n)) return '00'
  return String(Math.min(23, Math.max(0, n))).padStart(2, '0')
}

/** Formatea el input de minutos a "MM" válido (00–59); entradas no numéricas → "00". */
export function clampMinute(val: string): string {
  const n = parseInt(val)
  if (isNaN(n)) return '00'
  return String(Math.min(59, Math.max(0, n))).padStart(2, '0')
}

/** Hora numérica clampada a 0–23; entradas no numéricas → 0. */
export function parseHour(val: string): number {
  return Math.min(23, Math.max(0, parseInt(val) || 0))
}

/** Minuto numérico clampado a 0–59; entradas no numéricas → 0. */
export function parseMinute(val: string): number {
  return Math.min(59, Math.max(0, parseInt(val) || 0))
}

/** Intervalo de pausas en minutos: mínimo 5, no numérico → 25. */
export function clampPauseInterval(val: string): number {
  return Math.max(5, parseInt(val) || 25)
}

// ── Pausas activas ────────────────────────────────────────────────────────────

/**
 * Expande la ventana laboral [startHour, endHour) en huecos de pausa cada
 * `intervalMinutes`, saltando el primer hueco (startHour:00) — la jornada
 * empieza trabajando, no en pausa. Rango inválido (start >= end) → [].
 */
export function buildPauseSlots(
  startHour: number,
  endHour: number,
  intervalMinutes: number,
): Array<{ hour: number; minute: number }> {
  const slots: Array<{ hour: number; minute: number }> = []
  if (intervalMinutes <= 0) return slots
  for (let hr = startHour; hr < endHour; hr++) {
    for (let mn = 0; mn < 60; mn += intervalMinutes) {
      if (hr === startHour && mn === 0) continue
      slots.push({ hour: hr, minute: mn })
    }
  }
  return slots
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export type ReminderTimelineType = 'meal' | 'workout' | 'pause'

/** Entrada estructural del timeline, sin etiquetas i18n (las añade el hook). */
export interface ReminderTimelineEntry {
  /** Id prefijado: `meal-<pbId>` | `workout-<pbId>`. */
  id: string
  type: ReminderTimelineType
  hour: number
  minute: number
  days: number[]
  enabled: boolean
  mealType?: string
}

/** Quita el prefijo `meal-`/`workout-` para recuperar el id de PocketBase. */
export function rawReminderId(timelineId: string): string {
  return timelineId.replace(/^(meal|workout)-/, '')
}

/**
 * Fusiona recordatorios de comida y entrenamiento (workout + pause) en un
 * timeline único ordenado por hora del día.
 */
export function buildReminderTimeline(
  mealReminders: MealReminder[],
  workoutReminders: WorkoutReminder[],
): ReminderTimelineEntry[] {
  const items: ReminderTimelineEntry[] = []

  mealReminders.forEach(r => {
    items.push({
      id: `meal-${r.id}`,
      type: 'meal',
      hour: r.hour,
      minute: r.minute,
      days: r.daysOfWeek,
      enabled: r.enabled,
      mealType: r.mealType,
    })
  })

  workoutReminders.forEach(r => {
    items.push({
      id: `workout-${r.id}`,
      type: r.reminderType === 'pause' ? 'pause' : 'workout',
      hour: r.hour,
      minute: r.minute,
      days: r.daysOfWeek,
      enabled: r.enabled,
    })
  })

  items.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  return items
}

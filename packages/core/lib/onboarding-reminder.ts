/**
 * Recordatorio por defecto del onboarding (#695).
 *
 * El onboarding pregunta «¿a qué hora sueles entrenar?» y deja programado un
 * `workout_reminders` en esa hora los días que el usuario marcó en el paso de
 * entrenamiento. Sin esto no existía ningún gancho que trajera de vuelta a un
 * usuario de día 0: el recordatorio había que descubrirlo en ajustes.
 *
 * Lógica pura compartida por web y móvil; la escritura la hace
 * `useWorkoutReminders().saveReminder` y la entrega el dispatcher del servidor
 * (`mcp-server/src/api/reminder-dispatcher.ts`), que ya respeta la zona horaria.
 */

import type { DayId } from '../types/onboarding'

export type TrainingTimePresetId = 'morning' | 'midday' | 'afternoon' | 'evening'

export interface TrainingTimePreset {
  id: TrainingTimePresetId
  hour: number
  minute: number
  /** Clave i18n de la etiqueta (`onboarding.reminderMorning`, …). */
  labelKey: string
}

export const TRAINING_TIME_PRESETS: readonly TrainingTimePreset[] = [
  { id: 'morning', hour: 7, minute: 0, labelKey: 'onboarding.reminderMorning' },
  { id: 'midday', hour: 12, minute: 30, labelKey: 'onboarding.reminderMidday' },
  { id: 'afternoon', hour: 18, minute: 0, labelKey: 'onboarding.reminderAfternoon' },
  { id: 'evening', hour: 20, minute: 30, labelKey: 'onboarding.reminderEvening' },
]

/** Preset seleccionado por defecto: la tarde es la franja más habitual. */
export const DEFAULT_TRAINING_TIME_PRESET: TrainingTimePresetId = 'afternoon'

/** Lunes a viernes en índice JS (0 = domingo), lo que guarda `workout_reminders.days_of_week`. */
export const DEFAULT_REMINDER_DAYS: readonly number[] = [1, 2, 3, 4, 5]

// El onboarding guarda `training_days` con los ids en inglés de
// `types/onboarding.ts` (`mon`…`sun`); los programas usan `lun`…`dom`
// (`lib/program-day-ids.ts`). Se aceptan los dos para no depender de cuál llega.
const DAY_ID_TO_JS_WEEKDAY: Record<DayId, number> & Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0,
  lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 0,
}

/**
 * Días del recordatorio a partir de los días de entrenamiento del onboarding
 * (`mon`…`sun`). Sin días marcados —el paso se saltó o el perfil ya existía—
 * cae a lunes-viernes. Ignora ids desconocidos y devuelve orden estable.
 */
export function reminderDaysFromTraining(trainingDays: readonly string[] | null | undefined): number[] {
  const days = (trainingDays ?? [])
    .map((id) => DAY_ID_TO_JS_WEEKDAY[id])
    .filter((d): d is number => typeof d === 'number')
  const unique = Array.from(new Set(days)).sort((a, b) => a - b)
  return unique.length > 0 ? unique : [...DEFAULT_REMINDER_DAYS]
}

export function findTrainingTimePreset(id: string | null | undefined): TrainingTimePreset {
  return TRAINING_TIME_PRESETS.find((p) => p.id === id)
    ?? TRAINING_TIME_PRESETS.find((p) => p.id === DEFAULT_TRAINING_TIME_PRESET)!
}

/** `7:5` → `07:05`, para las etiquetas de los chips y el tracking. */
export function formatReminderTime(hour: number, minute: number): string {
  const h = String(Math.max(0, Math.min(23, Math.trunc(hour)))).padStart(2, '0')
  const m = String(Math.max(0, Math.min(59, Math.trunc(minute)))).padStart(2, '0')
  return `${h}:${m}`
}

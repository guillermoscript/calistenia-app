/**
 * Datos para el copy de priming de `PushPermissionCard` (#815).
 *
 * La tarjeta ya no promete «activa las notificaciones» en genérico: usa el
 * recordatorio que el usuario ya guardó en el paso de onboarding (hora +
 * días) para prometer un beneficio concreto («1 aviso los días que
 * entrenas, a las 19:00»). El cálculo —normalizar `daysOfWeek` a las claves
 * `dayShort.N` de i18n— es idéntico en web y móvil, así que vive aquí como
 * función pura; el `t()` y el join de los nombres de día los hace cada app
 * (sin dependencias de i18n en core). No toca `push-prompt.ts`: eso decide
 * SI se muestra la tarjeta, esto decide QUÉ dice.
 */
import { formatReminderTime } from './onboarding-reminder'

export interface ReminderScheduleInput {
  hour: number
  minute: number
  /**
   * `workout_reminders.days_of_week` tal y como lo guarda cada pantalla: el
   * onboarding usa 0=domingo..6=sábado (`reminderDaysFromTraining`, el mismo
   * `Date.getDay()` de JS), mientras que Ajustes > Recordatorios usa
   * 1=lunes..7=domingo. Coinciden de lunes(1) a sábado(6); solo el domingo
   * cambia (0 o 7) — se normalizan los dos.
   */
  daysOfWeek: readonly number[]
}

export interface ReminderScheduleSummary {
  /** `HH:MM`, ya formateado. */
  time: string
  /** Índices 0=lunes..6=domingo, listos para `t(\`dayShort.${i}\`)`. Sin duplicados, ordenados. */
  dayShortIndexes: number[]
  /** `true` cuando el recordatorio cubre los 7 días (copy «cada día» en vez de listarlos). */
  isEveryDay: boolean
}

/**
 * `null` cuando no hay recordatorio guardado (el usuario saltó el paso) o
 * no tiene ningún día válido — la tarjeta cae al copy genérico en ese caso.
 */
export function summarizeReminderSchedule(
  input: ReminderScheduleInput | null | undefined,
): ReminderScheduleSummary | null {
  if (!input) return null
  const dayShortIndexes = Array.from(new Set(input.daysOfWeek))
    .filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 7)
    .map((d) => (d === 0 || d === 7 ? 6 : d - 1))
    .sort((a, b) => a - b)
  if (dayShortIndexes.length === 0) return null
  return {
    time: formatReminderTime(input.hour, input.minute),
    dayShortIndexes,
    isEveryDay: dayShortIndexes.length === 7,
  }
}

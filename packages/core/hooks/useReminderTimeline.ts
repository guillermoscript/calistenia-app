import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useMealReminders } from './useMealReminders'
import { useWorkoutReminders } from './useWorkoutReminders'
import {
  MEAL_ICONS,
  REMINDER_DAYS,
  REMINDER_DAY_KEYS,
  buildPauseSlots,
  buildReminderTimeline,
  rawReminderId,
  type ReminderTimelineEntry,
} from '../lib/reminders'

export interface ReminderTimelineItem extends ReminderTimelineEntry {
  label: string
  subLabel?: string
}

export interface ReminderDayLabel {
  id: number
  label: string
  full: string
}

/**
 * Timeline unificado de recordatorios (comidas + entrenamientos + pausas).
 *
 * Envuelve useMealReminders/useWorkoutReminders y concentra la orquestación
 * que web y móvil duplicaban: etiquetas i18n de días y comidas, timeline
 * ordenado con etiquetas, contadores por tipo, expansión de la ventana de
 * pausas y el despacho meal/workout según el prefijo del id del item.
 * Las pantallas quedan como vistas: estilos, formularios y detalles de
 * plataforma (push web / token Expo, haptics) siguen en cada app.
 */
export function useReminderTimeline(userId: string | null) {
  const { t } = useTranslation()

  const {
    reminders: mealReminders,
    saveReminder: saveMealReminder,
    updateReminder: updateMealReminder,
    toggleReminder: toggleMealReminder,
    deleteReminder: deleteMealReminder,
  } = useMealReminders(userId)

  const {
    reminders: workoutReminders,
    saveReminder: saveWorkoutReminder,
    updateReminder: updateWorkoutReminder,
    toggleReminder: toggleWorkoutReminder,
    deleteReminder: deleteWorkoutReminder,
  } = useWorkoutReminders(userId)

  // ── Etiquetas i18n ────────────────────────────────────────────────────────

  const dayLabels = useMemo(
    (): ReminderDayLabel[] =>
      REMINDER_DAYS.map((d, i) => ({ ...d, full: t(`day.${REMINDER_DAY_KEYS[i]}`) })),
    [t],
  )

  const mealMeta = useMemo(
    () => ({
      desayuno: { icon: MEAL_ICONS.desayuno, label: t('meal.desayuno') },
      almuerzo: { icon: MEAL_ICONS.almuerzo, label: t('meal.almuerzo') },
      cena:     { icon: MEAL_ICONS.cena,     label: t('meal.cena') },
      snack:    { icon: MEAL_ICONS.snack,    label: t('meal.snack') },
    } as Record<string, { icon: string; label: string }>),
    [t],
  )

  // ── Timeline ordenado con etiquetas ───────────────────────────────────────

  const timeline = useMemo(
    (): ReminderTimelineItem[] =>
      buildReminderTimeline(mealReminders, workoutReminders).map(entry => {
        if (entry.type === 'meal') {
          const meta = mealMeta[entry.mealType ?? ''] ?? mealMeta.almuerzo
          return { ...entry, label: meta.label, subLabel: meta.icon }
        }
        if (entry.type === 'pause') {
          return { ...entry, label: t('reminders.pauseType'), subLabel: '🧘' }
        }
        return { ...entry, label: t('reminders.workoutType') }
      }),
    [mealReminders, workoutReminders, mealMeta, t],
  )

  const counts = useMemo(
    () => ({
      meals: mealReminders.length,
      workouts: workoutReminders.filter(r => r.reminderType !== 'pause').length,
      pauses: workoutReminders.filter(r => r.reminderType === 'pause').length,
    }),
    [mealReminders, workoutReminders],
  )

  // ── Handlers unificados (despachan por tipo según el prefijo del id) ──────

  const updateItem = useCallback(
    async (item: ReminderTimelineItem, hour: number, minute: number, days: number[]) => {
      const rawId = rawReminderId(item.id)
      if (item.type === 'meal') {
        await updateMealReminder(rawId, hour, minute, days)
      } else {
        await updateWorkoutReminder(rawId, hour, minute, days)
      }
    },
    [updateMealReminder, updateWorkoutReminder],
  )

  const toggleItem = useCallback(
    async (item: ReminderTimelineItem) => {
      const rawId = rawReminderId(item.id)
      if (item.type === 'meal') {
        await toggleMealReminder(rawId, !item.enabled)
      } else {
        await toggleWorkoutReminder(rawId)
      }
    },
    [toggleMealReminder, toggleWorkoutReminder],
  )

  const deleteItem = useCallback(
    async (item: ReminderTimelineItem) => {
      const rawId = rawReminderId(item.id)
      if (item.type === 'meal') {
        await deleteMealReminder(rawId)
      } else {
        await deleteWorkoutReminder(rawId)
      }
    },
    [deleteMealReminder, deleteWorkoutReminder],
  )

  /** Crea un recordatorio de pausa por cada hueco de la ventana laboral. */
  const savePauseSlots = useCallback(
    async (startHour: number, endHour: number, intervalMinutes: number, days: number[]) => {
      for (const slot of buildPauseSlots(startHour, endHour, intervalMinutes)) {
        await saveWorkoutReminder(slot.hour, slot.minute, days, 'pause')
      }
    },
    [saveWorkoutReminder],
  )

  return {
    timeline,
    counts,
    dayLabels,
    mealMeta,
    mealReminders,
    workoutReminders,
    saveMealReminder,
    saveWorkoutReminder,
    savePauseSlots,
    updateItem,
    toggleItem,
    deleteItem,
  }
}

/**
 * reminder-scheduler.ts
 *
 * Programa recordatorios OS-level de comidas y entrenamientos usando
 * expo-notifications con triggers de calendario (CALENDAR). Reemplaza
 * el setTimeout/ServiceWorker scheduler de la web, que no funciona en RN.
 *
 * Limitación iOS: el SO solo permite 64 notificaciones locales programadas
 * por app. Para no silenciar silenciosamente las últimas, limitamos a 60
 * y avisamos por consola si se descartan entradas.
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import i18n from './i18n'
import type { MealReminder } from '@calistenia/core/types'
import type { WorkoutReminder } from '@calistenia/core/hooks/useWorkoutReminders'

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export type ReminderPermStatus = 'granted' | 'denied' | 'undetermined'

// ─── Canal Android ───────────────────────────────────────────────────────────

const CHANNEL_ID = 'reminders'

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Recordatorios',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
  })
}

// ─── Permisos ────────────────────────────────────────────────────────────────

/** Consulta el estado actual del permiso sin solicitarlo. */
export async function getReminderPermission(): Promise<ReminderPermStatus> {
  try {
    const { granted, canAskAgain, status } = await Notifications.getPermissionsAsync()
    if (granted) return 'granted'
    if (!canAskAgain && status === 'denied') return 'denied'
    return 'undetermined'
  } catch {
    return 'undetermined'
  }
}

/**
 * Crea el canal Android (si aplica) y solicita permiso si aún no fue
 * concedido. Retorna true si el permiso queda concedido.
 */
export async function ensureReminderPermission(): Promise<boolean> {
  try {
    await ensureAndroidChannel()
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    const res = await Notifications.requestPermissionsAsync()
    return res.granted
  } catch {
    return false
  }
}

// ─── Helpers de i18n ─────────────────────────────────────────────────────────

function t(key: string, fallbackKey?: string): string {
  const value = i18n.t(key)
  // Si i18next retorna la clave sin traducir, usar el fallback
  if (fallbackKey && value === key) return i18n.t(fallbackKey)
  return value
}

// ─── Helpers de contenido ────────────────────────────────────────────────────

interface NotifContent {
  title: string
  body: string
  kind: 'meal' | 'workout' | 'pause'
}

function mealContent(mealType: MealReminder['mealType']): NotifContent {
  return {
    title: t(`reminder.meal.${mealType}`, 'reminder.meal.fallback'),
    body: t('reminder.meal.body'),
    kind: 'meal',
  }
}

function workoutContent(reminderType: WorkoutReminder['reminderType']): NotifContent {
  if (reminderType === 'pause') {
    return {
      title: t('reminder.pause.title'),
      body: t('reminder.pause.body'),
      kind: 'pause',
    }
  }
  return {
    title: t('reminder.workout.title'),
    body: t('reminder.workout.body'),
    kind: 'workout',
  }
}

// ─── Entrada interna para programar ─────────────────────────────────────────

interface ScheduleEntry {
  /** daysOfWeek en convención JS: 0=Dom..6=Sab */
  jsDay: number
  hour: number
  minute: number
  content: NotifContent
  /** id lógico del reminder de origen (para el campo data) */
  reminderId: string | undefined
}

// ─── Sincronización principal ─────────────────────────────────────────────────

/**
 * Cancela TODAS las notificaciones con `data.source === 'reminder'` y luego
 * reprograma las que estén habilitadas. Si el permiso no está concedido solo
 * se ejecuta la cancelación (para respetar desactivaciones).
 */
export async function syncReminders(
  meals: MealReminder[],
  workouts: WorkoutReminder[],
): Promise<void> {
  try {
    // ── 1. Cancelar recordatorios existentes ───────────────────────────────
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    await Promise.all(
      scheduled
        .filter((n) => n.content.data?.source === 'reminder')
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    )

    // ── 2. Verificar permiso antes de programar ────────────────────────────
    const { granted } = await Notifications.getPermissionsAsync()
    if (!granted) return

    // ── 3. Construir lista de entradas a programar ─────────────────────────
    const entries: ScheduleEntry[] = []

    for (const meal of meals) {
      if (!meal.enabled) continue
      for (const jsDay of meal.daysOfWeek) {
        entries.push({
          jsDay,
          hour: meal.hour,
          minute: meal.minute,
          content: mealContent(meal.mealType),
          reminderId: meal.id,
        })
      }
    }

    for (const workout of workouts) {
      if (!workout.enabled) continue
      for (const jsDay of workout.daysOfWeek) {
        entries.push({
          jsDay,
          hour: workout.hour,
          minute: workout.minute,
          content: workoutContent(workout.reminderType),
          reminderId: workout.id,
        })
      }
    }

    // ── 4. Cap iOS: máximo 60 notificaciones (límite OS = 64) ─────────────
    // iOS silenciosamente descarta notificaciones programadas más allá de 64;
    // ordenamos por hora/minuto para conservar las más tempranas del día.
    const IOS_CAP = 60
    let toSchedule = entries.sort((a, b) => a.hour - b.hour || a.minute - b.minute)
    if (toSchedule.length > IOS_CAP) {
      const dropped = toSchedule.length - IOS_CAP
      console.warn(
        `[reminder-scheduler] Se descartaron ${dropped} recordatorio(s) por el límite de ${IOS_CAP} notificaciones de iOS.`,
      )
      toSchedule = toSchedule.slice(0, IOS_CAP)
    }

    // ── 5. Programar cada entrada ──────────────────────────────────────────
    // expo-notifications usa weekday 1=Dom..7=Sab (igual que Calendar de iOS/Android).
    // MealReminder.daysOfWeek: convención JS 0=Dom..6=Sab → expoWeekday = jsDay + 1.
    // WorkoutReminder.daysOfWeek sigue la misma fórmula según la especificación.
    await Promise.all(
      toSchedule.map((entry) =>
        Notifications.scheduleNotificationAsync({
          content: {
            title: entry.content.title,
            body: entry.content.body,
            sound: 'default',
            data: {
              source: 'reminder',
              kind: entry.content.kind,
              id: entry.reminderId,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            weekday: entry.jsDay + 1,
            hour: entry.hour,
            minute: entry.minute,
            repeats: true,
            channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
          },
        }).catch((err) => {
          // Best-effort: loguear pero no romper el resto
          console.warn('[reminder-scheduler] Error programando notificación:', err)
        }),
      ),
    )
  } catch (err) {
    // Nunca lanzar hacia arriba — la falla de scheduling es silenciosa
    console.warn('[reminder-scheduler] syncReminders error:', err)
  }
}

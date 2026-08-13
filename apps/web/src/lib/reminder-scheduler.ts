/**
 * Reminder notification scheduler — LEGADO, solo se usa para LIMPIAR.
 *
 * La entrega de recordatorios la hace el servidor
 * (`mcp-server/src/api/reminder-dispatcher.ts` → Web Push): es lo único que
 * llega con la pestaña cerrada, y es donde se aplica la zona horaria del
 * usuario. `RemindersPage` solo llama a `cancelAllScheduled()`.
 *
 * NO vuelvas a llamar a `scheduleAll()` / `setupVisibilityRescheduler()`: con
 * el dispatcher activo, cada recordatorio sonaría DOS veces (la notificación
 * local de esta pestaña + el push del servidor). Se conservan porque
 * `cancelAllScheduled()` reutiliza sus estructuras de timers y el mensaje al
 * service worker.
 */

import { localDay, localMinutesSinceMidnight } from '@calistenia/core/lib/dateUtils'
import i18n from './i18n'

interface SchedulableReminder {
  id: string
  type: 'meal' | 'workout' | 'pause'
  hour: number
  minute: number
  daysOfWeek: number[]
  enabled: boolean
  label: string
}

function getMealLabel(mealType: string): string {
  return i18n.t(`reminder.meal.${mealType}`, { defaultValue: i18n.t('reminder.meal.fallback') })
}

// Track active timeouts so we can clear them
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>()
let checkInterval: ReturnType<typeof setInterval> | null = null
let currentReminders: SchedulableReminder[] = []

function isTodayIncluded(daysOfWeek: number[] | string): boolean {
  const jsDay = localDay()
  const days = typeof daysOfWeek === 'string'
    ? ((): number[] => { try { return JSON.parse(daysOfWeek) } catch { return [] } })()
    : daysOfWeek
  return Array.isArray(days) && days.includes(jsDay)
}

function getDelayMs(hour: number, minute: number): number {
  const targetMinutes = hour * 60 + minute
  const nowMinutes = localMinutesSinceMidnight()
  return (targetMinutes - nowMinutes) * 60 * 1000
}

async function fireNotification(reminder: SchedulableReminder): Promise<void> {
  const titles: Record<string, string> = {
    meal: reminder.label,
    workout: i18n.t('reminder.workout.title'),
    pause: i18n.t('reminder.pause.title'),
  }
  const bodies: Record<string, string> = {
    meal: i18n.t('reminder.meal.body'),
    workout: i18n.t('reminder.workout.body'),
    pause: i18n.t('reminder.pause.body'),
  }
  const urls: Record<string, string> = {
    meal: '/nutrition',
    workout: '/workout',
    pause: '/workout',
  }
  const title = titles[reminder.type] || titles.workout
  const body = bodies[reminder.type] || bodies.workout
  const tag = `${reminder.type}-reminder-${reminder.id}`
  const url = urls[reminder.type] || '/workout'

  const options: NotificationOptions & { data?: any; vibrate?: number[] } = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag,
    data: { url },
    vibrate: [200, 100, 200],
    requireInteraction: true,
  }

  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg) {
      await reg.showNotification(title, options)
      return
    }
  } catch { /* fallback */ }

  try {
    new Notification(title, options)
  } catch { /* unsupported */ }
}

function scheduleOne(reminder: SchedulableReminder): void {
  // Clear existing timer for this reminder
  const existing = activeTimers.get(reminder.id)
  if (existing) clearTimeout(existing)

  if (!reminder.enabled) return
  if (!isTodayIncluded(reminder.daysOfWeek)) return

  const delay = getDelayMs(reminder.hour, reminder.minute)

  // Only schedule if it's in the future and within 24h
  if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
    const timer = setTimeout(() => {
      fireNotification(reminder)
      activeTimers.delete(reminder.id)
    }, delay)
    activeTimers.set(reminder.id, timer)
  }
}

/**
 * Periodic check — runs every 60s as a safety net.
 * Catches reminders that were missed because setTimeout was frozen
 * (mobile browsers throttle background tabs).
 */
function startPeriodicCheck(): void {
  if (checkInterval) return

  let lastCheckMinute = -1

  checkInterval = setInterval(() => {
    const now = new Date()
    const currentMinute = now.getHours() * 60 + now.getMinutes()

    // Only fire once per minute
    if (currentMinute === lastCheckMinute) return
    lastCheckMinute = currentMinute

    for (const reminder of currentReminders) {
      if (!reminder.enabled) continue
      if (!isTodayIncluded(reminder.daysOfWeek)) continue

      const reminderMinute = reminder.hour * 60 + reminder.minute
      // Fire if we're within 1 minute of the target (catches frozen timers)
      if (currentMinute === reminderMinute) {
        // Check if the setTimeout already fired (timer would be deleted)
        if (!activeTimers.has(reminder.id)) {
          fireNotification(reminder)
        }
      }
    }
  }, 30_000) // Check every 30 seconds
}

function stopPeriodicCheck(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

/**
 * Post the reminder schedule to the service worker so it can fire
 * notifications even when the page is backgrounded on mobile.
 */
async function postToServiceWorker(reminders: SchedulableReminder[]): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg?.active) {
      reg.active.postMessage({
        type: 'SCHEDULE_REMINDERS',
        reminders: reminders.map(r => ({
          id: r.id,
          type: r.type,
          hour: r.hour,
          minute: r.minute,
          daysOfWeek: r.daysOfWeek,
          enabled: r.enabled,
          label: r.label,
        })),
      })
    }
  } catch { /* SW not available — page-level timers are the fallback */ }
}

/**
 * Schedule all reminders. Call on app load and when reminders change.
 */
export function scheduleAll(reminders: SchedulableReminder[]): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  currentReminders = reminders

  // Clear all existing timers
  for (const timer of activeTimers.values()) clearTimeout(timer)
  activeTimers.clear()

  // Schedule each reminder (page-level fallback)
  for (const r of reminders) {
    scheduleOne(r)
  }

  // Start the periodic safety net
  if (reminders.some(r => r.enabled)) {
    startPeriodicCheck()
  } else {
    stopPeriodicCheck()
  }

  // Also post to service worker for mobile background reliability
  postToServiceWorker(reminders)
}

/**
 * Cancel every locally-scheduled reminder: page timers, the periodic safety
 * net, and the copy held by the service worker.
 *
 * Reminders are delivered by the server now
 * (`mcp-server/src/api/reminder-dispatcher.ts` → Web Push), which is the only
 * path that works with the tab closed. Anything still scheduled locally would
 * fire a *second* notification for the same reminder, so this clears whatever a
 * previous version of the app left behind.
 */
export function cancelAllScheduled(): void {
  for (const timer of activeTimers.values()) clearTimeout(timer)
  activeTimers.clear()
  currentReminders = []
  stopPeriodicCheck()
  // An empty list makes the SW clear its own timers and interval.
  postToServiceWorker([])
}

/**
 * Build SchedulableReminder array from raw meal + workout data.
 */
export function buildSchedulableReminders(
  mealReminders: Array<{ id?: string; mealType: string; hour: number; minute: number; daysOfWeek: number[]; enabled: boolean }>,
  workoutReminders: Array<{ id: string; hour: number; minute: number; daysOfWeek: number[]; enabled: boolean; reminderType?: string }>,
): SchedulableReminder[] {
  const items: SchedulableReminder[] = []

  for (const r of mealReminders) {
    if (!r.id) continue
    items.push({
      id: `meal-${r.id}`,
      type: 'meal',
      hour: r.hour,
      minute: r.minute,
      daysOfWeek: r.daysOfWeek,
      enabled: r.enabled,
      label: getMealLabel(r.mealType),
    })
  }

  for (const r of workoutReminders) {
    const isPause = r.reminderType === 'pause'
    items.push({
      id: `workout-${r.id}`,
      type: isPause ? 'pause' : 'workout',
      hour: r.hour,
      minute: r.minute,
      daysOfWeek: r.daysOfWeek,
      enabled: r.enabled,
      label: isPause ? i18n.t('reminder.pause.title') : i18n.t('reminder.workout.title'),
    })
  }

  return items
}

/**
 * Set up visibility change listener to re-schedule when user returns to app.
 * Call once on app init.
 */
export function setupVisibilityRescheduler(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentReminders.length > 0) {
      scheduleAll(currentReminders)
    }
  })
}

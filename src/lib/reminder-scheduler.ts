/**
 * Reminder notification scheduler.
 *
 * Schedules local notifications for meal and workout reminders using
 * setTimeout + a periodic check as fallback. Uses Service Worker
 * showNotification when available for better background support.
 *
 * Call `scheduleAll()` on app load and whenever reminders change.
 * Automatically re-schedules on visibility change (tab refocus).
 */

import { localDay, localMinutesSinceMidnight } from './dateUtils'

interface SchedulableReminder {
  id: string
  type: 'meal' | 'workout' | 'pause'
  hour: number
  minute: number
  daysOfWeek: number[]
  enabled: boolean
  label: string
}

const MEAL_LABELS: Record<string, string> = {
  desayuno: 'Hora del desayuno',
  almuerzo: 'Hora del almuerzo',
  cena: 'Hora de cenar',
  snack: 'Hora del snack',
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
    workout: 'Hora de entrenar!',
    pause: 'Pausa Activa',
  }
  const bodies: Record<string, string> = {
    meal: 'No te saltes esta comida — tu cuerpo lo necesita',
    workout: 'Tu entrenamiento te espera. No pierdas la racha!',
    pause: 'Levántate, estira y muévete — tu cuerpo lo agradece',
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
      label: MEAL_LABELS[r.mealType] || 'Hora de comer',
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
      label: isPause ? 'Pausa Activa' : 'Hora de entrenar!',
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

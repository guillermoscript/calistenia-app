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

interface SchedulableReminder {
  id: string
  type: 'meal' | 'workout'
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
  const jsDay = new Date().getDay() // 0=Sun, 1=Mon...6=Sat
  const days = typeof daysOfWeek === 'string'
    ? ((): number[] => { try { return JSON.parse(daysOfWeek) } catch { return [] } })()
    : daysOfWeek
  return Array.isArray(days) && days.includes(jsDay)
}

function getDelayMs(hour: number, minute: number): number {
  const now = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)
  return target.getTime() - now.getTime()
}

async function fireNotification(reminder: SchedulableReminder): Promise<void> {
  const title = reminder.type === 'meal'
    ? reminder.label
    : 'Hora de entrenar!'
  const body = reminder.type === 'meal'
    ? 'No te saltes esta comida — tu cuerpo lo necesita'
    : 'Tu entrenamiento te espera. No pierdas la racha!'
  const tag = `${reminder.type}-reminder-${reminder.id}`
  const url = reminder.type === 'meal' ? '/nutrition' : '/workout'

  const options: NotificationOptions & { data?: any } = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag,
    data: { url },
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
 * Schedule all reminders. Call on app load and when reminders change.
 */
export function scheduleAll(reminders: SchedulableReminder[]): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  currentReminders = reminders

  // Clear all existing timers
  for (const timer of activeTimers.values()) clearTimeout(timer)
  activeTimers.clear()

  // Schedule each reminder
  for (const r of reminders) {
    scheduleOne(r)
  }

  // Start the periodic safety net
  if (reminders.some(r => r.enabled)) {
    startPeriodicCheck()
  } else {
    stopPeriodicCheck()
  }
}

/**
 * Build SchedulableReminder array from raw meal + workout data.
 */
export function buildSchedulableReminders(
  mealReminders: Array<{ id?: string; mealType: string; hour: number; minute: number; daysOfWeek: number[]; enabled: boolean }>,
  workoutReminders: Array<{ id: string; hour: number; minute: number; daysOfWeek: number[]; enabled: boolean }>,
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
    items.push({
      id: `workout-${r.id}`,
      type: 'workout',
      hour: r.hour,
      minute: r.minute,
      daysOfWeek: r.daysOfWeek,
      enabled: r.enabled,
      label: 'Hora de entrenar!',
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

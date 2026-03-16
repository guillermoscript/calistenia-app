/**
 * Browser Notification helpers for workout events.
 * Uses Service Worker notifications for persistent, interruptive alerts
 * that work even when the browser tab is in the background.
 */

let _permissionGranted: boolean | null = null

async function ensurePermission(): Promise<boolean> {
  if (_permissionGranted !== null) return _permissionGranted
  if (!('Notification' in window)) { _permissionGranted = false; return false }
  if (Notification.permission === 'granted') { _permissionGranted = true; return true }
  if (Notification.permission === 'denied') { _permissionGranted = false; return false }
  const result = await Notification.requestPermission()
  _permissionGranted = result === 'granted'
  return _permissionGranted
}

interface NotifyOptions {
  title: string
  body: string
  tag: string
  /** If true, notification persists until user interacts with it */
  requireInteraction?: boolean
  /** Vibration pattern in ms [vibrate, pause, vibrate, ...] */
  vibrate?: number[]
  /** If true, show even when the tab is focused */
  urgent?: boolean
}

async function send(opts: NotifyOptions): Promise<void> {
  if (!(await ensurePermission())) return

  // For non-urgent notifications, skip if tab is focused (in-app sounds suffice)
  if (!opts.urgent && document.visibilityState === 'visible') return

  const notifOptions: NotificationOptions = {
    body: opts.body,
    tag: opts.tag,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    requireInteraction: opts.requireInteraction ?? false,
    silent: false,
    vibrate: opts.vibrate,
  }

  try {
    // Prefer Service Worker notification — works in background & supports actions
    const reg = await navigator.serviceWorker?.ready
    if (reg) {
      await reg.showNotification(opts.title, notifOptions)
    } else {
      new Notification(opts.title, notifOptions)
    }
  } catch {
    // Fallback to basic notification
    try {
      new Notification(opts.title, { body: opts.body, tag: opts.tag, icon: '/icons/icon-192.svg' })
    } catch {}
  }
}

/** Request permission proactively (call on session start) */
export async function requestPermission(): Promise<boolean> {
  return ensurePermission()
}

/** Rest period started */
export function notifyRestStart(seconds: number, nextExercise?: string): void {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const time = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${seconds}s`
  send({
    title: `Descanso — ${time}`,
    body: nextExercise ? `Siguiente: ${nextExercise}` : 'Descansa y prepárate',
    tag: 'rest-start',
  })
}

/** Rest is about to end — this one is urgent, always show */
export function notifyRestEnding(secondsLeft: number): void {
  send({
    title: `¡${secondsLeft} segundos!`,
    body: 'Prepárate para el siguiente ejercicio',
    tag: 'rest-warning',
    urgent: true,
    vibrate: [200, 100, 200],
  })
}

/** Rest ended — urgent, must interrupt */
export function notifyRestDone(exerciseName: string, setNumber: number, totalSets: number): void {
  send({
    title: '¡A entrenar!',
    body: `${exerciseName} — Serie ${setNumber}/${totalSets}`,
    tag: 'rest-done',
    urgent: true,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300],
  })
}

/** Set completed */
export function notifySetComplete(exerciseName: string, setNumber: number, totalSets: number, setsRemaining: number): void {
  if (setsRemaining > 0) {
    send({
      title: `Serie ${setNumber}/${totalSets} ✓`,
      body: `${exerciseName} — Quedan ${setsRemaining} series`,
      tag: 'set-complete',
    })
  }
}

/** Session completed — urgent, celebrate */
export function notifySessionComplete(workoutTitle: string, totalSets: number): void {
  send({
    title: '¡Sesión completada! 💪',
    body: `${workoutTitle} — ${totalSets} series registradas`,
    tag: 'session-complete',
    urgent: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 400],
  })
}

/** Timed exercise finished — urgent, must interrupt */
export function notifyTimerDone(exerciseName: string): void {
  send({
    title: 'Tiempo cumplido ✓',
    body: exerciseName,
    tag: 'timer-done',
    urgent: true,
    requireInteraction: true,
    vibrate: [300, 100, 300],
  })
}

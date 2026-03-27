/**
 * Browser Notification helpers for workout events.
 * Uses Service Worker notifications for persistent, interruptive alerts
 * that work even when the browser tab is in the background.
 */

import i18n from './i18n'

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

  const notifOptions: NotificationOptions & { vibrate?: number[] } = {
    body: opts.body,
    tag: opts.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
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
      new Notification(opts.title, { body: opts.body, tag: opts.tag, icon: '/icons/icon-192.png' })
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
    title: i18n.t('notify.restStart', { time }),
    body: nextExercise ? i18n.t('notify.nextExercise', { name: nextExercise }) : i18n.t('notify.restAndPrepare'),
    tag: 'rest-start',
  })
}

/** Rest is about to end — this one is urgent, always show */
export function notifyRestEnding(secondsLeft: number): void {
  send({
    title: i18n.t('notify.secondsLeft', { count: secondsLeft }),
    body: i18n.t('notify.prepareForNext'),
    tag: 'rest-warning',
    urgent: true,
    vibrate: [200, 100, 200],
  })
}

/** Rest ended — urgent, must interrupt */
export function notifyRestDone(exerciseName: string, setNumber: number, totalSets: number): void {
  send({
    title: i18n.t('notify.letsGo'),
    body: `${exerciseName} — ${i18n.t('notify.setOf', { set: setNumber, total: totalSets })}`,
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
      title: i18n.t('notify.setComplete', { set: setNumber, total: totalSets }),
      body: `${exerciseName} — ${i18n.t('notify.setsRemaining', { count: setsRemaining })}`,
      tag: 'set-complete',
    })
  }
}

/** Session completed — urgent, celebrate */
export function notifySessionComplete(workoutTitle: string, totalSets: number): void {
  send({
    title: i18n.t('notify.sessionComplete'),
    body: i18n.t('notify.sessionCompleteBody', { title: workoutTitle, sets: totalSets }),
    tag: 'session-complete',
    urgent: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 400],
  })
}

/** Timed exercise finished — urgent, must interrupt */
export function notifyTimerDone(exerciseName: string): void {
  send({
    title: i18n.t('notify.timerDone'),
    body: exerciseName,
    tag: 'timer-done',
    urgent: true,
    requireInteraction: true,
    vibrate: [300, 100, 300],
  })
}

// ── Social notifications ─────────────────────────────────────────────────────

/** Someone reacted to your workout */
export function notifyReaction(reactorName: string, workoutTitle: string): void {
  send({
    title: `🔥 ${reactorName}`,
    body: i18n.t('notify.reactionBody', { title: workoutTitle }),
    tag: `reaction-${reactorName}`,
    urgent: true,
  })
}

/** A friend completed a workout */
export function notifyFriendWorkout(friendName: string, workoutTitle: string): void {
  send({
    title: i18n.t('notify.friendWorkout', { name: friendName }),
    body: workoutTitle,
    tag: `friend-workout-${friendName}`,
  })
}

/** Someone beat your PR */
export function notifyPRBeaten(friendName: string, prLabel: string, newValue: number, yourValue: number): void {
  send({
    title: i18n.t('notify.prBeaten', { name: friendName }),
    body: `${prLabel}: ${newValue} (${i18n.t('notify.yours')}: ${yourValue})`,
    tag: `pr-beaten-${prLabel}`,
    urgent: true,
    vibrate: [200, 100, 200],
  })
}

/**
 * Browser Notification helpers for workout events.
 * Requests permission on first use and silently degrades if denied.
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

async function send(title: string, body: string, tag: string): Promise<void> {
  if (!(await ensurePermission())) return
  // Only show if tab is not focused
  if (document.visibilityState === 'visible') return
  try {
    new Notification(title, { body, tag, silent: true, icon: '/favicon.ico' })
  } catch {}
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
  send(
    `Descanso — ${time}`,
    nextExercise ? `Siguiente: ${nextExercise}` : 'Descansa y prepárate',
    'rest-start'
  )
}

/** Rest is about to end */
export function notifyRestEnding(secondsLeft: number): void {
  send(
    `¡${secondsLeft} segundos!`,
    'Prepárate para el siguiente ejercicio',
    'rest-warning'
  )
}

/** Rest ended, next exercise */
export function notifyRestDone(exerciseName: string, setNumber: number, totalSets: number): void {
  send(
    `¡A entrenar!`,
    `${exerciseName} — Serie ${setNumber}/${totalSets}`,
    'rest-done'
  )
}

/** Set completed */
export function notifySetComplete(exerciseName: string, setNumber: number, totalSets: number, setsRemaining: number): void {
  if (setsRemaining > 0) {
    send(
      `Serie ${setNumber}/${totalSets} ✓`,
      `${exerciseName} — Quedan ${setsRemaining} series`,
      'set-complete'
    )
  }
}

/** Session completed */
export function notifySessionComplete(workoutTitle: string, totalSets: number): void {
  send(
    '¡Sesión completada! 💪',
    `${workoutTitle} — ${totalSets} series registradas`,
    'session-complete'
  )
}

/** Timed exercise finished */
export function notifyTimerDone(exerciseName: string): void {
  send(
    `Tiempo cumplido ✓`,
    exerciseName,
    'timer-done'
  )
}

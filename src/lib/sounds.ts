/**
 * Centralized sound system for the workout app.
 * Uses Web Audio API oscillators — no audio files needed.
 */

let _ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)()
  }
  // Resume if suspended (autoplay policy)
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

function tone(
  freq: number,
  startAt: number,
  duration: number,
  gain: number = 0.3,
  type: OscillatorType = 'sine'
): void {
  const ctx = getCtx()
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.connect(g)
  g.connect(ctx.destination)
  o.frequency.value = freq
  o.type = type
  g.gain.setValueAtTime(gain, ctx.currentTime + startAt)
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration)
  o.start(ctx.currentTime + startAt)
  o.stop(ctx.currentTime + startAt + duration)
}

/** Gentle descending chime — rest period starts */
export function playRestStart(): void {
  try {
    tone(660, 0, 0.25, 0.2)
    tone(520, 0.15, 0.3, 0.15)
  } catch {}
}

/** Energetic ascending tones — rest is over, get ready */
export function playGetReady(): void {
  try {
    tone(440, 0, 0.15, 0.25)
    tone(660, 0.12, 0.15, 0.3)
    tone(880, 0.24, 0.25, 0.35)
  } catch {}
}

/** Short tick — countdown 3, 2, 1 */
export function playCountdownTick(): void {
  try {
    tone(1000, 0, 0.08, 0.2)
  } catch {}
}

/** Subtle warning pulse — 10 seconds remaining */
export function playWarning(): void {
  try {
    tone(600, 0, 0.12, 0.15, 'triangle')
    tone(600, 0.15, 0.12, 0.15, 'triangle')
  } catch {}
}

/** Satisfying ding — set logged */
export function playSetComplete(): void {
  try {
    tone(880, 0, 0.12, 0.25)
    tone(1100, 0.08, 0.18, 0.2)
  } catch {}
}

/** Triumphant fanfare — entire session completed */
export function playSessionComplete(): void {
  try {
    tone(523, 0, 0.2, 0.25)     // C
    tone(659, 0.15, 0.2, 0.25)  // E
    tone(784, 0.3, 0.2, 0.3)    // G
    tone(1047, 0.45, 0.4, 0.3)  // C octave
  } catch {}
}

/** Triple beep — timed exercise complete */
export function playTimerComplete(): void {
  try {
    tone(880, 0, 0.15, 0.3)
    tone(880, 0.18, 0.15, 0.3)
    tone(1100, 0.36, 0.25, 0.3)
  } catch {}
}

/** Try to vibrate the device */
export function vibrate(pattern: number | number[] = [100]): void {
  try {
    navigator?.vibrate?.(pattern)
  } catch {}
}

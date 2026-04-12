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
  gain: number = 0.5,
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
    tone(660, 0, 0.3, 0.8, 'triangle')
    tone(520, 0.15, 0.35, 0.7, 'triangle')
  } catch {}
}

/** Energetic ascending tones — rest is over, get ready */
export function playGetReady(): void {
  try {
    tone(440, 0, 0.18, 0.9, 'square')
    tone(660, 0.12, 0.18, 0.95, 'square')
    tone(880, 0.24, 0.3, 1.0, 'square')
  } catch {}
}

/** Short tick — countdown 3, 2, 1 */
export function playCountdownTick(): void {
  try {
    tone(1000, 0, 0.1, 0.8, 'square')
  } catch {}
}

/** Warning pulse — 10 seconds remaining */
export function playWarning(): void {
  try {
    tone(600, 0, 0.15, 0.75, 'triangle')
    tone(600, 0.18, 0.15, 0.75, 'triangle')
  } catch {}
}

/** Satisfying ding — set logged (loud enough for outdoor use) */
export function playSetComplete(): void {
  try {
    tone(880, 0, 0.15, 1.0, 'square')
    tone(1100, 0.1, 0.2, 0.9, 'square')
  } catch {}
}

/** Triumphant fanfare — entire session completed */
export function playSessionComplete(): void {
  try {
    tone(523, 0, 0.25, 0.9, 'square')     // C
    tone(659, 0.15, 0.25, 0.9, 'square')  // E
    tone(784, 0.3, 0.25, 0.95, 'square')  // G
    tone(1047, 0.45, 0.45, 1.0, 'square') // C octave
  } catch {}
}

/** Triple beep — timed exercise complete */
export function playTimerComplete(): void {
  try {
    tone(880, 0, 0.18, 0.9, 'square')
    tone(880, 0.2, 0.18, 0.9, 'square')
    tone(1100, 0.4, 0.3, 0.95, 'square')
  } catch {}
}

/** Upward arpeggio — you moved up in the race leaderboard */
export function playRankUp(): void {
  try {
    tone(660, 0, 0.1, 0.85, 'triangle')
    tone(880, 0.08, 0.15, 0.9, 'triangle')
  } catch {}
}

/** Downward tone — you moved down in the race leaderboard */
export function playRankDown(): void {
  try {
    tone(440, 0, 0.15, 0.7, 'sine')
    tone(330, 0.1, 0.18, 0.7, 'sine')
  } catch {}
}

/** Try to vibrate the device */
export function vibrate(pattern: number | number[] = [100]): void {
  try {
    navigator?.vibrate?.(pattern)
  } catch {}
}

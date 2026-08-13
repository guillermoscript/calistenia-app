/**
 * Máquina de fases del ejercicio por tiempo, como reductor puro.
 *
 * Estaba repartida en cinco `useState` y tres efectos dentro de `TimerScreen`, así que
 * no había forma de comprobar que "pausar desde el 3-2-1" o "repetir desde terminado"
 * hicieran lo correcto sin abrir la app. Al ser una tabla, además, las transiciones
 * imposibles no existen en vez de estar prohibidas a base de `if`s.
 */

export type TimerPhase = 'idle' | 'countdown' | 'running' | 'paused' | 'done'

export type TimerAction =
  /** El usuario arranca: entra en el "prepárate". */
  | 'start'
  /** El 3-2-1 ha terminado. */
  | 'ready'
  | 'pause'
  | 'resume'
  /** Volver a hacerlo desde el principio. */
  | 'repeat'
  | 'reset'
  /** La cuenta atrás llegó a cero. */
  | 'complete'

/** Segundos del "prepárate" previo. */
export const TIMER_PRECOUNT_SECONDS = 3

/** Duración mínima que se puede dejar al ajustar con ±s. */
export const TIMER_MIN_SECONDS = 5

const TRANSITIONS: Readonly<Record<TimerPhase, Readonly<Partial<Record<TimerAction, TimerPhase>>>>> = {
  idle: { start: 'countdown' },
  // Cancelar durante el "prepárate" devuelve a idle: es un arrepentimiento, no una pausa.
  countdown: { ready: 'running', reset: 'idle' },
  running: { pause: 'paused', complete: 'done', reset: 'idle' },
  paused: { resume: 'running', reset: 'idle' },
  done: { repeat: 'countdown', reset: 'idle' },
}

/** La fase resultante, o la misma si la acción no aplica ahí. */
export function nextTimerPhase(phase: TimerPhase, action: TimerAction): TimerPhase {
  return TRANSITIONS[phase][action] ?? phase
}

export function canTimerTransition(phase: TimerPhase, action: TimerAction): boolean {
  return TRANSITIONS[phase][action] !== undefined
}

/** Los ±segundos solo tienen sentido con el crono parado. */
export function canAdjustTimer(phase: TimerPhase): boolean {
  return phase === 'idle' || phase === 'paused'
}

export interface TimerDuration {
  totalSeconds: number
  remainingSeconds: number
}

/**
 * Suma o resta segundos con el crono parado. El restante se mueve con el total pero
 * nunca lo supera (subir el total con el crono a media cuenta no debe "rebobinar"
 * más allá del nuevo total) ni baja de un segundo.
 */
export function adjustTimerSeconds(
  duration: TimerDuration,
  deltaSeconds: number,
  minTotalSeconds = TIMER_MIN_SECONDS,
): TimerDuration {
  const totalSeconds = Math.max(minTotalSeconds, duration.totalSeconds + deltaSeconds)
  const remainingSeconds = Math.max(1, Math.min(totalSeconds, duration.remainingSeconds + deltaSeconds))
  return { totalSeconds, remainingSeconds }
}

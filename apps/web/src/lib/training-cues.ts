/**
 * Traducción de las señales del entreno a sonido y vibración, en web.
 *
 * Gemelo de `apps/mobile/src/lib/training-cues.ts`: los hooks de `@calistenia/core`
 * solo emiten `TrainingCue` y cada plataforma decide cómo suena. Aquí la háptica es
 * `navigator.vibrate` en vez de expo-haptics.
 */
import type { TrainingCue } from '@calistenia/core/lib/countdown'

import * as sounds from './sounds'

export type TrainingCueHandler = (cue: TrainingCue) => void

/**
 * El tic de los últimos segundos no suena con la pestaña de fondo.
 *
 * No es una optimización: la pestaña dormida acumula los tics y al volver suenan de
 * golpe. Lo hacían a mano `RestTimer` y `RestScreen`; el circuito nunca lo hizo, así
 * que solo lo aplica quien ya lo tenía.
 */
function isTabHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

/** Descanso entre series (`RestTimer` y el `RestScreen` de la sesión). */
export const restCues: TrainingCueHandler = (cue) => {
  switch (cue) {
    case 'start':
      sounds.playRestStart()
      break
    case 'warning':
      sounds.playWarning()
      sounds.vibrate([100])
      break
    case 'tick':
      if (isTabHidden()) break
      sounds.playCountdownTick()
      sounds.vibrate([50])
      break
    case 'complete':
      sounds.playGetReady()
      sounds.vibrate([200, 100, 200])
      break
    default:
      break
  }
}

/** Ejercicio por tiempo (`Timer`), incluida la cuenta de «prepárate». */
export const timerCues: TrainingCueHandler = (cue) => {
  switch (cue) {
    case 'precount':
      sounds.playCountdownTick()
      sounds.vibrate([80])
      break
    case 'warning':
      sounds.playWarning()
      sounds.vibrate([100])
      break
    case 'tick':
      sounds.playCountdownTick()
      sounds.vibrate([50])
      break
    case 'complete':
      sounds.playTimerComplete()
      sounds.vibrate([200, 100, 200])
      break
    default:
      break
  }
}

/** Circuito (paridad con el `CountdownRing` que vivía dentro de `CircuitView`). */
export const circuitCues: TrainingCueHandler = (cue) => {
  switch (cue) {
    case 'warning':
      sounds.playWarning()
      sounds.vibrate([100])
      break
    case 'tick':
      sounds.playCountdownTick()
      sounds.vibrate([50])
      break
    case 'complete':
      sounds.playTimerComplete()
      sounds.vibrate([200, 100, 200])
      break
    default:
      break
  }
}

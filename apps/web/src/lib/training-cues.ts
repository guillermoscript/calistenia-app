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

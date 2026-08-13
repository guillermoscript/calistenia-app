/**
 * Traducción de las señales del entreno a sonido y háptica.
 *
 * Es el único sitio donde la cuenta atrás toca la plataforma. Los componentes y los
 * hooks solo emiten `TrainingCue`, así que se pueden testear y —el día que la web los
 * quiera— reutilizar sin arrastrar `expo-av` ni `expo-haptics`.
 *
 * Hay dos mapas y no uno porque el descanso y el ejercicio por tiempo suenan distinto:
 * el descanso termina con un "vamos" y el ejercicio con la campana de completado.
 */
import type { TrainingCue } from '@calistenia/core/lib/countdown'

import { haptics } from '@/lib/haptics'
import * as sounds from '@/lib/sounds'

export type TrainingCueHandler = (cue: TrainingCue) => void

/** Descanso entre series (paridad con el `RestScreen` histórico). */
export const restCues: TrainingCueHandler = (cue) => {
  switch (cue) {
    case 'start':
      sounds.playRestStart()
      break
    case 'warning':
      sounds.playWarning()
      void haptics.warning()
      break
    case 'tick':
      sounds.playCountdownTick()
      void haptics.light()
      break
    case 'complete':
      sounds.playGetReady()
      void haptics.success()
      break
    default:
      break
  }
}

/**
 * Circuito (paridad con el `CountdownRing` histórico de `components/circuit`).
 *
 * Igual que el descanso salvo el final: un circuito cierra con la campana de
 * completado, no con el "vamos" que anuncia la serie siguiente.
 */
export const circuitCues: TrainingCueHandler = (cue) => {
  switch (cue) {
    case 'warning':
      sounds.playWarning()
      void haptics.warning()
      break
    case 'tick':
      sounds.playCountdownTick()
      void haptics.light()
      break
    case 'complete':
      sounds.playTimerComplete()
      void haptics.success()
      break
    default:
      break
  }
}

/** Ejercicio por tiempo (paridad con el `ExerciseTimer` histórico). */
export const timerCues: TrainingCueHandler = (cue) => {
  switch (cue) {
    case 'precount':
    case 'tick':
      sounds.playCountdownTick()
      void haptics.selection()
      break
    case 'warning':
      sounds.playWarning()
      void haptics.medium()
      break
    case 'complete':
      sounds.playTimerComplete()
      void haptics.success()
      break
    default:
      break
  }
}

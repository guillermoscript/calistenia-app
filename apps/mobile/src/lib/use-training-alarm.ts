/**
 * Engancha una cuenta atrás del entreno a la alarma del sistema.
 *
 * Lo usan el descanso (`RestScreen`) y el ejercicio por tiempo (`ExerciseTimer`),
 * que tienen el mismo problema: con la app detrás Android congela el proceso y el
 * aviso sonoro de `training-cues` no llega. La política (cuándo armar, cuándo
 * desarmar, cuándo NO tocar la que está venciendo) vive en `training-alarm-policy`
 * y la plataforma en `training-alarm`; aquí solo está el cableado con React.
 *
 * Son DOS hooks y van juntos: `useTrainingCues` envuelve las señales de la cuenta
 * y `useTrainingAlarm` arma la alarma. Separados porque el crono por tiempo necesita
 * las señales para construirse y solo entonces tiene `endAt` que darle a la alarma.
 */
import { useCallback, useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import {
  cancelTrainingAlarm,
  scheduleTrainingAlarm,
  type TrainingAlarmKind,
} from '@/lib/training-alarm'
import { shouldCancelOnLeave, trainingAlarmAction } from '@/lib/training-alarm-policy'
import type { TrainingCueHandler } from '@/lib/training-cues'
import type { TrainingCue } from '@calistenia/core/lib/countdown'

/**
 * Silencia el aviso FINAL de la app cuando no está en primer plano: ahí lo da la
 * alarma del sistema y, si no, sonarían los dos. El resto de señales (ticks,
 * aviso de los 10 s) siguen igual.
 */
export function useTrainingCues(cues: TrainingCueHandler): TrainingCueHandler {
  const cuesRef = useRef(cues)
  cuesRef.current = cues
  return useCallback((cue: TrainingCue) => {
    if (cue === 'complete' && AppState.currentState !== 'active') return
    cuesRef.current(cue)
  }, [])
}

interface UseTrainingAlarmOptions {
  kind: TrainingAlarmKind
  /** Fin de la cuenta en marcha; `null` si está parada, en pausa o sin arrancar. */
  endAt: number | null
  /** Se lee en el momento de armar, no antes: el texto depende de dónde va la sesión. */
  text: () => { title: string, body: string }
}

export function useTrainingAlarm({ kind, endAt, text }: UseTrainingAlarmOptions): void {
  const endAtRef = useRef(endAt)
  endAtRef.current = endAt
  const textRef = useRef(text)
  textRef.current = text
  /** El `endAt` con el que está armada la alarma, o `null` si no lo está. */
  const armedForRef = useRef<number | null>(null)

  const sync = useCallback((state: AppStateStatus = AppState.currentState) => {
    const action = trainingAlarmAction(
      state === 'active',
      endAtRef.current,
      Date.now(),
      armedForRef.current,
    )
    if (action === 'arm') {
      const { title, body } = textRef.current()
      armedForRef.current = endAtRef.current
      void scheduleTrainingAlarm(kind, endAtRef.current!, title, body)
    } else if (action === 'disarm') {
      armedForRef.current = null
      void cancelTrainingAlarm(kind)
    }
  }, [kind])

  // Irse a segundo plano arma; volver desarma.
  useEffect(() => {
    const sub = AppState.addEventListener('change', sync)
    return () => { sub.remove() }
  }, [sync])

  // Y cada vez que la cuenta cambia de fin (ajustar, pausar, reanudar, terminar).
  useEffect(() => { sync() }, [endAt, sync])

  useEffect(() => () => {
    // Al salir solo se cancela si de verdad queda cuenta por delante. La que está
    // venciendo se deja sonar: con la app detrás es el único aviso que hay, y
    // cancelarla aquí era justo lo que lo silenciaba.
    const armedFor = armedForRef.current
    if (armedFor != null && shouldCancelOnLeave(armedFor - Date.now())) {
      void cancelTrainingAlarm(kind)
    }
  }, [kind])
}

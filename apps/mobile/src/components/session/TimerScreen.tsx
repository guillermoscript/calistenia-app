/**
 * Temporizador de un ejercicio por tiempo dentro de una sesión.
 *
 * Queda reducido a un cable: la máquina de fases y la cuenta son `useExerciseTimer`,
 * los píxeles son `TimerPanel`, y el ruido lo pone `timerCues`. Se mantiene el nombre y
 * la firma porque `SessionView` lo usa tal cual.
 *
 * Lo único que no es cable es la alarma: con la app detrás Android congela el JS y
 * los pitidos de `timerCues` no suenan, así que `useTrainingAlarm` programa una
 * alarma del sistema mientras la app no está delante (misma pieza que el descanso).
 */
import { useCallback, useEffect } from 'react'
import { AppState } from 'react-native'
import { useTranslation } from 'react-i18next'

import { TimerPanel } from '@/components/training/TimerPanel'
import { timerCues } from '@/lib/training-cues'
import { useTrainingAlarm, useTrainingCues } from '@/lib/use-training-alarm'
import { useExerciseTimer } from '@calistenia/core/hooks/useExerciseTimer'

interface ExerciseTimerProps {
  initialSeconds?: number
  /** Para el cuerpo de la alarma: con la pantalla bloqueada hay que saber de qué es. */
  exerciseName?: string
}

export function ExerciseTimer({ initialSeconds = 30, exerciseName }: ExerciseTimerProps) {
  const { t } = useTranslation()

  const alarmText = useCallback(() => ({
    title: t('notify.timerDone'),
    body: exerciseName ?? t('notify.prepareForNext'),
  }), [exerciseName, t])

  const cues = useTrainingCues(timerCues)
  const timer = useExerciseTimer({ initialSeconds, onCue: cues })
  const { resync } = timer

  // `timer.endAt` es null salvo con el crono corriendo, que es justo lo que la
  // alarma necesita saber: en pausa o parado no hay nada que anunciar.
  useTrainingAlarm({ kind: 'timer', endAt: timer.endAt, text: alarmText })

  // Volver de segundo plano: mirar el reloj ya, sin esperar al siguiente intervalo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resync()
    })
    return () => { sub.remove() }
  }, [resync])

  return (
    <TimerPanel
      phase={timer.phase}
      remainingSeconds={timer.remainingSeconds}
      precount={timer.precount}
      progress={timer.progress}
      endAt={timer.endAt}
      canAdjust={timer.canAdjust}
      onStart={timer.start}
      onPause={timer.pause}
      onResume={timer.resume}
      onRepeat={timer.repeat}
      onReset={timer.reset}
      onAdjust={timer.adjust}
    />
  )
}

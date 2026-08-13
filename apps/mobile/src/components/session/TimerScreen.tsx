/**
 * Temporizador de un ejercicio por tiempo dentro de una sesión.
 *
 * Queda reducido a un cable: la máquina de fases y la cuenta son `useExerciseTimer`,
 * los píxeles son `TimerPanel`, y el ruido lo pone `timerCues`. Se mantiene el nombre y
 * la firma porque `SessionView` lo usa tal cual.
 */
import { useEffect } from 'react'
import { AppState } from 'react-native'

import { TimerPanel } from '@/components/training/TimerPanel'
import { timerCues } from '@/lib/training-cues'
import { useExerciseTimer } from '@calistenia/core/hooks/useExerciseTimer'

export function ExerciseTimer({ initialSeconds = 30 }: { initialSeconds?: number }) {
  const timer = useExerciseTimer({ initialSeconds, onCue: timerCues })
  const { resync } = timer

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

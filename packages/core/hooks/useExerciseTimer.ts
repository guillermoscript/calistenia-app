/**
 * Ejercicio por tiempo, headless.
 *
 * Junta la máquina de fases pura de `lib/exercise-timer` con la cuenta atrás de
 * `useCountdown`: la fase decide si hay que contar, y contar es problema de la cuenta
 * atrás. Devuelve números y callbacks; ni pinta el anillo ni hace ruido.
 */
import { useCallback, useEffect, useState } from 'react'

import {
  countdownProgress,
  TIMER_CUE_THRESHOLDS,
  type CountdownCue,
  type TrainingCue,
} from '../lib/countdown'
import {
  adjustTimerSeconds,
  canAdjustTimer,
  nextTimerPhase,
  TIMER_MIN_SECONDS,
  TIMER_PRECOUNT_SECONDS,
  type TimerAction,
  type TimerPhase,
} from '../lib/exercise-timer'
import { useCountdown } from './useCountdown'
import { useLatest } from './useLatest'

export interface UseExerciseTimerOptions {
  initialSeconds: number
  now?: () => number
  intervalMs?: number
  minSeconds?: number
  onCue?: (cue: TrainingCue) => void
  onComplete?: () => void
}

export interface UseExerciseTimerResult {
  phase: TimerPhase
  totalSeconds: number
  /** Segundos que faltan para terminar. */
  remainingSeconds: number
  /** Segundos ya cumplidos. Es lo que se registra si se para antes de tiempo. */
  elapsedSeconds: number
  /** El número grande del "prepárate". Solo tiene sentido en la fase `countdown`. */
  precount: number
  progress: number
  canAdjust: boolean
  /** Fin de la cuenta en marcha, para que el anillo se anime solo. `null` si no corre. */
  endAt: number | null
  start: () => void
  pause: () => void
  resume: () => void
  repeat: () => void
  reset: () => void
  adjust: (deltaSeconds: number) => void
  /** Vuelve a mirar el reloj ya. Engánchalo al volver de segundo plano. */
  resync: () => void
}

export function useExerciseTimer(options: UseExerciseTimerOptions): UseExerciseTimerResult {
  const { initialSeconds, intervalMs, minSeconds = TIMER_MIN_SECONDS } = options
  const nowRef = useLatest(options.now ?? Date.now)
  const onCueRef = useLatest(options.onCue)
  const onCompleteRef = useLatest(options.onComplete)

  const [phase, setPhase] = useState<TimerPhase>('idle')
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds)
  // Solo manda con el crono parado; corriendo, la fuente de verdad es la cuenta atrás.
  const [pausedRemaining, setPausedRemaining] = useState(initialSeconds)
  const [precount, setPrecount] = useState(TIMER_PRECOUNT_SECONDS)
  const [endAt, setEndAt] = useState<number | null>(null)

  const phaseRef = useLatest(phase)
  const totalSecondsRef = useLatest(totalSeconds)
  const pausedRemainingRef = useLatest(pausedRemaining)
  const precountRef = useLatest(precount)

  const running = phase === 'running'

  const handleCue = useCallback((cue: CountdownCue) => { onCueRef.current?.(cue) }, [onCueRef])
  const handleComplete = useCallback(() => {
    setPausedRemaining(0)
    setEndAt(null)
    setPhase((current) => nextTimerPhase(current, 'complete'))
    onCompleteRef.current?.()
  }, [onCompleteRef])

  const countdown = useCountdown({
    endAt: running ? endAt : null,
    totalSeconds,
    now: options.now,
    intervalMs,
    thresholds: TIMER_CUE_THRESHOLDS,
    onCue: handleCue,
    onComplete: handleComplete,
  })

  const remainingSeconds = running ? countdown.secondsLeft : pausedRemaining
  const remainingRef = useLatest(remainingSeconds)

  /**
   * La transición se resuelve fuera del updater de `setPhase` a propósito: entrar en
   * `running` tiene que fijar también el instante de fin, y un updater que provoca
   * efectos se ejecutaría dos veces en modo estricto.
   */
  const dispatch = useCallback((action: TimerAction) => {
    const current = phaseRef.current
    const next = nextTimerPhase(current, action)
    if (next === current) return
    if (next === 'running') setEndAt(nowRef.current() + pausedRemainingRef.current * 1000)
    setPhase(next)
  }, [nowRef, pausedRemainingRef, phaseRef])

  const start = useCallback(() => {
    setPrecount(TIMER_PRECOUNT_SECONDS)
    dispatch('start')
  }, [dispatch])

  const pause = useCallback(() => {
    // Congelar el restante ANTES de salir de `running`, que es cuando la cuenta atrás
    // deja de ser quien manda.
    setPausedRemaining(remainingRef.current)
    setEndAt(null)
    dispatch('pause')
  }, [dispatch, remainingRef])

  const resume = useCallback(() => { dispatch('resume') }, [dispatch])

  const repeat = useCallback(() => {
    setPausedRemaining(totalSecondsRef.current)
    setPrecount(TIMER_PRECOUNT_SECONDS)
    dispatch('repeat')
  }, [dispatch, totalSecondsRef])

  const reset = useCallback(() => {
    setPausedRemaining(totalSecondsRef.current)
    setEndAt(null)
    dispatch('reset')
  }, [dispatch, totalSecondsRef])

  const adjust = useCallback((deltaSeconds: number) => {
    if (!canAdjustTimer(phaseRef.current)) return
    const next = adjustTimerSeconds(
      { totalSeconds: totalSecondsRef.current, remainingSeconds: pausedRemainingRef.current },
      deltaSeconds,
      minSeconds,
    )
    setTotalSeconds(next.totalSeconds)
    setPausedRemaining(next.remainingSeconds)
  }, [minSeconds, pausedRemainingRef, phaseRef, totalSecondsRef])

  // El "prepárate": una señal y un paso por segundo, y al último se arranca.
  useEffect(() => {
    if (phase !== 'countdown') return
    onCueRef.current?.('precount')
    const id = setTimeout(() => {
      if (precountRef.current <= 1) dispatch('ready')
      else setPrecount((n) => n - 1)
    }, 1000)
    return () => clearTimeout(id)
  }, [phase, precount, dispatch, onCueRef, precountRef])

  return {
    phase,
    totalSeconds,
    remainingSeconds,
    elapsedSeconds: Math.max(0, totalSeconds - remainingSeconds),
    precount,
    progress: countdownProgress(remainingSeconds, totalSeconds),
    canAdjust: canAdjustTimer(phase),
    endAt: running ? endAt : null,
    start,
    pause,
    resume,
    repeat,
    reset,
    adjust,
    resync: countdown.resync,
  }
}

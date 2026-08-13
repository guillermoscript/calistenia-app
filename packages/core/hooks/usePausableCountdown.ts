/**
 * Cuenta atrás con pausa, headless.
 *
 * `useCountdown` es controlada: recibe el instante de fin y no opina. Eso le va bien a
 * quien posee su propia ventana (la sesión de fuerza, una batalla), pero el circuito
 * quiere lo contrario — una duración y un interruptor de pausa. Este hook es esa
 * fachada: posee el `endAt`, lo suelta al pausar y lo recalcula al reanudar, que es la
 * única parte de la pausa que tiene truco.
 *
 * Sin React Native ni DOM: lo usan el circuito nativo y el de web con el mismo código.
 */
import { useCallback, useEffect, useState } from 'react'

import {
  countdownProgress,
  REST_CUE_THRESHOLDS,
  type CountdownCue,
  type CountdownCueThresholds,
} from '../lib/countdown'
import { useCountdown } from './useCountdown'
import { useLatest } from './useLatest'

export interface UsePausableCountdownOptions {
  /** Duración total. Cambiarla reinicia la cuenta (nueva fase, nuevo ejercicio). */
  seconds: number
  paused?: boolean
  now?: () => number
  intervalMs?: number
  /** Se lee una vez, al montar. */
  thresholds?: CountdownCueThresholds
  onCue?: (cue: CountdownCue) => void
  onComplete?: () => void
}

export interface UsePausableCountdownResult {
  secondsLeft: number
  totalSeconds: number
  progress: number
  /** Fin de la cuenta en marcha, para animar el anillo. `null` en pausa o al terminar. */
  endAt: number | null
  isRunning: boolean
  /** Vuelve a mirar el reloj ya. Engánchalo al volver de segundo plano. */
  resync: () => void
}

export function usePausableCountdown(
  options: UsePausableCountdownOptions,
): UsePausableCountdownResult {
  const {
    seconds,
    paused = false,
    intervalMs,
    thresholds = REST_CUE_THRESHOLDS,
  } = options

  const nowRef = useLatest(options.now ?? Date.now)
  const onCueRef = useLatest(options.onCue)
  const onCompleteRef = useLatest(options.onComplete)

  // Solo manda con la cuenta parada; corriendo, la fuente de verdad es `useCountdown`.
  const [pausedRemaining, setPausedRemaining] = useState(seconds)
  const [endAt, setEndAt] = useState<number | null>(() =>
    paused ? null : (options.now ?? Date.now)() + seconds * 1000,
  )
  const [done, setDone] = useState(false)

  const handleCue = useCallback((cue: CountdownCue) => { onCueRef.current?.(cue) }, [onCueRef])
  const handleComplete = useCallback(() => {
    setDone(true)
    setPausedRemaining(0)
    setEndAt(null)
    onCompleteRef.current?.()
  }, [onCompleteRef])

  const countdown = useCountdown({
    endAt,
    totalSeconds: seconds,
    now: options.now,
    intervalMs,
    thresholds,
    onCue: handleCue,
    onComplete: handleComplete,
  })

  const secondsLeft = endAt !== null ? countdown.secondsLeft : pausedRemaining
  const secondsLeftRef = useLatest(secondsLeft)

  // Nueva duración = cuenta nueva. Es lo que hacía el `useEffect([initialSeconds])` de
  // los cuatro CountdownRing que esto sustituye.
  useEffect(() => {
    setDone(false)
    setPausedRemaining(seconds)
    setEndAt(paused ? null : nowRef.current() + seconds * 1000)
    // `paused` se lee al arrancar la cuenta nueva; su propio efecto lleva los cambios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, nowRef])

  // Pausar congela el restante; reanudar lo convierte otra vez en un instante de fin.
  useEffect(() => {
    if (done) return
    if (paused) {
      setPausedRemaining(secondsLeftRef.current)
      setEndAt(null)
      return
    }
    setEndAt((current) => (current !== null ? current : nowRef.current() + secondsLeftRef.current * 1000))
  }, [paused, done, nowRef, secondsLeftRef])

  return {
    secondsLeft,
    totalSeconds: seconds,
    progress: countdownProgress(secondsLeft, seconds),
    endAt,
    isRunning: endAt !== null,
    resync: countdown.resync,
  }
}

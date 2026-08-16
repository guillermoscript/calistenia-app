/**
 * Cuenta atrás con pausa, headless.
 *
 * `useCountdown` es controlada: recibe el instante de fin y no opina. Eso le va bien a
 * quien posee su propia ventana (la sesión de fuerza, una batalla), pero el circuito
 * quiere lo contrario — una duración y un interruptor de pausa. Este hook es esa
 * fachada: posee el `endAt`, lo suelta al pausar y lo recalcula al reanudar, que es la
 * única parte de la pausa que tiene truco.
 *
 * Sin React Native ni DOM: lo usan el circuito nativo y, en web, el circuito, el
 * descanso entre series y el ejercicio por tiempo, con el mismo código.
 */
import { useCallback, useEffect, useState } from 'react'

import {
  adjustCountdown,
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
  /** Suelo al que puede bajar el total con `adjust`. */
  minTotalSeconds?: number
  /**
   * Cambiarlo reinicia la cuenta **con la misma duración**, que es lo que necesita un
   * botón de «repetir»: `seconds` no cambia, así que por sí solo no rearranca nada.
   */
  resetKey?: string | number | null
  onCue?: (cue: CountdownCue) => void
  onComplete?: () => void
}

export interface UsePausableCountdownResult {
  secondsLeft: number
  /** Total en curso. Sale de `seconds`, pero `adjust` lo mueve. */
  totalSeconds: number
  progress: number
  /** Fin de la cuenta en marcha, para animar el anillo. `null` en pausa o al terminar. */
  endAt: number | null
  isRunning: boolean
  /** Vuelve a mirar el reloj ya. Engánchalo al volver de segundo plano. */
  resync: () => void
  /**
   * Alarga o acorta la cuenta **sin reiniciarla** (los ±15 s del descanso). Cambiar
   * `seconds` no vale para esto: eso significa «cuenta nueva» y volvería a empezar.
   *
   * Devuelve el total resultante ya recortado al mínimo, para quien tenga que
   * guardarlo (la preferencia de descanso del ejercicio) sin esperar al render.
   */
  adjust: (deltaSeconds: number) => number
}

export function usePausableCountdown(
  options: UsePausableCountdownOptions,
): UsePausableCountdownResult {
  const {
    seconds,
    paused = false,
    intervalMs,
    thresholds = REST_CUE_THRESHOLDS,
    minTotalSeconds = 10,
    resetKey = null,
  } = options

  const nowRef = useLatest(options.now ?? Date.now)
  const onCueRef = useLatest(options.onCue)
  const onCompleteRef = useLatest(options.onComplete)

  // Solo manda con la cuenta parada; corriendo, la fuente de verdad es `useCountdown`.
  const [pausedRemaining, setPausedRemaining] = useState(seconds)
  const [endAt, setEndAt] = useState<number | null>(() =>
    paused ? null : (options.now ?? Date.now)() + seconds * 1000,
  )
  const [totalSeconds, setTotalSeconds] = useState(seconds)
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
    totalSeconds,
    now: options.now,
    intervalMs,
    thresholds,
    onCue: handleCue,
    onComplete: handleComplete,
  })

  const secondsLeft = endAt !== null ? countdown.secondsLeft : pausedRemaining
  const secondsLeftRef = useLatest(secondsLeft)
  const endAtRef = useLatest(endAt)
  const totalSecondsRef = useLatest(totalSeconds)
  const doneRef = useLatest(done)

  // Nueva duración = cuenta nueva. Es lo que hacía el `useEffect([initialSeconds])` de
  // los cuatro CountdownRing que esto sustituye. `resetKey` es la misma puerta para
  // quien quiere reiniciar sin cambiar la duración.
  useEffect(() => {
    setDone(false)
    setTotalSeconds(seconds)
    setPausedRemaining(seconds)
    setEndAt(paused ? null : nowRef.current() + seconds * 1000)
    // `paused` se lee al arrancar la cuenta nueva; su propio efecto lleva los cambios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, resetKey, nowRef])

  /**
   * Mover el final en marcha, no reiniciar. La aritmética (recortar al mínimo, no
   * adelantar el final por debajo de un segundo) es `adjustCountdown`; aquí solo se
   * decide contra qué ventana se aplica, que en pausa es una ficticia construida con
   * el restante congelado.
   */
  const adjust = useCallback((deltaSeconds: number): number => {
    if (doneRef.current || deltaSeconds === 0) return totalSecondsRef.current
    const now = nowRef.current()
    const running = endAtRef.current !== null
    const next = adjustCountdown(
      {
        endAt: running ? endAtRef.current! : now + secondsLeftRef.current * 1000,
        totalSeconds: totalSecondsRef.current,
      },
      deltaSeconds,
      now,
      minTotalSeconds,
    )
    setTotalSeconds(next.totalSeconds)
    if (running) setEndAt(next.endAt)
    else setPausedRemaining(Math.ceil((next.endAt - now) / 1000))
    return next.totalSeconds
  }, [doneRef, nowRef, endAtRef, secondsLeftRef, totalSecondsRef, minTotalSeconds])

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
    totalSeconds,
    progress: countdownProgress(secondsLeft, totalSeconds),
    endAt,
    isRunning: endAt !== null,
    resync: countdown.resync,
    adjust,
  }
}

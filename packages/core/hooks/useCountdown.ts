/**
 * Cuenta atrás headless: cuenta, avisa y no dibuja nada.
 *
 * Es **controlada** a propósito. Recibe el instante de fin en vez de una duración, así
 * que cada llamador conserva su propio modelo de estado: la sesión de fuerza posee su
 * `endAt` local y lo alarga con ±15 s, mientras que una batalla lo deriva del
 * `resting_until` que calcula el servidor. El hook no opina sobre quién manda.
 *
 * No importa nada de React Native ni del DOM: los sonidos y las hápticas salen por
 * `onCue` y los traduce la plataforma.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  countdownCues,
  countdownProgress,
  secondsLeft,
  REST_CUE_THRESHOLDS,
  type CountdownCue,
  type CountdownCueThresholds,
} from '../lib/countdown'
import { useLatest } from './useLatest'

export interface UseCountdownOptions {
  /** Instante de fin en ms, o `null` para no contar (pausa, descanso terminado…). */
  endAt: number | null
  /** Duración total, solo para el progreso. */
  totalSeconds: number
  /** Reloj. Una batalla pasa `serverNow`; una sesión en solitario no pasa nada. */
  now?: () => number
  /** Cada cuánto se mira el reloj. 250 ms basta para no perder ninguna frontera. */
  intervalMs?: number
  thresholds?: CountdownCueThresholds
  /**
   * Si el aviso suena una sola vez por cuenta. Con `false`, alargar el descanso por
   * encima del umbral hace que vuelva a avisar al cruzarlo.
   */
  warnOnce?: boolean
  onCue?: (cue: CountdownCue) => void
  onComplete?: () => void
  /**
   * Cambiarlo rearma la cuenta (aviso y fin vuelven a estar disponibles). Por defecto
   * es el propio `endAt`, que es lo que quiere quien recibe un descanso nuevo del
   * servidor; quien solo alarga el suyo debe pasar algo estable.
   */
  resetKey?: string | number | null
}

export interface UseCountdownResult {
  secondsLeft: number
  /** Fracción pendiente en [0, 1]. */
  progress: number
  isActive: boolean
  /** Vuelve a mirar el reloj ya. Engánchalo al volver de segundo plano. */
  resync: () => void
}

export function useCountdown(options: UseCountdownOptions): UseCountdownResult {
  const {
    endAt,
    totalSeconds,
    intervalMs = 250,
    thresholds = REST_CUE_THRESHOLDS,
    warnOnce = true,
  } = options

  const nowRef = useLatest(options.now ?? Date.now)
  const onCueRef = useLatest(options.onCue)
  const onCompleteRef = useLatest(options.onComplete)
  const thresholdsRef = useLatest(thresholds)
  const endAtRef = useLatest(endAt)

  const [remaining, setRemaining] = useState(() =>
    endAt === null ? 0 : secondsLeft(endAt, (options.now ?? Date.now)()),
  )
  const lastRef = useRef(remaining)
  const warnedRef = useRef(false)
  const finishedRef = useRef(false)

  const emit = useCallback(
    (cue: CountdownCue) => {
      if (cue === 'warning') {
        if (warnOnce && warnedRef.current) return
        warnedRef.current = true
      }
      if (cue === 'complete') {
        if (finishedRef.current) return
        finishedRef.current = true
      }
      onCueRef.current?.(cue)
      if (cue === 'complete') onCompleteRef.current?.()
    },
    [warnOnce, onCueRef, onCompleteRef],
  )

  const resync = useCallback(() => {
    const end = endAtRef.current
    if (end === null) return
    const rem = secondsLeft(end, nowRef.current())
    const prev = lastRef.current
    if (rem !== prev) {
      for (const cue of countdownCues(prev, rem, thresholdsRef.current)) emit(cue)
      lastRef.current = rem
      setRemaining(rem)
    }
    // También cuando la cuenta ya nacía en cero, que no cruza ninguna frontera.
    if (rem <= 0) emit('complete')
  }, [emit, endAtRef, nowRef, thresholdsRef])

  // Rearme: una cuenta nueva vuelve a tener derecho a avisar y a terminar.
  const resetKey = options.resetKey === undefined ? endAt : options.resetKey
  useEffect(() => {
    warnedRef.current = false
    finishedRef.current = false
    const end = endAtRef.current
    const rem = end === null ? 0 : secondsLeft(end, nowRef.current())
    lastRef.current = rem
    setRemaining(rem)
  }, [resetKey, endAtRef, nowRef])

  useEffect(() => {
    if (endAt === null) return
    resync()
    const id = setInterval(resync, intervalMs)
    return () => clearInterval(id)
  }, [endAt, intervalMs, resync])

  return {
    secondsLeft: endAt === null ? 0 : remaining,
    progress: countdownProgress(endAt === null ? 0 : remaining, totalSeconds),
    isActive: endAt !== null,
    resync,
  }
}

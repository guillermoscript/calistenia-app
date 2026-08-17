import { useCallback, useEffect, useRef } from 'react'
import type { CardioFixInput } from '@calistenia/core/lib/cardio-fix'

const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
const ONE_SHOT_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 3000 }

function toFix(pos: GeolocationPosition): CardioFixInput {
  const { latitude, longitude, altitude, speed, accuracy } = pos.coords
  return { latitude, longitude, altitude, speed, accuracy, timestamp: pos.timestamp }
}

interface Options {
  onFix: (fix: CardioFixInput) => void
  /** El navegador no expone geolocalización. */
  onUnavailable: () => void
  onError: (err: GeolocationPositionError) => void
}

export interface GeolocationWatch {
  start: () => void
  stop: () => void
  /** Relanza el watch: lo usa el health-check cuando el GPS enmudece. */
  restart: () => void
  /** Un único fix, best-effort — en iOS Safari puede no resolver nunca. */
  captureOnce: (onFix: (fix: CardioFixInput) => void) => void
}

/**
 * `navigator.geolocation.watchPosition` con ciclo de vida explícito, traducido
 * ya a la forma de fix que espera el pipeline de core.
 */
export function useGeolocationWatch({ onFix, onUnavailable, onError }: Options): GeolocationWatch {
  const watchIdRef = useRef<number | null>(null)

  // Por ref: el watch vive toda la sesión y no debe reiniciarse porque el
  // provider haya re-renderizado con callbacks nuevos.
  const handlersRef = useRef({ onFix, onUnavailable, onError })
  handlersRef.current = { onFix, onUnavailable, onError }

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      handlersRef.current.onUnavailable()
      return
    }
    // Idempotente: dos watches simultáneos duplicarían los fixes y la batería.
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handlersRef.current.onFix(toFix(pos)),
      (err) => handlersRef.current.onError(err),
      WATCH_OPTIONS,
    )
  }, [])

  const restart = useCallback(() => {
    stop()
    start()
  }, [stop, start])

  const captureOnce = useCallback((handler: (fix: CardioFixInput) => void) => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => handler(toFix(pos)),
      () => { /* best-effort — ignorar errores */ },
      ONE_SHOT_OPTIONS,
    )
  }, [])

  useEffect(() => stop, [stop])

  return { start, stop, restart, captureOnce }
}

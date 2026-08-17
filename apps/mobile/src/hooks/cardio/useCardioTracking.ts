import { useCallback, useEffect, useRef } from 'react'
import {
  setCardioFixListener, startCardioTracking, stopCardioTracking,
  requestCardioPermission, type CardioFix,
} from '@/lib/cardio-tracker'

interface Options {
  /** Cada fix del lote que emite el Foreground Service. */
  onFix: (fix: CardioFix) => void
  /** No se pudo arrancar el tracking (permiso, servicio caído…). */
  onUnavailable: () => void
}

export interface CardioTracking {
  requestPermission: () => Promise<boolean>
  start: () => void
  stop: () => void
  /** Relanza el tracking: lo usa el health-check cuando el GPS enmudece. */
  restart: () => void
}

/**
 * GPS de la sesión de cardio: expo-location detrás de un Foreground Service en
 * Android, que sigue emitiendo con la pantalla bloqueada.
 *
 * Equivalente nativo de `useGeolocationWatch` de la web. Aquí no hay watch id:
 * el listener es de módulo y recibe lotes de fixes.
 */
export function useCardioTracking({ onFix, onUnavailable }: Options): CardioTracking {
  // Por ref: el listener se registra una sola vez y debe ver siempre el
  // callback actual sin volver a suscribirse.
  const handlersRef = useRef({ onFix, onUnavailable })
  handlersRef.current = { onFix, onUnavailable }

  useEffect(() => {
    setCardioFixListener((fixes) => {
      for (const fix of fixes) handlersRef.current.onFix(fix)
    })
    return () => setCardioFixListener(null)
  }, [])

  const requestPermission = useCallback(() => requestCardioPermission(), [])

  const start = useCallback(() => {
    startCardioTracking().catch(() => handlersRef.current.onUnavailable())
  }, [])

  const stop = useCallback(() => {
    void stopCardioTracking()
  }, [])

  // El servicio ya es idempotente: volver a arrancarlo reengancha el GPS sin
  // pararlo antes (pararlo tiraría la notificación en vivo).
  const restart = useCallback(() => {
    startCardioTracking().catch(() => {})
  }, [])

  return { requestPermission, start, stop, restart }
}

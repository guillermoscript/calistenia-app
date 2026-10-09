import { useCallback } from 'react'
import type {
  CardioTrackingControls, CardioTrackingHandlers,
} from '@calistenia/core/hooks/session-contexts/useCardioSessionState'
import { useGeolocationWatch } from './useGeolocationWatch'

/**
 * GPS de la sesión de cardio en web: adapta `useGeolocationWatch`
 * (`navigator.geolocation`) al contrato de plataforma de core. Es el gemelo del
 * `useCardioTracking` de móvil; no pide permiso aparte (el navegador lo hace al
 * primer `watchPosition`) y sí sabe tomar un fix suelto al irse a segundo plano.
 */
export function useCardioTracking({ onFix, onUnavailable, onError }: CardioTrackingHandlers): CardioTrackingControls {
  return useGeolocationWatch({
    onFix,
    onUnavailable,
    onError: useCallback((err: GeolocationPositionError) => onError?.(`Error GPS: ${err.message}`), [onError]),
  })
}

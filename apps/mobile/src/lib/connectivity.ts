/**
 * Conectividad para RN sobre @react-native-community/netinfo.
 *
 * El adapter de core exige isOnline() SÍNCRONO, así que cacheamos el último
 * estado reportado por NetInfo (empezamos optimistas: online hasta que NetInfo
 * diga lo contrario — isInternetReachable puede ser null mientras se resuelve).
 */
import NetInfo from '@react-native-community/netinfo'

let online = true
const listeners = new Set<(online: boolean) => void>()

NetInfo.addEventListener(state => {
  const now = state.isConnected !== false && state.isInternetReachable !== false
  if (now !== online) {
    online = now
    listeners.forEach(l => l(now))
  }
})

export const isOnline = (): boolean => online

/** Notifica cada cambio online/offline (para el banner). */
export function onConnectivityChange(handler: (online: boolean) => void): () => void {
  listeners.add(handler)
  return () => { listeners.delete(handler) }
}

/** Notifica solo las transiciones offline → online (para la offline queue). */
export function onOnline(handler: () => void): () => void {
  return onConnectivityChange(now => { if (now) handler() })
}

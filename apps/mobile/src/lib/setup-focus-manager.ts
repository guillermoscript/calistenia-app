/**
 * Conecta el `focusManager` de TanStack Query al AppState de React Native.
 *
 * RN no tiene foco de ventana: sin esto, `refetchOnWindowFocus` nunca se
 * dispara al volver de background. Solo marca la app como enfocada; qué queries
 * refrescan lo decide cada una con `refetchOnWindowFocus` (el default global
 * de core sigue en `false`, para no provocar una tormenta de refetch).
 */
import { AppState, Platform, type AppStateStatus } from 'react-native'
import { focusManager } from '@tanstack/react-query'

export function setupFocusManager(): void {
  focusManager.setEventListener((handleFocus) => {
    if (Platform.OS === 'web') return () => {}
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      handleFocus(status === 'active')
    })
    return () => sub.remove()
  })
}

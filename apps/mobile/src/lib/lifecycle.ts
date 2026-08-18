/**
 * Lifecycle (primer plano / segundo plano) para RN sobre `AppState`.
 *
 * Es el gemelo nativo de `document.visibilitychange` en web. Core no puede
 * importar `react-native`, así que esto se inyecta vía `initCore()` (#482).
 *
 * `AppState` tiene tres estados: 'active' | 'background' | 'inactive'.
 * 'inactive' es un limbo de iOS (multitarea, llamada entrante, Control Center)
 * del que se puede volver a 'active' sin pasar por 'background'. Lo tratamos
 * como "ya no estás en primer plano" —igual que hacían los contexts antes de
 * centralizarlo aquí— para que la persistencia ocurra ANTES de que el sistema
 * pueda matar la app.
 */
import { AppState, type AppStateStatus } from 'react-native'

const isActive = (state: AppStateStatus): boolean => state === 'active'

export const isForeground = (): boolean => isActive(AppState.currentState)

/**
 * Notifica solo las transiciones (no-activo → activo). Filtramos por transición
 * y no por estado a secas porque en Android `AppState` puede emitir 'active'
 * repetido; sin el filtro, un handler que revalida el token o hace push
 * dispararía varias veces por cada vuelta a la app.
 */
export function onForeground(handler: () => void): () => void {
  let previous = AppState.currentState
  const sub = AppState.addEventListener('change', (next) => {
    if (!isActive(previous) && isActive(next)) handler()
    previous = next
  })
  return () => sub.remove()
}

/** Notifica solo las transiciones (activo → no-activo): el momento de persistir. */
export function onBackground(handler: () => void): () => void {
  let previous = AppState.currentState
  const sub = AppState.addEventListener('change', (next) => {
    if (isActive(previous) && !isActive(next)) handler()
    previous = next
  })
  return () => sub.remove()
}

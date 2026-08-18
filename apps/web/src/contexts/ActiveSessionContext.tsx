// Provider fino: el estado, la persistencia y la adopción de la sesión remota
// viven en `useActiveSessionState` de core, compartido con el móvil (#482).
// Aquí queda el par de contextos de React y lo que de verdad es solo de web:
// el `beforeunload` que registra el abandono y la limpieza de la cola de la
// sesión libre.
//
// `SessionView` sigue siendo dueño de su estado local y empujándolo aquí; esta
// refactor no invierte ese flujo.
import { createContext, useContext, useCallback, useEffect, type ReactNode } from 'react'
import { FREE_SESSION_QUEUE_KEY as FREE_QUEUE_KEY } from '@calistenia/core/lib/storage-keys'
import {
  useActiveSessionState,
  type ActiveSessionContextValue,
  type SessionProgress,
} from '@calistenia/core/hooks/session-contexts/useActiveSessionState'

export { getCurrentSection } from '@calistenia/core/hooks/session-contexts/useActiveSessionState'
export type { WarmupCooldownData } from '@calistenia/core/hooks/session-contexts/useActiveSessionState'

// Dos contextos a propósito: el *store* (identidad de la sesión y acciones) es
// estable durante todo el entreno, mientras que el progreso cambia en cada
// serie. Antes iban juntos en un único value SIN memoizar, así que registrar
// una serie re-renderizaba a todos los consumidores — la barra de sesión, la
// burbuja de sesión libre y `App` — ninguno de los cuales lee el progreso.
const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(null)
const ActiveSessionProgressContext = createContext<SessionProgress | null>(null)

interface ProviderProps {
  children: ReactNode
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

export function ActiveSessionProvider({ children, getRestForExercise, setRestForExercise }: ProviderProps) {
  // La cola de la sesión libre es solo de web: el móvil no guarda nada bajo
  // esta clave, así que la limpieza se inyecta desde aquí.
  const onSessionEnded = useCallback(() => {
    try { localStorage.removeItem(FREE_QUEUE_KEY) } catch { /* ignore */ }
  }, [])

  const { value, progress, trackAbandon } = useActiveSessionState({
    platform: 'web',
    getRestForExercise,
    setRestForExercise,
    onSessionEnded,
  })

  // Registrar el abandono al cerrar la pestaña o navegar fuera a media sesión.
  // No tiene equivalente nativo —pasar a segundo plano NO es abandonar—, así
  // que se queda aquí en vez de bajar a core.
  useEffect(() => {
    window.addEventListener('beforeunload', trackAbandon)
    return () => window.removeEventListener('beforeunload', trackAbandon)
  }, [trackAbandon])

  return (
    <ActiveSessionContext.Provider value={value}>
      <ActiveSessionProgressContext.Provider value={progress}>
        {children}
      </ActiveSessionProgressContext.Provider>
    </ActiveSessionContext.Provider>
  )
}

export function useActiveSession() {
  const ctx = useContext(ActiveSessionContext)
  if (!ctx) throw new Error('useActiveSession must be used within ActiveSessionProvider')
  return ctx
}

/**
 * Progreso vivo de la sesión. Suscribirse aquí re-renderiza en CADA serie, así
 * que úsalo solo si de verdad necesitas el valor actual; para restaurar al
 * montar está `getProgressSnapshot()` de `useActiveSession()`.
 */
export function useActiveSessionProgress() {
  const ctx = useContext(ActiveSessionProgressContext)
  if (!ctx) throw new Error('useActiveSessionProgress must be used within ActiveSessionProvider')
  return ctx
}

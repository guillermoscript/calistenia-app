// Provider fino: el estado, la persistencia y la adopción de la sesión remota
// viven en `useActiveSessionState` de core, compartido con la web (#482).
// Aquí solo queda el par de contextos de React.
//
// Misma arquitectura de siempre: SessionView es dueño del estado local
// (stepIdx/phase) y lo empuja aquí; el context nunca se lee de vuelta durante
// la sesión, solo para restaurar tras navegar fuera. Esta refactor NO invierte
// ese flujo.
//
// `trackAbandon` sigue sin engancharse: su disparo en web es `beforeunload` y
// en nativo no hay equivalente — pasar a segundo plano no es abandonar el
// entreno, y contarlo así inflaría la cifra hasta volverla inútil. El abandono
// en nativo sí se mide desde core, por las otras dos vías que no dependen del
// ciclo de vida de la app: la sesión que caduca a las 24 h y la que otra
// sesión reemplaza (#636).
import { createContext, use, type ReactNode } from 'react'
import {
  useActiveSessionState,
  type ActiveSessionContextValue,
  type SessionProgress,
} from '@calistenia/core/hooks/session-contexts/useActiveSessionState'

export { getCurrentSection } from '@calistenia/core/hooks/session-contexts/useActiveSessionState'
export type { WarmupCooldownData } from '@calistenia/core/hooks/session-contexts/useActiveSessionState'

// Dos contextos a propósito: el *store* (identidad de la sesión y acciones) es
// estable durante todo el entreno, mientras que el progreso cambia en cada
// serie. Antes iban juntos en un único `useMemo`, así que registrar una serie
// re-renderizaba `ActiveSessionBar`, `ActiveBattleBar` y la Home, ninguno de
// los cuales lee el progreso (#475).
const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(null)
const ActiveSessionProgressContext = createContext<SessionProgress | null>(null)

interface ProviderProps {
  children: ReactNode
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

export function ActiveSessionProvider({ children, getRestForExercise, setRestForExercise }: ProviderProps) {
  const { value, progress } = useActiveSessionState({
    // `platform: 'mobile'` ya no se manda a mano en cada evento: lo sella core
    // desde `getClientInfo()`, que es la misma fuente para web y móvil (#636).
    platform: 'mobile',
    getRestForExercise,
    setRestForExercise,
  })

  return (
    <ActiveSessionContext.Provider value={value}>
      <ActiveSessionProgressContext.Provider value={progress}>
        {children}
      </ActiveSessionProgressContext.Provider>
    </ActiveSessionContext.Provider>
  )
}

export function useActiveSession() {
  const ctx = use(ActiveSessionContext)
  if (!ctx) throw new Error('useActiveSession must be used within ActiveSessionProvider')
  return ctx
}

/**
 * Progreso vivo de la sesión. Suscribirse aquí re-renderiza en CADA serie, así
 * que úsalo solo si de verdad necesitas el valor actual; para restaurar al
 * montar está `getProgressSnapshot()` de `useActiveSession()`.
 */
export function useActiveSessionProgress() {
  const ctx = use(ActiveSessionProgressContext)
  if (!ctx) throw new Error('useActiveSessionProgress must be used within ActiveSessionProvider')
  return ctx
}

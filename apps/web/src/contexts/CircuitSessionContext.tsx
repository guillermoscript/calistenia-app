// Provider fino: el estado, la persistencia y la cola offline viven en
// `useCircuitSessionState` de core, compartido con el móvil (#482). Aquí solo
// queda el contexto de React y el hook de consumo.
import { createContext, useContext, type ReactNode } from 'react'
import {
  useCircuitSessionState,
  type CircuitSessionState,
} from '@calistenia/core/hooks/session-contexts/useCircuitSessionState'

export type { CircuitProgress } from '@calistenia/core/hooks/session-contexts/useCircuitSessionState'

const CircuitSessionContext = createContext<CircuitSessionState | null>(null)

interface ProviderProps {
  userId: string | null
  children: ReactNode
}

export function CircuitSessionProvider({ userId, children }: ProviderProps) {
  const value = useCircuitSessionState({ userId })

  return (
    <CircuitSessionContext.Provider value={value}>
      {children}
    </CircuitSessionContext.Provider>
  )
}

export function useCircuitSession() {
  const ctx = useContext(CircuitSessionContext)
  if (!ctx) throw new Error('useCircuitSession must be used within CircuitSessionProvider')
  return ctx
}

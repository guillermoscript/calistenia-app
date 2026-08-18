// Provider fino: el estado, la persistencia y la cola offline viven en
// `useCircuitSessionState` de core, compartido con la web (#482). Aquí solo
// queda el contexto de React, el tag de analytics del móvil y el reporte a
// Sentry con sus tags de feature.
//
// La UI (CircuitSessionView) sigue siendo dueña de su estado local y empujando
// aquí; esta refactor no invierte ese flujo.
import { createContext, use, useCallback, type ReactNode } from 'react'
import {
  useCircuitSessionState,
  type CircuitSessionState,
  type CircuitErrorOp,
} from '@calistenia/core/hooks/session-contexts/useCircuitSessionState'
import { Sentry } from '@/lib/instrument'

export type { CircuitProgress } from '@calistenia/core/hooks/session-contexts/useCircuitSessionState'

const CircuitSessionContext = createContext<CircuitSessionState | null>(null)

const ANALYTICS_PROPS = { platform: 'mobile' } as const

interface ProviderProps {
  userId: string | null
  children: ReactNode
}

export function CircuitSessionProvider({ userId, children }: ProviderProps) {
  const reportError = useCallback((error: unknown, errorOp: CircuitErrorOp) => {
    Sentry.captureException(error, { tags: { feature: 'circuit', op: errorOp } })
  }, [])

  const value = useCircuitSessionState({
    userId,
    analyticsProps: ANALYTICS_PROPS,
    reportError,
  })

  return (
    <CircuitSessionContext.Provider value={value}>
      {children}
    </CircuitSessionContext.Provider>
  )
}

export function useCircuitSession() {
  const ctx = use(CircuitSessionContext)
  if (!ctx) throw new Error('useCircuitSession must be used within CircuitSessionProvider')
  return ctx
}

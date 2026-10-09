import { createContext, use, type ReactNode } from 'react'
import i18n from '../lib/i18n'
import {
  useCardioSessionState,
  type CardioSessionStateValue, type SessionState as CoreSessionState,
} from '@calistenia/core/hooks/session-contexts/useCardioSessionState'

import { useWakeLock } from '../hooks/useWakeLock'
import { useCardioTracking } from '../hooks/cardio/useCardioTracking'

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionState = CoreSessionState

type CardioSessionContextValue = CardioSessionStateValue

const CardioSessionContext = createContext<CardioSessionContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

interface Props {
  userId: string | null
  userWeight?: number
  children: ReactNode
}

const geoUnavailableMessage = () => i18n.t('cardioSession.geoNotAvailable')

/**
 * Hub de la sesión de cardio. La máquina de estados, la copia de seguridad, la
 * cola de reintento y el CRUD de PocketBase viven en core
 * (`useCardioSessionState`); aquí sólo se inyecta lo de navegador: el GPS
 * (`navigator.geolocation`) y el wake lock.
 */
export function CardioSessionProvider({ userId, userWeight, children }: Props) {
  const value = useCardioSessionState({
    userId,
    userWeight,
    useTracking: useCardioTracking,
    useKeepAwake: useWakeLock,
    geoUnavailableMessage,
  })

  return (
    <CardioSessionContext.Provider value={value}>
      {children}
    </CardioSessionContext.Provider>
  )
}

export function useCardioSessionContext() {
  const ctx = use(CardioSessionContext)
  if (!ctx) throw new Error('useCardioSessionContext must be used within CardioSessionProvider')
  return ctx
}

// Provider fino: la composición de la carrera (conexión, disparadores de fin,
// acciones) vive en `useRaceState` de core, compartida con el móvil (#482).
// Lo que se queda aquí: el `createContext`/`useContext` de React, el auth de
// la plataforma, el tracker de GPS (`createRaceTracker`, que se inyecta en el
// hook de core) y el wake lock de pantalla, que no tiene facade en
// `platform.ts`.
import { createContext, use, type ReactNode } from 'react'
import {
  useRaceState,
  useRaceCountdownState,
  type RaceState,
  type RacePhase,
  type RaceErrorKind,
  type RaceErrorState,
} from '@calistenia/core/hooks/session-contexts/useRaceState'

import { useAuthState } from './AuthContext'
import { createRaceTracker } from '../lib/race/raceTracker'
import { useWakeLock } from '../hooks/useWakeLock'

export type { RacePhase, RaceErrorKind, RaceErrorState }

const RaceContext = createContext<RaceState | null>(null)


// ── Provider ────────────────────────────────────────────────────────────────

interface RaceProviderProps {
  raceId: string
  children: ReactNode
}

export function RaceProvider({ raceId, children }: RaceProviderProps) {
  const { userId } = useAuthState()

  const value = useRaceState({
    raceId,
    userId,
    createTracker: createRaceTracker,
  })

  useWakeLock(value.phase === 'racing' && !!value.me?.id && !!value.race?.starts_at)

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>
}

export function useRaceContext(): RaceState {
  const ctx = use(RaceContext)
  if (!ctx) throw new Error('useRaceContext must be used within RaceProvider')
  return ctx
}

/**
 * Cuenta atrás sincronizada con el servidor: segundos hasta el inicio.
 * Derivada de `race.starts_at` más el offset de raceClock.
 */
export function useRaceCountdown(): { secondsLeft: number; isCounting: boolean } {
  const { race, phase } = useRaceContext()
  return useRaceCountdownState(phase, race?.starts_at)
}

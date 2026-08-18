// Provider fino: la composición de la carrera (conexión, disparadores de fin,
// acciones) vive en `useRaceState` de core, compartida con el móvil (#482).
// Lo que se queda aquí: el `createContext`/`useContext` de React, el auth de
// la plataforma, los cuatro hooks de `hooks/race/` (GPS y snapshot local no
// son portables — se inyectan en el hook de core sin tocarlos, ver el
// doc-comment de `useRaceState`) y el wake lock de pantalla, que tampoco
// tiene facade en `platform.ts`.
import { createContext, use, type ReactNode } from 'react'
import {
  useRaceState,
  useRaceCountdownState,
  type RaceState,
  type RacePhase,
  type RaceErrorKind,
  type RaceErrorState,
  type RaceHooks,
} from '@calistenia/core/hooks/session-contexts/useRaceState'

import { useAuthState } from './AuthContext'
import { clearRaceSnapshot } from '../lib/race/raceSnapshot'
import { useWakeLock } from '../hooks/useWakeLock'
import { useRaceConnection } from '../hooks/race/useRaceConnection'
import { useRaceErrors } from '../hooks/race/useRaceErrors'
import { useRaceFinish } from '../hooks/race/useRaceFinish'
import { useRaceTracker } from '../hooks/race/useRaceTracker'

export type { RacePhase, RaceErrorKind, RaceErrorState }

const RaceContext = createContext<RaceState | null>(null)

const RACE_HOOKS: RaceHooks = { useRaceErrors, useRaceConnection, useRaceFinish, useRaceTracker }

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
    clearRaceSnapshot,
    hooks: RACE_HOOKS,
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

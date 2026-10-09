// Provider fino: la composición de la carrera (conexión, disparadores de fin,
// acciones) vive en `useRaceState` de core, compartida con la web (#482). Lo
// que se queda aquí: el `createContext`/`useContext` de React, el auth de la
// plataforma, el tracker de GPS (`createRaceTracker`, que se inyecta en el
// hook de core), el tag de analytics del móvil y el keep-awake de pantalla,
// que no tiene facade en `platform.ts`.
import { createContext, use, type ReactNode } from 'react'
import {
  useRaceState,
  useRaceCountdownState,
  type RaceState,
  type RacePhase,
  type RaceErrorKind,
  type RaceErrorState,
} from '@calistenia/core/hooks/session-contexts/useRaceState'

import { useAuthUser } from '@/lib/use-auth-user'
import { createRaceTracker } from '@/lib/race/raceTracker'
import { useKeepAwakeWhile } from '@/hooks/useKeepAwakeWhile'

export type { RacePhase, RaceErrorKind, RaceErrorState }

const RaceContext = createContext<RaceState | null>(null)

const KEEP_AWAKE_TAG = 'race'
const ANALYTICS_PROPS = { platform: 'mobile' } as const

// ── Provider ────────────────────────────────────────────────────────────────

interface RaceProviderProps {
  raceId: string
  children: ReactNode
}

export function RaceProvider({ raceId, children }: RaceProviderProps) {
  const user = useAuthUser()
  const userId = user?.id ?? null

  const value = useRaceState({
    raceId,
    userId,
    analyticsProps: ANALYTICS_PROPS,
    createTracker: createRaceTracker,
  })

  useKeepAwakeWhile(value.phase === 'racing' && !!value.me?.id && !!value.race?.starts_at, KEEP_AWAKE_TAG)

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>
}

export function useRaceContext(): RaceState {
  const ctx = use(RaceContext)
  if (!ctx) throw new Error('useRaceContext must be used within RaceProvider')
  return ctx
}

/** Countdown sincronizado con el servidor: segundos hasta el inicio. */
export function useRaceCountdown(): { secondsLeft: number; isCounting: boolean } {
  const { race, phase } = useRaceContext()
  return useRaceCountdownState(phase, race?.starts_at)
}

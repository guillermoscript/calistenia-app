// Copia literal de apps/web/src/hooks/race/useRaceErrors.ts. Candidato a
// `packages/core`, pero mover los hooks es el #482.
import { useCallback, useState } from 'react'

export type RaceErrorKind = 'auth' | 'push' | 'gps' | 'realtime' | 'load'

export interface RaceErrorState {
  kind: RaceErrorKind
  message: string
}

export interface RaceErrors {
  lastError: RaceErrorState | null
  setError: (kind: RaceErrorKind, message: string) => void
  clearError: () => void
  /** Borra el error sólo si es del tipo dado (p. ej. un fix nuevo limpia el de GPS). */
  clearErrorKind: (kind: RaceErrorKind) => void
}

/** Único banner de error de la carrera: el último gana. */
export function useRaceErrors(): RaceErrors {
  const [lastError, setLastError] = useState<RaceErrorState | null>(null)

  const setError = useCallback((kind: RaceErrorKind, message: string) => {
    setLastError({ kind, message })
  }, [])

  const clearError = useCallback(() => setLastError(null), [])

  const clearErrorKind = useCallback((kind: RaceErrorKind) => {
    setLastError(prev => (prev?.kind === kind ? null : prev))
  }, [])

  return { lastError, setError, clearError, clearErrorKind }
}

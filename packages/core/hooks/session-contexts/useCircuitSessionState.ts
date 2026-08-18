/**
 * Estado del circuito activo, compartido por web y móvil (#482).
 *
 * Antes esto vivía duplicado en `apps/web/src/contexts/CircuitSessionContext.tsx`
 * y `apps/mobile/src/contexts/CircuitSessionContext.tsx` (473 y 472 L, ~92 %
 * idénticas). Lo único que ataba cada copia a su plataforma era el storage
 * (`localStorage` vs `storage` de core) y el lifecycle (`visibilitychange` vs
 * `AppState`); con `lifecycle` ya en `CorePlatform`, ambas cosas se resuelven
 * por el adapter y el resto es el mismo código.
 *
 * Siguiendo el patrón que dejó el #475 con `session-machine`: **el estado y la
 * lógica bajan a core; los efectos y el `createContext` se quedan en la app**.
 * Cada app conserva su Provider fino, que llama a este hook y publica el valor
 * en su propio contexto — el `createContext` NO sube a core, para no depender
 * de que Metro y Vite resuelvan una única copia de React.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import type { CircuitDefinition } from '../../types'
import { pb } from '../../lib/pocketbase'
import { CIRCUIT_ACTIVE_KEY as STORAGE_KEY } from '../../lib/storage-keys'
import { op } from '../../lib/analytics'
import { persistOrQueue, processQueue, newClientId } from '../../lib/offlineQueue'
import {
  CIRCUIT_COLLECTION,
  countQueuedCircuitSessions,
  migrateLegacyCircuitQueue,
} from '../../lib/circuitSessionQueue'
import { getPlatform, storage, lifecycle } from '../../platform'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CircuitProgress {
  currentRound: number          // 0-indexed
  currentExerciseIndex: number  // 0-indexed within the round
  phase: 'getReady' | 'exercise' | 'rest' | 'roundRest' | 'work' | 'celebrate'
  completedExercises: number    // total across all rounds
}

export type CircuitSource = 'custom' | 'preset' | 'program'

interface PersistedCircuitSession {
  circuit: CircuitDefinition
  progress: CircuitProgress
  startedAt: number
  isPaused: boolean
  source: CircuitSource
  programId?: string
  programDayKey?: string
}

export interface CircuitSessionState {
  // State
  isActive: boolean
  circuit: CircuitDefinition | null
  progress: CircuitProgress
  startedAt: number | null
  isPaused: boolean
  source: CircuitSource
  programId?: string
  programDayKey?: string
  unsavedCount: number

  // Actions
  startCircuit: (circuit: CircuitDefinition, source: CircuitSource, programId?: string, programDayKey?: string) => void
  advanceExercise: () => void
  advanceFromGetReady: () => void
  advanceToNextPhase: () => void
  pause: () => void
  resume: () => void
  completeCircuit: (note?: string) => Promise<void>
  abandonCircuit: () => void
}

/** Las dos operaciones asíncronas que pueden fallar y merecen reporte. */
export type CircuitErrorOp = 'save_session' | 'flush_unsaved_session'

export interface UseCircuitSessionStateOptions {
  userId: string | null
  /**
   * Props extra para cada evento de analytics. El móvil manda
   * `{ platform: 'mobile' }`; la web no manda nada (su proyecto de OpenPanel
   * ya es solo de web).
   */
  analyticsProps?: Record<string, unknown>
  /**
   * Reporte de errores. Por defecto usa `platform.reportError`; el móvil lo
   * sobreescribe para conservar sus `tags` de Sentry, que son lo que permite
   * segmentar estos fallos por feature en el dashboard.
   */
  reportError?: (error: unknown, errorOp: CircuitErrorOp) => void
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

const INITIAL_PROGRESS: CircuitProgress = {
  currentRound: 0,
  currentExerciseIndex: 0,
  phase: 'exercise',
  completedExercises: 0,
}

// ── Persistence helpers ─────────────────────────────────────────────────────

function saveToStorage(data: PersistedCircuitSession) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* quota exceeded — ignore */ }
}

function loadFromStorage(): PersistedCircuitSession | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: PersistedCircuitSession = JSON.parse(raw)
    if (Date.now() - data.startedAt > MAX_SESSION_AGE_MS) {
      storage.removeItem(STORAGE_KEY)
      return null
    }
    if (!data.circuit || !data.progress) {
      storage.removeItem(STORAGE_KEY)
      return null
    }
    return data
  } catch {
    storage.removeItem(STORAGE_KEY)
    return null
  }
}

function clearStorage() {
  try { storage.removeItem(STORAGE_KEY) } catch {}
}

// ── Complete circuit session (PB + analytics) ───────────────────────────────

function buildCircuitSessionData(
  userId: string,
  circuit: CircuitDefinition,
  progress: CircuitProgress,
  startedAt: number,
  source: CircuitSource,
  programId?: string,
  programDayKey?: string,
  note?: string,
): Record<string, unknown> {
  const now = Date.now()
  const durationSeconds = Math.round((now - startedAt) / 1000)
  const roundsCompleted = progress.phase === 'celebrate'
    ? circuit.rounds
    : progress.currentRound + 1

  const data: Record<string, unknown> = {
    user: userId,
    circuit_name: circuit.name,
    mode: circuit.mode,
    exercises: circuit.exercises,
    rounds_completed: roundsCompleted,
    rounds_target: circuit.rounds,
    duration_seconds: durationSeconds,
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(now).toISOString(),
    note: note || '',
    config: circuit,
    // #464: se genera UNA sola vez, al completar, y viaja dentro del payload
    // encolado. Es lo que hace que el reintento de una petición que sí llegó
    // choque contra el índice único parcial de `circuit_sessions` y se lea como
    // «ya está» en vez de crear una sesión duplicada.
    client_id: newClientId(),
  }

  if (programId) data.program = programId
  if (programDayKey) data.program_day_key = programDayKey

  return data
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useCircuitSessionState({
  userId,
  analyticsProps,
  reportError,
}: UseCircuitSessionStateOptions): CircuitSessionState {
  // Restore síncrono — el storage de core es síncrono en ambas plataformas (en
  // móvil, un caché en memoria hidratado en el boot), así que el primer render
  // ya tiene el estado correcto.
  //
  // Init perezosa con `useState(fn)`: con `useRef(loadFromStorage())` el
  // `JSON.parse` corría en CADA render (#475). Y leerlo a nivel de MÓDULO
  // —como hacía la web— lo dejaba congelado en el primer import: tras
  // abandonar un circuito y remontar el provider se restauraba el snapshot
  // viejo. Por mount es lo correcto.
  const [restored] = useState(loadFromStorage)

  const [isActive, setIsActive] = useState(!!restored)
  const [circuit, setCircuit] = useState<CircuitDefinition | null>(restored?.circuit ?? null)
  const [progress, setProgress] = useState<CircuitProgress>(restored?.progress ?? INITIAL_PROGRESS)
  const [isPaused, setIsPaused] = useState(restored?.isPaused ?? false)
  const [source, setSource] = useState<CircuitSource>(restored?.source ?? 'custom')

  const [unsavedCount, setUnsavedCount] = useState(0)

  const startedAtRef = useRef(restored?.startedAt ?? 0)
  const programIdRef = useRef(restored?.programId)
  const programDayKeyRef = useRef(restored?.programDayKey)

  // Los callbacks inyectados viven en refs para no entrar en las deps de los
  // efectos: si la app los recrea en cada render, un `analyticsProps` inline
  // resuscribiría los listeners de lifecycle/conectividad en bucle.
  const analyticsPropsRef = useRef(analyticsProps)
  analyticsPropsRef.current = analyticsProps
  const reportErrorRef = useRef(reportError)
  reportErrorRef.current = reportError

  const report = useCallback((error: unknown, errorOp: CircuitErrorOp) => {
    if (reportErrorRef.current) reportErrorRef.current(error, errorOp)
    else getPlatform().reportError?.(error)
  }, [])

  const track = useCallback((name: string, props: Record<string, unknown>) => {
    op.track(name, { ...props, ...analyticsPropsRef.current })
  }, [])

  // ── Persistencia en cada cambio + al pasar a segundo plano ────────────────

  useEffect(() => {
    if (!isActive || !circuit) return

    const persist = () => saveToStorage({
      circuit,
      progress,
      startedAt: startedAtRef.current,
      isPaused,
      source,
      programId: programIdRef.current,
      programDayKey: programDayKeyRef.current,
    })

    persist()

    return lifecycle.onBackground(persist)
  }, [isActive, circuit, progress, isPaused, source])

  // ── Actions ─────────────────────────────────────────────────────────────

  const startCircuit = useCallback((
    c: CircuitDefinition,
    src: CircuitSource,
    progId?: string,
    progDayKey?: string,
  ) => {
    const now = Date.now()
    startedAtRef.current = now
    programIdRef.current = progId
    programDayKeyRef.current = progDayKey

    const initial: CircuitProgress = { ...INITIAL_PROGRESS, phase: 'getReady' }

    setCircuit(c)
    setSource(src)
    setProgress(initial)
    setIsPaused(false)
    setIsActive(true)

    saveToStorage({
      circuit: c,
      progress: initial,
      startedAt: now,
      isPaused: false,
      source: src,
      programId: progId,
      programDayKey: progDayKey,
    })

    track('circuit_started', { mode: c.mode, exercises: c.exercises.length, rounds: c.rounds, source: src })
  }, [track])

  const advanceExercise = useCallback(() => {
    if (!circuit) return

    setProgress(prev => {
      const totalExercises = circuit.exercises.length
      const isLastExercise = prev.currentExerciseIndex >= totalExercises - 1
      const isLastRound = prev.currentRound >= circuit.rounds - 1

      if (circuit.mode === 'timed') {
        // Timed mode: 'work' -> 'rest' -> next work, or 'roundRest' at end of round
        if (prev.phase === 'work') {
          if (isLastExercise && isLastRound) {
            return { ...prev, phase: 'celebrate', completedExercises: prev.completedExercises + 1 }
          }
          if (isLastExercise) {
            // Fin de ronda — igual que en modo circuit: roundRest solo si hay
            // descanso configurado; con restBetweenRounds=0 pasa directo.
            if (circuit.restBetweenRounds > 0) {
              return { ...prev, phase: 'roundRest', completedExercises: prev.completedExercises + 1 }
            }
            return {
              ...prev,
              phase: 'work',
              currentRound: prev.currentRound + 1,
              currentExerciseIndex: 0,
              completedExercises: prev.completedExercises + 1,
            }
          }
          // More exercises in this round — go to rest (if restSeconds > 0) or next work
          const restSec = circuit.restSeconds ?? 0
          if (restSec > 0) {
            return { ...prev, phase: 'rest', completedExercises: prev.completedExercises + 1 }
          }
          return {
            ...prev,
            phase: 'work',
            currentExerciseIndex: prev.currentExerciseIndex + 1,
            completedExercises: prev.completedExercises + 1,
          }
        }
        // If in rest or roundRest, advanceToNextPhase handles it
        return prev
      }

      // Circuit mode: 'exercise' -> 'rest' or next exercise/round
      if (prev.phase === 'exercise') {
        if (isLastExercise && isLastRound) {
          return { ...prev, phase: 'celebrate', completedExercises: prev.completedExercises + 1 }
        }
        if (isLastExercise) {
          // End of round
          if (circuit.restBetweenRounds > 0) {
            return { ...prev, phase: 'roundRest', completedExercises: prev.completedExercises + 1 }
          }
          // No round rest — go directly to next round
          return {
            ...prev,
            phase: 'exercise',
            currentRound: prev.currentRound + 1,
            currentExerciseIndex: 0,
            completedExercises: prev.completedExercises + 1,
          }
        }
        // More exercises in this round
        if (circuit.restBetweenExercises > 0) {
          return { ...prev, phase: 'rest', completedExercises: prev.completedExercises + 1 }
        }
        return {
          ...prev,
          currentExerciseIndex: prev.currentExerciseIndex + 1,
          completedExercises: prev.completedExercises + 1,
        }
      }

      return prev
    })
  }, [circuit])

  const advanceFromGetReady = useCallback(() => {
    setProgress(prev => ({
      ...prev,
      phase: circuit?.mode === 'timed' ? 'work' : 'exercise',
    }))
  }, [circuit])

  const advanceToNextPhase = useCallback(() => {
    if (!circuit) return

    setProgress(prev => {
      if (prev.phase === 'rest') {
        // After rest between exercises, go to next exercise
        const nextPhase = circuit.mode === 'timed' ? 'work' : 'exercise'
        return {
          ...prev,
          phase: nextPhase,
          currentExerciseIndex: prev.currentExerciseIndex + 1,
        }
      }

      if (prev.phase === 'roundRest') {
        // After round rest, go to first exercise of next round
        const nextPhase = circuit.mode === 'timed' ? 'work' : 'exercise'
        return {
          ...prev,
          phase: nextPhase,
          currentRound: prev.currentRound + 1,
          currentExerciseIndex: 0,
        }
      }

      return prev
    })
  }, [circuit])

  const pause = useCallback(() => {
    setIsPaused(true)
  }, [])

  const resume = useCallback(() => {
    setIsPaused(false)
  }, [])

  const doComplete = useCallback(async (note?: string) => {
    if (!circuit || !userId) return

    const data = buildCircuitSessionData(
      userId,
      circuit,
      progress,
      startedAtRef.current,
      source,
      programIdRef.current,
      programDayKeyRef.current,
      note,
    )

    // #464: por la cola offline común. Sin red (o con `status: 0`, que es «no
    // hubo respuesta», no «no llegó») la sesión se encola y la reintenta
    // `setupAutoSync` al reconectar; un 4xx/5xx del servidor es determinista y
    // se reporta en vez de encolarse para siempre.
    let saved = true
    try {
      const record = await persistOrQueue(pb, {
        collection: CIRCUIT_COLLECTION,
        action: 'create',
        data,
      })
      if (record === null) saved = false // quedó encolada
    } catch (e) {
      report(e, 'save_session')
      saved = false
    }
    setUnsavedCount(countQueuedCircuitSessions())

    // El circuito SÍ se completó físicamente aunque el guardado falle (queda
    // encolado); `saved` permite segmentar en analytics las sesiones que aún
    // no llegaron al backend.
    track('circuit_completed', {
      mode: circuit.mode,
      rounds_completed: data.rounds_completed as number,
      rounds_target: circuit.rounds,
      exercise_count: circuit.exercises.length,
      duration_seconds: data.duration_seconds as number,
      source,
      saved,
    })

    clearStorage()
    setIsActive(false)
    setCircuit(null)
    setProgress(INITIAL_PROGRESS)
    setIsPaused(false)
  }, [circuit, userId, progress, source, report, track])

  const abandonCircuit = useCallback(() => {
    clearStorage()
    setIsActive(false)
    setCircuit(null)
    setProgress(INITIAL_PROGRESS)
    setIsPaused(false)

    if (circuit) {
      const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000)
      track('circuit_abandoned', { mode: circuit.mode, duration_seconds: elapsed, source })
    }
  }, [circuit, source, track])

  // ── Flush de sesiones pendientes: en mount, al reconectar y al volver ─────

  // #464: un solo camino de drenado. `processQueue` ya serializa las pasadas
  // concurrentes (montaje, reconexión y vuelta a primer plano; entre pestañas
  // vía Web Locks), así que aquí no hace falta ningún flag de cancelación.
  const flushUnsaved = useCallback(async () => {
    if (!userId) return
    try {
      await processQueue(pb)
    } catch (e) {
      report(e, 'flush_unsaved_session')
    }
    setUnsavedCount(countQueuedCircuitSessions())
  }, [userId, report])

  useEffect(() => {
    if (!userId) return
    // Trasvasa lo que quedara de la cola casera anterior a #464 antes de contar:
    // si no, esas sesiones no las volvería a mirar nadie.
    migrateLegacyCircuitQueue()
    setUnsavedCount(countQueuedCircuitSessions())
    flushUnsaved()
  }, [userId, flushUnsaved])

  // Las dos apps escuchaban solo la mitad de esto: la web drenaba al volver la
  // red y el móvil al volver a primer plano. Ambos disparos son válidos en las
  // dos plataformas, así que ahora se escuchan los dos en las dos.
  useEffect(() => {
    const offOnline = getPlatform().connectivity.onOnline(flushUnsaved)
    const offForeground = lifecycle.onForeground(flushUnsaved)
    return () => {
      offOnline()
      offForeground()
    }
  }, [flushUnsaved])

  return {
    isActive,
    circuit,
    progress,
    startedAt: isActive ? startedAtRef.current : null,
    isPaused,
    source,
    programId: programIdRef.current,
    programDayKey: programDayKeyRef.current,
    unsavedCount,
    startCircuit,
    advanceExercise,
    advanceFromGetReady,
    advanceToNextPhase,
    pause,
    resume,
    completeCircuit: doComplete,
    abandonCircuit,
  }
}

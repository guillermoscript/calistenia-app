/**
 * Estado de la sesión de fuerza activa, compartido por web y móvil (#482).
 *
 * Antes vivía duplicado en `apps/web/src/contexts/ActiveSessionContext.tsx` y
 * `apps/mobile/src/contexts/ActiveSessionContext.tsx` (388 y 337 L, ~80 %
 * idénticas). Con `lifecycle` ya en `CorePlatform`, lo que ataba cada copia a
 * su plataforma (storage y `visibilitychange`/`AppState`) lo resuelve el
 * adapter y el resto es el mismo código.
 *
 * **La dirección del flujo NO cambia** (regla explícita de `apps/mobile/CLAUDE.md`):
 * `SessionView` sigue siendo dueño de su estado local (`stepIdx`/`phase`) y lo
 * empuja aquí; este hook nunca se lee de vuelta durante la sesión, solo para
 * restaurar tras navegar fuera. Este hook guarda y persiste lo que le empujan;
 * no conduce la sesión.
 *
 * Como en el resto del #482, el `createContext` se queda en cada app: aquí solo
 * baja el estado.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { Exercise, Workout } from '../../types'
import { op } from '../../lib/analytics'
import type { ExerciseTimingState } from '../../lib/exerciseTiming'
import { pb } from '../../lib/pocketbase'
import { STRENGTH_ACTIVE_KEY as STORAGE_KEY } from '../../lib/storage-keys'
import {
  scheduleActiveSessionPush, flushActiveSessionPush, pushActiveSessionNow,
  fetchRemoteActiveSession, clearRemoteActiveSession,
} from '../../lib/activeSessionSync'
import { storage, lifecycle } from '../../platform'

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionSource = 'program' | 'free'
export type SessionPhase = 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'

export interface SessionProgress {
  stepIdx: number
  phase: SessionPhase
  setsCount: number
  /** Snapshot serializable de los tiempos — persistido para que sobrevivan a un reinicio. */
  timing?: ExerciseTimingState
}

export interface WarmupCooldownData {
  warmupSkipped: boolean
  warmupDurationSeconds: number
  cooldownSkipped: boolean
  cooldownDurationSeconds: number
}

interface PersistedStrengthSession {
  workout: Workout
  workoutKey: string
  source: SessionSource
  progress: SessionProgress
  startedAt: number
  sectionStartTime: number | null
  /** Último guardado local — para decidir si la copia del server es más reciente */
  savedAt?: number
}

export interface ActiveSessionContextValue {
  /** Whether a session is currently active */
  isActive: boolean
  /** The workout being performed */
  workout: Workout | null
  /** Unique key for this session (e.g., "p1_lun" or "free_1234567890") */
  workoutKey: string
  /** Where the session was started from */
  source: SessionSource
  /** Number of exercises in the session */
  exerciseCount: number
  /**
   * Lee el progreso persistido SIN suscribirse a él. `SessionView` lo usa una
   * sola vez, al montar, para restaurar su reducer; suscribirse volvería a
   * re-renderizar media app en cada serie (#475).
   */
  getProgressSnapshot: () => SessionProgress
  /** Update session progress */
  setProgress: (update: Partial<SessionProgress>) => void
  /** Start a new session */
  startSession: (workout: Workout, workoutKey: string, source: SessionSource) => void
  /** End the session (completed or discarded) */
  endSession: () => void
  /** Timestamp when the session was started */
  startedAt: number
  /** Timestamp when the current section started */
  sectionStartTime: number | null
  /** Set the section start time */
  setSectionStartTime: (time: number | null) => void
  /** Get warmup/cooldown tracking data */
  getWarmupCooldownData: () => WarmupCooldownData
  /** Skip warmup — jump to first main exercise */
  skipWarmup: () => void
  /** Skip cooldown — jump to celebrate */
  skipCooldown: () => void
  /** Skip remaining cooldown exercises */
  skipRemainingCooldown: () => void
  /** Se incrementa al adoptar una sesión del server — remonta SessionView */
  resumeEpoch: number
  /** Optional rest preference hooks passed from the caller */
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

export interface UseActiveSessionStateOptions {
  /**
   * Identifica el dispositivo en el push de la sesión remota, que es lo que
   * permite reanudar un entreno en otro aparato. NO se mezcla con analytics:
   * para eso está `analyticsProps`, porque cada app manda ahí cosas distintas.
   */
  platform: 'web' | 'mobile'
  /**
   * Props extra para cada evento de analytics. El móvil manda
   * `{ platform: 'mobile' }`; la web no manda nada (su proyecto de OpenPanel
   * ya es solo de web). Se respeta lo que enviaba cada una para no alterar
   * eventos que ya están en producción.
   */
  analyticsProps?: Record<string, unknown>
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
  /**
   * Se llama al cerrar la sesión, después de limpiar el estado. La web lo usa
   * para vaciar además la cola de la sesión libre (`FREE_SESSION_QUEUE_KEY`),
   * que es suya: el móvil no guarda nada bajo esa clave.
   */
  onSessionEnded?: () => void
}

export interface UseActiveSessionStateResult {
  /** El valor del contexto "store": identidad de la sesión y acciones. */
  value: ActiveSessionContextValue
  /** El progreso vivo, que va en un contexto aparte porque cambia en cada serie. */
  progress: SessionProgress
  /**
   * Registra el abandono de la sesión. Lo expone el hook en vez de dispararlo
   * él porque el disparo es puramente web: `beforeunload`. En nativo no hay
   * equivalente —pasar a segundo plano NO es abandonar— así que el móvil
   * simplemente no lo engancha a nada.
   */
  trackAbandon: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getCurrentSection(exercises: Exercise[], stepIdx: number): 'warmup' | 'main' | 'cooldown' {
  if (!exercises[stepIdx]) return 'main'
  return exercises[stepIdx].section || 'main'
}

const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

const INITIAL_PROGRESS: SessionProgress = { stepIdx: 0, phase: 'exercise', setsCount: 0 }

// ── Persistence helpers ─────────────────────────────────────────────────────

function saveToStorage(data: PersistedStrengthSession) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* quota exceeded — ignore */ }
}

function loadFromStorage(): PersistedStrengthSession | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: PersistedStrengthSession = JSON.parse(raw)
    // Descartar sesiones de más de 24 h
    if (Date.now() - data.startedAt > MAX_SESSION_AGE_MS) {
      storage.removeItem(STORAGE_KEY)
      return null
    }
    // Validación básica de forma
    if (!data.workout || !data.workoutKey || !data.progress) {
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

// ── Hook ────────────────────────────────────────────────────────────────────

export function useActiveSessionState({
  platform,
  analyticsProps,
  getRestForExercise,
  setRestForExercise,
  onSessionEnded,
}: UseActiveSessionStateOptions): UseActiveSessionStateResult {
  // Restore síncrono — el storage de core es síncrono en ambas plataformas, así
  // que el primer render ya tiene el estado correcto.
  //
  // Init perezosa con `useState(fn)`: con `useRef(loadFromStorage())` el
  // `JSON.parse` del entreno persistido corría en CADA render del provider, o
  // sea en cada serie (#475). Y leerlo a nivel de MÓDULO —como hacía la web—
  // congelaba el snapshot en el primer import, así que remontar el provider
  // tras cerrar una sesión restauraba estado viejo.
  const [restored] = useState(loadFromStorage)

  const [isActive, setIsActive] = useState(!!restored)
  const [workout, setWorkout] = useState<Workout | null>(restored?.workout ?? null)
  const [source, setSource] = useState<SessionSource>(restored?.source ?? 'program')
  const [progress, setProgressState] = useState<SessionProgress>(restored?.progress ?? INITIAL_PROGRESS)
  const [sectionStartTime, setSectionStartTime] = useState<number | null>(restored?.sectionStartTime ?? null)
  const workoutKeyRef = useRef(restored?.workoutKey ?? '')
  const startedAtRef = useRef(restored?.startedAt ?? 0)
  const savedAtRef = useRef(restored?.savedAt ?? restored?.startedAt ?? 0)
  const isActiveRef = useRef(!!restored)
  const [resumeEpoch, setResumeEpoch] = useState(0)

  // Metadata transitoria de warmup/cooldown — refs porque no pintan UI, solo se
  // leen una vez al cerrar la sesión vía getWarmupCooldownData().
  const warmupSkippedRef = useRef(false)
  const warmupDurationRef = useRef(0)
  const cooldownSkippedRef = useRef(false)
  const cooldownDurationRef = useRef(0)

  // Espejo del progreso actualizado EN RENDER (no en un efecto): `SessionView`
  // lo lee durante su primer render, antes de que corra ningún efecto.
  const progressRef = useRef(progress)
  progressRef.current = progress

  // El callback de cierre vive en una ref para no entrar en las deps de
  // `endSession`, que debe seguir siendo estable.
  const onSessionEndedRef = useRef(onSessionEnded)
  onSessionEndedRef.current = onSessionEnded

  // En una ref por lo mismo: si la app pasa un objeto inline, no debe reentrar
  // en las deps de los callbacks ni de los efectos.
  const analyticsPropsRef = useRef(analyticsProps)
  analyticsPropsRef.current = analyticsProps

  const track = useCallback((name: string, props: Record<string, unknown>) => {
    op.track(name, { ...props, ...analyticsPropsRef.current })
  }, [])

  const getProgressSnapshot = useCallback(() => progressRef.current, [])

  const setProgress = useCallback((update: Partial<SessionProgress>) => {
    setProgressState(prev => ({ ...prev, ...update }))
  }, [])

  // Persistir en cada cambio de estado y al pasar a segundo plano
  useEffect(() => {
    if (!isActive || !workout) return

    const persist = () => {
      savedAtRef.current = Date.now()
      const data = {
        workout,
        workoutKey: workoutKeyRef.current,
        source,
        progress,
        startedAt: startedAtRef.current,
        sectionStartTime,
        savedAt: savedAtRef.current,
      }
      saveToStorage(data)
      scheduleActiveSessionPush({ ...data, platform })
    }

    persist()

    return lifecycle.onBackground(() => { persist(); flushActiveSessionPush() })
  }, [isActive, workout, source, progress, sectionStartTime, platform])

  const trackAbandon = useCallback(() => {
    if (!isActiveRef.current || !workoutKeyRef.current) return
    const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000)
    track('workout_abandoned', {
      workout_key: workoutKeyRef.current,
      source,
      duration_seconds: elapsed,
    })
  }, [source, track])

  const startSession = useCallback((w: Workout, key: string, src: SessionSource) => {
    const now = Date.now()
    workoutKeyRef.current = key
    startedAtRef.current = now
    setWorkout(w)
    setSource(src)
    setProgressState(INITIAL_PROGRESS)
    setSectionStartTime(now)
    warmupSkippedRef.current = false
    warmupDurationRef.current = 0
    cooldownSkippedRef.current = false
    cooldownDurationRef.current = 0
    setIsActive(true)
    track('session_started', { workout_key: key, source: src })
    // Persistir de inmediato
    isActiveRef.current = true
    savedAtRef.current = now
    const data = { workout: w, workoutKey: key, source: src, progress: INITIAL_PROGRESS, startedAt: now, sectionStartTime: now, savedAt: now }
    saveToStorage(data)
    pushActiveSessionNow({ ...data, platform })
  }, [platform, track])

  // Adopción de la sesión activa del server (reanudar entre dispositivos).
  // Solo al arrancar, cuando haya auth: si el server tiene una sesión más
  // reciente que la copia local (o no hay local), se adopta y se remonta
  // SessionView vía resumeEpoch.
  useEffect(() => {
    let cancelled = false
    const tryAdopt = async () => {
      const remote = await fetchRemoteActiveSession<Workout, SessionProgress>()
      if (cancelled || !remote) return
      if (isActiveRef.current) {
        // Sesión local en marcha: solo adoptar si es LA MISMA y el server va por delante
        if (remote.workoutKey !== workoutKeyRef.current) return
        if (remote.savedAt <= savedAtRef.current) return
      }
      workoutKeyRef.current = remote.workoutKey
      startedAtRef.current = remote.startedAt
      savedAtRef.current = remote.savedAt
      isActiveRef.current = true
      setWorkout(remote.workout)
      setSource(remote.source)
      setProgressState(remote.progress)
      setSectionStartTime(remote.sectionStartTime)
      setIsActive(true)
      setResumeEpoch(n => n + 1)
      saveToStorage({
        workout: remote.workout, workoutKey: remote.workoutKey, source: remote.source,
        progress: remote.progress, startedAt: remote.startedAt,
        sectionStartTime: remote.sectionStartTime, savedAt: remote.savedAt,
      })
    }
    if (pb.authStore.isValid) tryAdopt()
    const unsubAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) tryAdopt()
    })
    // Re-chequear al volver a primer plano: quizá se avanzó en otro dispositivo
    const offForeground = lifecycle.onForeground(() => {
      if (pb.authStore.isValid) tryAdopt()
    })
    return () => {
      cancelled = true
      unsubAuth()
      offForeground()
    }
  }, [])

  const getWarmupCooldownData = useCallback((): WarmupCooldownData => ({
    warmupSkipped: warmupSkippedRef.current,
    warmupDurationSeconds: warmupDurationRef.current,
    cooldownSkipped: cooldownSkippedRef.current,
    cooldownDurationSeconds: cooldownDurationRef.current,
  }), [])

  // Estos dos solo REGISTRAN la metadata de la sección saltada. Quién avanza
  // el paso y la fase es `SessionView`, que es el dueño del estado: antes lo
  // escribían los dos y coincidían por casualidad, porque recorrían la misma
  // lista de `buildSteps` por separado (#475).
  const skipWarmup = useCallback(() => {
    if (!workout) return
    warmupSkippedRef.current = true
    if (sectionStartTime) {
      warmupDurationRef.current = Math.round((Date.now() - sectionStartTime) / 1000)
    }
    // Reabrir el cronómetro de sección: sin esto, el `skipCooldown` posterior
    // mediría el enfriamiento desde el arranque del CALENTAMIENTO. El móvil no
    // lo hacía y por eso inflaba `cooldownDurationSeconds` (#482).
    setSectionStartTime(Date.now())
  }, [workout, sectionStartTime])

  const skipCooldown = useCallback(() => {
    if (!workout) return
    cooldownSkippedRef.current = true
    if (sectionStartTime) {
      cooldownDurationRef.current = Math.round((Date.now() - sectionStartTime) / 1000)
    }
  }, [workout, sectionStartTime])

  const skipRemainingCooldown = useCallback(() => {
    skipCooldown()
  }, [skipCooldown])

  const endSession = useCallback(() => {
    isActiveRef.current = false
    clearRemoteActiveSession()
    setIsActive(false)
    setWorkout(null)
    workoutKeyRef.current = ''
    startedAtRef.current = 0
    setSectionStartTime(null)
    setProgressState(INITIAL_PROGRESS)
    clearStorage()
    onSessionEndedRef.current?.()
  }, [])

  // `useMemo` NO es cosmético: el progreso cambia en CADA serie y va en un
  // contexto aparte precisamente para no re-renderizar a quien no lo lee. Si
  // este objeto cambiase de identidad en cada render, la separación de los dos
  // contextos no serviría de nada y volveríamos al problema del #475. Por eso
  // `progress` no está en las deps.
  const value: ActiveSessionContextValue = useMemo(() => ({
    isActive,
    workout,
    workoutKey: workoutKeyRef.current,
    source,
    exerciseCount: workout?.exercises.length ?? 0,
    getProgressSnapshot,
    setProgress,
    startSession,
    endSession,
    startedAt: startedAtRef.current,
    sectionStartTime,
    setSectionStartTime,
    getWarmupCooldownData,
    skipWarmup,
    skipCooldown,
    skipRemainingCooldown,
    resumeEpoch,
    getRestForExercise,
    setRestForExercise,
  }), [
    isActive, workout, source, sectionStartTime, resumeEpoch,
    getProgressSnapshot, setProgress, startSession, endSession,
    getWarmupCooldownData, skipWarmup, skipCooldown, skipRemainingCooldown,
    getRestForExercise, setRestForExercise,
  ])

  return { value, progress, trackAbandon }
}

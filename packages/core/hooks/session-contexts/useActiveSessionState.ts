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
 *
 * ## Dueño único del desenlace de la sesión (#636)
 *
 * Este hook decide con qué evento TERMINA una sesión, y garantiza que sea
 * exactamente uno. Antes la decisión estaba repartida entre tres sitios que no
 * se hablaban —`workout_completed` en `useProgressMutations`, un
 * `workout_abandoned` colgado del `beforeunload` de la web y un `endSession()`
 * mudo—, así que había sesiones sin ningún evento terminal (salir a propósito,
 * y TODO el móvil) y sesiones con dos (completar y cerrar la pestaña desde el
 * panel de celebración). Sin eso no se puede calcular una tasa de finalización.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { Exercise, Workout } from '../../types'
import { op } from '../../lib/analytics'
import {
  TRAINING_FUNNEL_EVENTS, plannedSetCount, sessionFunnelProperties,
  type SessionAbandonReason, type TrainingFunnelEvent,
} from '../../lib/session-funnel'
import type { ExerciseTimingState } from '../../lib/exerciseTiming'
import { pb } from '../../lib/pocketbase'
import { STRENGTH_ACTIVE_KEY as STORAGE_KEY } from '../../lib/storage-keys'
import {
  scheduleActiveSessionPush, flushActiveSessionPush, pushActiveSessionNow,
  fetchRemoteActiveSession, clearRemoteActiveSession,
  type RemoteActiveSession,
} from '../../lib/activeSessionSync'
import { storage, lifecycle } from '../../platform'
import { normalizeRestoredWorkout } from './normalizeRestoredWorkout'

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
  /**
   * Emite un paso INTERMEDIO del embudo (serie, ejercicio terminado, descanso
   * saltado) con el mismo bloque de propiedades que los desenlaces. Es el hook
   * quien lo construye: si cada app armase sus propias propiedades, el embudo
   * volvería a no ser comparable entre plataformas, que es el bug del #636.
   */
  trackFunnelStep: (event: TrainingFunnelEvent, extra?: Record<string, unknown>) => void
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
   * Registra el abandono de la sesión por cierre de la pestaña. Lo expone el
   * hook en vez de dispararlo él porque ese disparo concreto es puramente web
   * (`beforeunload`/`pagehide`); en nativo no hay equivalente, porque pasar a
   * segundo plano NO es abandonar el entreno.
   *
   * Las otras dos causas de abandono —caducar a las 24 h y ser reemplazada por
   * otra sesión— sí las dispara el hook, y son las que dan medición de abandono
   * en móvil, donde antes no había ninguna (#636).
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

/**
 * Sesión restaurable y, aparte, la que se descartó por caducidad.
 *
 * La caducada se devuelve en vez de tirarse en silencio porque es la ÚNICA
 * señal de abandono que existe en nativo (#636): allí no hay `beforeunload`, así
 * que una sesión que el usuario nunca terminó desaparecía sin dejar ni un
 * evento. La forma se valida ANTES que la edad: una entrada corrupta no es una
 * sesión abandonada y no debe emitir nada.
 */
interface RestoredStrengthSession {
  session: PersistedStrengthSession | null
  expired: PersistedStrengthSession | null
}

/** Exportada sólo para testear la restauración sin montar el hook (#690). */
export function loadFromStorage(): RestoredStrengthSession {
  const nothing: RestoredStrengthSession = { session: null, expired: null }
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return nothing
    const data: PersistedStrengthSession = JSON.parse(raw)
    // Validación básica de forma
    if (!data.workout || !data.workoutKey || !data.progress) {
      storage.removeItem(STORAGE_KEY)
      return nothing
    }
    // Descartar sesiones de más de 24 h
    if (Date.now() - data.startedAt > MAX_SESSION_AGE_MS) {
      storage.removeItem(STORAGE_KEY)
      return { session: null, expired: data }
    }
    // El entreno persistido es un SNAPSHOT: nadie vuelve a consultar el
    // programa mientras dura la sesión, así que una sesión empezada antes del
    // despliegue arrastraría los nombres crudos («arm_circles») y la falta de
    // cronómetro que arregló el #690 hasta terminarla o caducar. Se repasa aquí,
    // al restaurar; `id` se queda intacto (es la clave de series y PRs).
    return { session: { ...data, workout: normalizeRestoredWorkout(data.workout) }, expired: null }
  } catch {
    storage.removeItem(STORAGE_KEY)
    return nothing
  }
}

function clearStorage() {
  try { storage.removeItem(STORAGE_KEY) } catch {}
}

/**
 * La sesión que viene del server, repasada antes de adoptarla (#690).
 *
 * `active_sessions` guarda el MISMO snapshot congelado que el storage local —se
 * sube tal cual—, así que una sesión empezada antes del despliegue arrastra por
 * ahí los nombres crudos y la falta de cronómetro. Sin este repaso, reanudar en
 * el otro dispositivo reintroduciría lo que acabamos de curar al restaurar.
 *
 * Devuelve el MISMO objeto si no hubo nada que corregir. Exportada sólo para
 * poder testear la adopción sin montar el hook.
 */
export function normalizeRemoteSession(
  remote: RemoteActiveSession<Workout, SessionProgress>,
): RemoteActiveSession<Workout, SessionProgress> {
  const workout = normalizeRestoredWorkout(remote.workout)
  return workout === remote.workout ? remote : { ...remote, workout }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useActiveSessionState({
  platform,
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
  const [{ session: restored, expired }] = useState(loadFromStorage)

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

  // Los mismos espejos para el entreno y el origen: los eventos terminales se
  // emiten desde callbacks estables (`beforeunload`, `endSession`) que no
  // pueden depender del valor capturado en el render en que se crearon.
  const workoutRef = useRef(workout)
  workoutRef.current = workout
  const sourceRef = useRef(source)
  sourceRef.current = source

  /**
   * Pestillo del desenlace: se arma con el PRIMER evento terminal de la sesión
   * y bloquea los demás. Sin él, completar un entreno y cerrar después la
   * pestaña desde el panel de celebración emitía `workout_completed` **y**
   * `workout_abandoned`, y ninguna tasa de finalización salía bien (#636).
   */
  const outcomeRef = useRef<'completed' | 'exited' | 'abandoned' | null>(null)

  // El callback de cierre vive en una ref para no entrar en las deps de
  // `endSession`, que debe seguir siendo estable.
  const onSessionEndedRef = useRef(onSessionEnded)
  onSessionEndedRef.current = onSessionEnded

  const track = useCallback((name: string, props: Record<string, unknown>) => {
    op.track(name, props)
  }, [])

  /**
   * Bloque de propiedades de la sesión EN CURSO. Todo sale de refs, así que el
   * callback es estable y se puede llamar desde un listener de `beforeunload`
   * registrado una sola vez.
   */
  const funnelProps = useCallback((extra?: {
    endedAt?: number
    reason?: SessionAbandonReason
    /**
     * Cuenta de series autoritativa. La serie que dispara `set_logged` todavía
     * no ha llegado al progreso del contexto cuando el evento sale, así que sin
     * esto el evento de la primera serie diría `sets_logged: 0` y
     * `completion_pct: 0`.
     */
    setsLogged?: number
  }) => {
    const exercises = workoutRef.current?.exercises ?? []
    return sessionFunnelProperties({
      workoutKey: workoutKeyRef.current,
      source: sourceRef.current,
      startedAt: startedAtRef.current,
      endedAt: extra?.endedAt ?? Date.now(),
      exerciseCount: exercises.length,
      plannedSets: plannedSetCount(exercises),
      setsLogged: extra?.setsLogged ?? progressRef.current.setsCount,
      reason: extra?.reason,
    })
  }, [])

  /**
   * Pasos INTERMEDIOS del embudo. No pasan por el pestillo del desenlace: el
   * pestillo garantiza un único evento de CIERRE, mientras que registrar una
   * serie o saltarse un descanso puede pasar muchas veces en la misma sesión.
   *
   * El guardia de sesión activa evita que una acción rezagada (un descanso que
   * termina después de cerrar la sesión) emita un evento con `workout_key`
   * vacío, que en OpenPanel aparecería como un entreno fantasma.
   */
  const trackFunnelStep = useCallback((event: TrainingFunnelEvent, extra?: Record<string, unknown>) => {
    if (!isActiveRef.current || !workoutKeyRef.current) return
    // Un `sets_logged` explícito manda sobre el del progreso, y además vuelve a
    // derivar `completion_pct` de él: mandarlo solo en el spread dejaría las dos
    // propiedades contándose una serie de diferencia.
    const setsLogged = typeof extra?.sets_logged === 'number' ? extra.sets_logged : undefined
    track(event, { ...funnelProps({ setsLogged }), ...extra })
  }, [funnelProps, track])

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

  /**
   * Arma el pestillo si la sesión sigue sin desenlace, y dice si a quien
   * pregunta le toca emitir su evento.
   *
   * Una sesión en fase `celebrate` ya está contada: `session-machine` la pone
   * en el `dispatch({type:'finish'})` que va justo después de `onMarkDone`, o
   * sea después de `workout_completed`. La comprobación vive AQUÍ y no en cada
   * llamador porque el doble conteo real no era el del botón de cerrar, sino el
   * de completar el entreno y cerrar después la pestaña sin tocarlo (#636).
   */
  const claimOutcome = useCallback((outcome: 'exited' | 'abandoned'): boolean => {
    if (!isActiveRef.current || !workoutKeyRef.current) return false
    if (outcomeRef.current) return false
    if (progressRef.current.phase === 'celebrate') {
      outcomeRef.current = 'completed'
      return false
    }
    outcomeRef.current = outcome
    return true
  }, [])

  const abandon = useCallback((reason: SessionAbandonReason) => {
    if (!claimOutcome('abandoned')) return
    track(TRAINING_FUNNEL_EVENTS.workoutAbandoned, funnelProps({ reason }))
  }, [claimOutcome, funnelProps, track])

  // Sin argumentos a propósito: la web lo pasa DIRECTAMENTE a
  // `addEventListener`, así que un parámetro opcional aquí recibiría el objeto
  // `BeforeUnloadEvent` como si fuese la causa del abandono.
  const trackAbandon = useCallback(() => { abandon('page_closed') }, [abandon])

  // Una sesión que caducó a las 24 h nunca se completó: es un abandono y hay
  // que declararlo. Va en un efecto y no en el `useState` inicial porque emitir
  // analytics durante el render sería un efecto colateral en mitad de React.
  //
  // La contrapartida está asumida: el evento llega cuando el usuario vuelve a
  // abrir la app, que pueden ser días después. `duration_seconds` sí es real
  // (mide del arranque al último guardado), pero el timestamp del evento no es
  // el del abandono.
  useEffect(() => {
    if (!expired) return
    // Misma regla que en vivo: si quedó en `celebrate`, el entreno se terminó y
    // ya lo contó `workout_completed`; lo que caducó es la basura del storage.
    if (expired.progress?.phase === 'celebrate') return
    track(TRAINING_FUNNEL_EVENTS.workoutAbandoned, sessionFunnelProperties({
      workoutKey: expired.workoutKey,
      source: expired.source,
      startedAt: expired.startedAt,
      endedAt: expired.savedAt ?? expired.startedAt,
      exerciseCount: expired.workout?.exercises?.length ?? 0,
      plannedSets: plannedSetCount(expired.workout?.exercises ?? []),
      setsLogged: expired.progress?.setsCount ?? 0,
      reason: 'expired',
    }))
    // `expired` sale de un `useState` inicial: no cambia en toda la vida del
    // provider, así que esto corre una sola vez.
  }, [expired, track])

  const startSession = useCallback((w: Workout, key: string, src: SessionSource) => {
    // Arrancar un entreno teniendo otro a medias abandona el anterior: es la
    // otra señal de abandono que sí existe en nativo (#636). Con la MISMA clave
    // no cuenta — eso es reanudar, no cambiar de entreno.
    if (isActiveRef.current && workoutKeyRef.current && workoutKeyRef.current !== key) {
      abandon('replaced')
    }
    outcomeRef.current = null
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
    track(TRAINING_FUNNEL_EVENTS.sessionStarted, sessionFunnelProperties({
      workoutKey: key,
      source: src,
      exerciseCount: w.exercises.length,
      plannedSets: plannedSetCount(w.exercises),
      setsLogged: 0,
    }))
    // Persistir de inmediato
    isActiveRef.current = true
    savedAtRef.current = now
    const data = { workout: w, workoutKey: key, source: src, progress: INITIAL_PROGRESS, startedAt: now, sectionStartTime: now, savedAt: now }
    saveToStorage(data)
    pushActiveSessionNow({ ...data, platform })
  }, [abandon, platform, track])

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
      // Repasado igual que al restaurar del storage: la copia del server es el
      // mismo snapshot congelado y arrastra los mismos nombres crudos y la
      // misma falta de cronómetro (#690).
      const adopted = normalizeRemoteSession(remote)
      workoutKeyRef.current = remote.workoutKey
      startedAtRef.current = remote.startedAt
      savedAtRef.current = remote.savedAt
      isActiveRef.current = true
      // Adoptar es empezar a llevar OTRA sesión: el pestillo del desenlace de
      // la anterior no puede seguir armado o esta se quedaría sin evento final.
      outcomeRef.current = null
      setWorkout(adopted.workout)
      setSource(remote.source)
      setProgressState(remote.progress)
      setSectionStartTime(remote.sectionStartTime)
      setIsActive(true)
      setResumeEpoch(n => n + 1)
      saveToStorage({
        workout: adopted.workout, workoutKey: remote.workoutKey, source: remote.source,
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
    const alreadySkipped = warmupSkippedRef.current
    warmupSkippedRef.current = true
    if (sectionStartTime) {
      warmupDurationRef.current = Math.round((Date.now() - sectionStartTime) / 1000)
    }
    // Solo el PRIMER salto emite: la metadata se puede reescribir sin coste,
    // pero dos eventos por un solo calentamiento saltado vuelven a inflar la
    // cifra, que es exactamente el bug del §2.1 (#636).
    if (!alreadySkipped) {
      trackFunnelStep(TRAINING_FUNNEL_EVENTS.warmupSkipped, {
        section_duration_seconds: warmupDurationRef.current,
      })
    }
    // Reabrir el cronómetro de sección: sin esto, el `skipCooldown` posterior
    // mediría el enfriamiento desde el arranque del CALENTAMIENTO. El móvil no
    // lo hacía y por eso inflaba `cooldownDurationSeconds` (#482).
    setSectionStartTime(Date.now())
  }, [workout, sectionStartTime, trackFunnelStep])

  /**
   * `scope` distingue saltar el enfriamiento entero de saltar lo que queda de
   * él. Va como propiedad y no como dos eventos porque la pregunta del embudo
   * —«¿cuánta gente se salta el enfriamiento?»— es la misma en los dos casos.
   */
  const registerCooldownSkip = useCallback((scope: 'full' | 'remaining') => {
    if (!workout) return
    const alreadySkipped = cooldownSkippedRef.current
    cooldownSkippedRef.current = true
    if (sectionStartTime) {
      cooldownDurationRef.current = Math.round((Date.now() - sectionStartTime) / 1000)
    }
    if (!alreadySkipped) {
      trackFunnelStep(TRAINING_FUNNEL_EVENTS.cooldownSkipped, {
        section_duration_seconds: cooldownDurationRef.current,
        scope,
      })
    }
  }, [workout, sectionStartTime, trackFunnelStep])

  // Envoltorios sin argumentos a propósito: los dos se pasan directos a un
  // `onPress`/`onClick` en las apps, que llamaría al callback con el evento del
  // DOM como primer argumento.
  const skipCooldown = useCallback(() => {
    registerCooldownSkip('full')
  }, [registerCooldownSkip])

  const skipRemainingCooldown = useCallback(() => {
    registerCooldownSkip('remaining')
  }, [registerCooldownSkip])

  const endSession = useCallback(() => {
    // Quién cierra la sesión NO dice si estaba terminada: el mismo `endSession()`
    // lo llama el botón de salir y el panel de celebración. Lo resuelve el
    // pestillo, mirando la fase.
    if (claimOutcome('exited')) {
      track(TRAINING_FUNNEL_EVENTS.sessionExited, funnelProps())
    }
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
  }, [claimOutcome, funnelProps, track])

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
    trackFunnelStep,
    skipWarmup,
    skipCooldown,
    skipRemainingCooldown,
    resumeEpoch,
    getRestForExercise,
    setRestForExercise,
  }), [
    isActive, workout, source, sectionStartTime, resumeEpoch,
    getProgressSnapshot, setProgress, startSession, endSession,
    getWarmupCooldownData, trackFunnelStep, skipWarmup, skipCooldown, skipRemainingCooldown,
    getRestForExercise, setRestForExercise,
  ])

  return { value, progress, trackAbandon }
}

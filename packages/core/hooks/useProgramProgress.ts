/**
 * useProgramProgress — progreso DENTRO del programa activo (#616).
 *
 * No hace ninguna consulta propia: compone lo que `WorkoutContext` ya tiene
 * montado (la inscripción de `usePrograms` y el `ProgressMap` de `useProgress`)
 * y se lo pasa a la lib pura `programProgress.ts`. Cualquier consulta extra
 * aquí sería una segunda lectura de filas que ya están en caché, y podría
 * discrepar de lo que pinta `isWorkoutDone`.
 *
 * Además es donde vive el efecto de borde que la lib no puede tener:
 *
 * - **La fase deja de ser `settings.phase`.** El override manual se guarda en
 *   `user_programs.current_phase`, es decir POR PROGRAMA: apuntarse a otro
 *   programa empieza de cero, que es justo lo que no pasaba con el entero
 *   global del usuario.
 * - **Al superar la última semana** la inscripción pasa a `status: 'completed'`
 *   con su `ended_at`. `is_current` se deja en `true` a propósito: el programa
 *   tiene que seguir visible en las pantallas. Quitarlo (y sugerir el
 *   siguiente) es el follow-up de esta issue.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { nowLocalForPB, todayStr, utcToLocalDateStr } from '../lib/dateUtils'
import { wallClockDay } from '../lib/wallClock'
import { qk } from '../lib/query-keys'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '../lib/analytics'
import { extensionWeeksFor, programOutcome } from '../lib/programOutcome'
import {
  completedWorkoutsFromProgress,
  computeProgramProgress,
  daysPastProgramEnd,
  programAdherencePct,
  isDeloadWeek,
  weekInPhase,
  type ProgramProgress,
} from '../lib/programProgress'
import { applyDeload } from '../lib/deload'
import { applyWeeklyProgression } from '../lib/weeklyProgression'
import type { ActiveEnrollment } from './usePrograms'
import type { Phase, ProgramMeta, ProgressMap, WeekDay, Workout } from '../types'

export interface UseProgramProgressArgs {
  userId: string | null
  activeProgram: ProgramMeta | null
  activeEnrollment: ActiveEnrollment | null
  phases: Phase[]
  weekDays: WeekDay[]
  /** El `ProgressMap` de `useProgress`, ya deduplicado y con la cola offline. */
  progress: ProgressMap
  /**
   * `settings.phase`, el entero global que era la fuente de verdad antes de
   * #616. Solo se usa cuando no hay nada de donde derivar la fase (sin programa
   * activo, o con un programa sin fases): así quien todavía no se ha inscrito
   * sigue viendo la fase que tenía, y ninguna pantalla necesita el `||
   * settings.phase` repetido.
   */
  settingsPhase?: number
}

export interface UseProgramProgressReturn {
  programProgress: ProgramProgress
  /**
   * Fija (o quita, con `null`) el override manual de fase para el programa
   * activo. Sin inscripción activa no hace nada y devuelve `false`.
   */
  setPhaseOverride: (phase: number | null) => Promise<boolean>
  /**
   * Extiende el programa terminado para ponerse al día (#938): reabre la
   * inscripción y le suma las semanas que hagan falta para que queden al menos
   * dos desde hoy. Quien llama comprueba antes `canExtendProgram`.
   */
  extendProgram: () => Promise<boolean>
}

export function useProgramProgress({
  userId, activeProgram, activeEnrollment, phases, weekDays, progress, settingsPhase,
}: UseProgramProgressArgs): UseProgramProgressReturn {
  const qc = useQueryClient()

  const completed = useMemo(() => completedWorkoutsFromProgress(progress), [progress])

  // `todayStr()` se resuelve en el render y NO se memoiza con el resto: si se
  // congelara, una sesión abierta toda la noche seguiría diciendo «hoy toca»
  // del día anterior. Recalcularlo es una lectura de reloj, no una consulta.
  const today = todayStr()

  const computed = useMemo(() => computeProgramProgress({
    startedAt: activeEnrollment?.started_at ?? '',
    durationWeeks: activeProgram?.duration_weeks ?? 0,
    extendedWeeks: activeEnrollment?.extended_weeks ?? 0,
    phases,
    weekDays,
    completed,
    // `user_programs.started_at` se escribe con `nowLocalForPB()`: hora de pared
    // local, no UTC, así que su día son los 10 primeros caracteres.
    utcToLocalDay: (stamp: string) => wallClockDay(stamp) ?? utcToLocalDateStr(stamp),
    today,
    phaseOverride: activeEnrollment?.current_phase ?? null,
  }), [activeEnrollment, activeProgram, phases, weekDays, completed, today])

  const programProgress = useMemo<ProgramProgress>(() => (
    computed.phaseSource === 'fallback' && typeof settingsPhase === 'number' && settingsPhase >= 1
      ? { ...computed, currentPhase: Math.floor(settingsPhase) }
      : computed
  ), [computed, settingsPhase])

  const setPhaseOverride = useCallback(async (phase: number | null): Promise<boolean> => {
    if (!userId || !activeEnrollment) return false
    // 0 es «automática»: el campo es `required: false` justamente porque un
    // number requerido en PocketBase rechaza el 0 (#376).
    const value = typeof phase === 'number' && phase >= 1 ? Math.floor(phase) : 0
    try {
      await pb.collection('user_programs').update(activeEnrollment.id, { current_phase: value })
      qc.setQueryData<ActiveEnrollment | null>(
        qk.programs.enrollment(userId),
        (old) => (old ? { ...old, current_phase: value } : old),
      )
      return true
    } catch (e) {
      console.error('useProgramProgress: setPhaseOverride error', e)
      return false
    }
  }, [userId, activeEnrollment, qc])

  // ── Cierre automático al superar la última semana ──────────────────────────
  // El ref evita reintentar en bucle si PB rechaza la escritura: sin él, cada
  // render volvería a lanzar el update mientras `isCompleted` siga siendo true.
  const closedRef = useRef<string | null>(null)
  const enrollmentId = activeEnrollment?.id ?? null
  const shouldClose = !!enrollmentId
    && activeEnrollment?.status === 'active'
    && programProgress.isCompleted

  useEffect(() => {
    if (!userId || !enrollmentId || !shouldClose) return
    if (closedRef.current === enrollmentId) return
    closedRef.current = enrollmentId
    // Se fotografía ANTES de escribir: tras el `update` la inscripción cambia y
    // el progreso podría recalcularse con otro programa.
    const completedProps = {
      surface: 'program',
      source: 'program_progress',
      // #938: `completed` con adherencia ≥ 70 %, `finished` por debajo.
      result: programOutcome(programProgress),
      extended_weeks: activeEnrollment?.extended_weeks ?? 0,
      program_id: activeProgram?.id,
      program_slug: activeProgram?.slug,
      difficulty: activeProgram?.difficulty,
      goal_type: activeProgram?.goal_type,
      duration_weeks: programProgress.totalWeeks,
      sessions_done: programProgress.programSessionsDone,
      sessions_planned: programProgress.programSessionsPlanned,
      adherence_pct: programAdherencePct(programProgress) ?? undefined,
      days_late: daysPastProgramEnd(programProgress.endDay, today),
    }
    pb.collection('user_programs')
      .update(enrollmentId, { status: 'completed', ended_at: nowLocalForPB() })
      .then(() => {
        // Una vez por inscripción: solo el cliente cuya escritura pasó de
        // `active` a `completed` llega aquí (el ref evita el reintento local, y
        // en el siguiente arranque `status` ya no es `active`).
        trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.programCompleted, completedProps)
        qc.setQueryData<ActiveEnrollment | null>(
          qk.programs.enrollment(userId),
          (old) => (old && old.id === enrollmentId ? { ...old, status: 'completed' } : old),
        )
      })
      .catch((e) => {
        console.error('useProgramProgress: no se pudo cerrar el programa', e)
      })
    // `activeProgram`/`programProgress`/`today` solo se leen para el evento; el
    // ref impide que un cambio suyo vuelva a cerrar la inscripción.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, enrollmentId, shouldClose, qc])

  const extendProgram = useCallback(async (): Promise<boolean> => {
    if (!userId || !activeEnrollment) return false
    const weeks = extensionWeeksFor(programProgress.endDay, today)
    try {
      await pb.collection('user_programs').update(activeEnrollment.id, {
        status: 'active',
        ended_at: '',
        extended_weeks: weeks,
      })
      // El efecto de cierre lleva un ref por inscripción para no reintentar en
      // bucle; tras extender, el MISMO id tiene que poder cerrarse otra vez al
      // acabar la extensión.
      closedRef.current = null
      qc.setQueryData<ActiveEnrollment | null>(
        qk.programs.enrollment(userId),
        (old) => (old && old.id === activeEnrollment.id ? { ...old, status: 'active', extended_weeks: weeks } : old),
      )
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.programExtended, {
        surface: 'home',
        source: 'program_complete',
        result: 'extended',
        program_id: activeProgram?.id,
        program_slug: activeProgram?.slug,
        extended_weeks: weeks,
        sessions_done: programProgress.programSessionsDone,
        sessions_planned: programProgress.programSessionsPlanned,
      })
      return true
    } catch (e) {
      console.error('useProgramProgress: no se pudo extender el programa', e)
      return false
    }
  }, [userId, activeEnrollment, activeProgram, programProgress, today, qc])

  return { programProgress, setPhaseOverride, extendProgram }
}

/**
 * `getWorkout` con la semana en curso aplicada: progresión semanal (#755) y
 * descarga (#716).
 *
 * Envuelve el `getWorkout` de `usePrograms`, que no puede saber en qué semana
 * está el usuario: la semana sale de `programProgress`, que se calcula DESPUÉS
 * con las fases que `usePrograms` devuelve. Va aquí y no en cada contexto para
 * que web y móvil no lleven dos copias — y por eso las dos plataformas enseñan
 * lo mismo sin que ninguna pantalla sepa que existe una rampa.
 *
 * **El orden importa**: primero la rampa y después la descarga. La descarga
 * parte las series de lo que toca ESA semana, no de lo que tocaba la primera.
 * Este es el único sitio donde una sesión ya construida se transforma, y las
 * dos transformaciones son funciones puras (`weeklyProgression.ts`,
 * `deload.ts`) que no saben nada de React.
 *
 * Los resultados se cachean por clave `p{fase}_{día}` mientras no cambien las
 * entradas: `WorkoutPage` llama a `getWorkout` en cada render y varios efectos
 * dependen de la identidad del `Workout` (el evento `workout_day_viewed`, la
 * duración estimada). Devolver un objeto nuevo cada vez los dispararía en bucle.
 */
export function useWeekAwareGetWorkout(
  getWorkout: (phaseNumber: number, dayId: string) => Workout | null,
  phases: Phase[],
  programProgress: Pick<ProgramProgress, 'currentWeek' | 'isCompleted' | 'hasStarted'>,
): (phaseNumber: number, dayId: string) => Workout | null {
  const week = programProgress.hasStarted && !programProgress.isCompleted ? programProgress.currentWeek : null
  const cache = useMemo(() => new Map<string, Workout | null>(), [getWorkout, phases, week])
  return useCallback((phaseNumber: number, dayId: string) => {
    const key = `p${phaseNumber}_${dayId}`
    if (cache.has(key)) return cache.get(key)!
    const raw = getWorkout(phaseNumber, dayId)
    let out = raw
    if (out) {
      const deload = isDeloadWeek(phases, phaseNumber, week)
      out = applyWeeklyProgression(out, weekInPhase(phases, phaseNumber, week), deload)
      if (deload) out = applyDeload(out)
    }
    cache.set(key, out)
    return out
  }, [cache, getWorkout, phases, week])
}

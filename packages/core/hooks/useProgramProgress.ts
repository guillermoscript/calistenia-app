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
import { qk } from '../lib/query-keys'
import {
  completedWorkoutsFromProgress,
  computeProgramProgress,
  type ProgramProgress,
} from '../lib/programProgress'
import type { ActiveEnrollment } from './usePrograms'
import type { Phase, ProgramMeta, ProgressMap, WeekDay } from '../types'

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
    phases,
    weekDays,
    completed,
    utcToLocalDay: utcToLocalDateStr,
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
    pb.collection('user_programs')
      .update(enrollmentId, { status: 'completed', ended_at: nowLocalForPB() })
      .then(() => {
        qc.setQueryData<ActiveEnrollment | null>(
          qk.programs.enrollment(userId),
          (old) => (old && old.id === enrollmentId ? { ...old, status: 'completed' } : old),
        )
      })
      .catch((e) => {
        console.error('useProgramProgress: no se pudo cerrar el programa', e)
      })
  }, [userId, enrollmentId, shouldClose, qc])

  return { programProgress, setPhaseOverride }
}

/**
 * useAutoProgression — el puente entre la lib pura `autoProgression.ts` y las
 * dos cosas que esta no puede tocar: el catálogo y PocketBase (#617).
 *
 * La regla de negocio entera vive en `suggestProgression`, que es donde se
 * puede probar sin renderizar nada. Aquí solo hay cableado:
 *
 *  - traducir `ExerciseLog[]` (lo que guarda el ProgressMap) a la forma que la
 *    lib entiende,
 *  - resolver la variante más dura contra el índice del catálogo,
 *  - y escribir la aceptación en el sitio que toca según de quién sea el
 *    programa.
 *
 * DÓNDE ATERRIZA UNA ACEPTACIÓN
 * -----------------------------
 * Si el programa es del usuario, en `program_exercises`: es su programa y puede
 * editarlo. Si es ajeno —los oficiales, o el de otra persona—, en
 * `user_program_overrides`, porque escribir en `program_exercises` sería
 * cambiarle el programa a todos los demás inscritos. La comprobación se hace
 * aquí Y la sostiene la regla de API de la colección; la de API es la que manda.
 */
import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import i18n from 'i18next'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { localize } from '../lib/i18n-db'
import { getCatalogEntry, getVariantsByLevel } from '../lib/variants'
import { resolveExerciseId } from '../lib/resolveExerciseId'
import {
  suggestProgression,
  type ProgressionSession,
  type ProgressionSuggestion,
  type SuggestProgressionOptions,
  type VariantRef,
} from '../lib/autoProgression'
import type { ProgramOverride } from '../lib/programOverrides'
import type { Exercise, ExerciseLog } from '../types'

// ─── Overrides guardados ─────────────────────────────────────────────────────

interface OverrideRecord {
  id: string
  exercise_id: string
  exercise_id_override?: string
  reps_override?: string
}

function toOverride(rec: OverrideRecord, locale: string): ProgramOverride {
  const variantId = rec.exercise_id_override || undefined
  return {
    exerciseId: rec.exercise_id,
    exerciseIdOverride: variantId,
    repsOverride: rec.reps_override || undefined,
    // El nombre se resuelve aquí, contra el catálogo, y no se guarda en PB: si
    // se guardara, quedaría congelado en el idioma en que se aceptó.
    exerciseNameOverride: variantId ? variantName(variantId, locale) : undefined,
  }
}

/**
 * Nombre localizado de una variante, o `undefined` si el catálogo aún no ha
 * cargado o el id no está en él.
 *
 * `undefined` es un valor útil, no un fallo: `applyOverrideToExercise` conserva
 * entonces el nombre viejo, que es mejor que dejar el ejercicio sin nombre.
 */
function variantName(exerciseId: string, locale: string): string | undefined {
  const entry = getCatalogEntry(exerciseId)
  if (!entry) return undefined
  return localize(entry.name, locale) || undefined
}

/**
 * Lo que este usuario ha aceptado sobre este programa.
 *
 * Devuelve `[]` mientras carga y también si la colección no responde: un fallo
 * leyendo overrides tiene que degradar a «el programa tal cual lo prescribió su
 * autor», nunca dejar la sesión sin días.
 */
export function useProgramOverrides(
  userId: string | null,
  programId: string | null,
): { overrides: ProgramOverride[]; loading: boolean } {
  const locale = i18n.language

  const query = useQuery({
    queryKey: qk.programs.overrides(userId, programId),
    enabled: !!userId && !!programId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProgramOverride[]> => {
      try {
        const res = await pb.collection('user_program_overrides').getList(1, 200, {
          requestKey: null,
          filter: pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: programId }),
        })
        return res.items.map(r => toOverride(r as unknown as OverrideRecord, locale))
      } catch {
        return []
      }
    },
  })

  return { overrides: query.data ?? [], loading: query.isLoading }
}

// ─── Opt-in ──────────────────────────────────────────────────────────────────

/**
 * Enciende o apaga la progresión automática de la inscripción activa.
 *
 * Escribe en `user_programs` y refresca la caché de la inscripción en el sitio,
 * igual que `setPhaseOverride` (#616): la pantalla que tiene el interruptor
 * necesita ver el cambio sin esperar al siguiente refetch.
 */
export function useSetAutoProgress(
  userId: string | null,
  enrollmentId: string | null,
): (enabled: boolean) => Promise<boolean> {
  const qc = useQueryClient()

  return useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!userId || !enrollmentId) return false
    try {
      await pb.collection('user_programs').update(enrollmentId, { auto_progress: enabled })
      qc.setQueryData<{ auto_progress: boolean } | null>(
        qk.programs.enrollment(userId),
        (old) => (old ? { ...old, auto_progress: enabled } : old),
      )
      return true
    } catch (e) {
      console.error('useSetAutoProgress: no se pudo cambiar el opt-in', e)
      return false
    }
  }, [userId, enrollmentId, qc])
}

// ─── Sugerencia ──────────────────────────────────────────────────────────────

/**
 * `ExerciseLog[]` → lo que la lib entiende.
 *
 * Cada serie aporta su propio número. En un ejercicio de temporizador ese
 * número son SEGUNDOS, porque es lo que la app guarda en la columna `reps`; la
 * lib lo sabe por `isTimer` y no hay conversión que hacer aquí.
 */
export function toSessions(logs: ExerciseLog[]): ProgressionSession[] {
  return (logs ?? []).map(log => ({
    date: log.date,
    values: (log.sets ?? [])
      .map(s => Number(String(s.reps ?? '').match(/\d+/)?.[0]))
      .filter((n): n is number => Number.isFinite(n)),
  }))
}

/** La variante `harder` de la familia, ya localizada, o `null`. */
export function harderVariantOf(exerciseId: string, locale: string): VariantRef | null {
  const next = getVariantsByLevel(exerciseId).harder[0]
  if (!next) return null
  return { id: next.id, name: localize(next.name, locale) || next.id }
}

/**
 * Qué proponerle hoy a quien va a hacer este ejercicio, o `null` si no hay nada
 * seguro que proponer (que es lo normal).
 *
 * `enabled` es el opt-in de la inscripción (`user_programs.auto_progress`): con
 * él apagado ni siquiera se evalúa, para que activar la progresión sea una
 * decisión consciente y no una sorpresa.
 */
export function useProgressionSuggestion(
  exercise: Exercise | null | undefined,
  logs: ExerciseLog[],
  { enabled, ...options }: { enabled: boolean } & SuggestProgressionOptions,
): ProgressionSuggestion | null {
  const locale = i18n.language

  return useMemo(() => {
    if (!enabled || !exercise) return null
    // La variante se busca por el ejercicio REAL que se está haciendo: en un
    // hueco ya sustituido, `variant_of` es la variante vigente.
    //
    // Y pasa por `resolveExerciseId` porque `program_exercises.exercise_id`
    // guarda DOS cosas según la antigüedad del programa: el id canónico del
    // catálogo (los nuevos) o una clave de slot tipo `lun_1_2` (los viejos), tal
    // y como documenta `exercise-resolver.ts`. Sin resolver, los programas
    // viejos no tendrían familia y jamás verían un cambio de variante. Los que
    // ni así resuelven caen solos: `getVariantsByLevel` devuelve vacío y la lib
    // deja de sugerir variante — que es la degradación correcta, no un fallo.
    const catalogId = resolveExerciseId(exercise.variant_of || exercise.id)
    return suggestProgression(exercise, toSessions(logs), {
      ...options,
      harderVariant: () => harderVariantOf(catalogId, locale),
    })
    // `options` se desestructura arriba y sus valores son primitivos; incluir el
    // objeto entero metería una referencia nueva por render (#451).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, exercise, logs, locale, options.sessionsAtTarget, options.repsCap, options.secondsCap])
}

// ─── Aceptación ──────────────────────────────────────────────────────────────

export interface AcceptProgressionArgs {
  suggestion: ProgressionSuggestion
  /** El ejercicio tal y como está hoy en el día. */
  exercise: Exercise
  programId: string
  /** `created_by` del programa: decide dónde se escribe. */
  programOwnerId: string | null
  userId: string
}

/**
 * Acepta una sugerencia y la deja escrita donde corresponda.
 *
 * Devuelve `false` sin lanzar si algo falla: aceptar una progresión es un gesto
 * accesorio dentro de una sesión de entrenamiento, y no puede costarle al
 * usuario la sesión entera.
 */
export function useAcceptProgression(): (args: AcceptProgressionArgs) => Promise<boolean> {
  const qc = useQueryClient()

  return useCallback(async ({
    suggestion, exercise, programId, programOwnerId, userId,
  }: AcceptProgressionArgs): Promise<boolean> => {
    if (!userId || !programId) return false

    const reps = String(suggestion.to)
    const isMine = !!programOwnerId && programOwnerId === userId

    try {
      if (isMine && exercise.pbRecordId) {
        // Programa propio: se edita la prescripción de verdad.
        await pb.collection('program_exercises').update(exercise.pbRecordId, {
          reps,
          ...(suggestion.kind === 'variant' ? { exercise_id: suggestion.exerciseId } : {}),
          ...(exercise.isTimer ? { timer_seconds: suggestion.to } : {}),
        })
        await qc.invalidateQueries({ queryKey: qk.programs.detail(programId) })
        return true
      }

      // Programa ajeno: la aceptación es SUYA, no del programa. Se busca la
      // fila existente antes de crear porque el índice único
      // (user, program, exercise_id) rechaza el duplicado con un 400.
      const payload = {
        user: userId,
        program: programId,
        exercise_id: exercise.id,
        reps_override: reps,
        ...(suggestion.kind === 'variant' ? { exercise_id_override: suggestion.exerciseId } : {}),
      }

      let existing: { id: string } | null = null
      try {
        existing = await pb.collection('user_program_overrides').getFirstListItem(
          pb.filter('user = {:uid} && program = {:pid} && exercise_id = {:eid}', {
            uid: userId, pid: programId, eid: exercise.id,
          }),
          { requestKey: null },
        )
      } catch { /* no había override previo */ }

      if (existing) {
        await pb.collection('user_program_overrides').update(existing.id, payload)
      } else {
        await pb.collection('user_program_overrides').create(payload)
      }

      await qc.invalidateQueries({ queryKey: qk.programs.overrides(userId, programId) })
      return true
    } catch (e) {
      console.error('useAcceptProgression: no se pudo guardar la progresión', e)
      return false
    }
  }, [qc])
}

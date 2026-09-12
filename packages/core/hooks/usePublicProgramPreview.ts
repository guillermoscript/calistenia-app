/**
 * Vista previa pública de un programa compartido (#604).
 *
 * `/shared/:id` sin sesión no puede leer `programs`: su `viewRule` exige
 * `@request.auth.id != ""` y desde #603 además filtra por `visibility`. Este
 * hook consume `GET /api/programs/{id}/public`, la ruta de `pb_hooks` que corre
 * con `$app` y devuelve un puñado de campos solo si el programa está marcado
 * como `link` o `public` — mismo patrón que `useInviteLanding` con
 * `referral-lookup` y `challenge-preview` (#313, #473).
 *
 * Los campos de texto llegan en crudo (`{es, en}` o string plano) y se pasan
 * por `localize()` al pintar: así un cambio de idioma no obliga a volver a
 * consultar (#474).
 *
 * Un 404 no es un error que enseñar: significa «este programa no es
 * compartible», que es exactamente el mismo mensaje que «no existe» — y
 * distinguirlos en la UI filtraría qué ids hay en la base. Los dos casos
 * devuelven `program: null`.
 */

import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import type { TranslatableField } from '../lib/i18n-db'

export interface PublicProgramExercise {
  name: TranslatableField
  sets: number | string
  reps: string
  muscles: TranslatableField
}

export interface PublicProgramPreview {
  id: string
  name: TranslatableField
  description: TranslatableField
  durationWeeks: number
  daysPerWeek: number
  goalType: string
  intensity: string
  authorName: string
  phaseCount: number
  exerciseCount: number
  exercises: PublicProgramExercise[]
}

/** Tal cual sale de `pb_hooks/public_program_preview.pb.js`. */
interface PublicProgramResponse {
  id: string
  name?: TranslatableField
  description?: TranslatableField
  duration_weeks?: number
  days_per_week?: number
  goal_type?: string
  intensity?: string
  author_name?: string
  phase_count?: number
  exercise_count?: number
  exercises?: {
    name?: TranslatableField
    sets?: number | string
    reps?: string
    muscles?: TranslatableField
  }[]
}

export async function fetchPublicProgramPreview(
  programId: string,
): Promise<PublicProgramPreview | null> {
  const res = await fetch(
    `${pb.baseUrl}/api/programs/${encodeURIComponent(programId)}/public`,
  )
  if (!res.ok) return null

  const raw = (await res.json()) as PublicProgramResponse
  return {
    id: raw.id,
    name: raw.name ?? '',
    description: raw.description ?? '',
    durationWeeks: raw.duration_weeks ?? 0,
    daysPerWeek: raw.days_per_week ?? 0,
    goalType: raw.goal_type ?? '',
    intensity: raw.intensity ?? '',
    authorName: raw.author_name ?? '',
    phaseCount: raw.phase_count ?? 0,
    exerciseCount: raw.exercise_count ?? 0,
    exercises: (raw.exercises ?? []).map(ex => ({
      name: ex.name ?? '',
      sets: ex.sets ?? 0,
      reps: ex.reps ?? '',
      muscles: ex.muscles ?? '',
    })),
  }
}

export function usePublicProgramPreview(programId: string | null) {
  const query = useQuery({
    queryKey: qk.programs.publicPreview(programId),
    enabled: !!programId,
    staleTime: 60_000,
    // Un programa que deja de ser compartible no debe seguir viéndose porque
    // la respuesta anterior siguiera en el caché de disco.
    gcTime: 5 * 60_000,
    queryFn: () => fetchPublicProgramPreview(programId!),
  })

  return {
    program: query.data ?? null,
    loading: query.isLoading,
  }
}

/**
 * Rutina completa del programa activo de un usuario (#473).
 *
 * Sustituye al `useEffect` de `RoutineViewPage`, que hacía cuatro peticiones en
 * cascada y seis `useState` sueltos. Aquí van en dos olas —lo que se puede
 * pedir a la vez, se pide a la vez— y el join fases × días vive en
 * `lib/routine-view.ts`, donde se puede testear sin montar nada.
 *
 * Los textos salen crudos: quien los pinta los localiza. Antes se localizaban
 * dentro del efecto, así que cambiar de idioma repetía las cuatro peticiones.
 */

import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { buildPhaseGroups } from '../lib/routine-view'
import { profileDisplayName } from '../lib/public-profile'
import type {
  RoutineExerciseRow,
  RoutinePhaseGroup,
  RoutinePhaseRow,
} from '../lib/routine-view'
import type { TranslatableField } from '../lib/i18n-db'

export type { RoutinePhaseGroup, RoutineDayGroup, RoutineExerciseRow } from '../lib/routine-view'

export interface RoutineProgram {
  id: string
  name: TranslatableField
  description: TranslatableField
  durationWeeks: number
}

interface RoutineViewData {
  userName: string
  program: RoutineProgram | null
  phaseGroups: RoutinePhaseGroup[]
}

export function useRoutineView(userId: string | null) {
  const query = useQuery({
    queryKey: qk.routineView(userId),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<RoutineViewData> => {
      const uid = userId!

      // Primera ola: el nombre de quien comparte y su inscripción activa. Son
      // independientes entre sí, solo dependen de `uid`.
      const [user, enrollment] = await Promise.all([
        pb.collection('users').getOne(uid, { $autoCancel: false }),
        pb
          .collection('user_programs')
          .getFirstListItem(pb.filter('user = {:uid} && is_current = true', { uid }), {
            expand: 'program',
            $autoCancel: false,
          })
          .catch(() => null),
      ])

      const userName = profileDisplayName(user as { display_name?: string; email?: string })
      const programRec = enrollment?.expand?.program as
        | { id: string; name?: TranslatableField; description?: TranslatableField; duration_weeks?: number }
        | undefined

      // Sin programa activo no hay rutina que enseñar; la pantalla pinta su
      // estado vacío. No es un error.
      if (!programRec) {
        return { userName, program: null, phaseGroups: [] }
      }

      const byProgram = pb.filter('program = {:pid}', { pid: programRec.id })

      // Segunda ola: fases y ejercicios, que solo dependen del id del programa.
      // `getFullList` en lugar del viejo `getList(1, 50)` / `getList(1, 500)`:
      // un programa largo perdía días sin avisar al pasarse del tope.
      const [phases, exercises] = await Promise.all([
        pb
          .collection('program_phases')
          .getFullList({ filter: byProgram, sort: 'sort_order,phase_number', $autoCancel: false })
          .then(items => items as unknown as RoutinePhaseRow[]),
        pb
          .collection('program_exercises')
          .getFullList({ filter: byProgram, sort: 'phase_number,sort_order', $autoCancel: false })
          .then(items => items as unknown as RoutineExerciseRow[]),
      ])

      return {
        userName,
        program: {
          id: programRec.id,
          name: programRec.name ?? '',
          description: programRec.description ?? '',
          durationWeeks: programRec.duration_weeks || 0,
        },
        phaseGroups: buildPhaseGroups(phases, exercises),
      }
    },
  })

  const data = query.data

  return {
    userName: data?.userName ?? '',
    program: data?.program ?? null,
    phaseGroups: data?.phaseGroups ?? [],
    /** El usuario existe pero no tiene programa activo. */
    noProgram: !!data && data.program === null,
    loading: query.isLoading,
    error: query.error as Error | null,
  }
}

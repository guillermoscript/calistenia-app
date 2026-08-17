/**
 * Detalle de un programa: metadatos + semana tipo de la fase 1 (#473).
 *
 * Sustituye a los dos `useEffect` de `program/[id]` en móvil, que traían el
 * programa con `toProgramMeta(p: any)` y deducían los días con dos `catch {}`
 * silenciosos.
 *
 * Se consulta directo a PB y no vía `usePrograms` porque ese catálogo solo carga
 * días y ejercicios del programa **activo**, y esta pantalla se abre sobre
 * cualquiera (incluido un deep-link a un programa inactivo).
 */

import { useQuery } from '@tanstack/react-query'
import i18n from 'i18next'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { buildProgramDayRows, refineDiscipline, toProgramMeta } from '../lib/program-detail'
import type { ProgramDayRow, ProgramDaySourceRow, ProgramRow } from '../lib/program-detail'
import type { ProgramMeta } from '../types'

export type { ProgramDayRow } from '../lib/program-detail'

export interface UseProgramDetailOptions {
  /**
   * Programa que la pantalla ya tiene en memoria (del catálogo de `usePrograms`).
   * Si viene, no se pide por red: solo se cargan sus días.
   */
  knownProgram?: ProgramMeta | null
}

interface ProgramDetailData {
  program: ProgramMeta | null
  days: ProgramDayRow[]
}

export function useProgramDetail(
  programId: string | null,
  { knownProgram = null }: UseProgramDetailOptions = {},
) {
  const hasKnown = !!knownProgram
  const locale = i18n.language

  const query = useQuery({
    queryKey: qk.programs.detail(programId),
    enabled: !!programId,
    staleTime: 60_000,
    queryFn: async (): Promise<ProgramDetailData> => {
      const pid = programId!
      const byPhaseOne = pb.filter('program = {:pid} && phase_number = 1', { pid })

      // El programa solo se pide si la pantalla no lo tiene ya. Los días van en
      // paralelo con él: dependen del id, no del registro.
      const [program, days] = await Promise.all([
        hasKnown
          ? Promise.resolve(knownProgram)
          : pb
              .collection('programs')
              .getOne(pid, { $autoCancel: false })
              .then(rec => toProgramMeta(rec as unknown as ProgramRow, locale)),
        loadWeekDays(byPhaseOne, locale),
      ])

      if (!program) return { program: null, days }

      // La disciplina no está en la fila del programa: se deduce de los días. El
      // del catálogo ya la trae correcta, así que solo se refina el traído por red.
      const discipline = hasKnown ? null : refineDiscipline(days)
      return {
        program: discipline ? { ...program, discipline } : program,
        days,
      }
    },
  })

  return {
    program: query.data?.program ?? knownProgram,
    /** `null` mientras no se sabe; `[]` es "programa sin días definidos". */
    days: query.data?.days ?? null,
    /** El programa no existe o no es visible. */
    notFound: !hasKnown && !!query.error,
    loading: query.isLoading,
    error: query.error as Error | null,
  }
}

/**
 * Días de la semana tipo, con el fallback histórico: los programas antiguos no
 * tienen `program_day_config`, así que sus días se deducen de las filas de
 * `program_exercises`.
 *
 * La cascada es intencional y no se puede paralelizar sin pedir de más: la
 * segunda consulta solo se hace si la primera no devolvió nada.
 */
async function loadWeekDays(filter: string, locale: string): Promise<ProgramDayRow[]> {
  const config = await pb
    .collection('program_day_config')
    .getFullList({ filter, sort: 'sort_order', $autoCancel: false })
    .catch(() => [])

  if (config.length > 0) {
    return buildProgramDayRows(config as unknown as ProgramDaySourceRow[], locale)
  }

  const exercises = await pb
    .collection('program_exercises')
    .getFullList({
      filter,
      sort: 'sort_order',
      fields: 'day_id,day_name,day_focus,day_type,day_color',
      $autoCancel: false,
    })
    .catch(() => [])

  return buildProgramDayRows(exercises as unknown as ProgramDaySourceRow[], locale)
}

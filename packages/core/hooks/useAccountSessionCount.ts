import { useMemo } from 'react'
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { countAccountSessions } from '../lib/accountSessions'
import type { ProgressMap } from '../types'

/**
 * Opciones de la query del total de la cuenta, compartidas con `useHomeStage`
 * para que Home y Progreso/Perfil usen UNA definición de «entrenos»
 * (`countAccountSessions`: fuerza + circuitos + cardio) y una familia de keys.
 * Sin `stamp` (Home) la key es la raíz `['account-sessions', uid]`: la
 * invalidación por prefijo de `invalidateAfterWorkout` alcanza a las dos.
 */
export function accountSessionsQueryOptions(userId: string | null, stamp?: string) {
  return queryOptions({
    queryKey: qk.accountSessions(userId, stamp),
    enabled: !!userId,
    staleTime: 30_000,
    // Home (etapa de la cuenta): se recuenta al volver a primer plano si ya
    // caducó el staleTime. Solo lectura de `totalItems`, sin parche optimista.
    refetchOnWindowFocus: true,
    queryFn: () => countAccountSessions(pb as never, userId!),
  })
}

/**
 * Cifra «Entrenos» de la cuenta (#869): total de sesiones de todos los
 * programas más las libres, el cardio libre y los circuitos. Es la misma que
 * enseñan Progreso y Perfil, y no cambia al cambiar de programa.
 *
 * `progress` solo se usa como sello: al marcar o desmarcar un entreno del
 * programa la clave cambia y se vuelve a contar.
 */
export function useAccountSessionCount(userId: string | null, progress: ProgressMap): number | null {
  const stamp = useMemo(
    () => String(Object.keys(progress ?? {}).filter(k => k.startsWith('done_')).length),
    [progress],
  )
  const { data } = useQuery({
    ...accountSessionsQueryOptions(userId, stamp),
    placeholderData: keepPreviousData,
  })
  return data ?? null
}

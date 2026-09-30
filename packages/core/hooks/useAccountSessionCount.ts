import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { countAccountSessions } from '../lib/accountSessions'
import type { ProgressMap } from '../types'

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
    queryKey: qk.accountSessions(userId, stamp),
    enabled: !!userId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: () => countAccountSessions(pb as never, userId!),
  })
  return data ?? null
}

/**
 * Amigos (seguidos aceptados) que han entrenado hoy, para la fila de «Para ti»
 * del inicio (#855). Lee las views `public_*` (las tablas base son solo del
 * dueño, #386) con UNA consulta por view para todos los seguidos a la vez, en
 * vez de las 3 por persona que hace el ranking. Devuelve los ids en el orden de
 * `followed`, para que el nombre que se enseña sea estable.
 */
import { useQuery } from '@tanstack/react-query'
import { pb } from '@calistenia/core/lib/pocketbase'
import { localMidnightAsUTC, todayStr } from '@calistenia/core/lib/dateUtils'

/** Tope de seguidos que entran en el filtro: la URL de PB no es infinita. */
const MAX_FOLLOWED = 60

export function useFriendsTrainedToday(userId: string | null, followedIds: readonly string[]) {
  const ids = followedIds.slice(0, MAX_FOLLOWED)
  const today = todayStr()
  const { data, isLoading } = useQuery({
    queryKey: ['home', 'friendsToday', userId, today, ids.join(',')],
    enabled: !!userId && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const start = localMidnightAsUTC(today)
      const params: Record<string, string> = { start }
      const users = ids.map((id, i) => {
        params[`u${i}`] = id
        return `user = {:u${i}}`
      }).join(' || ')
      const read = (collection: string, field: string) =>
        pb.collection(collection).getList(1, 200, {
          filter: pb.filter(`(${users}) && ${field} >= {:start}`, params),
          fields: 'user',
          $autoCancel: false,
        }).then(r => r.items.map(it => String(it.user ?? ''))).catch(() => [] as string[])
      const found = new Set((await Promise.all([
        read('public_sessions', 'completed_at'),
        read('public_circuit_sessions', 'started_at'),
        read('public_cardio_sessions', 'started_at'),
      ])).flat())
      return ids.filter(id => found.has(id))
    },
  })
  return { ids: data ?? [], loading: isLoading && ids.length > 0 }
}

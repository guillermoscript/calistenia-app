/**
 * Amigos (seguidos aceptados) que han entrenado hoy, para la fila de «Para ti»
 * del inicio (#855/#858). Web y móvil comparten ESTE hook.
 *
 * Fuente: consulta propia a las views `public_*` (las tablas base son solo del
 * dueño, #386), UNA por view para todos los seguidos a la vez (3 en total, no 3
 * por persona como el ranking). Se prefiere al feed de actividad porque:
 * - es correcta con el feed sin cargar o paginado (el feed trae las últimas N
 *   sesiones y un amigo de hoy puede quedar fuera);
 * - cuesta 3 lecturas baratas con `fields: 'user'` en lugar de montar el feed
 *   completo (sesiones + usuarios + reacciones) solo para contar caras;
 * - cuenta también circuitos y cardio.
 *
 * Devuelve los ids en el orden de `followedIds`, para que el nombre que se
 * enseña sea estable.
 */
import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { todayStr } from '../lib/dateUtils'
import { friendsTodayBounds } from '../lib/friends-today'

/** Tope de seguidos que entran en el filtro: la URL de PB no es infinita. */
const MAX_FOLLOWED = 60

export function useFriendsTrainedToday(userId: string | null, followedIds: readonly string[]) {
  const ids = followedIds.slice(0, MAX_FOLLOWED)
  const today = todayStr()
  const { data, isLoading } = useQuery({
    queryKey: qk.home.friendsTrainedToday(userId, today, ids.join(',')),
    enabled: !!userId && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { wall, utc } = friendsTodayBounds(today)
      const params: Record<string, string> = { wall, utc }
      const users = ids.map((id, i) => {
        params[`u${i}`] = id
        return `user = {:u${i}}`
      }).join(' || ')
      const read = (collection: string, field: string, bound: 'wall' | 'utc') =>
        pb.collection(collection).getList(1, 200, {
          filter: pb.filter(`(${users}) && ${field} >= {:${bound}}`, params),
          fields: 'user',
          $autoCancel: false,
        }).then(r => r.items.map(it => String(it.user ?? ''))).catch(() => [] as string[])
      const found = new Set((await Promise.all([
        read('public_sessions', 'completed_at', 'wall'),
        read('public_circuit_sessions', 'started_at', 'utc'),
        read('public_cardio_sessions', 'started_at', 'utc'),
      ])).flat())
      return ids.filter(id => found.has(id))
    },
  })
  return { ids: data ?? [], loading: isLoading && ids.length > 0 }
}

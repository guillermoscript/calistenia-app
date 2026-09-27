/**
 * Tramo del inicio simplificado (#808): `first` (0 entrenos), `early` (1-2) o
 * `full` (3+). La lógica vive en `resolveHomeStage` (`lib/activation.ts`);
 * aquí solo se leen los dos contadores y el flag del dispositivo.
 *
 * `getTotalSessions()` cuenta solo el programa activo: al cambiar de programa
 * vuelve a 0 y, por sí solo, devolvería al inicio simple a quien lleva meses
 * entrenando. Por eso se cruza con el total de filas de `sessions` del usuario
 * en todos sus programas: la misma fuente, sin el filtro de programa.
 */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { storage } from '../platform'
import {
  ACTIVATION_TARGET_SESSIONS,
  homeFullKey,
  resolveHomeStage,
  type HomeStageView,
} from '../lib/activation'

export type { HomeStageView }

function readFlag(key: string): boolean {
  try {
    return storage.getItem(key) === 'true'
  } catch {
    return false
  }
}

/**
 * @param programSessions `getTotalSessions()` del contexto de entreno.
 */
export function useHomeStage(userId: string | null | undefined, programSessions: number): HomeStageView {
  const uid = userId || null
  const { data, fetchStatus } = useQuery({
    queryKey: qk.lifetimeSessions(uid),
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const res = await pb.collection('sessions').getList(1, 1, {
        filter: pb.filter('user = {:uid}', { uid }),
        fields: 'id',
        $autoCancel: false,
      })
      return res.totalItems
    },
  })

  // Sin dato: «cargando» solo mientras la petición está en vuelo. Sin red (la
  // query queda en pausa) o con error se sigue con el contador del programa.
  const lifetimeSessions = data ?? (fetchStatus === 'fetching' ? undefined : null)

  const view = resolveHomeStage({
    programSessions,
    lifetimeSessions,
    reachedBefore: !!uid && readFlag(homeFullKey(uid)),
  })

  useEffect(() => {
    if (!uid || view.sessions < ACTIVATION_TARGET_SESSIONS) return
    try {
      storage.setItem(homeFullKey(uid), 'true')
    } catch {
      // Sin storage se recalcula en cada visita; no pasa nada.
    }
  }, [uid, view.sessions])

  return view
}

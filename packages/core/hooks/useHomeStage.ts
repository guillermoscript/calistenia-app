/**
 * Tramo del inicio simplificado (#808): `first` (0 entrenos), `early` (1-2) o
 * `full` (3+). La lógica vive en `resolveHomeStage` (`lib/activation.ts`);
 * aquí solo se leen los dos contadores y el flag del dispositivo.
 *
 * `getTotalSessions()` cuenta solo el programa activo: al cambiar de programa
 * vuelve a 0 y, por sí solo, devolvería al inicio simple a quien lleva meses
 * entrenando. Por eso se cruza con `user_stats.total_sessions`, el contador de
 * toda la cuenta que mantiene el servidor (fuerza, cardio y circuitos).
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
  const { data: lifetimeSessions } = useQuery({
    queryKey: qk.lifetimeSessions(uid),
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      try {
        const row = await pb.collection('user_stats').getFirstListItem(
          pb.filter('user = {:uid}', { uid }),
          { fields: 'total_sessions', $autoCancel: false },
        )
        return Number((row as { total_sessions?: number }).total_sessions) || 0
      } catch (err) {
        // Sin fila todavía: el servidor la crea con el primer entreno.
        if ((err as { status?: number })?.status === 404) return 0
        throw err
      }
    },
  })

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

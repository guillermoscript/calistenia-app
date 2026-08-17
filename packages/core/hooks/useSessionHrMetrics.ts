/**
 * Frecuencia cardiaca y calorías que el reloj dejó en una sesión (#473).
 *
 * Sale del `useEffect` que tenía `session-detail.tsx` en móvil. Solo lo usa
 * móvil —web no pinta métricas de reloj— pero vive en core porque es una
 * consulta a PocketBase, y ahí es donde va el acceso a datos.
 *
 * Lee de la tabla base `sessions` y no de la view `public_sessions`: estas
 * métricas son del propio usuario (owner-only) y la view las deja fuera a
 * propósito (#316).
 */

import { useQuery } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

export interface SessionHrMetrics {
  hr_avg?: number
  hr_max?: number
  calories_actual?: number
}

export function useSessionHrMetrics(
  date: string | null,
  workoutKey: string | null,
  userId: string | null,
) {
  const enabled = !!date && !!workoutKey && !!userId

  const query = useQuery({
    queryKey: qk.sessionHrMetrics(userId, date ?? '', workoutKey ?? ''),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SessionHrMetrics | null> => {
      if (!(await isPocketBaseAvailable())) return null

      try {
        const rec = await pb.collection('sessions').getFirstListItem(
          pb.filter(
            'user = {:u} && workout_key = {:w} && completed_at >= {:d1} && completed_at <= {:d2}',
            {
              u: userId,
              w: workoutKey,
              d1: `${date} 00:00:00`,
              d2: `${date} 23:59:59`,
            },
          ),
          { fields: 'hr_avg,hr_max,calories_actual', $autoCancel: false },
        )

        // Una sesión registrada a mano no trae nada de esto; se trata igual que
        // si no hubiera sesión, para que la pantalla no pinte un bloque vacío.
        if (!rec.hr_avg && !rec.calories_actual) return null

        return {
          hr_avg: rec.hr_avg,
          hr_max: rec.hr_max,
          calories_actual: rec.calories_actual,
        }
      } catch {
        // Sesión sin métricas de reloj: es el caso normal, no un fallo.
        return null
      }
    },
  })

  return query.data ?? null
}

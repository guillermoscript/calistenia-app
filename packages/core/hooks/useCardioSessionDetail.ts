import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { authorDisplayName } from '../lib/author-name'
import { qk } from '../lib/query-keys'
import { fetchCardioRoute } from '../lib/cardioRoutes'
import { toCardioSession } from '../lib/cardio-session-view'
import type { CardioSession, GpsPoint } from '../types'

export interface CardioSessionDetail {
  session: CardioSession | null
  authorName: string | undefined
  authorAvatarUrl: string | null
  /** La sesión pública aún no ha llegado. */
  loading: boolean
  /** No se pudo cargar la sesión pública (los extras del dueño fallan en silencio). */
  error: boolean
  isOwn: boolean
}

interface OwnerExtras {
  points: GpsPoint[]
  hr_avg?: number
  hr_max?: number
  calories_actual?: number
}

/**
 * Detalle de una sesión de cardio, propia o ajena (el muro enlaza a ambas).
 *
 * Se lee de la view `public_cardio_sessions` y no de la tabla base (#386): la
 * base es owner-only. La view no lleva FC ni calorías del reloj; la ruta
 * (`cardio_routes`, #299) y esas métricas se piden aparte y SÓLO si el visor es
 * el dueño, así una sesión ajena no cuesta dos 404 por visita. Los extras
 * llegan después de la sesión y su fallo nunca tumba la pantalla.
 *
 * `viewerId` entra en la clave: decide si se piden los extras, así que si la
 * pantalla monta antes que el auth se reintenta al llegar.
 */
export function useCardioSessionDetail(
  sessionId: string | null | undefined,
  viewerId: string | null | undefined,
): CardioSessionDetail {
  const id = sessionId ?? null
  const viewer = viewerId ?? null

  const base = useQuery({
    queryKey: qk.cardioSessionDetail(id, viewer),
    enabled: !!id,
    // Siempre se revalida al abrir: la nota y las métricas se editan en otras
    // pantallas y la ruta sólo existe tras guardar.
    staleTime: 0,
    queryFn: async () => {
      const raw: any = await pb.collection('public_cardio_sessions').getOne(id!, {
        expand: 'user',
        $autoCancel: false,
      })
      const expandedUser = raw.expand?.user
      return {
        session: toCardioSession(raw as Record<string, unknown>),
        authorName: expandedUser ? authorDisplayName(expandedUser) || undefined : undefined,
        authorAvatarUrl: expandedUser ? getUserAvatarUrl(expandedUser, '200x200') : null,
      }
    },
  })

  const ownerId = base.data?.session.user
  const isOwn = !!viewer && !!ownerId && ownerId === viewer

  const extras = useQuery({
    queryKey: qk.cardioSessionOwnerExtras(id, viewer),
    enabled: !!id && isOwn,
    staleTime: 0,
    queryFn: async (): Promise<OwnerExtras> => {
      const [points, priv] = await Promise.all([
        fetchCardioRoute(id!),
        pb.collection('cardio_sessions').getOne(id!, {
          $autoCancel: false,
          fields: 'hr_avg,hr_max,calories_actual',
        }).catch(() => null), // sesión sin métricas de reloj
      ])
      return {
        points,
        hr_avg: priv?.hr_avg as number | undefined,
        hr_max: priv?.hr_max as number | undefined,
        calories_actual: priv?.calories_actual as number | undefined,
      }
    },
  })

  const session = useMemo<CardioSession | null>(() => {
    const s = base.data?.session
    if (!s) return null
    const e = extras.data
    if (!e) return s
    return {
      ...s,
      gps_points: e.points.length ? e.points : s.gps_points,
      hr_avg: e.hr_avg,
      hr_max: e.hr_max,
      calories_actual: e.calories_actual,
    }
  }, [base.data, extras.data])

  return {
    session,
    authorName: base.data?.authorName,
    authorAvatarUrl: base.data?.authorAvatarUrl ?? null,
    loading: !!id && base.isPending,
    error: base.isError,
    isOwn,
  }
}

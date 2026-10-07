/**
 * Conexión con Strava y subida de sesiones de cardio (#914). Misma lógica en
 * web y móvil; lo único que difiere es CÓMO se abre la URL de autorización, y
 * eso lo decide cada app con lo que `connect` devuelve.
 */
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '../lib/query-keys'
import {
  disconnectStrava,
  fetchStravaUpload,
  getStravaConnectUrl,
  getStravaStatus,
  uploadCardioToStrava,
  type StravaStatus,
  type StravaUpload,
} from '../lib/strava'

export function useStravaStatus(userId: string | null) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: qk.stravaStatus(userId),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: getStravaStatus,
  })

  const disconnect = useMutation({
    mutationFn: disconnectStrava,
    onSuccess: () => {
      qc.setQueryData<StravaStatus>(qk.stravaStatus(userId), (old) =>
        old ? { ...old, connected: false, athlete_id: null } : old,
      )
    },
  })

  /** Pide la URL de autorización; la app la abre a su manera. */
  const getConnectUrl = useCallback(
    (platform: 'web' | 'mobile') => getStravaConnectUrl(platform),
    [],
  )
  /** Llamar al volver del flujo de autorización (deep link / `?strava=connected`). */
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: qk.stravaStatus(userId) }),
    [qc, userId],
  )

  return {
    status: query.data ?? null,
    loading: query.isLoading,
    getConnectUrl,
    refresh,
    disconnect: disconnect.mutateAsync,
    disconnecting: disconnect.isPending,
  }
}

/** Estado de subida de UNA sesión de cardio propia, y la acción de subirla. */
export function useStravaUpload(userId: string | null, sessionId: string | null) {
  const qc = useQueryClient()
  const key = qk.stravaUpload(userId, sessionId ?? '')
  const query = useQuery({
    queryKey: key,
    enabled: !!userId && !!sessionId,
    staleTime: 60_000,
    queryFn: () => fetchStravaUpload(sessionId as string),
  })

  const upload = useMutation({
    mutationFn: () => uploadCardioToStrava(sessionId as string),
    onSuccess: (res) => qc.setQueryData<StravaUpload | null>(key, res),
    // Un fallo de Strava deja fila `failed`; un 409 de reconexión no: en ambos
    // casos conviene volver a leer para no pintar un estado viejo.
    onError: () => qc.invalidateQueries({ queryKey: key }),
  })

  return {
    upload: query.data ?? null,
    loading: query.isLoading,
    send: upload.mutateAsync,
    sending: upload.isPending,
    error: upload.error,
  }
}

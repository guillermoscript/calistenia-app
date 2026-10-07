/**
 * Cliente de la integración con Strava (#914). Todo pasa por `/api/strava/*`
 * (pb_hooks/strava.pb.js): el `client_secret` y los tokens no salen del servidor
 * y por eso aquí no hay ninguna colección de tokens que leer.
 */
import { pb } from './pocketbase'

export interface StravaStatus {
  /** El servidor tiene las credenciales de Strava. Sin ellas el botón no debe ni aparecer. */
  configured: boolean
  connected: boolean
  athlete_id: number | null
}

export type StravaUploadStatus = 'processing' | 'done' | 'failed'

export interface StravaUpload {
  status: StravaUploadStatus
  activity_id: number | null
  /** Enlace a la actividad en Strava (solo si `status === 'done'`). */
  url: string | null
  error: string | null
}

export type StravaErrorCode =
  | 'strava_not_configured'
  | 'strava_not_connected'
  /** Strava revocó el acceso (el usuario lo quitó desde Strava): hay que reconectar. */
  | 'strava_reauth_required'
  | 'strava_rate_limited'
  | 'strava_unreachable'
  | 'strava_error'
  | 'upload_in_progress'
  | 'not_found'
  | 'network'
  | 'request_failed'

export class StravaApiError extends Error {
  constructor(
    public status: number,
    public code: StravaErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'StravaApiError'
  }
}

function toStravaError(err: unknown): StravaApiError {
  const e = err as { status?: number; response?: { code?: string; message?: string }; message?: string }
  const status = typeof e?.status === 'number' ? e.status : 0
  const code = (status === 0 ? 'network' : e?.response?.code || 'request_failed') as StravaErrorCode
  return new StravaApiError(status, code, e?.response?.message || e?.message || 'Strava request failed')
}

async function send<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  try {
    // requestKey null: subir dos sesiones seguidas no debe auto-cancelar la primera.
    return await pb.send(path, { method, body, requestKey: null })
  } catch (err) {
    throw toStravaError(err)
  }
}

export const getStravaStatus = () => send<StravaStatus>('/api/strava/status', 'GET')

/** URL de autorización de Strava. La web navega a ella; el móvil la abre en un navegador del sistema. */
export const getStravaConnectUrl = (platform: 'web' | 'mobile') =>
  send<{ url: string }>('/api/strava/connect', 'POST', { return: platform }).then((r) => r.url)

export const disconnectStrava = () => send<{ connected: false }>('/api/strava/disconnect', 'POST', {})

/** Sube la sesión (idempotente: repetirlo devuelve la misma actividad). */
export const uploadCardioToStrava = (sessionId: string) =>
  send<StravaUpload>('/api/strava/upload', 'POST', { session: sessionId })

/** Subida ya hecha de una sesión propia, o null. Lectura directa: la regla es solo-dueño. */
export async function fetchStravaUpload(sessionId: string): Promise<StravaUpload | null> {
  try {
    const rec = await pb.collection('strava_uploads').getFirstListItem(
      pb.filter('session = {:s}', { s: sessionId }),
      { $autoCancel: false },
    )
    const id = (rec.activity_id as number) || null
    return {
      status: rec.status as StravaUploadStatus,
      activity_id: id,
      url: id ? `https://www.strava.com/activities/${id}` : null,
      error: (rec.error as string) || null,
    }
  } catch {
    return null
  }
}

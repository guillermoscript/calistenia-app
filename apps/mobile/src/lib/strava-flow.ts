/**
 * Piezas puras del flujo de Strava en el móvil (#914): sin React ni módulos
 * nativos para poder probarlas con Vitest.
 */

/** Deep link al que el servidor devuelve la app tras autorizar en Strava. */
export const STRAVA_RETURN_URL = 'calistenia://strava'

export type StravaReturnStatus = 'connected' | 'denied' | 'error'

/** `calistenia://strava?status=connected|denied|error` → estado. Cualquier otra cosa es `error`. */
export function parseStravaReturnUrl(url: string | null | undefined): StravaReturnStatus {
  if (!url) return 'error'
  const q = url.indexOf('?')
  if (q < 0) return 'error'
  const hash = url.indexOf('#', q)
  const params = new URLSearchParams(url.slice(q + 1, hash < 0 ? undefined : hash))
  const status = params.get('status')
  return status === 'connected' || status === 'denied' ? status : 'error'
}

export const STRAVA_RETURN_TOAST_KEY: Record<StravaReturnStatus, string> = {
  connected: 'strava.connectedToast',
  denied: 'strava.deniedToast',
  error: 'strava.connectErrorToast',
}

/** Código de error de la API de Strava → clave i18n del mensaje para el usuario. */
export function stravaErrorKey(code: string | undefined | null): string {
  switch (code) {
    case 'strava_reauth_required': return 'strava.reauth'
    case 'strava_rate_limited': return 'strava.rateLimited'
    case 'network': return 'strava.offline'
    default: return 'strava.error'
  }
}

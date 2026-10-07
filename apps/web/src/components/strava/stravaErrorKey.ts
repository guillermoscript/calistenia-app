import { StravaApiError } from '@calistenia/core/lib/strava'

/** Traduce el fallo de una subida a Strava a la clave i18n que se le muestra. */
export function stravaErrorKey(err: unknown): string {
  const code = err instanceof StravaApiError ? err.code : null
  switch (code) {
    case 'strava_reauth_required': return 'strava.reauth'
    case 'strava_rate_limited': return 'strava.rateLimited'
    case 'network': return 'strava.offline'
    default: return 'strava.error'
  }
}

import { describe, it, expect, vi } from 'vitest'
vi.mock('@calistenia/core/lib/pocketbase', () => ({ pb: { send: vi.fn() } }))
import { StravaApiError } from '@calistenia/core/lib/strava'
import { stravaErrorKey } from './stravaErrorKey'

describe('stravaErrorKey', () => {
  it.each([
    ['strava_reauth_required', 'strava.reauth'],
    ['strava_rate_limited', 'strava.rateLimited'],
    ['network', 'strava.offline'],
    ['strava_error', 'strava.error'],
    ['request_failed', 'strava.error'],
  ] as const)('%s -> %s', (code, key) => {
    expect(stravaErrorKey(new StravaApiError(0, code, 'x'))).toBe(key)
  })

  it('un error que no es de Strava cae en strava.error', () => {
    expect(stravaErrorKey(new Error('boom'))).toBe('strava.error')
    expect(stravaErrorKey(null)).toBe('strava.error')
  })
})

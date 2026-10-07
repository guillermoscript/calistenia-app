import { describe, expect, it } from 'vitest'
import { parseStravaReturnUrl, stravaErrorKey, STRAVA_RETURN_TOAST_KEY } from '../strava-flow'

describe('parseStravaReturnUrl', () => {
  it('reads the three statuses', () => {
    expect(parseStravaReturnUrl('calistenia://strava?status=connected')).toBe('connected')
    expect(parseStravaReturnUrl('calistenia://strava?status=denied')).toBe('denied')
    expect(parseStravaReturnUrl('calistenia://strava?status=error')).toBe('error')
  })
  it('falls back to error on anything unexpected', () => {
    expect(parseStravaReturnUrl(undefined)).toBe('error')
    expect(parseStravaReturnUrl('calistenia://strava')).toBe('error')
    expect(parseStravaReturnUrl('calistenia://strava?status=hacked')).toBe('error')
  })
  it('ignores the fragment and extra params', () => {
    expect(parseStravaReturnUrl('calistenia://strava?x=1&status=connected#frag')).toBe('connected')
  })
  it('has a toast key per status', () => {
    expect(STRAVA_RETURN_TOAST_KEY.denied).toBe('strava.deniedToast')
  })
})

describe('stravaErrorKey', () => {
  it('maps known codes', () => {
    expect(stravaErrorKey('strava_reauth_required')).toBe('strava.reauth')
    expect(stravaErrorKey('strava_rate_limited')).toBe('strava.rateLimited')
    expect(stravaErrorKey('network')).toBe('strava.offline')
  })
  it('defaults to the generic error', () => {
    expect(stravaErrorKey('strava_unreachable')).toBe('strava.error')
    expect(stravaErrorKey(undefined)).toBe('strava.error')
  })
})

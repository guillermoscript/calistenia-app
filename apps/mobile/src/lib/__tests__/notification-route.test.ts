import { describe, expect, it } from 'vitest'
import { resolveNotifUrl } from '../notification-route'

describe('challenge notification deep links', () => {
  it('preserves a challenge detail URL from a push payload', () => {
    expect(resolveNotifUrl('/challenges/challenge-123')).toBe('/challenges/challenge-123')
  })

  it('keeps challenge query strings intact', () => {
    expect(resolveNotifUrl('/challenges/challenge-123?source=push')).toBe('/challenges/challenge-123?source=push')
  })
})

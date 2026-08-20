import { describe, expect, it } from 'vitest'
import { CARDIO_MIN_SESSION, isCardioSessionTooShort } from './cardioMinimum'

describe('isCardioSessionTooShort (#562)', () => {
  it('discards the accidental start/stop from device QA (2 s, 0 km)', () => {
    expect(isCardioSessionTooShort({ duration_seconds: 2, distance_km: 0 })).toBe(true)
  })

  it('discards anything under the duration floor even with distance', () => {
    expect(isCardioSessionTooShort({ duration_seconds: 9, distance_km: 1 })).toBe(true)
  })

  it('discards short sessions without movement', () => {
    expect(isCardioSessionTooShort({ duration_seconds: 10, distance_km: 0 })).toBe(true)
    expect(isCardioSessionTooShort({ duration_seconds: 59, distance_km: 0.04 })).toBe(true)
  })

  it('keeps a long session without GPS distance (indoor / no fix)', () => {
    expect(isCardioSessionTooShort({ duration_seconds: CARDIO_MIN_SESSION.noDistanceGraceSeconds, distance_km: 0 })).toBe(false)
    expect(isCardioSessionTooShort({ duration_seconds: 1200, distance_km: 0 })).toBe(false)
  })

  it('keeps a short session that actually moved', () => {
    expect(isCardioSessionTooShort({ duration_seconds: 10, distance_km: 0.05 })).toBe(false)
    expect(isCardioSessionTooShort({ duration_seconds: 30, distance_km: 0.2 })).toBe(false)
  })

  it('treats missing or malformed fields as zero', () => {
    expect(isCardioSessionTooShort({})).toBe(true)
    expect(isCardioSessionTooShort({ duration_seconds: '120', distance_km: NaN })).toBe(true)
    expect(isCardioSessionTooShort({ duration_seconds: 120, distance_km: undefined })).toBe(false)
  })
})

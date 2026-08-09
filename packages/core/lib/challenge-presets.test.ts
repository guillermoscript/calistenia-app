import { describe, expect, it } from 'vitest'
import {
  BEGINNER_CHALLENGE_PRESETS,
  findExistingPresetChallenge,
  getPresetDateRange,
} from './challenge-presets'

describe('beginner challenge presets', () => {
  it('contains the four requested presets and keeps cumulative push-ups disabled', () => {
    expect(BEGINNER_CHALLENGE_PRESETS.map((preset) => preset.id)).toEqual([
      'starter_7_day',
      'consistency_30_day',
      'first_10_workouts',
      'pushup_builder',
    ])
    expect(BEGINNER_CHALLENGE_PRESETS.find((preset) => preset.id === 'pushup_builder')?.enabled).toBe(false)
  })

  it('uses inclusive start/end dates for a preset duration', () => {
    const preset = BEGINNER_CHALLENGE_PRESETS[0]
    expect(getPresetDateRange(preset, '2026-08-09')).toEqual({
      startsAt: '2026-08-09',
      endsAt: '2026-08-15',
    })
  })

  it('returns the existing challenge for a repeated preset join', () => {
    const existing = { id: 'challenge-1', preset_key: 'starter_7_day', starts_at: '2026-08-09', ends_at: '2026-08-15' }
    expect(findExistingPresetChallenge([
      { expand: { challenge: existing } },
    ], 'starter_7_day')).toEqual(existing)
    expect(findExistingPresetChallenge([
      { expand: { challenge: existing } },
    ], 'consistency_30_day')).toBeNull()
  })
})

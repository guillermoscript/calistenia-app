import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ANALYTICS_EVENTS,
  normalizeCanonicalAnalyticsProperties,
} from './analytics'

describe('canonical analytics contract', () => {
  it('defines the versioned growth-loop event set without duplicate names', () => {
    const events = Object.values(CANONICAL_ANALYTICS_EVENTS)

    expect(events).toHaveLength(18)
    expect(new Set(events).size).toBe(events.length)
    expect(events).toContain('post_workout_action_viewed')
    expect(events).toContain('post_workout_action_selected')
    expect(events).toContain('referral_prompt_viewed')
    expect(events).toContain('program_milestone_completed')
    expect(events).toContain('battle_shared')
  })

  it('adds the contract version and removes unset properties', () => {
    expect(normalizeCanonicalAnalyticsProperties({
      surface: 'post_workout',
      source: undefined,
      workout_id: 'p1_lun',
      result: null as unknown as string,
    })).toEqual({
      event_version: 1,
      surface: 'post_workout',
      workout_id: 'p1_lun',
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ANALYTICS_EVENTS,
  normalizeCanonicalAnalyticsProperties,
} from './analytics'

describe('canonical analytics contract', () => {
  it('defines the versioned growth-loop event set without duplicate names', () => {
    const events = Object.values(CANONICAL_ANALYTICS_EVENTS)

    expect(events).toHaveLength(25)
    expect(new Set(events).size).toBe(events.length)
    expect(events).toContain('featured_challenge_viewed')
    expect(events).toContain('post_workout_action_viewed')
    expect(events).toContain('post_workout_action_selected')
    expect(events).toContain('referral_prompt_viewed')
    expect(events).toContain('referral_status_viewed')
    expect(events).toContain('program_milestone_completed')
    expect(events).toContain('battle_shared')
  })

  // #356 separó las dos familias: `race_*` es el flujo GPS (que antes emitía
  // `battle_*` con un id de `races`) y `battle_*` queda solo para las batallas de
  // circuito. Mezclarlas otra vez rompería los embudos de las dos.
  it('keeps race and battle events as separate families', () => {
    const events = Object.values(CANONICAL_ANALYTICS_EVENTS)
    for (const name of ['race_created', 'race_joined', 'race_started', 'race_completed', 'race_shared']) {
      expect(events).toContain(name)
    }
    for (const name of ['battle_created', 'battle_joined', 'battle_started', 'battle_completed', 'battle_shared']) {
      expect(events).toContain(name)
    }
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

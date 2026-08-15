/**
 * Facade de analytics — misma API op.track/identify/clear en web y mobile.
 * La implementación real (OpenPanel web o react-native) se inyecta vía initCore().
 */
import { getPlatform, type CoreAnalytics } from '../platform'

/** Canonical growth-loop events shared by web and mobile. */
export const CANONICAL_ANALYTICS_EVENTS = {
  postWorkoutActionViewed: 'post_workout_action_viewed',
  postWorkoutActionSelected: 'post_workout_action_selected',
  referralPromptViewed: 'referral_prompt_viewed',
  shareCardShared: 'share_card_shared',
  inviteSent: 'invite_sent',
  inviteLandingViewed: 'invite_landing_viewed',
  referralConverted: 'referral_converted',
  referralStatusViewed: 'referral_status_viewed',
  featuredChallengeViewed: 'featured_challenge_viewed',
  challengeViewed: 'challenge_viewed',
  challengeJoined: 'challenge_joined',
  challengeProgressUpdated: 'challenge_progress_updated',
  challengeCompleted: 'challenge_completed',
  /**
   * Training-program curriculum (`programs` / `user_programs`). NOT the
   * community programs below — these two were deliberately kept apart so the
   * funnel can tell a curriculum enrollment from a community cohort.
   */
  programJoined: 'program_joined',
  programMilestoneCompleted: 'program_milestone_completed',
  /**
   * Community programs with weekly milestones (#353, `community_programs`).
   * They got their own event family instead of reusing `program_*` with a
   * different `surface`: overloading the existing names would have entangled
   * the two features in every funnel query forever, and the `race_*`/`battle_*`
   * split below is the precedent for why that is worth avoiding.
   */
  communityProgramViewed: 'community_program_viewed',
  communityProgramJoined: 'community_program_joined',
  communityProgramLeft: 'community_program_left',
  communityProgramMilestoneCompleted: 'community_program_milestone_completed',
  communityProgramCompleted: 'community_program_completed',
  /**
   * GPS/cardio races. These used to be emitted under the `battle_*` names, which
   * collided with collaborative circuit battles (#356) and made the funnel mix two
   * unrelated features. Races moved to their own names on 2026-08-11; the `battle_*`
   * names below now mean circuit battles only.
   */
  raceCreated: 'race_created',
  raceJoined: 'race_joined',
  raceStarted: 'race_started',
  raceCompleted: 'race_completed',
  raceShared: 'race_shared',
  /** Collaborative circuit battles (`battles` collection). Never races. */
  battleCreated: 'battle_created',
  battleJoined: 'battle_joined',
  battleStarted: 'battle_started',
  battleCompleted: 'battle_completed',
  battleShared: 'battle_shared',
  /**
   * The results screen was opened (#357). Separate from `battle_completed`, which fires
   * once per battle from the creator's device: this one fires per viewer, per visit, and
   * is what says whether anyone actually looks at the result they earned.
   */
  battleResultsViewed: 'battle_results_viewed',
  /** A rematch created a new battle from a closed one (#357). */
  battleRematchCreated: 'battle_rematch_created',
} as const

export type CanonicalAnalyticsEvent = typeof CANONICAL_ANALYTICS_EVENTS[keyof typeof CANONICAL_ANALYTICS_EVENTS]

export interface CanonicalAnalyticsProperties {
  /** Product surface that produced the event, e.g. `post_workout` or `challenge_detail`. */
  surface: string
  source?: string
  workout_id?: string
  challenge_id?: string
  /** `programs` record id — the training-program curriculum. */
  program_id?: string
  /** `community_programs` record id. Only on `community_program_*` events. */
  community_program_id?: string
  /** `community_program_milestones` record id, or `phase_{n}` for `program_*`. */
  milestone_id?: string
  /** `races` record id. Only on `race_*` events. */
  race_id?: string
  /** `battles` record id. Only on `battle_*` events. */
  battle_id?: string
  share_type?: string
  participant_count?: number
  /** Acción elegida dentro de una superficie con varias, p. ej. el panel post-entreno. */
  action?: string
  result?: string
  [key: string]: unknown
}

export interface ShareCardAnalyticsProperties extends CanonicalAnalyticsProperties {
  share_type: string
  platform: string
  result: 'shared' | 'opened' | 'downloaded'
  share_confirmed: boolean
}

/**
 * Remove unset values and stamp the payload with the contract version.
 * Keeping this pure makes the cross-platform contract easy to test.
 */
export function normalizeCanonicalAnalyticsProperties(
  properties: CanonicalAnalyticsProperties,
): Record<string, unknown> {
  return Object.fromEntries([
    ['event_version', 1],
    ...Object.entries(properties),
  ].filter(([, value]) => value !== undefined && value !== null))
}

export const op: CoreAnalytics = {
  track: (name, properties) => getPlatform().analytics.track(name, properties),
  identify: (payload) => getPlatform().analytics.identify(payload),
  clear: () => getPlatform().analytics.clear(),
}

export function trackCanonicalEvent(
  event: CanonicalAnalyticsEvent,
  properties: CanonicalAnalyticsProperties,
): unknown {
  return op.track(event, normalizeCanonicalAnalyticsProperties(properties))
}

/** Punto único para el contrato de `share_card_shared` en web y móvil. */
export function trackShareCardShared(properties: ShareCardAnalyticsProperties): unknown {
  return trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.shareCardShared, properties)
}

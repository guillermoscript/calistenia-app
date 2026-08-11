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
  featuredChallengeViewed: 'featured_challenge_viewed',
  challengeViewed: 'challenge_viewed',
  challengeJoined: 'challenge_joined',
  challengeProgressUpdated: 'challenge_progress_updated',
  challengeCompleted: 'challenge_completed',
  programJoined: 'program_joined',
  programMilestoneCompleted: 'program_milestone_completed',
  battleCreated: 'battle_created',
  battleJoined: 'battle_joined',
  battleStarted: 'battle_started',
  battleCompleted: 'battle_completed',
  battleShared: 'battle_shared',
} as const

export type CanonicalAnalyticsEvent = typeof CANONICAL_ANALYTICS_EVENTS[keyof typeof CANONICAL_ANALYTICS_EVENTS]

export interface CanonicalAnalyticsProperties {
  /** Product surface that produced the event, e.g. `post_workout` or `challenge_detail`. */
  surface: string
  source?: string
  workout_id?: string
  challenge_id?: string
  program_id?: string
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

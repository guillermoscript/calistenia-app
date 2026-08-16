/**
 * Realtime subscriptions for the race flow.
 *
 * The implementation moved to `@calistenia/core/lib/race/raceRealtime` (#466) — web
 * and mobile had byte-identical copies with no platform-specific imports. Both now
 * re-export the shared one.
 */
export { subscribeRace } from '@calistenia/core/lib/race/raceRealtime'
export type { RaceRealtimeHandlers } from '@calistenia/core/lib/race/raceRealtime'

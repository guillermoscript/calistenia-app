/**
 * Server clock offset for the race flow.
 *
 * The implementation moved to `@calistenia/core/lib/serverClock` when battles (#356)
 * needed the same synchronization. Re-exported here so every existing race import keeps
 * working and the two features share one measured offset instead of racing for it.
 */
export {
  measureOffset,
  serverNow,
  msUntil,
  resetOffset,
  getOffsetMs,
} from '@calistenia/core/lib/serverClock'

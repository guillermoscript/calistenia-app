/**
 * Race domain errors.
 *
 * The implementation moved to `@calistenia/core/lib/race/errors` (#466) — web and
 * mobile had byte-identical copies with no platform-specific imports. Both now
 * re-export the shared one.
 */
export {
  RaceAuthError,
  RaceNotFoundError,
  RaceRuleError,
  wrapPbError,
} from '@calistenia/core/lib/race/errors'

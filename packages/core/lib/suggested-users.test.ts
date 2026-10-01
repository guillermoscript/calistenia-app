import { describe, expect, it, vi } from 'vitest'

vi.mock('./analytics', () => ({
  CANONICAL_ANALYTICS_EVENTS: { suggestedUsersViewed: 'suggested_users_viewed', suggestedUserFollowed: 'suggested_user_followed' },
  trackCanonicalEvent: vi.fn(),
}))

import { trackCanonicalEvent } from './analytics'
import {
  activeSinceDay,
  buildSuggestedUsers,
  trackSuggestedUserFollowed,
  trackSuggestedUsersViewed,
  type BuildSuggestionsInput,
} from './suggested-users'

const stat = (user: string, last: string, total = 10, streak = 0) =>
  ({ user, last_workout_date: last, total_sessions: total, workout_streak_current: streak })
const usr = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, display_name: id.toUpperCase(), username: id, ...extra })

function run(over: Partial<BuildSuggestionsInput> = {}) {
  return buildSuggestedUsers({
    stats: [], users: [], selfId: 'me',
    followingIds: new Set(), pendingOutgoingIds: new Set(), blockedIds: new Set(),
    activeSince: '2026-09-01', ...over,
  })
}

describe('buildSuggestedUsers', () => {
  const stats = [
    stat('me', '2026-09-30'), stat('followed', '2026-09-30'), stat('asked', '2026-09-30'),
    stat('blocked', '2026-09-30'), stat('priv', '2026-09-30'), stat('old', '2026-08-01'),
    stat('never', '2026-09-30', 0), stat('ghost', '2026-09-30'), stat('ok1', '2026-09-28', 5),
    stat('ok2', '2026-09-30', 7, 2),
  ]
  const users = ['me', 'followed', 'asked', 'blocked', 'old', 'never', 'ok1', 'ok2'].map(id => usr(id))
    .concat([usr('priv', { is_private: true })])

  it('excludes self, followed, requested, blocked, private, stale, empty and user-less rows', () => {
    const out = run({
      stats, users,
      followingIds: new Set(['followed']), pendingOutgoingIds: new Set(['asked']), blockedIds: new Set(['blocked']),
    })
    expect(out.map(s => s.id)).toEqual(['ok2', 'ok1'])
  })

  it('orders by most recent workout, then streak', () => {
    const out = run({
      stats: [stat('a', '2026-09-20'), stat('b', '2026-09-30', 3, 1), stat('c', '2026-09-30', 3, 5)],
      users: [usr('a'), usr('b'), usr('c')],
    })
    expect(out.map(s => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('applies the limit and dedupes repeated rows', () => {
    const out = run({
      stats: [stat('a', '2026-09-30'), stat('a', '2026-09-30'), stat('b', '2026-09-29'), stat('c', '2026-09-28')],
      users: [usr('a'), usr('b'), usr('c')], limit: 2,
    })
    expect(out.map(s => s.id)).toEqual(['a', 'b'])
  })

  it('uses the single visible-name rule and never the email', () => {
    const out = run({
      stats: [stat('a', '2026-09-30'), stat('b', '2026-09-30')],
      users: [{ id: 'a', name: 'Ana Torres', email: 'ana@x.com', username: 'ana' }, { id: 'b', email: 'b@x.com' }],
    })
    expect(out.find(s => s.id === 'a')!.displayName).toBe('Ana Torres')
    expect(out.find(s => s.id === 'b')!.displayName).toBe('?')
  })

  it('treats a missing is_private as public', () => {
    expect(run({ stats: [stat('a', '2026-09-30')], users: [usr('a')] })).toHaveLength(1)
  })
})

describe('activeSinceDay', () => {
  it('goes back N days across a month boundary', () => {
    expect(activeSinceDay(new Date(2026, 9, 1), 30)).toBe('2026-09-01')
    expect(activeSinceDay(new Date(2026, 0, 5), 10)).toBe('2025-12-26')
  })
})

describe('analytics', () => {
  it('emits the viewed and followed events with the surface', () => {
    trackSuggestedUsersViewed('friends_suggestions', 5)
    trackSuggestedUserFollowed('leaderboard_suggestions', 'u1', 'following', 2)
    expect(trackCanonicalEvent).toHaveBeenCalledWith('suggested_users_viewed', { surface: 'friends_suggestions', participant_count: 5 })
    expect(trackCanonicalEvent).toHaveBeenCalledWith('suggested_user_followed',
      { surface: 'leaderboard_suggestions', target_id: 'u1', result: 'following', position: 2 })
  })
})

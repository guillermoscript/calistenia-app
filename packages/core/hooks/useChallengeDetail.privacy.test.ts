/**
 * Ranking de retos y cuentas privadas (#422).
 *
 * Como Strava: el participante privado sale del ranking para los demás en vez
 * de recalcular la puntuación por espectador. Sin esto, las views `public_*`
 * devuelven 0 filas en silencio y el privado aparecía clavado a 0 en el último
 * puesto. El propio privado sí se ve a sí mismo, marcado.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const lists = vi.hoisted(() => ({ participants: [] as any[] }))

vi.mock('../lib/pocketbase', () => ({
  pb: {
    filter: vi.fn((s: string) => s),
    collection: vi.fn((name: string) => ({
      getFullList: vi.fn(async () => (name === 'challenge_participants' ? lists.participants : [])),
      getList: vi.fn(async () => ({ items: [], totalItems: 0 })),
      getFirstListItem: vi.fn(async () => { throw new Error('none') }),
    })),
    authStore: { record: null },
  },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
  getUserAvatarUrl: vi.fn(() => null),
}))
vi.mock('../lib/analytics', () => ({
  op: { track: vi.fn() },
  CANONICAL_ANALYTICS_EVENTS: {},
  trackCanonicalEvent: vi.fn(),
}))

import { fetchLeaderboard } from './useChallengeDetail'
import type { Challenge } from '../types'

const challenge = {
  id: 'c1',
  metric: 'most_sessions',
  starts_at: '2026-08-01',
  ends_at: '2026-08-31',
} as unknown as Challenge

const participant = (uid: string, isPrivate = false) => ({
  id: `p-${uid}`,
  user: uid,
  created: '2026-08-01 00:00:00.000Z',
  expand: { user: { id: uid, display_name: uid, is_private: isPrivate } },
})

describe('fetchLeaderboard · cuentas privadas', () => {
  beforeEach(() => {
    lists.participants = [participant('pub'), participant('priv', true), participant('me')]
  })

  it('hides private participants from everyone else and counts them', async () => {
    const out = await fetchLeaderboard('c1', challenge, 'me')
    expect(out.entries.map(e => e.userId).sort()).toEqual(['me', 'pub'])
    expect(out.hiddenPrivateCount).toBe(1)
    // participantIds sigue completo: decide «ya estás unido», no el ranking.
    expect(out.participantIds).toEqual(['pub', 'priv', 'me'])
  })

  it('lets a private participant see themself, flagged', async () => {
    const out = await fetchLeaderboard('c1', challenge, 'priv')
    const mine = out.entries.find(e => e.userId === 'priv')
    expect(mine?.isCurrentUser).toBe(true)
    expect(mine?.isPrivate).toBe(true)
    expect(out.hiddenPrivateCount).toBe(0)
  })
})

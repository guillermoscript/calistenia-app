import { describe, it, expect, vi } from 'vitest'
import type { Battle } from '@calistenia/core/types/battle'
vi.mock('@calistenia/core/lib/battleApi', () => ({ findMyActiveBattle: vi.fn() }))

import { isBattleOngoing } from './useActiveBattle'

const battle = (status: string) => ({ id: 'b', status }) as unknown as Battle

describe('isBattleOngoing', () => {
  it('is true for an open room and a battle in progress', () => {
    for (const s of ['lobby', 'ready', 'live']) expect(isBattleOngoing(battle(s))).toBe(true)
  })
  it('is false for drafts, closed battles and nothing', () => {
    for (const s of ['draft', 'finished', 'cancelled', 'expired']) expect(isBattleOngoing(battle(s))).toBe(false)
    expect(isBattleOngoing(null)).toBe(false)
    expect(isBattleOngoing(undefined)).toBe(false)
  })
})

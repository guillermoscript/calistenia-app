/**
 * #890: el ranking de sesiones cuenta solo entrenos de programa y libres
 * (`sessions`), igual que la racha y el objetivo semanal; no cardio ni circuitos.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const getList = vi.fn()
const collection = vi.fn((_name: string) => ({ getList }))

vi.mock('../lib/pocketbase', () => ({
  pb: {
    filter: vi.fn((q: string) => q),
    collection: (name: string) => collection(name),
  },
  getUserAvatarUrl: vi.fn(),
}))

import { countWorkoutSessionsSince } from './useLeaderboard'

describe('countWorkoutSessionsSince', () => {
  beforeEach(() => { getList.mockReset(); collection.mockClear() })

  it('reads only public_sessions, never cardio or circuit views', async () => {
    getList.mockResolvedValue({ totalItems: 2 })
    expect(await countWorkoutSessionsSince('u1', '2026-09-28')).toBe(2)
    expect(collection.mock.calls.map(c => c[0])).toEqual(['public_sessions'])
  })

  it('returns 0 when the read fails', async () => {
    getList.mockRejectedValue(new Error('boom'))
    expect(await countWorkoutSessionsSince('u1', '2026-09-28')).toBe(0)
  })
})

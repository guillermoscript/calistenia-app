import { describe, expect, it } from 'vitest'
import type { LeaderboardEntry } from '@calistenia/core/hooks/useLeaderboard'
import { summarizeWeek } from '../community-ranking'

function entry(userId: string, value: number, isCurrentUser = false): LeaderboardEntry {
  return { userId, displayName: userId, avatarUrl: null, value, isCurrentUser }
}

describe('summarizeWeek', () => {
  it('dentro del podio: solo los 3 primeros, sin repetir tu fila', () => {
    const rows = summarizeWeek([entry('ana', 4), entry('me', 3, true), entry('dani', 2), entry('marta', 1)])
    expect(rows.map(r => [r.entry.userId, r.position])).toEqual([['ana', 1], ['me', 2], ['dani', 3]])
  })

  it('fuera del podio: los 3 primeros y tu fila con tu puesto real', () => {
    const rows = summarizeWeek([entry('ana', 4), entry('dani', 3), entry('marta', 2), entry('luis', 1), entry('me', 0, true)])
    expect(rows.map(r => [r.entry.userId, r.position])).toEqual([['ana', 1], ['dani', 2], ['marta', 3], ['me', 5]])
  })

  it('con menos de 3 personas enseña las que haya', () => {
    expect(summarizeWeek([entry('me', 1, true)]).map(r => r.position)).toEqual([1])
    expect(summarizeWeek([])).toEqual([])
  })
})

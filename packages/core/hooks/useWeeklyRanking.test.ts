/**
 * Resumen semanal de Comunidad (#857): los 3 primeros y mi puesto si quedo fuera.
 *
 * Core corre en vitest/node sin testing-library, así que se prueba la parte pura.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})) },
  getUserAvatarUrl: vi.fn(),
}))

import { rankWeekly } from './useWeeklyRanking'

const c = (userId: string, value: number) => ({ userId, value })

describe('rankWeekly', () => {
  it('keeps the top three in order and no separate row when I am among them', () => {
    const { top, me } = rankWeekly([c('me', 2), c('ana', 4), c('dani', 3), c('marta', 1)], 'me')
    expect(top.map(r => [r.userId, r.position])).toEqual([['ana', 1], ['dani', 2], ['me', 3]])
    expect(me).toBeNull()
  })

  it('adds my row with my real position when I fall outside the top three', () => {
    const { top, me } = rankWeekly([c('me', 0), c('ana', 4), c('dani', 3), c('marta', 2), c('leo', 1)], 'me')
    expect(top.map(r => r.userId)).toEqual(['ana', 'dani', 'marta'])
    expect(me).toEqual({ userId: 'me', value: 0, position: 5 })
  })

  it('breaks ties by input order, like the full leaderboard', () => {
    const { top } = rankWeekly([c('me', 1), c('ana', 1)], 'me')
    expect(top.map(r => r.userId)).toEqual(['me', 'ana'])
  })

  it('works with fewer people than the top size', () => {
    const { top, me } = rankWeekly([c('me', 1), c('ana', 0)], 'me')
    expect(top).toHaveLength(2)
    expect(me).toBeNull()
  })
})

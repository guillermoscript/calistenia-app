/**
 * Cobertura de la parte pura del historial de batallas (#453).
 *
 * El hook no se renderiza (core corre en vitest/node, sin testing-library), así que se
 * testea `battleHistoryEntryFrom`, que es donde se resuelven los empates: el historial
 * tiene que contar el mismo puesto que la pantalla de resultados.
 */
import { describe, expect, it, vi } from 'vitest'

// `battleApi` importa `pb` al evaluarse, que exige initCore(); la función bajo test
// es pura, así que basta con un doble mínimo del cliente.
vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})) },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import { createBattleScore } from '../lib/battle'
import type { Battle, BattleStanding } from '../types/battle'
import { battleHistoryEntryFrom } from './useBattleHistory'

const score = (over: Partial<{ rounds: number; key: string }> = {}) => createBattleScore({
  completed_rounds: over.rounds ?? 3,
  completed_reps: 30,
  completed_time_seconds: 0,
  finished_at: null,
  tie_break_key: over.key ?? 'k',
})

const row = (over: Partial<BattleStanding>): BattleStanding => ({
  participant_id: 'p1',
  user: 'u1',
  display_name: 'Alguien',
  status: 'finished',
  score: score(),
  rank: 1,
  current_exercise_position: null,
  last_activity_at: null,
  resting_until: null,
  ...over,
})

const battle = (final_standings: BattleStanding[] | null): Battle =>
  ({ id: 'b1', status: 'finished', final_standings }) as unknown as Battle

describe('battleHistoryEntryFrom', () => {
  it('shares my rank with a level rival instead of repeating the frozen tie-break', () => {
    // El servidor congela #1/#2 por `tie_break_key`; resultados ya enseñaba #1/#1 y el
    // historial decía "#2 de 2" de la misma batalla (#453).
    const entry = battleHistoryEntryFrom(battle([
      row({ participant_id: 'p1', user: 'rival', rank: 1, score: score({ key: 'a' }) }),
      row({ participant_id: 'p2', user: 'me', rank: 2, score: score({ key: 'b' }) }),
    ]), 'me')

    expect(entry.rank).toBe(1)
    expect(entry.standings.map((s) => s.display_rank)).toEqual([1, 1])
    // El `rank` congelado se conserva tal cual: no es cosa del cliente reescribirlo.
    expect(entry.standings.map((s) => s.rank)).toEqual([1, 2])
    expect(entry.opponents.map((s) => s.participant_id)).toEqual(['p1'])
  })

  it('leaves a clean win/loss untouched', () => {
    const entry = battleHistoryEntryFrom(battle([
      row({ participant_id: 'p1', user: 'rival', rank: 1, score: score({ rounds: 4 }) }),
      row({ participant_id: 'p2', user: 'me', rank: 2 }),
    ]), 'me')

    expect(entry.rank).toBe(2)
    expect(entry.standings.map((s) => s.display_rank)).toEqual([1, 2])
    expect(entry.outcome).toBe('lost')
  })

  it('reports no rank when the battle closed without stored results', () => {
    const entry = battleHistoryEntryFrom(battle(null), 'me')
    expect(entry.rank).toBeNull()
    expect(entry.standings).toEqual([])
    expect(entry.opponents).toEqual([])
  })

  it('reports no rank for a viewer who was not in the battle', () => {
    const entry = battleHistoryEntryFrom(battle([row({ user: 'someone' })]), 'me')
    expect(entry.rank).toBeNull()
    expect(entry.opponents).toHaveLength(1)
  })
})

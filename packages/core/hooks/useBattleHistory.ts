/**
 * My closed battles and the record they add up to (#398).
 *
 * Shared between platforms because none of it is platform-specific, and because the two
 * apps must not disagree about what counts as a win — a record that says 3-1 on the
 * phone and 4-0 on the web is worse than no record at all.
 *
 * Unlike `useBattle`, this IS cached server state: a closed battle never changes again,
 * which is exactly what makes a long `staleTime` correct here and wrong there.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { qk } from '../lib/query-keys'
import { listMyBattleHistory } from '../lib/battleApi'
import {
  battleDisplayRanks,
  battleOutcomeFor,
  battleRecordFrom,
  type BattleOutcome,
  type BattleRecord,
} from '../lib/battle'
import type { Battle, BattleStanding } from '../types/battle'

/** A frozen standing with its tie-aware rank resolved (#453). */
export interface BattleHistoryStanding extends BattleStanding {
  /** Shared with anyone level with this row. See `battleDisplayRanks`. */
  display_rank: number
}

export interface BattleHistoryEntry {
  battle: Battle
  outcome: BattleOutcome
  /**
   * Where I placed, or null on a battle with no stored ranking. Tie-aware: two level
   * players both read `1`, the same number the results screen showed them (#453).
   */
  rank: number | null
  /** The frozen ranking, empty when the battle closed before results were stored. */
  standings: BattleHistoryStanding[]
  /** Everyone else who took part, in finishing order. */
  opponents: BattleHistoryStanding[]
}

/**
 * One history entry from a closed battle. Pure so both platforms and the tests share it.
 *
 * The frozen `rank` in `final_standings` is left alone; ties are derived at read time
 * with the same rule as `battleResultView`, otherwise the history says "#2 of 2" about
 * a battle whose results screen said "#1 of 2" (#453).
 */
export function battleHistoryEntryFrom(battle: Battle, userId: string | null): BattleHistoryEntry {
  const frozen = battle.final_standings ?? []
  const displayRanks = battleDisplayRanks(frozen)
  const standings: BattleHistoryStanding[] = frozen.map((entry) => ({
    ...entry,
    display_rank: displayRanks.get(entry.participant_id) ?? entry.rank,
  }))
  const mine = userId ? standings.find((entry) => entry.user === userId) ?? null : null
  return {
    battle,
    outcome: userId ? battleOutcomeFor(battle.final_standings, userId) : 'unknown',
    rank: mine?.display_rank ?? null,
    standings,
    opponents: standings.filter((entry) => entry.participant_id !== mine?.participant_id),
  }
}

export interface UseBattleHistoryResult {
  entries: BattleHistoryEntry[]
  record: BattleRecord
  isLoading: boolean
  error: Error | null
}

export function useBattleHistory(userId: string | null): UseBattleHistoryResult {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.battles.history(userId),
    queryFn: () => listMyBattleHistory(),
    enabled: !!userId,
    // A closed battle is immutable; only a newly closed one changes this list.
    staleTime: 5 * 60_000,
    retry: false,
  })

  return useMemo(() => {
    const battles = data ?? []
    const entries = battles.map((battle) => battleHistoryEntryFrom(battle, userId))

    return {
      entries,
      record: userId ? battleRecordFrom(battles, userId) : { fought: 0, won: 0, lost: 0, left: 0, streak: 0 },
      isLoading,
      error: (error as Error) ?? null,
    }
  }, [data, userId, isLoading, error])
}

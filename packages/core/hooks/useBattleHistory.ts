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
import { battleOutcomeFor, battleRecordFrom, type BattleOutcome, type BattleRecord } from '../lib/battle'
import type { Battle, BattleStanding } from '../types/battle'

export interface BattleHistoryEntry {
  battle: Battle
  outcome: BattleOutcome
  /** Where I placed, or null on a battle with no stored ranking. */
  rank: number | null
  /** The frozen ranking, empty when the battle closed before results were stored. */
  standings: BattleStanding[]
  /** Everyone else who took part, in finishing order. */
  opponents: BattleStanding[]
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
    const entries: BattleHistoryEntry[] = battles.map((battle) => {
      const standings = battle.final_standings ?? []
      const mine = userId ? standings.find((entry) => entry.user === userId) ?? null : null
      return {
        battle,
        outcome: userId ? battleOutcomeFor(battle.final_standings, userId) : 'unknown',
        rank: mine?.rank ?? null,
        standings,
        opponents: standings.filter((entry) => entry.participant_id !== mine?.participant_id),
      }
    })

    return {
      entries,
      record: userId ? battleRecordFrom(battles, userId) : { fought: 0, won: 0, lost: 0, left: 0, streak: 0 },
      isLoading,
      error: (error as Error) ?? null,
    }
  }, [data, userId, isLoading, error])
}

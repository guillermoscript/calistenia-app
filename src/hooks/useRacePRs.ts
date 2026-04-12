import { useEffect, useState } from 'react'
import { pb } from '../lib/pocketbase'
import type { Race, RaceParticipant } from '../types/race'

export interface RacePRs {
  wins: number
  finishes: number
  best1k: number | null      // seconds
  best5k: number | null
  best10k: number | null
  fastestRace: { name: string; durationSeconds: number; distanceKm: number } | null
  longestRace: { name: string; distanceKm: number } | null
}

const EMPTY: RacePRs = {
  wins: 0,
  finishes: 0,
  best1k: null,
  best5k: null,
  best10k: null,
  fastestRace: null,
  longestRace: null,
}

/**
 * Aggregate a user's race performance: wins, finishes, best times for
 * standard distances, and the fastest / longest race they ran.
 *
 * Pulls every finished race_participants row for the user with the parent
 * race expanded. Computes locally — small data volumes per user, no need
 * for server-side aggregation.
 */
export function useRacePRs(userId: string | null): { prs: RacePRs; loading: boolean } {
  const [prs, setPrs] = useState<RacePRs>(EMPTY)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId) { setPrs(EMPTY); return }
    let cancelled = false
    setLoading(true)

    pb.collection('race_participants').getFullList<RaceParticipant & { expand?: { race?: Race } }>({
      filter: `user = "${userId}" && status = "finished"`,
      expand: 'race',
      sort: '-created',
      requestKey: null,
    }).then(rows => {
      if (cancelled) return
      const finishes = rows.length
      let wins = 0
      let best1k: number | null = null
      let best5k: number | null = null
      let best10k: number | null = null
      let fastestRace: RacePRs['fastestRace'] = null
      let longestRace: RacePRs['longestRace'] = null

      for (const row of rows) {
        const race = row.expand?.race
        if (!race) continue

        // For race-specific distance targets, track bests per bucket.
        // Allow ±2% tolerance so "5.00 km" and "4.99 km" both count.
        const target = race.target_distance_km
        if (target > 0 && row.duration_seconds > 0) {
          if (Math.abs(target - 1) / 1 < 0.02) {
            if (best1k === null || row.duration_seconds < best1k) best1k = row.duration_seconds
          } else if (Math.abs(target - 5) / 5 < 0.02) {
            if (best5k === null || row.duration_seconds < best5k) best5k = row.duration_seconds
          } else if (Math.abs(target - 10) / 10 < 0.02) {
            if (best10k === null || row.duration_seconds < best10k) best10k = row.duration_seconds
          }
        }

        // Track longest (any race, distance-based metric)
        if (!longestRace || row.distance_km > longestRace.distanceKm) {
          longestRace = { name: race.name, distanceKm: row.distance_km }
        }

        // Track fastest pace overall (if distance >= 1km to avoid noise)
        if (row.distance_km >= 1 && row.duration_seconds > 0) {
          if (!fastestRace || (row.duration_seconds / row.distance_km) < (fastestRace.durationSeconds / fastestRace.distanceKm)) {
            fastestRace = {
              name: race.name,
              durationSeconds: row.duration_seconds,
              distanceKm: row.distance_km,
            }
          }
        }
      }

      // Count wins: fetch all races where user was rank 0 finisher
      // Expensive to query across all races, so we do a simpler heuristic:
      // for each race, load participants and check if user was the first finisher.
      // Cap at 50 races to avoid runaway queries on power users.
      const raceIds = [...new Set(rows.slice(0, 50).map(r => r.race))]
      Promise.all(raceIds.map(id =>
        pb.collection('race_participants').getFullList<RaceParticipant>({
          filter: `race = "${id}" && status = "finished"`,
          sort: 'finished_at',
          requestKey: null,
        }).catch(() => [] as RaceParticipant[]),
      )).then(lists => {
        if (cancelled) return
        for (const list of lists) {
          if (list.length > 0 && list[0].user === userId) wins++
        }
        setPrs({ wins, finishes, best1k, best5k, best10k, fastestRace, longestRace })
        setLoading(false)
      })
    }).catch(() => {
      if (cancelled) return
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [userId])

  return { prs, loading }
}

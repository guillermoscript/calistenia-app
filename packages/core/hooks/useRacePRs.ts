import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
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

/** Máximo de carreras a revisar para el conteo de victorias (evita N+1 descontrolado). */
const WIN_CHECK_CAP = 50

/**
 * Agrega el historial de carreras del usuario: victorias, finalizaciones, mejores
 * tiempos en distancias estándar y la carrera más rápida / más larga que corrió.
 *
 * Dos queries dependientes con TanStack Query:
 *  1. prsFinished — carga todos los race_participants con status "finished" y
 *     calcula PRs localmente (sin victorias).
 *  2. wins — habilitado solo cuando prsFinished cargó; hace el N+1 de verificación
 *     de victoria carrera por carrera, capado en WIN_CHECK_CAP (50).
 *
 * Forma pública estable: { prs: RacePRs; loading: boolean }.
 */
export function useRacePRs(userId: string | null): { prs: RacePRs; loading: boolean } {
  // ── Query 1: participaciones finalizadas + cálculo de PRs (sin victorias) ──
  const {
    data: finishedData,
    isLoading: loadingFinished,
    isFetching: fetchingFinished,
  } = useQuery({
    queryKey: qk.races.prsFinished(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 min — los PRs no cambian con frecuencia
    queryFn: async () => {
      const rows = await pb
        .collection('race_participants')
        .getFullList<RaceParticipant & { expand?: { race?: Race } }>({
          filter: `user = "${userId}" && status = "finished"`,
          expand: 'race',
          sort: '-created',
          requestKey: null,
        })

      const finishes = rows.length
      let best1k: number | null = null
      let best5k: number | null = null
      let best10k: number | null = null
      let fastestRace: RacePRs['fastestRace'] = null
      let longestRace: RacePRs['longestRace'] = null

      for (const row of rows) {
        const race = row.expand?.race
        if (!race) continue

        // Mejores tiempos por distancia estándar (tolerancia ±2%).
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

        // Carrera más larga (por distancia).
        if (!longestRace || row.distance_km > longestRace.distanceKm) {
          longestRace = { name: race.name, distanceKm: row.distance_km }
        }

        // Carrera más rápida por ritmo (pace), mínimo 1 km para evitar ruido.
        if (row.distance_km >= 1 && row.duration_seconds > 0) {
          if (
            !fastestRace ||
            row.duration_seconds / row.distance_km <
              fastestRace.durationSeconds / fastestRace.distanceKm
          ) {
            fastestRace = {
              name: race.name,
              durationSeconds: row.duration_seconds,
              distanceKm: row.distance_km,
            }
          }
        }
      }

      // Devolvemos también los IDs únicos de carrera (capados a WIN_CHECK_CAP)
      // para que la query de victorias los use sin volver a fetchear.
      const raceIds = [...new Set(rows.slice(0, WIN_CHECK_CAP).map(r => r.race))]

      return { finishes, best1k, best5k, best10k, fastestRace, longestRace, raceIds }
    },
  })

  // ── Query 2: conteo de victorias — habilitado solo cuando finishedData existe ──
  const {
    data: winsData,
    isLoading: loadingWins,
    isFetching: fetchingWins,
  } = useQuery({
    queryKey: qk.races.wins(userId),
    // Dependiente: solo corre cuando ya tenemos los IDs de carrera.
    enabled: !!userId && !!finishedData,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // raceIds ya viene capado a WIN_CHECK_CAP (50) desde la query anterior.
      const raceIds = finishedData?.raceIds ?? []
      const lists = await Promise.all(
        raceIds.map(id =>
          pb
            .collection('race_participants')
            .getFullList<RaceParticipant>({
              filter: `race = "${id}" && status = "finished"`,
              sort: 'finished_at',
              requestKey: null,
            })
            .catch(() => [] as RaceParticipant[]),
        ),
      )
      let wins = 0
      for (const list of lists) {
        if (list.length > 0 && list[0].user === userId) wins++
      }
      return wins
    },
  })

  // ── Construcción de la forma pública ──
  const prs: RacePRs = finishedData
    ? {
        wins: winsData ?? 0,
        finishes: finishedData.finishes,
        best1k: finishedData.best1k,
        best5k: finishedData.best5k,
        best10k: finishedData.best10k,
        fastestRace: finishedData.fastestRace,
        longestRace: finishedData.longestRace,
      }
    : EMPTY

  // loading = true mientras cualquiera de las dos queries esté en vuelo inicial.
  const loading =
    (!!userId && (loadingFinished || fetchingFinished)) ||
    (!!finishedData && (loadingWins || fetchingWins))

  return { prs, loading }
}

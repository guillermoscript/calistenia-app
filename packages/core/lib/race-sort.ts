import type { Race, RaceParticipant } from '../types/race'

export type RaceSortInput = Pick<Race, 'mode' | 'target_distance_km'>

/**
 * Ranking de participantes de carrera, compartido entre leaderboard en vivo,
 * resultados y share card (web + mobile).
 *
 * Grupos: finalizados → en carrera/otros → DNF. Dentro de finalizados el
 * criterio depende de la carrera:
 * - `distance` con objetivo: primero en llegar (finished_at ascendente).
 * - `time` o sin objetivo de distancia: todos terminan casi simultáneo
 *   (auto-finish del reloj o force-finish del creador), así que finished_at
 *   solo refleja latencia de red — gana quien más distancia recorrió
 *   (empate: mejor pace, luego nombre).
 */
export function sortRaceParticipants(
  participants: RaceParticipant[],
  race: RaceSortInput | null | undefined,
): RaceParticipant[] {
  const finishByDistance = race != null && (race.mode === 'time' || !(race.target_distance_km > 0))
  const group = (p: RaceParticipant) =>
    p.status === 'finished' ? 0 : p.status === 'dnf' ? 2 : 1

  return [...participants].sort((a, b) => {
    if (group(a) !== group(b)) return group(a) - group(b)

    if (a.status === 'finished' && b.status === 'finished') {
      if (finishByDistance) {
        if (b.distance_km !== a.distance_km) return b.distance_km - a.distance_km
        if (a.avg_pace !== b.avg_pace) return a.avg_pace - b.avg_pace
        return a.display_name.localeCompare(b.display_name)
      }
      const af = a.finished_at ? new Date(a.finished_at).getTime() : Infinity
      const bf = b.finished_at ? new Date(b.finished_at).getTime() : Infinity
      if (af !== bf) return af - bf
      return a.display_name.localeCompare(b.display_name)
    }

    // En carrera (o DNF entre sí): distancia desc, menos tiempo, nombre estable
    if (b.distance_km !== a.distance_km) return b.distance_km - a.distance_km
    if (a.duration_seconds !== b.duration_seconds) return a.duration_seconds - b.duration_seconds
    return a.display_name.localeCompare(b.display_name)
  })
}

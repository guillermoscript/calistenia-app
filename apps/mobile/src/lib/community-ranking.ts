/**
 * Resumen del ranking semanal de la pestaña Comunidad (#860).
 *
 * Sin imports de `@/`: el Vitest del móvil no resuelve ese alias.
 */
import type { LeaderboardEntry } from '@calistenia/core/hooks/useLeaderboard'

export type RankedEntry = { entry: LeaderboardEntry; position: number }

/**
 * Los 3 primeros y, si te quedas fuera, tu fila con tu puesto real. Las
 * entradas llegan ya ordenadas de mayor a menor desde `useLeaderboard`.
 */
export function summarizeWeek(entries: LeaderboardEntry[]): RankedEntry[] {
  const ranked = entries.map((entry, i) => ({ entry, position: i + 1 }))
  const top = ranked.slice(0, 3)
  const me = ranked.find(r => r.entry.isCurrentUser)
  return me && me.position > 3 ? [...top, me] : top
}

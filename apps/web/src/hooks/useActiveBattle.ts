/**
 * La batalla activa del usuario (paridad con `apps/mobile/src/lib/use-active-battle.ts`).
 *
 * Una sola query key (`qk.battles.active()`): Hoy y la pestaña Batallas de Comunidad la
 * comparten sin pedirla dos veces. `poll` lo activa quien quiera refrescarla sola; el
 * resto lee la caché.
 */
import { useQuery } from '@tanstack/react-query'

import { findMyActiveBattle } from '@calistenia/core/lib/battleApi'
import { qk } from '@calistenia/core/lib/query-keys'
import type { Battle } from '@calistenia/core/types/battle'

export const ACTIVE_BATTLE_POLL_MS = 45_000

/** Una batalla con gente dentro (sala abierta o en marcha); el resto no se enseña. */
export function isBattleOngoing(battle: Battle | null | undefined): battle is Battle {
  const status = battle?.status
  return status === 'lobby' || status === 'ready' || status === 'live'
}

export function useActiveBattle({ poll = false, enabled = true }: { poll?: boolean; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.battles.active(),
    queryFn: findMyActiveBattle,
    enabled,
    staleTime: 15_000,
    refetchInterval: poll ? ACTIVE_BATTLE_POLL_MS : false,
    // Un fallo aquí no puede tumbar la pantalla: sin dato, simplemente no sale.
    retry: false,
  })
}

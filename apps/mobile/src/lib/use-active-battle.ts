import { usePathname } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { findMyActiveBattle } from '@calistenia/core/lib/battleApi'
import { qk } from '@calistenia/core/lib/query-keys'
import type { Battle } from '@calistenia/core/types/battle'
import { ACTIVE_BATTLE_POLL_MS, shouldPollActiveBattle } from '@/lib/active-battle-poll'

/** Una batalla con gente dentro (sala abierta o en marcha); el resto no se enseña. */
export function isBattleOngoing(battle: Battle | null | undefined): battle is Battle {
  const status = battle?.status
  return status === 'lobby' || status === 'ready' || status === 'live'
}

/**
 * La batalla activa del usuario, compartida por la barra flotante y la pestaña
 * Comunidad (misma query key: una sola petición).
 *
 * Solo consulta con Hoy o Comunidad en pantalla (#860). `poll` decide quién
 * lleva el temporizador: cada observador de React Query arranca el suyo, así que
 * si los dos sondearan habría dos peticiones cada 45 s. Lo lleva la barra, que
 * está montada siempre.
 */
export function useActiveBattle({ poll = false }: { poll?: boolean } = {}) {
  const visible = shouldPollActiveBattle(usePathname())
  return useQuery({
    queryKey: qk.battles.active(),
    queryFn: findMyActiveBattle,
    // Fuera de Hoy y Comunidad no se pregunta: la barra sigue saliendo con lo
    // que haya en caché y se refresca al volver a una de las dos.
    enabled: visible,
    staleTime: 15_000,
    // La batalla solo cambia por acciones propias, pero el usuario vuelve a las
    // tabs desde la pantalla de batalla sin desmontar el layout.
    refetchInterval: poll && visible ? ACTIVE_BATTLE_POLL_MS : false,
    // Un fallo aquí no puede tumbar las tabs: sin dato, simplemente no sale.
    retry: false,
  })
}

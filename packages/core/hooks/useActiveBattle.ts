/**
 * La batalla activa del usuario, compartida por Hoy, la barra flotante y la
 * pestaña/sección Batallas de Comunidad (misma query key
 * `qk.battles.active()`: una sola petición).
 *
 * - `enabled`: quien sabe DÓNDE está la pantalla lo decide (móvil solo consulta
 *   con Hoy o Comunidad a la vista, #860).
 * - `poll`: lo activa quien quiera refrescarla sola. Cada observador de React
 *   Query arranca su propio temporizador, así que solo debe sondear UNO (la
 *   barra en móvil, Hoy en web); el resto lee la caché.
 */
import { useQuery } from '@tanstack/react-query'
import { findMyActiveBattle } from '../lib/battleApi'
import { qk } from '../lib/query-keys'

export const ACTIVE_BATTLE_POLL_MS = 45_000

export function useActiveBattle({ poll = false, enabled = true }: { poll?: boolean; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.battles.active(),
    queryFn: findMyActiveBattle,
    enabled,
    staleTime: 15_000,
    refetchInterval: poll && enabled ? ACTIVE_BATTLE_POLL_MS : false,
    // Un fallo aquí no puede tumbar la pantalla: sin dato, simplemente no sale.
    retry: false,
  })
}

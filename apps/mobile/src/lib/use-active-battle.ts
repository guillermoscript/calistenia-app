import { usePathname } from 'expo-router'

import { useActiveBattle as useCoreActiveBattle } from '@calistenia/core/hooks/useActiveBattle'
import { shouldPollActiveBattle } from '@/lib/active-battle-poll'

/**
 * La batalla activa (core), solo consultada con Hoy o Comunidad en pantalla
 * (#860). Fuera de ahí la barra sigue saliendo con lo que haya en caché y se
 * refresca al volver a una de las dos. `poll` lo lleva la barra, que está
 * montada siempre (ver core: un solo observador sondea).
 */
export function useActiveBattle({ poll = false }: { poll?: boolean } = {}) {
  const visible = shouldPollActiveBattle(usePathname())
  return useCoreActiveBattle({ poll, enabled: visible })
}

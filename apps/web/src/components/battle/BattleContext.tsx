/**
 * Hub de una batalla en web. Casi todo el estado vive en `useBattle` de core (la batalla es
 * autoritativa en el servidor); aquí solo lo propio de la plataforma: invalidar las queries
 * de batalla al cambiar de estado, volver a pedir snapshot al regresar a la pestaña y
 * mantener la pantalla encendida durante la sesión.
 */
import { createContext, use, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useBattle, type UseBattleResult } from '@calistenia/core/hooks/useBattle'
import { useWakeLock } from '../../hooks/useWakeLock'
import { qk } from '@calistenia/core/lib/query-keys'

const BattleContext = createContext<UseBattleResult | null>(null)

export function BattleProvider({ battleId, userId, children }: { battleId: string; userId: string | null; children: ReactNode }) {
  const battle = useBattle(battleId, userId)
  const { phase, actions, snapshot } = battle
  const queryClient = useQueryClient()

  // «Mi batalla activa» y el historial cuelgan de ['battle']: una batalla que acaba de
  // cerrarse es justo la fila que falta.
  const battleStatus = snapshot?.battle.status
  const mySeat = snapshot?.me?.status
  useEffect(() => {
    if (!battleStatus) return
    void queryClient.invalidateQueries({ queryKey: qk.battles.all })
  }, [battleStatus, mySeat, queryClient])

  // El progreso hecho sin conexión no es fiable: al volver a la pestaña se pide snapshot y se
  // reemplaza, nunca se reenvía nada.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') actions.refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [actions])

  useWakeLock(phase === 'countdown' || phase === 'live')

  return <BattleContext.Provider value={battle}>{children}</BattleContext.Provider>
}

export function useBattleContext(): UseBattleResult {
  const ctx = use(BattleContext)
  if (!ctx) throw new Error('useBattleContext debe usarse dentro de BattleProvider')
  return ctx
}

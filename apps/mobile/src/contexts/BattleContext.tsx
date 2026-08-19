/**
 * Hub de una batalla de circuito colaborativa (#356).
 *
 * A diferencia de `RaceContext`, aquí casi todo el estado vive en el hook compartido
 * `useBattle` de core: la batalla es autoritativa en el servidor y el cliente solo
 * reemplaza su copia con el último snapshot. Este contexto añade lo que sí es propio
 * de la plataforma: mantener la pantalla encendida durante la sesión y volver a pedir
 * un snapshot cuando la app regresa del segundo plano.
 */
import { createContext, use, useEffect, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { useQueryClient } from '@tanstack/react-query'

import { useBattle, type UseBattleResult } from '@calistenia/core/hooks/useBattle'
import { useAuthUser } from '@/lib/use-auth-user'

const BattleContext = createContext<UseBattleResult | null>(null)

const KEEP_AWAKE_TAG = 'battle'

export function BattleProvider({ battleId, children }: { battleId: string; children: ReactNode }) {
  const user = useAuthUser()
  const battle = useBattle(battleId, user?.id ?? null)
  const { phase, actions, snapshot } = battle
  const queryClient = useQueryClient()

  // La barra flotante de las tabs cachea "mi batalla activa" y solo se refresca sola cada
  // 45 s. Sin esto, terminar o abandonar una batalla dejaba la barra invitando a volver a
  // una batalla ya cerrada — el usuario la tocaba y no había nada que hacer allí.
  //
  // El historial cuelga del mismo prefijo: una batalla que acaba de cerrarse es
  // justo la fila que falta en Progreso (#398).
  const battleStatus = snapshot?.battle.status
  const mySeat = snapshot?.me?.status
  useEffect(() => {
    if (!battleStatus) return
    void queryClient.invalidateQueries({ queryKey: ['battle'] })
  }, [battleStatus, mySeat, queryClient])

  // El progreso hecho sin conexión no es fiable, así que al volver del segundo plano
  // NO reenviamos nada: pedimos snapshot y reemplazamos. Es la misma regla que en
  // reconexión y en hueco de `revision`.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') actions.refresh()
    })
    return () => sub.remove()
  }, [actions])

  // Nadie quiere que se apague la pantalla a mitad de una ronda.
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'live') return
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {})
    return () => { void deactivateKeepAwake(KEEP_AWAKE_TAG) }
  }, [phase])

  return <BattleContext.Provider value={battle}>{children}</BattleContext.Provider>
}

export function useBattleContext(): UseBattleResult {
  const ctx = use(BattleContext)
  if (!ctx) throw new Error('useBattleContext debe usarse dentro de BattleProvider')
  return ctx
}

/**
 * Barra flotante cuando el usuario tiene una batalla en curso — misma idea que
 * `ActiveSessionBar`, y se apila por encima de esa y de la de cardio.
 *
 * Existe porque una batalla no se veía en ningún sitio salvo entrando a ☰ → Batallas:
 * al matar la app parecía que la batalla se había perdido, cuando el servidor la tenía
 * entera. Aquí una batalla viva es más urgente que una sesión: hay gente esperando en la
 * sala o entrenando contra ti ahora mismo.
 */
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { useCardioSessionContext } from '@/contexts/CardioSessionContext'
import { findMyActiveBattle } from '@calistenia/core/lib/battleApi'
import { qk } from '@calistenia/core/lib/query-keys'

export default function ActiveBattleBar() {
  const { t } = useTranslation()
  const router = useRouter()
  const { isActive: sessionActive, workout } = useActiveSession()
  const { state: cardioState } = useCardioSessionContext()

  const { data: battle } = useQuery({
    queryKey: qk.battles.active(),
    queryFn: findMyActiveBattle,
    // Un fallo aquí no puede tumbar las tabs: sin dato, la barra simplemente no sale.
    staleTime: 15_000,
    // La batalla solo cambia por acciones propias, pero el usuario vuelve a las tabs
    // desde la pantalla de batalla sin desmontar este layout, así que se refresca sola.
    refetchInterval: 45_000,
    retry: false,
  })

  if (!battle) return null
  const status = battle.status
  if (status !== 'lobby' && status !== 'ready' && status !== 'live') return null

  // Se coloca por encima de las barras que ya puedan estar visibles.
  const cardioVisible = cardioState === 'tracking' || cardioState === 'paused'
  const sessionVisible = sessionActive && !!workout
  const bottom = 88 + (cardioVisible ? 64 : 0) + (sessionVisible ? 64 : 0)

  return (
    <Pressable
      onPress={() => router.push(`/battle/${battle.id}`)}
      accessibilityLabel={t('battle.barLabel')}
      style={{ bottom }}
      className="absolute inset-x-3 flex-row items-center gap-3 rounded-xl border border-lime/40 bg-card px-4 py-3 shadow-lg active:opacity-90"
    >
      <View className="flex-1">
        <Kicker size="xs" tone="lime">
          {t('battle.kicker')}
        </Kicker>
        <Text className="font-bebas text-lg leading-tight text-foreground" numberOfLines={1}>
          {status === 'live' ? t('battle.barLive') : t('battle.barLobby')}
        </Text>
      </View>
      <View className="size-2.5 rounded-full bg-lime" />
    </Pressable>
  )
}

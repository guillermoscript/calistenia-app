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

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { useCardioSessionContext } from '@/contexts/CardioSessionContext'
import { isBattleOngoing, useActiveBattle } from '@/lib/use-active-battle'

export default function ActiveBattleBar() {
  const { t } = useTranslation()
  const router = useRouter()
  const { isActive: sessionActive, workout } = useActiveSession()
  const { state: cardioState } = useCardioSessionContext()

  // La barra lleva el sondeo de 45 s, y solo con Hoy o Comunidad a la vista (#860).
  const { data: battle } = useActiveBattle({ poll: true })

  if (!isBattleOngoing(battle)) return null
  const status = battle.status

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

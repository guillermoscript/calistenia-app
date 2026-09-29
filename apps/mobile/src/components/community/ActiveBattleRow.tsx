/**
 * Fila de «batalla activa» de la pestaña Comunidad (#860).
 *
 * Lee la misma query que la barra flotante (`useActiveBattle`), pero no lleva
 * temporizador propio: el sondeo de 45 s es de la barra, que ya lo limita a Hoy
 * y Comunidad. Si no hay batalla viva, no ocupa sitio.
 */
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { isBattleOngoing, useActiveBattle } from '@/lib/use-active-battle'

export default function ActiveBattleRow() {
  const { t } = useTranslation()
  const router = useRouter()
  const { data: battle } = useActiveBattle()

  if (!isBattleOngoing(battle)) return null

  const live = battle.status === 'live'
  const title = live ? t('community.battleLive') : t('community.battleLobby')
  const detail = `${battle.config.rounds} ${t('battle.rounds')} · ${battle.config.exercises.length} ${t('battle.exercises')}`

  return (
    <Pressable
      onPress={() => router.push(`/battle/${battle.id}`)}
      className="min-h-[60px] flex-row items-center gap-3 rounded-xl border border-sky-400/45 px-4 py-2 active:bg-sky-400/10"
      accessibilityRole="button"
      accessibilityLabel={`${title} · ${detail}`}
    >
      <View className="size-2 rounded-full bg-sky-400" />
      <View className="flex-1 gap-0.5">
        <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <ChevronRight size={16} color="hsl(0 0% 55%)" />
    </Pressable>
  )
}

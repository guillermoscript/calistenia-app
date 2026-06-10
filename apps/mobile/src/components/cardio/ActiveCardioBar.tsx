/**
 * Barra flotante cuando hay una sesión de cardio en curso y el usuario navega
 * por las tabs — equivalente móvil del ActiveCardioBar web. Vuelve a /cardio.
 */
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { useCardioSessionContext } from '@/contexts/CardioSessionContext'
import { formatDuration } from '@calistenia/core/lib/geo'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'

export default function ActiveCardioBar() {
  const { t } = useTranslation()
  const router = useRouter()
  const { state, activityType, duration, distance } = useCardioSessionContext()

  if (state !== 'tracking' && state !== 'paused') return null

  return (
    <Pressable
      onPress={() => router.push('/cardio')}
      className="absolute inset-x-3 bottom-[88px] flex-row items-center gap-3 rounded-xl border border-lime/40 bg-card px-4 py-3 shadow-lg active:opacity-90"
    >
      <Text className="text-lg">{CARDIO_ACTIVITY[activityType]?.icon ?? '🏃'}</Text>
      <View className="flex-1">
        <Text className="font-mono text-[9px] uppercase tracking-[2px] text-lime">
          {state === 'paused' ? t('cardio.paused') : t('cardio.activeSession')}
        </Text>
        <Text className="font-bebas text-lg leading-tight text-foreground">
          {formatDuration(duration)} · {distance.toFixed(2)} km
        </Text>
      </View>
      {state === 'tracking' && <View className="size-2.5 rounded-full bg-red-500" />}
    </Pressable>
  )
}

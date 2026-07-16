/**
 * Barra flotante cuando hay una sesión de fuerza en curso y el usuario navega
 * por las tabs — equivalente móvil del ActiveFreeSessionBubble web. Vuelve a
 * /session. Se apila sobre la de cardio si ambas están activas.
 */
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { useCardioSessionContext } from '@/contexts/CardioSessionContext'

export default function ActiveSessionBar() {
  const { t } = useTranslation()
  const router = useRouter()
  const { isActive, workout, exerciseCount } = useActiveSession()
  const { state: cardioState } = useCardioSessionContext()

  if (!isActive || !workout) return null

  // Si la barra de cardio también está visible, esta se coloca encima
  const cardioVisible = cardioState === 'tracking' || cardioState === 'paused'
  const title = workout.title || t('session.session')

  return (
    <Pressable
      onPress={() => router.push('/session')}
      accessibilityLabel={t('session.activeBubbleLabel', { title, count: exerciseCount })}
      className={`absolute inset-x-3 ${cardioVisible ? 'bottom-[152px]' : 'bottom-[88px]'} flex-row items-center gap-3 rounded-xl border border-lime/40 bg-card px-4 py-3 shadow-lg active:opacity-90`}
    >
      <View className="flex-1">
        <Text className="font-mono text-[9px] uppercase tracking-[2px] text-lime">
          {t('session.activeSession')}
        </Text>
        <Text className="font-bebas text-lg leading-tight text-foreground" numberOfLines={1}>
          {/* plural manual: Hermes puede no traer Intl.PluralRules (ver SelectionBar) */}
          {title} · {exerciseCount} {exerciseCount === 1 ? t('session.exerciseCount') : t('session.exerciseCount_other')}
        </Text>
      </View>
      <View className="size-2.5 rounded-full bg-lime" />
    </Pressable>
  )
}

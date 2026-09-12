/**
 * FirstWorkoutCard — reemplaza el checklist «Primeros pasos» en el Home para
 * quien nunca ha entrenado (#694).
 *
 * Antes, alguien con `totalSessions === 0` veía el checklist de 6 ítems
 * (programa, primer entreno, comida, cardio, foto, seguir amigo) montando de
 * paso las queries de nutrición/cardio/fotos/follows — trabajo pagado por
 * quien todavía no ha hecho lo único que de verdad importa el día 0: entrenar.
 * Esta card es una sola fila con un CTA directo al primer entreno; el
 * checklist completo vuelve a partir de la primera sesión.
 */
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Dumbbell } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { haptics } from '@/lib/haptics'
import { COLORS } from '@/lib/theme'
import { useAuthUser } from '@/lib/use-auth-user'
import { useStartFirstWorkout } from '@/lib/start-first-workout'
import { estimateFirstWorkoutMinutes, normalizeFirstWorkoutLevel } from '@calistenia/core/lib/first-workout'

export default function FirstWorkoutCard() {
  const { t } = useTranslation()
  const user = useAuthUser()
  const startFirstWorkout = useStartFirstWorkout()
  const minutes = estimateFirstWorkoutMinutes(normalizeFirstWorkoutLevel(user?.level))

  const handlePress = () => {
    haptics.medium()
    startFirstWorkout(user?.level, 'home')
  }

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
      <View className="size-10 shrink-0 items-center justify-center rounded-full bg-lime/10">
        <Dumbbell size={18} color={COLORS.lime} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
          {t('firstWorkout.cardKicker')}
        </Text>
        <Text className="font-bebas text-lg leading-none text-foreground">{t('firstWorkout.title')}</Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">
          {t('firstWorkout.cardDesc', { minutes })}
        </Text>
      </View>
      <Button size="sm" className="shrink-0 bg-lime active:bg-lime/90" onPress={handlePress}>
        <Text className="font-sans-medium text-xs text-lime-foreground">{t('firstWorkout.cardCta')}</Text>
      </Button>
    </View>
  )
}

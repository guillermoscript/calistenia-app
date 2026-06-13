/** Overlay de cuenta atrás — port móvil del RaceCountdown web. */
import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { useRaceCountdown } from '@/contexts/RaceContext'
import { haptics } from '@/lib/haptics'
import * as sounds from '@/lib/sounds'

export default function RaceCountdown() {
  const { t } = useTranslation()
  const { secondsLeft } = useRaceCountdown()

  // 3-2-1 con tick (sonido + háptica) y golpe fuerte en GO — en la salida el
  // usuario mira al frente, no a la pantalla. Mismo vocabulario que el fin de
  // descanso del workout.
  const prevRef = useRef<number>(Infinity)
  useEffect(() => {
    const prev = prevRef.current
    if (secondsLeft === prev) return
    prevRef.current = secondsLeft
    if (secondsLeft > 0 && secondsLeft <= 3 && secondsLeft < prev) {
      sounds.playCountdownTick()
      void haptics.light()
    } else if (secondsLeft === 0 && prev > 0) {
      sounds.playGetReady()
      void haptics.heavy()
    }
  }, [secondsLeft])

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="font-mono text-xs uppercase tracking-[4px] text-muted-foreground">
        {t('race.startingSoon')}
      </Text>
      <Text className="mt-4 font-bebas text-[140px] leading-none text-lime">
        {secondsLeft > 0 ? secondsLeft : 'GO'}
      </Text>
    </View>
  )
}

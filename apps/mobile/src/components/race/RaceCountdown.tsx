/** Overlay de cuenta atrás — port móvil del RaceCountdown web. */
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { useRaceCountdown } from '@/contexts/RaceContext'

export default function RaceCountdown() {
  const { t } = useTranslation()
  const { secondsLeft } = useRaceCountdown()

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

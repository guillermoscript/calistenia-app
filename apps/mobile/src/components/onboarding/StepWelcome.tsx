import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'

interface Props {
  firstName: string
  needsProfile: boolean
  onStart: () => void
  onSkipAll: () => void
}

const FLOW_ITEMS = [
  { icon: '📋', labelKey: 'onboarding.programLabel' },
  { icon: '→', labelKey: '' },
  { icon: '📅', labelKey: 'onboarding.dayLabel' },
  { icon: '→', labelKey: '' },
  { icon: '💪', labelKey: 'onboarding.exercises' },
  { icon: '→', labelKey: '' },
  { icon: '📈', labelKey: 'onboarding.progress' },
] as const

export function StepWelcome({ firstName, needsProfile, onStart, onSkipAll }: Props) {
  const { t } = useTranslation()

  return (
    <Animated.View entering={FadeInDown.duration(500)} className="items-center">
      <Text className="font-bebas text-7xl leading-none text-lime mb-2">
        CALISTENIA
      </Text>

      <Text className="text-muted-foreground text-sm mb-6 text-center">
        {firstName
          ? t('onboarding.welcomeMsg', { name: firstName })
          : t('onboarding.welcomeDefault')}
      </Text>

      <View className="flex-row items-center justify-center gap-2 mb-6">
        {FLOW_ITEMS.map((item, i) => (
          <View key={i} className="items-center">
            <Text className={item.labelKey ? 'text-lg' : 'text-muted-foreground/40 text-sm'}>
              {item.icon}
            </Text>
            {item.labelKey ? (
              <Text className="text-[9px] text-muted-foreground mt-0.5">
                {t(item.labelKey)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <Card className="mb-6 w-full">
        <CardContent className="p-5">
          <Text className="text-sm text-muted-foreground leading-relaxed">
            <Text className="text-foreground font-sans-medium">{t('onboarding.howItWorks')} </Text>
            {t('onboarding.howItWorksDetail')}
          </Text>
          <Text className="text-xs text-muted-foreground mt-2">
            {needsProfile
              ? t('onboarding.needsProfileHint')
              : t('onboarding.justChooseProgram')}
          </Text>
        </CardContent>
      </Card>

      <Button
        className="w-full h-12 bg-lime active:bg-lime/90"
        onPress={onStart}
      >
        <Text className="font-bebas text-xl tracking-wide text-lime-foreground">
          {needsProfile ? t('onboarding.startBtn') : t('onboarding.chooseProgramBtn')}
        </Text>
      </Button>

      <Pressable onPress={onSkipAll} className="mt-4 active:opacity-60">
        <Text className="text-xs text-muted-foreground text-center">
          {t('onboarding.skipAll')}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

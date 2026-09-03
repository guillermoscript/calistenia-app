import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { haptics } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { DISCOVERY_SOURCES, type DiscoverySourceId } from '@calistenia/core/lib/discovery-source'

interface Props {
  firstName: string
  needsProfile: boolean
  /** «¿Cómo conociste la app?» (#586): null = sin contestar. */
  discoverySource: DiscoverySourceId | null
  onDiscoverySourceChange: (source: DiscoverySourceId | null) => void
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

export function StepWelcome({
  firstName, needsProfile, discoverySource, onDiscoverySourceChange, onStart, onSkipAll,
}: Props) {
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

      {/* Una sola pregunta, opcional, antes del CTA: aquí todavía la contesta
          casi todo el mundo; al final del onboarding llega menos de la mitad. */}
      <View className="mb-6 w-full">
        <View className="mb-2 flex-row items-baseline justify-between">
          <Text className="text-sm font-sans-medium text-foreground">{t('onboarding.discoveryTitle')}</Text>
          <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('onboarding.discoveryOptional')}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {DISCOVERY_SOURCES.map((option) => {
            const active = discoverySource === option.id
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => { haptics.selection(); onDiscoverySourceChange(active ? null : option.id) }}
                className={cn(
                  'rounded-full border px-3 py-1.5 active:opacity-70',
                  active ? 'border-lime bg-lime/10' : 'border-border bg-card',
                )}
              >
                <Text className={cn('text-xs', active ? 'text-foreground' : 'text-muted-foreground')}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

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

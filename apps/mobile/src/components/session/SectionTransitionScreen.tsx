import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { SectionTransitionType } from '@calistenia/core/lib/session-machine'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'

interface SectionTransitionScreenProps {
  type: SectionTransitionType
  onContinue: () => void
  onSkip?: () => void
}

/** Pantalla puente entre secciones: calentamiento → principal, principal → enfriamiento. */
export default function SectionTransitionScreen({ type, onContinue, onSkip }: SectionTransitionScreenProps) {
  const { t } = useTranslation()
  const doneMsg = type === 'warmup-to-main'
    ? t('warmupCooldown.transitions.warmupComplete')
    : t('warmupCooldown.transitions.mainComplete')
  const nextSection = type === 'warmup-to-main'
    ? t('warmupCooldown.sections.main')
    : t('warmupCooldown.sections.cooldown')

  return (
    <View className="flex-1 items-center justify-center gap-6 px-8">
      <Text className="text-center text-lg text-muted-foreground">{doneMsg}</Text>
      <Text className="text-center font-bebas text-4xl leading-none tracking-[2px] text-foreground">{nextSection}</Text>
      <Button size="lg" className="min-w-[200px] bg-lime active:bg-lime/90" onPress={onContinue}>
        <Text className="font-bebas text-xl tracking-[2px] text-lime-foreground">{t('warmupCooldown.transitions.continue').toUpperCase()}</Text>
      </Button>
      {onSkip && (
        <Button variant="outline" onPress={onSkip}>
          <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">{t('warmupCooldown.skip.cooldown')}</Text>
        </Button>
      )}
    </View>
  )
}

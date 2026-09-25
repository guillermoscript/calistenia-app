import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import type { PrimaryGoal } from '@calistenia/core/types/onboarding'

/**
 * Paso «lo esencial» (#820), port nativo de la versión web. Fusiona los
 * antiguos StepGoals + StepTraining en objetivo + nivel; el resto de campos
 * finos vive ahora en Perfil > Entrenamiento, no en el camino crítico.
 */

interface Props {
  primaryGoal: PrimaryGoal | ''
  onPrimaryGoalChange: (goal: PrimaryGoal) => void
  level: string
  onLevelChange: (level: string) => void
  saving: boolean
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

export function StepEssentials({
  primaryGoal, onPrimaryGoalChange, level, onLevelChange, saving,
  onBack, onContinue, onSkip,
}: Props) {
  const { t } = useTranslation()

  const PRIMARY_GOALS: { value: PrimaryGoal; label: string }[] = [
    { value: 'ganar_musculo', label: t('onboarding.primaryGoalMuscle') },
    { value: 'perder_grasa', label: t('onboarding.primaryGoalFatLoss') },
    { value: 'recomposicion', label: t('onboarding.primaryGoalRecomp') },
    { value: 'resistencia', label: t('onboarding.primaryGoalEndurance') },
    { value: 'habilidades', label: t('onboarding.primaryGoalSkills') },
    { value: 'salud_general', label: t('onboarding.primaryGoalHealth') },
  ]

  const LEVELS = [
    { value: 'principiante', label: t('onboarding.beginner'), desc: t('onboarding.beginnerDesc') },
    { value: 'intermedio', label: t('onboarding.intermediate'), desc: t('onboarding.intermediateDesc') },
    { value: 'avanzado', label: t('onboarding.advanced'), desc: t('onboarding.advancedDesc') },
  ]

  return (
    <View>
      <View className="items-center mb-6">
        <Text className="font-bebas text-3xl mb-1">{t('onboarding.essentialsTitle')}</Text>
        <Text className="text-sm text-muted-foreground text-center">{t('onboarding.essentialsDesc')}</Text>
      </View>

      <Card className="mb-6">
        <CardContent className="p-5 gap-5">
          {/* Primary goal */}
          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.primaryGoal')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {PRIMARY_GOALS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => { haptics.selection(); onPrimaryGoalChange(opt.value) }}
                  className={cn(
                    'flex-1 min-w-[45%] items-start rounded-md border px-3 py-2',
                    primaryGoal === opt.value
                      ? 'border-lime bg-lime/10'
                      : 'border-border'
                  )}
                >
                  <Text className={cn(
                    'text-sm font-sans-medium',
                    primaryGoal === opt.value ? 'text-lime' : 'text-foreground'
                  )}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Level */}
          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.level')}
            </Text>
            <View className="gap-2">
              {LEVELS.map((l) => (
                <Pressable
                  key={l.value}
                  onPress={() => { haptics.selection(); onLevelChange(l.value) }}
                  className={cn(
                    'flex-row items-center gap-3 px-3.5 py-2.5 rounded-md border',
                    level === l.value
                      ? 'border-lime bg-lime/5'
                      : 'border-border'
                  )}
                >
                  <View className={cn(
                    'w-3 h-3 rounded-full border-2 shrink-0',
                    level === l.value ? 'border-lime bg-lime' : 'border-muted-foreground/40'
                  )} />
                  <View>
                    <Text className={cn(
                      'text-sm',
                      level === l.value ? 'text-lime' : 'text-foreground'
                    )}>
                      {l.label}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{l.desc}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </CardContent>
      </Card>

      <View className="flex-row gap-3">
        <Button variant="outline" onPress={onBack} className="flex-1 h-11">
          <Text className="font-mono text-xs tracking-wide">{t('onboarding.back')}</Text>
        </Button>
        <Button
          onPress={onContinue}
          disabled={saving}
          className="flex-1 h-11 bg-lime active:bg-lime/90"
        >
          <Text className="font-bebas text-lg tracking-wide text-lime-foreground">
            {saving ? t('onboarding.saving') : t('onboarding.continueBtn')}
          </Text>
        </Button>
      </View>

      <Pressable onPress={onSkip} className="mt-4 active:opacity-60">
        <Text className="text-xs text-muted-foreground text-center">
          {t('onboarding.skipForNow')}
        </Text>
      </Pressable>
    </View>
  )
}

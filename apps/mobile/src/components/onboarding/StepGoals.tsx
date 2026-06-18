import { useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'

export type ActivityLevel = 'sedentary' | 'light' | 'active' | 'very_active'
export type Pace = 'gradual' | 'balanced' | 'aggressive'

export interface GoalsValues {
  goal_weight: string
  activity_level: ActivityLevel | ''
  pace: Pace | ''
}

interface Props {
  values: GoalsValues
  onChange: (next: GoalsValues) => void
  currentWeightKg: number | null
  currentHeightCm: number | null
  saving: boolean
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || heightCm <= 0) return null
  const m = heightCm / 100
  return Number((weightKg / (m * m)).toFixed(1))
}

function bmiCategoryKey(v: number): 'bmiUnderweight' | 'bmiNormal' | 'bmiOverweight' | 'bmiObese' {
  if (v < 18.5) return 'bmiUnderweight'
  if (v < 25) return 'bmiNormal'
  if (v < 30) return 'bmiOverweight'
  return 'bmiObese'
}

function bmiColor(v: number): string {
  if (v < 18.5 || (v >= 25 && v < 30)) return 'text-amber-400'
  if (v >= 30) return 'text-red-500'
  return 'text-emerald-500'
}

export function StepGoals({
  values, onChange, currentWeightKg, currentHeightCm, saving,
  onBack, onContinue, onSkip,
}: Props) {
  const { t } = useTranslation()
  const set = <K extends keyof GoalsValues>(key: K, v: GoalsValues[K]) =>
    onChange({ ...values, [key]: v })

  const goalWeightNum = values.goal_weight ? parseFloat(values.goal_weight) : null
  const currentBmi = useMemo(() => bmi(currentWeightKg, currentHeightCm), [currentWeightKg, currentHeightCm])
  const goalBmi = useMemo(() => bmi(goalWeightNum, currentHeightCm), [goalWeightNum, currentHeightCm])

  const ACTIVITY: { value: ActivityLevel; label: string; desc: string }[] = [
    { value: 'sedentary', label: t('onboarding.activitySedentary'), desc: t('onboarding.activitySedentaryDesc') },
    { value: 'light', label: t('onboarding.activityLight'), desc: t('onboarding.activityLightDesc') },
    { value: 'active', label: t('onboarding.activityActive'), desc: t('onboarding.activityActiveDesc') },
    { value: 'very_active', label: t('onboarding.activityVeryActive'), desc: t('onboarding.activityVeryActiveDesc') },
  ]

  const PACE: { value: Pace; label: string; desc: string }[] = [
    { value: 'gradual', label: t('onboarding.paceGradual'), desc: t('onboarding.paceGradualDesc') },
    { value: 'balanced', label: t('onboarding.paceBalanced'), desc: t('onboarding.paceBalancedDesc') },
    { value: 'aggressive', label: t('onboarding.paceAggressive'), desc: t('onboarding.paceAggressiveDesc') },
  ]

  return (
    <View>
      <View className="items-center mb-6">
        <Text className="font-bebas text-3xl mb-1">{t('onboarding.goalsTitle')}</Text>
        <Text className="text-sm text-muted-foreground text-center">{t('onboarding.goalsDesc')}</Text>
      </View>

      <Card className="mb-6">
        <CardContent className="p-5 gap-4">
          {/* Goal weight */}
          <View className="gap-1.5">
            <Label nativeID="ob-goal-weight">
              <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
                {t('onboarding.goalWeight')}
              </Text>
            </Label>
            <Input
              aria-labelledby="ob-goal-weight"
              keyboardType="decimal-pad"
              placeholder={t('onboarding.goalWeightPlaceholder')}
              value={values.goal_weight}
              onChangeText={(v) => set('goal_weight', v)}
            />
            {(currentWeightKg !== null || currentBmi !== null) ? (
              <View className="flex-row flex-wrap gap-2 mt-0.5">
                {currentWeightKg !== null ? (
                  <Text className="text-[11px] text-muted-foreground">
                    {t('onboarding.currentWeightRef', { weight: currentWeightKg })}
                  </Text>
                ) : null}
                {currentBmi !== null ? (
                  <Text className={cn('text-[11px]', bmiColor(currentBmi))}>
                    {t('onboarding.bmiCurrent', { bmi: currentBmi })} ({t(`onboarding.${bmiCategoryKey(currentBmi)}`)})
                  </Text>
                ) : null}
                {goalBmi !== null ? (
                  <Text className={cn('text-[11px]', bmiColor(goalBmi))}>
                    {t('onboarding.bmiGoal', { bmi: goalBmi })} ({t(`onboarding.${bmiCategoryKey(goalBmi)}`)})
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Activity level */}
          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.activityLevel')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {ACTIVITY.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => { haptics.selection(); set('activity_level', opt.value) }}
                  className={cn(
                    'flex-1 min-w-[45%] items-start gap-0.5 rounded-md border px-3 py-2',
                    values.activity_level === opt.value
                      ? 'border-lime bg-lime/10'
                      : 'border-border'
                  )}
                >
                  <Text className={cn(
                    'text-sm font-sans-medium',
                    values.activity_level === opt.value ? 'text-lime' : 'text-foreground'
                  )}>
                    {opt.label}
                  </Text>
                  <Text className="text-[10px] text-muted-foreground">{opt.desc}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Pace */}
          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.pace')}
            </Text>
            <View className="flex-row gap-2">
              {PACE.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => { haptics.selection(); set('pace', opt.value) }}
                  className={cn(
                    'flex-1 items-center gap-0.5 rounded-md border px-2 py-2',
                    values.pace === opt.value
                      ? 'border-lime bg-lime/10'
                      : 'border-border'
                  )}
                >
                  <Text className={cn(
                    'text-sm font-sans-medium',
                    values.pace === opt.value ? 'text-lime' : 'text-foreground'
                  )}>
                    {opt.label}
                  </Text>
                  <Text className="text-[10px] text-muted-foreground text-center">{opt.desc}</Text>
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

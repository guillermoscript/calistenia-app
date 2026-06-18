import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'

import {
  FOCUS_AREA_IDS, DAY_IDS,
  type DayId, type FocusAreaId, type Intensity, type TrainingValues,
} from '@calistenia/core/types/onboarding'

export { FOCUS_AREA_IDS, DAY_IDS }
export type { DayId, FocusAreaId, Intensity, TrainingValues }

interface Props {
  values: TrainingValues
  onChange: (next: TrainingValues) => void
  saving: boolean
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

export function StepTraining({ values, onChange, saving, onBack, onContinue, onSkip }: Props) {
  const { t } = useTranslation()
  const set = <K extends keyof TrainingValues>(key: K, v: TrainingValues[K]) =>
    onChange({ ...values, [key]: v })

  const toggleFocus = (id: FocusAreaId) => {
    const next = values.focus_areas.includes(id)
      ? values.focus_areas.filter((x) => x !== id)
      : [...values.focus_areas, id]
    set('focus_areas', next)
  }

  const toggleDay = (id: DayId) => {
    const next = values.training_days.includes(id)
      ? values.training_days.filter((x) => x !== id)
      : [...values.training_days, id]
    set('training_days', next)
  }

  const LEVELS = [
    { value: 'principiante', label: t('onboarding.beginner'), desc: t('onboarding.beginnerDesc') },
    { value: 'intermedio', label: t('onboarding.intermediate'), desc: t('onboarding.intermediateDesc') },
    { value: 'avanzado', label: t('onboarding.advanced'), desc: t('onboarding.advancedDesc') },
  ]

  const INTENSITY: { value: Intensity; label: string; desc: string }[] = [
    { value: 'light', label: t('onboarding.intensityLight'), desc: t('onboarding.intensityLightDesc') },
    { value: 'moderate', label: t('onboarding.intensityModerate'), desc: t('onboarding.intensityModerateDesc') },
    { value: 'intense', label: t('onboarding.intensityIntense'), desc: t('onboarding.intensityIntenseDesc') },
  ]

  return (
    <View>
      <View className="items-center mb-6">
        <Text className="font-bebas text-3xl mb-1">{t('onboarding.trainingTitle')}</Text>
        <Text className="text-sm text-muted-foreground text-center">{t('onboarding.trainingDesc')}</Text>
      </View>

      <Card className="mb-6">
        <CardContent className="p-5 gap-5">
          {/* Level */}
          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.level')}
            </Text>
            <View className="gap-2">
              {LEVELS.map((l) => (
                <Pressable
                  key={l.value}
                  onPress={() => { haptics.selection(); set('level', l.value) }}
                  className={cn(
                    'flex-row items-center gap-3 px-3.5 py-2.5 rounded-md border',
                    values.level === l.value
                      ? 'border-lime bg-lime/5'
                      : 'border-border'
                  )}
                >
                  <View className={cn(
                    'w-3 h-3 rounded-full border-2 shrink-0',
                    values.level === l.value ? 'border-lime bg-lime' : 'border-muted-foreground/40'
                  )} />
                  <View>
                    <Text className={cn(
                      'text-sm',
                      values.level === l.value ? 'text-lime' : 'text-foreground'
                    )}>
                      {l.label}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{l.desc}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Focus areas */}
          <View className="gap-2">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.focusAreas')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {FOCUS_AREA_IDS.map((id) => (
                <Chip
                  key={id}
                  label={t(`onboarding.focus.${id}`)}
                  active={values.focus_areas.includes(id)}
                  onPress={() => toggleFocus(id)}
                />
              ))}
            </View>
          </View>

          {/* Training days */}
          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.trainingDays')}
            </Text>
            <View className="flex-row gap-1.5">
              {DAY_IDS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => { haptics.selection(); toggleDay(d) }}
                  className={cn(
                    'flex-1 h-10 rounded-md border items-center justify-center',
                    values.training_days.includes(d)
                      ? 'border-lime bg-lime/10'
                      : 'border-border'
                  )}
                >
                  <Text className={cn(
                    'text-xs font-sans-medium',
                    values.training_days.includes(d) ? 'text-lime' : 'text-muted-foreground'
                  )}>
                    {t(`onboarding.days.${d}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Intensity */}
          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.intensity')}
            </Text>
            <View className="flex-row gap-2">
              {INTENSITY.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => { haptics.selection(); set('intensity', opt.value) }}
                  className={cn(
                    'flex-1 items-center gap-0.5 rounded-md border px-2 py-2',
                    values.intensity === opt.value
                      ? 'border-lime bg-lime/10'
                      : 'border-border'
                  )}
                >
                  <Text className={cn(
                    'text-sm font-sans-medium',
                    values.intensity === opt.value ? 'text-lime' : 'text-foreground'
                  )}>
                    {opt.label}
                  </Text>
                  <Text className="text-[10px] text-muted-foreground text-center">{opt.desc}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Goal (free text) */}
          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.goal')}
            </Text>
            <Textarea
              value={values.goal}
              onChangeText={(v) => set('goal', v)}
              placeholder={t('onboarding.goalPlaceholder')}
              numberOfLines={2}
            />
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

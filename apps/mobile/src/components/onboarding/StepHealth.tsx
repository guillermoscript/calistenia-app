import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { Text } from '@/components/ui/text'

import {
  CONDITION_IDS, INJURY_IDS,
  type ConditionId, type InjuryId, type HealthValues,
} from '@calistenia/core/types/onboarding'

export { CONDITION_IDS, INJURY_IDS }
export type { ConditionId, InjuryId, HealthValues }

interface Props {
  values: HealthValues
  onChange: (next: HealthValues) => void
  saving: boolean
  onBack: () => void
  onContinue: () => void
  onSkipAsNone: () => void
}

export function StepHealth({ values, onChange, saving, onBack, onContinue, onSkipAsNone }: Props) {
  const { t } = useTranslation()

  const toggleCondition = (id: ConditionId) => {
    const next = values.medical_conditions.includes(id)
      ? values.medical_conditions.filter((c) => c !== id)
      : [...values.medical_conditions, id]
    onChange({ ...values, medical_conditions: next })
  }

  const toggleInjury = (id: InjuryId) => {
    const next = values.injuries.includes(id)
      ? values.injuries.filter((i) => i !== id)
      : [...values.injuries, id]
    onChange({ ...values, injuries: next })
  }

  return (
    <View>
      <View className="items-center mb-6">
        <Text className="font-bebas text-3xl mb-1">{t('onboarding.healthTitle')}</Text>
        <Text className="text-sm text-muted-foreground text-center">{t('onboarding.healthDesc')}</Text>
      </View>

      {/* Prominent "No issues" shortcut */}
      <Button
        onPress={onSkipAsNone}
        disabled={saving}
        variant="outline"
        className="w-full h-12 mb-4 border-2 border-emerald-500/30 bg-emerald-500/5 active:bg-emerald-500/10"
      >
        <Text className="font-bebas text-base tracking-wide text-emerald-400">
          ✓ {t('onboarding.noIssuesLabel')}
        </Text>
      </Button>

      <Card className="mb-4">
        <CardContent className="p-5 gap-5">
          <View className="gap-2">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.medicalConditions')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CONDITION_IDS.map((id) => (
                <Chip
                  key={id}
                  label={t(`onboarding.conditions.${id}`)}
                  active={values.medical_conditions.includes(id)}
                  onPress={() => toggleCondition(id)}
                />
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.injuriesLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {INJURY_IDS.map((id) => (
                <Chip
                  key={id}
                  label={t(`onboarding.injuries.${id}`)}
                  active={values.injuries.includes(id)}
                  onPress={() => toggleInjury(id)}
                />
              ))}
            </View>
          </View>
        </CardContent>
      </Card>

      <Text className="text-[10px] text-muted-foreground leading-snug mb-4 px-2">
        {t('onboarding.healthDisclaimer')}
      </Text>

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
    </View>
  )
}

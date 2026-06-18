import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'

export interface BasicsValues {
  weight: string
  height: string
  age: string
  sex: string
}

interface Props {
  values: BasicsValues
  onChange: (next: BasicsValues) => void
  saving: boolean
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

export function StepBasics({ values, onChange, saving, onBack, onContinue, onSkip }: Props) {
  const { t } = useTranslation()
  const set = <K extends keyof BasicsValues>(key: K, v: BasicsValues[K]) =>
    onChange({ ...values, [key]: v })

  const SEX_OPTIONS = [
    { value: 'male', label: t('onboarding.male') },
    { value: 'female', label: t('onboarding.female') },
  ]

  return (
    <View>
      <View className="items-center mb-6">
        <Text className="font-bebas text-3xl mb-1">{t('onboarding.aboutYou')}</Text>
        <Text className="text-sm text-muted-foreground text-center">{t('onboarding.aboutYouDesc')}</Text>
      </View>

      <Card className="mb-6">
        <CardContent className="p-5 gap-4">
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <Label nativeID="ob-weight">
                <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  {t('onboarding.weight')}
                </Text>
              </Label>
              <Input
                aria-labelledby="ob-weight"
                keyboardType="decimal-pad"
                placeholder="75"
                value={values.weight}
                onChangeText={(v) => set('weight', v)}
              />
            </View>
            <View className="flex-1 gap-1.5">
              <Label nativeID="ob-height">
                <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  {t('onboarding.height')}
                </Text>
              </Label>
              <Input
                aria-labelledby="ob-height"
                keyboardType="decimal-pad"
                placeholder="175"
                value={values.height}
                onChangeText={(v) => set('height', v)}
              />
            </View>
            <View className="flex-1 gap-1.5">
              <Label nativeID="ob-age">
                <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  {t('onboarding.age')}
                </Text>
              </Label>
              <Input
                aria-labelledby="ob-age"
                keyboardType="number-pad"
                placeholder="28"
                value={values.age}
                onChangeText={(v) => set('age', v)}
              />
            </View>
          </View>

          <View className="gap-1.5">
            <Text className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('onboarding.sex')}
            </Text>
            <View className="flex-row gap-2">
              {SEX_OPTIONS.map((s) => (
                <Pressable
                  key={s.value}
                  onPress={() => { haptics.selection(); set('sex', s.value) }}
                  className={cn(
                    'flex-1 h-10 rounded-md border items-center justify-center',
                    values.sex === s.value
                      ? 'border-lime bg-lime/10'
                      : 'border-border'
                  )}
                >
                  <Text className={cn(
                    'text-sm',
                    values.sex === s.value ? 'text-lime' : 'text-muted-foreground'
                  )}>
                    {s.label}
                  </Text>
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

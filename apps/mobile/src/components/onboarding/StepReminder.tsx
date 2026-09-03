import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import {
  TRAINING_TIME_PRESETS,
  formatReminderTime,
  type TrainingTimePresetId,
} from '@calistenia/core/lib/onboarding-reminder'

export type { TrainingTimePresetId }

interface Props {
  preset: TrainingTimePresetId
  onChange: (preset: TrainingTimePresetId) => void
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
  saving: boolean
  permissionDenied: boolean
}

/**
 * Paso de onboarding «¿a qué hora sueles entrenar?» (#695). Deja programado un
 * `workout_reminders` por defecto: sin este paso el recordatorio solo se
 * descubría entrando a Ajustes, y casi nadie volvía a ver la app un segundo día.
 */
export function StepReminder({
  preset, onChange, onBack, onContinue, onSkip, saving, permissionDenied,
}: Props) {
  const { t } = useTranslation()

  return (
    <View>
      <View className="items-center mb-6">
        <Text className="font-bebas text-3xl mb-1">{t('onboarding.reminderTitle')}</Text>
        <Text className="text-sm text-muted-foreground text-center">{t('onboarding.reminderSubtitle')}</Text>
      </View>

      <Card className="mb-6">
        <CardContent className="p-5">
          <View className="flex-row flex-wrap gap-3">
            {TRAINING_TIME_PRESETS.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => { haptics.selection(); onChange(p.id) }}
                className={cn(
                  'w-[47%] grow items-center gap-1 rounded-md border px-3 py-4',
                  preset === p.id ? 'border-lime bg-lime/5' : 'border-border'
                )}
              >
                <Text className={cn(
                  'text-sm font-sans-medium',
                  preset === p.id ? 'text-lime' : 'text-foreground'
                )}>
                  {t(p.labelKey)}
                </Text>
                <Text className={cn(
                  'font-mono text-xs tracking-wide',
                  preset === p.id ? 'text-lime/80' : 'text-muted-foreground'
                )}>
                  {formatReminderTime(p.hour, p.minute)}
                </Text>
              </Pressable>
            ))}
          </View>
        </CardContent>
      </Card>

      {permissionDenied ? (
        <View className="mb-4 rounded-md border border-border bg-card px-3 py-2">
          <Text className="text-xs text-muted-foreground text-center">
            {t('onboarding.reminderPermissionDenied')}
          </Text>
        </View>
      ) : null}

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
            {saving ? t('onboarding.saving') : t('onboarding.reminderContinue')}
          </Text>
        </Button>
      </View>

      <Pressable onPress={onSkip} className="mt-4 active:opacity-60">
        <Text className="text-xs text-muted-foreground text-center">
          {t('onboarding.reminderSkip')}
        </Text>
      </Pressable>
    </View>
  )
}

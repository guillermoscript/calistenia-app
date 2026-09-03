import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import {
  TRAINING_TIME_PRESETS,
  formatReminderTime,
  type TrainingTimePresetId,
} from '@calistenia/core/lib/onboarding-reminder'
import { getNotificationSupport } from '../../lib/push-subscription'

interface Props {
  preset: TrainingTimePresetId
  onChange: (preset: TrainingTimePresetId) => void
  saving: boolean
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

export function StepReminder({ preset, onChange, saving, onBack, onContinue, onSkip }: Props) {
  const { t } = useTranslation()
  const support = getNotificationSupport()
  const showPermissionNotice = support.permission === 'denied' || !support.notifications

  return (
    <div className="animate-[fadeUp_0.5s_ease]">
      <div className="text-center mb-6">
        <div className="font-bebas text-3xl mb-1">{t('onboarding.reminderTitle')}</div>
        <div className="text-sm text-muted-foreground">{t('onboarding.reminderSubtitle')}</div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 gap-2">
            {TRAINING_TIME_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.id)}
                aria-pressed={preset === p.id}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md border px-3 py-3 text-center transition-colors',
                  preset === p.id
                    ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                )}
              >
                <span className="text-sm font-medium">{t(p.labelKey)}</span>
                <span className="text-[10px] text-muted-foreground">{formatReminderTime(p.hour, p.minute)}</span>
              </button>
            ))}
          </div>

          {showPermissionNotice && (
            <p className="mt-4 text-[11px] text-muted-foreground text-center">
              {t('onboarding.reminderPermissionDenied')}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1 h-11 font-mono text-xs tracking-wide">
          {t('onboarding.back')}
        </Button>
        <Button
          variant="limeSolid"
          onClick={onContinue}
          disabled={saving}
          className="flex-1 h-11 font-bebas text-lg tracking-wide"
        >
          {saving ? t('onboarding.saving') : t('onboarding.reminderContinue')}
        </Button>
      </div>

      <button
        onClick={onSkip}
        className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
      >
        {t('onboarding.reminderSkip')}
      </button>
    </div>
  )
}

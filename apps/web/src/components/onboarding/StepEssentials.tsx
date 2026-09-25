import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'
import type { PrimaryGoal } from '@calistenia/core/types/onboarding'

/**
 * Paso «lo esencial» (#820): fusiona los antiguos StepGoals + StepTraining en
 * una sola pregunta de objetivo + nivel. El resto de campos finos que pedían
 * esos dos pasos (peso objetivo, cintura, actividad, ritmo, áreas de foco,
 * días de entreno, intensidad, objetivo libre) se movieron a «completa tu
 * perfil» (ProfilePage), accesible después del primer entreno — nunca se
 * pierden, solo dejan de bloquear el camino crítico.
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
    <div className="animate-[fadeUp_0.5s_ease]">
      <div className="text-center mb-6">
        <div className="font-bebas text-3xl mb-1">{t('onboarding.essentialsTitle')}</div>
        <div className="text-sm text-muted-foreground">{t('onboarding.essentialsDesc')}</div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5 flex flex-col gap-5">
          {/* Primary goal */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.primaryGoal')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRIMARY_GOALS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onPrimaryGoalChange(opt.value)}
                  aria-pressed={primaryGoal === opt.value}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors',
                    primaryGoal === opt.value
                      ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Level */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.level')}</Label>
            <div className="flex flex-col gap-2">
              {LEVELS.map(l => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => onLevelChange(l.value)}
                  aria-pressed={level === l.value}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-md border text-left transition-colors',
                    level === l.value
                      ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/5'
                      : 'border-border hover:border-foreground/30'
                  )}
                >
                  <div className={cn(
                    'w-3 h-3 rounded-full border-2 shrink-0',
                    level === l.value ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]' : 'border-muted-foreground/40'
                  )} />
                  <div>
                    <p className={cn('text-sm', level === l.value ? 'text-[hsl(var(--lime))]' : 'text-foreground')}>{l.label}</p>
                    <p className="text-xs text-muted-foreground">{l.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 h-11 font-mono text-xs tracking-wide"
        >
          {t('onboarding.back')}
        </Button>
        <Button
          variant="limeSolid"
          onClick={onContinue}
          disabled={saving}
          className="flex-1 h-11 font-bebas text-lg tracking-wide"
        >
          {saving ? t('onboarding.saving') : t('onboarding.continueBtn')}
        </Button>
      </div>

      <button
        onClick={onSkip}
        className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
      >
        {t('onboarding.skipForNow')}
      </button>
    </div>
  )
}

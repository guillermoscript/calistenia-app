import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import type { ProgramMeta } from '@calistenia/core/types'
import type { Pace } from '@calistenia/core/types/onboarding'

const PACE_KG_PER_WEEK: Record<Pace, number> = {
  gradual: 0.25,
  balanced: 0.5,
  aggressive: 1.0,
}

interface Props {
  currentWeightKg: number | null
  goalWeightKg: number | null
  pace: Pace | ''
  program: ProgramMeta | null
  onFinish: () => void
  /** Cierra el onboarding y lleva a registrar la primera medición corporal (#227). */
  onFirstMeasurement?: () => void
  /** Cierra el onboarding directo al primer entreno del día 0 (#694). */
  onStartFirstWorkout?: () => void
  /** Minutos estimados del primer entreno, para la promesa del CTA (#694). */
  firstWorkoutMinutes?: number
}

export function StepPersonalizing({ currentWeightKg, goalWeightKg, pace, program, onFinish, onFirstMeasurement, onStartFirstWorkout, firstWorkoutMinutes }: Props) {
  const { t, i18n } = useTranslation()

  const projection = useMemo(() => {
    if (!currentWeightKg || !goalWeightKg || !pace) return null
    const kgPerWeek = PACE_KG_PER_WEEK[pace]
    const delta = Math.abs(goalWeightKg - currentWeightKg)
    if (delta < 0.1) return null
    const weeks = Math.max(1, Math.ceil(delta / kgPerWeek))
    const targetDate = dayjs().add(weeks * 7, 'day').locale(i18n.language.startsWith('en') ? 'en' : 'es')
    return { weeks, dateLabel: targetDate.format('D MMM YYYY') }
  }, [currentWeightKg, goalWeightKg, pace, i18n.language])

  return (
    <div className="animate-[fadeUp_0.5s_ease]">
      <div className="text-center mb-6">
        <div className="font-bebas text-3xl mb-1">{t('onboarding.yourPlanTitle')}</div>
        <div className="text-sm text-muted-foreground">{t('onboarding.yourPlanDesc')}</div>
      </div>

      <div className="flex flex-col gap-3 mb-6">
        {/* Weight transition */}
        {currentWeightKg !== null && (
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground tracking-[2px] uppercase">{t('onboarding.timelineWeight')}</span>
                <span className="font-bebas text-2xl text-foreground leading-none">{currentWeightKg} kg</span>
              </div>
              {goalWeightKg !== null && (
                <>
                  <span className="text-muted-foreground/60">→</span>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-muted-foreground tracking-[2px] uppercase">{t('onboarding.timelineGoal')}</span>
                    <span className="font-bebas text-2xl text-[hsl(var(--lime))] leading-none">{goalWeightKg} kg</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Projection */}
        {projection && pace && (
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-foreground font-medium">
                {t('onboarding.timelineProjection', { date: projection.dateLabel })}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {t('onboarding.timelineProjectionNote', {
                  pace: t(`onboarding.pace${pace.charAt(0).toUpperCase() + pace.slice(1)}`).toLowerCase(),
                  weeks: projection.weeks,
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Program preview */}
        {program && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn(
                'size-10 rounded-lg flex items-center justify-center shrink-0 text-lg font-bebas',
                'bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
              )}>
                {program.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground tracking-[2px] uppercase">{t('onboarding.timelineProgram')}</div>
                <div className="text-sm font-medium truncate">{program.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {t('onboarding.timelineWeeks', { weeks: program.duration_weeks })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Button
        variant="limeSolid"
        onClick={onStartFirstWorkout ?? onFinish}
        className="w-full h-12 font-bebas text-xl tracking-wide"
      >
        {onStartFirstWorkout
          ? t('onboarding.firstWorkoutCta', { minutes: firstWorkoutMinutes })
          : t('onboarding.startTraining')}
      </Button>

      {onStartFirstWorkout && (
        <div className="mt-2 text-center text-[11px] text-muted-foreground/70">
          {t('onboarding.firstWorkoutHint')}
        </div>
      )}

      {(onFirstMeasurement || onStartFirstWorkout) && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {onStartFirstWorkout && (
            <button
              onClick={onFinish}
              className="text-[11px] text-muted-foreground tracking-wide underline underline-offset-4 hover:text-lime"
            >
              {t('onboarding.goHomeInstead')}
            </button>
          )}
          {onFirstMeasurement && (
            <button
              onClick={onFirstMeasurement}
              className="text-[11px] text-muted-foreground tracking-wide underline underline-offset-4 hover:text-lime"
            >
              {t('onboarding.firstMeasurementCta')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

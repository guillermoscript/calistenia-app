import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import type { ProgramMeta } from '../../types'
import type { Pace } from './StepGoals'

const PHASE_DURATION_MS = 2400  // total loading splash duration
const MESSAGE_COUNT = 4

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
}

export function StepPersonalizing({ currentWeightKg, goalWeightKg, pace, program, onFinish }: Props) {
  const { t, i18n } = useTranslation()
  const [phase, setPhase] = useState<'loading' | 'preview'>('loading')
  const [msgIndex, setMsgIndex] = useState(0)

  useEffect(() => {
    const interval = PHASE_DURATION_MS / MESSAGE_COUNT
    const timers: number[] = []
    for (let i = 1; i < MESSAGE_COUNT; i++) {
      timers.push(window.setTimeout(() => setMsgIndex(i), i * interval))
    }
    timers.push(window.setTimeout(() => setPhase('preview'), PHASE_DURATION_MS))
    return () => timers.forEach(window.clearTimeout)
  }, [])

  const projection = useMemo(() => {
    if (!currentWeightKg || !goalWeightKg || !pace) return null
    const kgPerWeek = PACE_KG_PER_WEEK[pace]
    const delta = Math.abs(goalWeightKg - currentWeightKg)
    if (delta < 0.1) return null
    const weeks = Math.max(1, Math.ceil(delta / kgPerWeek))
    const targetDate = dayjs().add(weeks * 7, 'day').locale(i18n.language.startsWith('en') ? 'en' : 'es')
    return { weeks, dateLabel: targetDate.format('D MMM YYYY') }
  }, [currentWeightKg, goalWeightKg, pace, i18n.language])

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 animate-[fadeUp_0.5s_ease]">
        <div className="font-bebas text-4xl text-[hsl(var(--lime))] mb-8 leading-none">
          {t('onboarding.personalizingTitle')}
        </div>

        {/* Spinner */}
        <div className="relative mb-8">
          <div className="size-16 rounded-full border-4 border-muted-foreground/15 border-t-[hsl(var(--lime))] animate-spin" />
        </div>

        <div className="min-h-[2.5rem] flex items-center">
          <div key={msgIndex} className="text-sm text-muted-foreground animate-[fadeUp_0.35s_ease]">
            {t(`onboarding.personalizing.msg${msgIndex + 1}`)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6 w-48 h-1 rounded-full bg-muted-foreground/15 overflow-hidden">
          <div
            className="h-full bg-[hsl(var(--lime))]"
            style={{
              animation: `personalizingBar ${PHASE_DURATION_MS}ms linear forwards`,
            }}
          />
        </div>
        <style>{`
          @keyframes personalizingBar {
            from { width: 0% }
            to { width: 100% }
          }
        `}</style>
      </div>
    )
  }

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
        onClick={onFinish}
        className="w-full h-12 font-bebas text-xl tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background"
      >
        {t('onboarding.startTraining')}
      </Button>
    </div>
  )
}

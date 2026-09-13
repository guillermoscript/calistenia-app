import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DiscoverySourceId } from '@calistenia/core/lib/discovery-source'
import {
  DISCOVERY_SURVEY_DELAY_MS,
  DISCOVERY_SURVEY_RETRY_MS,
  DISCOVERY_SURVEY_SOURCES,
  USER_GOALS,
  canShowDiscoverySurvey,
  getRememberedDiscoverySource,
  markDiscoverySurvey,
  trackDiscoverySurveyCompleted,
  trackDiscoverySurveyDismissed,
  trackDiscoverySurveyViewed,
  type DiscoverySurveyStep,
  type UserGoalId,
} from '@calistenia/core/lib/discovery-survey'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

/** driver.js pone esta clase en `<body>` mientras un tour está abierto. */
const isTourRunning = () => document.body.classList.contains('driver-active')

/**
 * Encuesta de descubrimiento: opcional y una sola vez por usuario. Las reglas
 * de cuándo sale y qué se manda a analítica viven en `core/lib/discovery-survey`.
 */
export default function DiscoverySurvey({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [rememberedSource, setRememberedSource] = useState<DiscoverySourceId | null>(null)
  const [source, setSource] = useState<DiscoverySourceId | null>(null)
  const [sourceConfirmed, setSourceConfirmed] = useState(false)
  const [goal, setGoal] = useState<UserGoalId | null>(null)
  const viewedSteps = useRef(new Set<DiscoverySurveyStep>())

  const step: DiscoverySurveyStep = rememberedSource || sourceConfirmed ? 'goal' : 'source'

  useEffect(() => {
    if (!userId) return
    let timer: number | undefined
    const attempt = () => {
      if (!canShowDiscoverySurvey(userId) || isTourRunning()) {
        timer = window.setTimeout(attempt, DISCOVERY_SURVEY_RETRY_MS)
        return
      }
      setRememberedSource(getRememberedDiscoverySource(userId))
      setOpen(true)
    }
    timer = window.setTimeout(attempt, DISCOVERY_SURVEY_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [userId])

  useEffect(() => {
    if (!open || viewedSteps.current.has(step)) return
    viewedSteps.current.add(step)
    trackDiscoverySurveyViewed('survey_web', step)
  }, [open, step])

  const close = () => setOpen(false)

  const dismiss = () => {
    markDiscoverySurvey(userId, 'dismissed')
    trackDiscoverySurveyDismissed('survey_web', step, { discoverySource: sourceConfirmed ? source : null })
    close()
  }

  const submit = () => {
    if (!goal) return
    markDiscoverySurvey(userId, 'answered')
    trackDiscoverySurveyCompleted('survey_web', {
      discoverySource: sourceConfirmed ? source : null,
      rememberedSource,
      goal,
    })
    close()
  }

  const choose = (id: string) => {
    if (step === 'goal') {
      setGoal(id as UserGoalId)
      return
    }
    setSource(id as DiscoverySourceId)
    setSourceConfirmed(true)
  }

  const options = step === 'goal' ? USER_GOALS : DISCOVERY_SURVEY_SOURCES
  const selected = step === 'goal' ? goal : source
  const question = step === 'goal' ? t('discoverySurvey.goalQuestion') : t('onboarding.discoveryTitle')

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss() }}>
      <DialogContent hideClose className="max-w-md" data-testid="discovery-survey">
        <DialogHeader>
          <DialogTitle>{t('discoverySurvey.title')}</DialogTitle>
          <DialogDescription>{t('discoverySurvey.subtitle')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="font-medium">{question}</p>
          <div className="grid gap-2" role="group" aria-label={question}>
            {options.map((option) => (
              <Button
                key={option.id}
                variant={selected === option.id ? 'limeSolid' : 'outline'}
                aria-pressed={selected === option.id}
                className="justify-start whitespace-normal text-left"
                onClick={() => choose(option.id)}
              >
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={dismiss}>{t('discoverySurvey.notNow')}</Button>
          {step === 'goal' ? (
            <Button variant="limeSolid" disabled={!goal} onClick={submit}>{t('discoverySurvey.submit')}</Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

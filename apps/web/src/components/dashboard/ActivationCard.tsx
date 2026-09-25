/**
 * ActivationCard — objetivo «3 entrenos en tus primeros 7 días» (#800).
 *
 * Tres estados (los decide `activationCardMode` en core): `start` (0/3, con
 * CTA al entreno), `progress` (1/3, 2/3 y los días que quedan) y `completed`
 * (solo el día en que se alcanza). Fuera de la ventana no se pinta. Es el
 * hueco que en web no tenía equivalente a `GettingStartedCard`; el inicio
 * simplificado (#808) la reutiliza.
 */
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { ACTIVATION_TARGET_SESSIONS } from '@calistenia/core/lib/activation'
import { useActivation, useTrackActivationReached } from '@calistenia/core/hooks/useActivation'

interface ActivationCardProps {
  userId: string | null
  /** `users.created` del usuario autenticado. */
  created: string | null | undefined
  doneDates: readonly string[]
  onStart: () => void
}

export default function ActivationCard({ userId, created, doneDates, onStart }: ActivationCardProps) {
  const { t } = useTranslation()
  const activation = useActivation(created, doneDates)
  useTrackActivationReached(userId, activation)

  const { mode, daysRemaining } = activation
  if (mode === 'hidden') return null

  const done = Math.min(activation.sessionsInFirst7Days, ACTIVATION_TARGET_SESSIONS)
  const completed = mode === 'completed'

  return (
    <section
      className={cn(
        'mb-6 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center md:p-5',
        completed ? 'border-lime/40 bg-lime/5' : 'border-border bg-card',
      )}
      aria-labelledby="activation-card-title"
    >
      <div className="flex-1 min-w-0">
        <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {t('activation.kicker')}
        </div>
        <div className="flex items-baseline gap-3">
          <h2 id="activation-card-title" className={cn('font-bebas text-2xl leading-none', completed && 'text-lime')}>
            {completed ? t('activation.completedTitle') : t('activation.title')}
          </h2>
          <span className="font-bebas text-2xl leading-none" aria-hidden="true">
            {done}<span className="text-muted-foreground">/{ACTIVATION_TARGET_SESSIONS}</span>
          </span>
        </div>
        <div
          className="mt-3 flex gap-1.5"
          role="img"
          aria-label={t('activation.a11yProgress', { done, total: ACTIVATION_TARGET_SESSIONS })}
        >
          {Array.from({ length: ACTIVATION_TARGET_SESSIONS }, (_, i) => (
            <div
              key={i}
              className={cn('h-1.5 flex-1 rounded-full', i < done ? 'bg-lime' : 'bg-muted')}
            />
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {completed
            ? t('activation.completedDesc')
            : mode === 'start'
              ? t('activation.startDesc')
              : t('activation.progressDesc', { count: daysRemaining })}
        </p>
      </div>
      {mode === 'start' && (
        <Button
          onClick={onStart}
          className="w-full shrink-0 bg-lime font-bebas text-lg tracking-wide text-lime-foreground hover:bg-lime/90 sm:w-auto"
        >
          {t('activation.cta')}
        </Button>
      )}
    </section>
  )
}

/**
 * Panel de acciones post-entreno (#347).
 *
 * Vive dentro de la pantalla de celebración, debajo del resultado, y concentra
 * el bucle de crecimiento: compartir (primaria), invitar, retos, progreso y
 * repetir. Sustituye a los CTAs sueltos que había antes en `CelebrateScreen`,
 * incluido el `ReferralPrompt` condicional.
 *
 * Toda la celebración es un `onClick` que lleva al dashboard, así que **cada
 * control de aquí tiene que parar la propagación**: sin eso, la primera
 * pulsación en cualquier acción te saca de la pantalla.
 */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildPostWorkoutActions, trackPostWorkoutAction, type PostWorkoutActionId } from '@calistenia/core/lib/post-workout-actions'
import { usePostWorkoutChallenge } from '@calistenia/core/hooks/usePostWorkoutChallenge'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import type { Exercise } from '@calistenia/core/types'
import WorkoutShareCard from './WorkoutShareCard'
import { shareReferralInvite } from '../lib/share'
import { cn } from '../lib/utils'
import { useSessionIdentity } from '../hooks/useSessionIdentity'

interface Quote { q: string; a: string }

export interface PostWorkoutActionsProps {
  workoutKey: string
  workoutTitle: string
  totalSets: number
  durationMin: number
  exercises: Exercise[]
  quote?: Quote | null
  /** Reinicia la misma rutina; si no se pasa, la acción no aparece. */
  onRepeat?: () => void
  /** Cierra la sesión activa y navega. El panel nunca navega por su cuenta. */
  onNavigateAway: (path: string) => void
}

export default function PostWorkoutActions({
  workoutKey,
  workoutTitle,
  totalSets,
  durationMin,
  exercises,
  quote,
  onRepeat,
  onNavigateAway,
}: PostWorkoutActionsProps) {
  const { t } = useTranslation()
  // La identidad se lee aquí en lugar de bajarla dos niveles desde la página:
  // el AuthProvider ya está montado por encima (#475).
  const { userName, avatarUrl, userId, referralCode } = useSessionIdentity()
  // Solo para esta finalización: no se persiste, así que la próxima sesión
  // completada vuelve a mostrar el panel.
  const [dismissed, setDismissed] = useState(false)

  const { challenge } = usePostWorkoutChallenge(userId ?? null, exercises.map(e => e.id))

  const actions = buildPostWorkoutActions({
    canInvite: !!referralCode,
    canRepeat: !!onRepeat,
    affectedChallengeId: challenge?.id ?? null,
  })

  const track = useCallback((action: PostWorkoutActionId) => {
    trackPostWorkoutAction(action, { workoutKey, challengeId: action === 'challenge' ? challenge?.id : null })
  }, [workoutKey, challenge?.id])

  const handleInvite = useCallback(async () => {
    if (!referralCode) return
    track('invite')
    const ok = await shareReferralInvite(userName || '', referralCode)
    if (ok) {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.inviteSent, {
        surface: 'post_workout', source: 'workout_completion', share_type: 'invite_link', result: 'sent',
      })
    }
  }, [referralCode, userName, track])

  const handleChallenge = useCallback(() => {
    track('challenge')
    if (challenge) {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeViewed, {
        surface: 'post_workout',
        source: 'workout_completion',
        challenge_id: challenge.id,
        participant_count: challenge.participantCount,
        result: 'viewed',
      })
    }
    onNavigateAway(challenge ? `/challenges/${challenge.id}` : '/challenges')
  }, [challenge, onNavigateAway, track])

  const handleProgress = useCallback(() => {
    track('progress')
    onNavigateAway('/progress')
  }, [onNavigateAway, track])

  const handleRepeat = useCallback(() => {
    track('repeat')
    onRepeat?.()
  }, [onRepeat, track])

  if (dismissed) return null

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      className="w-full max-w-[380px] text-left"
      style={{ animation: 'fadeUp 0.5s 0.6s ease-out both' }}
    >
      <div className="h-px mb-4 bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">
          {t('postWorkout.kicker')}
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label={t('postWorkout.dismiss')}
          title={t('postWorkout.dismiss')}
          className="size-7 flex items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {actions.map(action => {
          if (action.id === 'share') {
            return (
              <WorkoutShareCard
                key="share"
                workoutTitle={workoutTitle}
                totalSets={totalSets}
                durationMin={durationMin}
                exercises={exercises}
                quote={quote}
                userName={userName}
                avatarUrl={avatarUrl}
                referralCode={referralCode}
                label={t('postWorkout.share')}
                variant="limeSolid"
                className="w-full h-12 font-bebas text-xl tracking-[2px]"
                onPress={() => track('share')}
              />
            )
          }
          if (action.id === 'invite') {
            return <ActionRow key="invite" label={t('postWorkout.invite')} hint={t('postWorkout.inviteHint')} onClick={handleInvite} />
          }
          if (action.id === 'challenge') {
            return (
              <ActionRow
                key="challenge"
                label={challenge ? t('postWorkout.challengeActive', { title: challenge.title }) : t('postWorkout.challenge')}
                hint={challenge ? t('postWorkout.challengeActiveHint') : t('postWorkout.challengeHint')}
                accent={!!challenge}
                onClick={handleChallenge}
              />
            )
          }
          if (action.id === 'progress') {
            return <ActionRow key="progress" label={t('postWorkout.progress')} hint={t('postWorkout.progressHint')} onClick={handleProgress} />
          }
          return <ActionRow key="repeat" label={t('postWorkout.repeat')} hint={t('postWorkout.repeatHint')} onClick={handleRepeat} />
        })}
      </div>
    </div>
  )
}

function ActionRow({ label, hint, onClick, accent }: { label: string; hint: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3.5 py-2.5 border rounded-md text-left transition-colors',
        accent
          ? 'border-lime/40 bg-lime/5 hover:bg-lime/10'
          : 'border-border hover:bg-muted/40',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className={cn('text-[13px] truncate', accent ? 'text-lime' : 'text-foreground')}>{label}</div>
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground truncate">{hint}</div>
      </div>
      <svg className="size-3.5 flex-shrink-0 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  )
}

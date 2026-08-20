import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { pb } from '@calistenia/core/lib/pocketbase'
import { Button } from '../components/ui/button'
import { Loader } from '../components/ui/loader'
import { ShareButton } from '../components/ShareButton'
import { shareContent, type ShareMethod } from '../lib/share'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { WEB_BASE_URL } from '@calistenia/core/lib/app-urls'
import { useInviteLanding } from '@calistenia/core/hooks/useInviteLanding'
import { REFERRAL_BONUS_POINTS, REFERRAL_SIGNUP_POINTS } from '@calistenia/core/hooks/useReferrals'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'

const REFERRAL_CODE_KEY = 'calistenia_referral_code'

export default function InviteLandingPage() {
  const { t } = useTranslation()
  const { code, challengeId } = useParams<{ code: string; challengeId?: string }>()
  const navigate = useNavigate()
  const l = useLocalize()
  const [joining, setJoining] = useState(false)

  const isLoggedIn = pb.authStore.isValid
  const currentUserId = isLoggedIn ? ((pb.authStore as any).record?.id ?? (pb.authStore as any).model?.id) : null

  // La carga la sirve core (#473). El hook no navega ni toca localStorage a
  // propósito: devuelve un veredicto en `status` y esta pantalla decide.
  const { inviter, program, challenge, status, loading, error } = useInviteLanding(
    code ?? null,
    challengeId ?? null,
    { isLoggedIn, currentUserId },
  )

  // Guardar el código y registrar la vista no dependen de la carga: se hacen en
  // cuanto se conoce el enlace, igual que antes.
  useEffect(() => {
    if (!code) return
    localStorage.setItem(REFERRAL_CODE_KEY, code)
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.inviteLandingViewed, {
      surface: 'invite_landing', source: 'referral_link', result: 'viewed', code, has_challenge: !!challengeId,
    })
  }, [code, challengeId])

  // Navegación derivada del veredicto del hook. `own-link` no navega: pinta la
  // pantalla de "tu propio enlace".
  useEffect(() => {
    if (error || status === 'invalid-code') {
      navigate('/auth', { replace: true })
      return
    }
    if (status === 'other-profile' && inviter) {
      navigate(`/u/${inviter.id}`, { replace: true })
    }
  }, [status, error, inviter, navigate])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader label={t('common.loading')} />
      </div>
    )
  }

  if (!inviter) return null

  const inviteUrl = challengeId
    ? `${WEB_BASE_URL}/invite/${code}/challenge/${challengeId}`
    : `${WEB_BASE_URL}/invite/${code}`

  const handleShare = (method: ShareMethod) =>
    shareContent({
      title: t('referrals.inviteShareTitle', { name: inviter.displayName }),
      text: t('referrals.inviteShareText', { name: inviter.displayName }),
      url: inviteUrl,
    }, method)

  // Own link: show share prompt
  if (status === 'own-link') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <img src="/logo.png" alt="" className="w-9 h-9 rounded-lg" />
            <span className="font-bebas text-3xl tracking-[0.15em] text-foreground">CALISTENIA</span>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <div className="text-xs tracking-widest uppercase text-muted-foreground mb-3">{t('referrals.linkLabel')}</div>
            <p className="text-sm text-muted-foreground mb-6">
              {t('referrals.shareLinkHelp', {
                referrerPoints: REFERRAL_SIGNUP_POINTS,
                referredPoints: REFERRAL_BONUS_POINTS,
              })}
            </p>

            <div className="bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-muted-foreground mb-6 truncate select-all">
              {inviteUrl}
            </div>

            {/* Sin `label`: ShareButton ya usa `t('share.share').toUpperCase()`. */}
            <ShareButton
              onShare={handleShare}
              size="default"
              variant="limeSolid"
              className="w-full border-0"
            />
          </div>

          <button
            onClick={() => navigate('/')}
            className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('common.backHome')}
          </button>
        </div>
      </div>
    )
  }

  const handleJoin = async () => {
    // Con sesión: inscribirse directamente (la rule de challenge_participants
    // permite crear tu propia participación) y saltar al detalle del reto.
    if (isLoggedIn && challengeId && currentUserId) {
      setJoining(true)
      try {
        await pb.collection('challenge_participants').create({
          challenge: challengeId,
          user: currentUserId,
        })
      } catch { /* ya inscrito (índice único challenge+user) */ }
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeJoined, {
        surface: 'invite_landing', source: 'invite', result: 'joined', challenge_id: challengeId,
      })
      navigate(`/challenges/${challengeId}`)
      return
    }
    const params = new URLSearchParams()
    params.set('ref', code!)
    if (challengeId) params.set('challenge', challengeId)
    navigate(`/auth?${params.toString()}`)
  }

  // La descripción del programa viene cruda: se localiza antes de comprobarla,
  // porque un `{"es":""}` sería truthy como objeto.
  const programDescription = program ? l(program.description) : ''

  const handleLogin = () => {
    const params = new URLSearchParams()
    params.set('mode', 'login')
    params.set('ref', code!)
    if (challengeId) params.set('challenge', challengeId)
    navigate(`/auth?${params.toString()}`)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <img src="/logo.png" alt="" className="w-9 h-9 rounded-lg" />
            <span className="font-bebas text-3xl tracking-[0.15em] text-foreground">CALISTENIA</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-6">
            {/* Inviter header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center text-xl font-bebas text-foreground shrink-0 overflow-hidden">
                {inviter.avatarUrl ? (
                  <img src={inviter.avatarUrl} alt={inviter.displayName} className="size-full object-cover" />
                ) : (
                  inviter.displayName[0]?.toUpperCase() || '?'
                )}
              </div>
              <div>
                <div className="font-bebas text-2xl text-foreground leading-none">{inviter.displayName}</div>
                <p className="text-sm text-muted-foreground mt-1">{t('referrals.invitesYouToTrain')}</p>
              </div>
            </div>

            {/* Social proof stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatChip label={t('referrals.statLevel')} value={inviter.level} />
              <StatChip label={t('referrals.statStreak')} value={inviter.currentStreak} unit="d" />
              <StatChip label={t('referrals.statSessions')} value={inviter.totalSessions} />
            </div>

            {/* Preview: challenge or program */}
            {challenge && (
              <div className="bg-muted border border-border rounded-lg p-4 mb-6">
                <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">{t('challenge.expressEyebrow')}</div>
                <div className="font-bebas text-lg text-foreground leading-tight mb-3">{challenge.title}</div>
                <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {challenge.exerciseName && (
                    <div className="flex items-center gap-2">
                      <ExerciseIcon className="size-3.5 text-lime shrink-0" />
                      <span>{challenge.exerciseName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <TargetIcon className="size-3.5 text-lime shrink-0" />
                    <span>{t('challenge.repsPerDay', { count: challenge.dailyTarget })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="size-3.5 text-lime shrink-0" />
                    <span>{challenge.durationDays} {t('challenge.unitDays')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UsersIcon className="size-3.5 text-lime shrink-0" />
                    <span>{t('challenge.participantCount', { count: challenge.participantCount })}</span>
                  </div>
                </div>
              </div>
            )}

            {!challenge && program && (
              <div className="bg-muted border border-border rounded-lg p-4 mb-6">
                <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">{t('referrals.currentProgram')}</div>
                <div className="font-bebas text-lg text-foreground leading-tight">{l(program.name)}</div>
                {program.durationWeeks > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">{program.durationWeeks} {t('programs.weeks')}</div>
                )}
                {programDescription && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{programDescription}</p>
                )}
              </div>
            )}

            {/* CTA */}
            {isLoggedIn && challengeId ? (
              <Button
                onClick={handleJoin}
                disabled={joining}
                variant="limeSolid"
                className="w-full h-12 font-semibold text-sm"
              >
                {joining ? t('referrals.joining') : t('referrals.joinChallenge')}
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleJoin}
                  variant="limeSolid"
                  className="w-full h-12 font-semibold text-sm"
                >
                  {t('referrals.join')}
                </Button>
                <p className="text-center mt-3 text-xs text-muted-foreground">
                  {t('referrals.bothEarnPoints', {
                    name: inviter.displayName,
                    referrerPoints: REFERRAL_SIGNUP_POINTS,
                    referredPoints: REFERRAL_BONUS_POINTS,
                  })}
                </p>
                <p className="text-center mt-3 text-sm text-muted-foreground">
                  {t('referrals.alreadyHaveAccount')}{' '}
                  <button
                    onClick={handleLogin}
                    className="text-lime hover:text-lime/80 transition-colors"
                  >
                    {t('referrals.logIn')}
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatChip({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div className="bg-muted border border-border rounded-lg p-3 text-center">
      <div className="font-bebas text-xl text-lime leading-none">
        {value}{unit && <span className="text-sm">{unit}</span>}
      </div>
      <div className="text-[10px] tracking-widest uppercase text-muted-foreground mt-1">{label}</div>
    </div>
  )
}

function ExerciseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 8h12M4 5v6M12 5v6M6 6v4M10 6v4" />
    </svg>
  )
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="0.5" fill="currentColor" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5 1.5v3M11 1.5v3" />
    </svg>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" />
      <circle cx="11.5" cy="5.5" r="2" />
      <path d="M14.5 14c0-2 -1.5-3.5-3-3.5" />
    </svg>
  )
}

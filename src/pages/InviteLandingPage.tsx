import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { Button } from '../components/ui/button'
import { Loader } from '../components/ui/loader'
import { ShareButton } from '../components/ShareButton'
import { shareContent, type ShareMethod } from '../lib/share'

const REFERRAL_CODE_KEY = 'calistenia_referral_code'
const BASE_URL = 'https://gym.guille.tech'

interface InviterData {
  id: string
  displayName: string
  avatarUrl: string | null
  level: number
  currentStreak: number
  totalSessions: number
}

interface ProgramPreview {
  name: string
  description: string
  durationWeeks: number
}

interface ChallengePreview {
  id: string
  title: string
  exerciseName: string
  dailyTarget: number
  durationDays: number
  participantCount: number
}

export default function InviteLandingPage() {
  const { code, challengeId } = useParams<{ code: string; challengeId?: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [inviter, setInviter] = useState<InviterData | null>(null)
  const [program, setProgram] = useState<ProgramPreview | null>(null)
  const [challenge, setChallenge] = useState<ChallengePreview | null>(null)
  const [isOwnLink, setIsOwnLink] = useState(false)

  const isLoggedIn = pb.authStore.isValid
  const currentUserId = isLoggedIn ? ((pb.authStore as any).record?.id ?? (pb.authStore as any).model?.id) : null

  useEffect(() => {
    if (!code) return
    // Save referral code to localStorage immediately
    localStorage.setItem(REFERRAL_CODE_KEY, code)

    const load = async () => {
      setLoading(true)
      try {
        // Look up inviter by referral_code
        const users = await pb.collection('users').getList(1, 1, {
          filter: pb.filter('referral_code = {:code}', { code }),
          $autoCancel: false,
        })

        if (users.items.length === 0) {
          // Invalid code → redirect to registration
          navigate('/auth', { replace: true })
          return
        }

        const user = users.items[0]

        // Check edge cases for logged-in users
        if (isLoggedIn && currentUserId) {
          if (user.id === currentUserId) {
            setIsOwnLink(true)
          } else if (!challengeId) {
            // Logged-in user opens another's link without challenge → redirect to profile
            navigate(`/u/${user.id}`, { replace: true })
            return
          }
        }

        // Get avatar
        const avatarUrl = getUserAvatarUrl(user as any, '200x200')

        // Get user stats
        let level = 1
        let currentStreak = 0
        let totalSessions = 0
        try {
          const stats = await pb.collection('user_stats').getFirstListItem(
            pb.filter('user = {:uid}', { uid: user.id }),
            { $autoCancel: false }
          )
          level = (stats as any).level || 1
          currentStreak = (stats as any).workout_streak_current || 0
          totalSessions = (stats as any).total_sessions || 0
        } catch { /* no stats */ }

        setInviter({
          id: user.id,
          displayName: user.display_name || user.email?.split('@')[0] || '',
          avatarUrl,
          level,
          currentStreak,
          totalSessions,
        })

        // Fetch program or challenge preview
        if (challengeId) {
          try {
            const ch = await pb.collection('challenges').getOne(challengeId, {
              $autoCancel: false,
            }) as any

            let exerciseName = ''
            if (ch.exercise_id) {
              try {
                const ex = await pb.collection('exercises_catalog').getOne(ch.exercise_id, {
                  $autoCancel: false,
                })
                const rawName = (ex as any).name
                exerciseName = (typeof rawName === 'object' && rawName !== null) ? (rawName.es ?? rawName.en ?? '') : (rawName || '')
              } catch { /* */ }
            }

            const participants = await pb.collection('challenge_participants').getList(1, 1, {
              filter: pb.filter('challenge = {:cid}', { cid: challengeId }),
              $autoCancel: false,
            })

            setChallenge({
              id: ch.id,
              title: ch.title || '',
              exerciseName,
              dailyTarget: ch.daily_target || 0,
              durationDays: ch.duration_days || 0,
              participantCount: participants.totalItems,
            })
          } catch { /* challenge not found */ }
        } else {
          // Fetch inviter's current program
          try {
            const up = await pb.collection('user_programs').getFirstListItem(
              pb.filter('user = {:uid} && is_current = true', { uid: user.id }),
              { expand: 'program', $autoCancel: false }
            )
            const prog = up.expand?.program as any
            if (prog) {
              setProgram({
                name: prog.name || '',
                description: prog.description || '',
                durationWeeks: prog.duration_weeks || 0,
              })
            }
          } catch { /* no program */ }
        }
      } catch (e) {
        console.error('InviteLandingPage: load error', e)
        navigate('/auth', { replace: true })
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [code, challengeId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader label="Cargando..." />
      </div>
    )
  }

  if (!inviter) return null

  const inviteUrl = challengeId
    ? `${BASE_URL}/invite/${code}/challenge/${challengeId}`
    : `${BASE_URL}/invite/${code}`

  const handleShare = (method: ShareMethod) =>
    shareContent({
      title: `${inviter.displayName} te invita a entrenar`,
      text: `💪 ${inviter.displayName} te invitó a entrenar juntos en Calistenia App`,
      url: inviteUrl,
    }, method)

  // Own link: show share prompt
  if (isOwnLink) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <img src="/logo.png" alt="" className="w-9 h-9 rounded-lg" />
            <span className="font-bebas text-3xl tracking-[0.15em] text-foreground">CALISTENIA</span>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <div className="text-xs tracking-widest uppercase text-muted-foreground mb-3">TU LINK DE INVITACION</div>
            <p className="text-sm text-muted-foreground mb-6">
              Comparte este link con tus amigos para ganar puntos
            </p>

            <div className="bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-muted-foreground mb-6 truncate select-all">
              {inviteUrl}
            </div>

            <ShareButton
              onShare={handleShare}
              label="COMPARTIR"
              size="default"
              className="w-full bg-lime text-lime-foreground hover:bg-lime/90 border-0"
            />
          </div>

          <button
            onClick={() => navigate('/')}
            className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    )
  }

  const handleJoin = () => {
    const params = new URLSearchParams()
    params.set('ref', code!)
    if (challengeId) params.set('challenge', challengeId)
    navigate(`/auth?${params.toString()}`)
  }

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
                <p className="text-sm text-muted-foreground mt-1">te invito a entrenar juntos</p>
              </div>
            </div>

            {/* Social proof stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatChip label="Nivel" value={inviter.level} />
              <StatChip label="Racha" value={inviter.currentStreak} unit="d" />
              <StatChip label="Sesiones" value={inviter.totalSessions} />
            </div>

            {/* Preview: challenge or program */}
            {challenge && (
              <div className="bg-muted border border-border rounded-lg p-4 mb-6">
                <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">CHALLENGE EXPRESS</div>
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
                    <span>{challenge.dailyTarget} reps / dia</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="size-3.5 text-lime shrink-0" />
                    <span>{challenge.durationDays} dias</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UsersIcon className="size-3.5 text-lime shrink-0" />
                    <span>{challenge.participantCount} participante{challenge.participantCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            )}

            {!challenge && program && (
              <div className="bg-muted border border-border rounded-lg p-4 mb-6">
                <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">PROGRAMA ACTUAL</div>
                <div className="font-bebas text-lg text-foreground leading-tight">{program.name}</div>
                {program.durationWeeks > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">{program.durationWeeks} semanas</div>
                )}
                {program.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{program.description}</p>
                )}
              </div>
            )}

            {/* CTA */}
            {isLoggedIn && challengeId ? (
              <Button
                onClick={handleJoin}
                className="w-full h-12 bg-lime text-lime-foreground hover:bg-lime/90 font-semibold text-sm"
              >
                Unirme al challenge
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleJoin}
                  className="w-full h-12 bg-lime text-lime-foreground hover:bg-lime/90 font-semibold text-sm"
                >
                  Unirme
                </Button>
                <p className="text-center mt-4 text-sm text-muted-foreground">
                  Ya tienes cuenta?{' '}
                  <button
                    onClick={handleLogin}
                    className="text-lime hover:text-lime/80 transition-colors"
                  >
                    Inicia sesion
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

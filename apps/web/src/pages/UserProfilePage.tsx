import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import { pb } from '@calistenia/core/lib/pocketbase'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Loader } from '../components/ui/loader'
import { EmptyState } from '../components/ui/empty-state'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { cn } from '../lib/utils'
import { todayStr } from '@calistenia/core/lib/dateUtils'
import { PHASE_COLORS } from '@calistenia/core/lib/style-tokens'
import { usePublicProfile } from '@calistenia/core/hooks/usePublicProfile'
import type { ProfilePRs } from '@calistenia/core/lib/public-profile'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import { useBlocks } from '@calistenia/core/hooks/useBlocks'
import { useReports } from '@calistenia/core/hooks/useReports'
import { ReportDialog } from '../components/social/ReportDialog'
import { useProfileCompare } from '@calistenia/core/hooks/useProfileCompare'
import { ShareButton } from '../components/ShareButton'
import { shareProfile, shareReferralInvite } from '../lib/share'
import { useReferrals } from '@calistenia/core/hooks/useReferrals'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import type { ShareMethod } from '../lib/share'

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

const PR_DEFS: {
  key: keyof ProfilePRs
  label: string
  unit: string
  goal: number
  accent: string
}[] = [
  { key: 'pr_pullups',   label: 'Pull-ups',        unit: 'reps', goal: 20, accent: 'text-sky-500' },
  { key: 'pr_pushups',   label: 'Push-ups',        unit: 'reps', goal: 50, accent: 'text-[hsl(var(--lime))]' },
  { key: 'pr_lsit',      label: 'L-sit',           unit: 's',    goal: 30, accent: 'text-amber-400' },
  { key: 'pr_pistol',    label: 'Pistol Squat',    unit: 'reps', goal: 1,  accent: 'text-pink-500' },
  { key: 'pr_handstand', label: 'Freestanding Handstand', unit: 's', goal: 60, accent: 'text-red-500' },
]

export default function UserProfilePage() {
  const { t, i18n } = useTranslation()
  const l = useLocalize()
  const { settings } = useWorkoutState()
  const { getLongestStreak, getTotalSessions } = useWorkoutActions()
  const { userId: currentUserId } = useAuthState()
  const currentUserPrs = settings as unknown as Record<string, number>
  const currentUserStreak = useMemo(() => getLongestStreak(), [getLongestStreak])
  const currentUserSessions = useMemo(() => getTotalSessions(), [getTotalSessions])
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  // El perfil público lo sirve core (#473): mismas cinco consultas, en una sola
  // ola y con caché. Devuelve los textos crudos, así que aquí se localizan al
  // pintar en vez de dentro del efecto.
  const { profile, loading } = usePublicProfile(userId ?? null)
  const [comparing, setComparing] = useState(false)
  const isOwnProfile = currentUserId === userId
  const { isFollowing, isRequested, follow, unfollow, followingCount, followersCount } = useFollows(currentUserId || null)
  const { isBlocked, block, unblock } = useBlocks(currentUserId || null)
  const blocked = userId ? isBlocked(userId) : false
  const [followLoading, setFollowLoading] = useState(false)
  const [blockLoading, setBlockLoading] = useState(false)
  // Denuncia de usuario (#220): abre el selector de motivo
  const { report } = useReports(currentUserId || null)
  const [reportOpen, setReportOpen] = useState(false)
  const { stats: referralStats, getReferralStats } = useReferrals(currentUserId || null)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  // Compare: fetch extended stats for both the viewed user and the current user
  const { stats: otherCompareStats, loading: otherCompareLoading, load: loadOtherCompare } = useProfileCompare()
  const { stats: myCompareStats, loading: myCompareLoading, load: loadMyCompare } = useProfileCompare()

  // Load extended compare stats when user toggles compare mode
  useEffect(() => {
    if (!comparing || !userId || !currentUserId) return
    loadOtherCompare(userId)
    loadMyCompare(currentUserId)
  }, [comparing, userId, currentUserId, loadOtherCompare, loadMyCompare])

  const compareLoading = otherCompareLoading || myCompareLoading

  // Load referral stats and code for own profile
  useEffect(() => {
    if (!isOwnProfile || !currentUserId) return
    getReferralStats()
    pb.collection('users').getOne(currentUserId, { fields: 'referral_code', $autoCancel: false })
      .then(u => setReferralCode(u.referral_code || null))
      .catch(() => {})
  }, [isOwnProfile, currentUserId, getReferralStats])

  const handleInvite = () => {
    if (referralCode) {
      shareReferralInvite(profile?.displayName || '', referralCode, 'native')
    } else {
      navigate('/referrals')
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Loader label={t('profile.loadingProfile')} />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-muted-foreground text-sm">
        {t('profile.notFound')}
      </div>
    )
  }

  const today = todayStr()
  const calDays = Object.entries(profile.monthActivity)

  // Cuenta privada sin follow aceptado (#422): las views `public_*` han
  // devuelto 0 filas en silencio, así que los números de abajo son ceros
  // falsos. Se pinta el candado en su lugar; la cabecera y el botón se quedan.
  const following = !!userId && isFollowing(userId)
  const requested = !!userId && isRequested(userId)
  const locked = profile.isPrivate && !isOwnProfile && !following
  const followLabel = followLoading
    ? '...'
    : following
      ? t('friends.followingBtn')
      : requested
        ? t('friends.requestedBtn')
        : profile.isPrivate
          ? t('friends.requestBtn')
          : t('friends.followBtn')

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-3">
          <div className="size-14 sm:size-16 rounded-full bg-accent flex items-center justify-center text-xl sm:text-2xl font-bebas text-foreground shrink-0 overflow-hidden">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.displayName} className="size-full object-cover" />
            ) : (
              profile.displayName[0]?.toUpperCase() || '?'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bebas text-3xl sm:text-4xl leading-none truncate">{profile.displayName}</h1>
            <div className="text-xs text-muted-foreground mt-1">
              {t('profile.memberSince')} {profile.memberSince} · {t('profile.phase', { phase: profile.phase })}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isOwnProfile && currentUserId && userId && (
            blocked ? (
              <Button
                variant="outline"
                size="sm"
                disabled={blockLoading}
                onClick={async () => {
                  setBlockLoading(true)
                  await unblock(userId)
                  setBlockLoading(false)
                }}
                className="text-[10px] tracking-widest h-9 border-red-500/60 text-red-500 hover:bg-red-500 hover:text-white active:scale-95 transition-all"
              >
                {blockLoading ? '...' : `${t('blocks.blockedState')} · ${t('blocks.unblockBtn')}`}
              </Button>
            ) : (
              <>
                <Button
                  variant={following ? 'limeSolid' : 'outline'}
                  size="sm"
                  disabled={followLoading}
                  title={requested ? t('friends.cancelRequest') : undefined}
                  onClick={async () => {
                    setFollowLoading(true)
                    // unfollow también retira una solicitud pendiente
                    if (following || requested) await unfollow(userId)
                    else await follow(userId)
                    setFollowLoading(false)
                  }}
                  className={cn(
                    'text-[10px] tracking-widest h-9 active:scale-95 transition-all',
                    following || requested
                      ? 'hover:bg-red-500 hover:text-white'
                      : 'hover:border-lime hover:text-lime'
                  )}
                >
                  {followLabel}
                </Button>
                <Button
                  variant={comparing ? 'limeSolid' : 'outline'}
                  size="sm"
                  onClick={() => setComparing(c => !c)}
                  className={cn(
                    'text-[10px] tracking-widest h-9',
                    comparing
                      ? ''
                      : 'hover:border-lime hover:text-lime'
                  )}
                >
                  {comparing ? t('friends.compare.hide') : t('friends.compare.show')}
                </Button>
                <button
                  type="button"
                  disabled={blockLoading}
                  onClick={async () => {
                    if (window.confirm(`${t('blocks.confirmTitle')}\n\n${t('blocks.confirmBody')}`)) {
                      setBlockLoading(true)
                      await block(userId)
                      setBlockLoading(false)
                    }
                  }}
                  className="text-[10px] tracking-widest uppercase text-muted-foreground hover:text-red-500 transition-colors self-center px-1 h-9"
                >
                  {t('blocks.blockBtn')}
                </button>
              </>
            )
          )}
          {!isOwnProfile && currentUserId && userId && (
            <>
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="text-[10px] tracking-widest uppercase text-muted-foreground hover:text-red-500 transition-colors self-center px-1 h-9"
              >
                {t('reports.commentAction')}
              </button>
              <ReportDialog
                open={reportOpen}
                onOpenChange={setReportOpen}
                onSubmit={reason => report({ targetType: 'user', targetUserId: userId, reason })}
              />
            </>
          )}
          {userId && (
            <ShareButton
              onShare={(method: ShareMethod) => shareProfile(profile.displayName, userId, method)}
              onInvite={isOwnProfile ? handleInvite : undefined}
              className="hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
            />
          )}
        </div>
      </div>

      {locked ? (
        <EmptyState
          icon={<LockIcon className="size-6" />}
          title={t('privacy.lockedTitle')}
          hint={requested ? t('privacy.lockedPending') : t('privacy.lockedBody', { name: profile.displayName })}
          className="py-16"
        />
      ) : (
      <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatBox label={t('profile.sessions')} value={profile.totalSessions} compareValue={comparing ? currentUserSessions : undefined} accent="text-[hsl(var(--lime))]" />
        <StatBox label={t('profile.currentStreak')} value={profile.currentStreak} compareValue={comparing ? currentUserStreak : undefined} accent="text-sky-500" unit={t('profile.days')} />
        <StatBox label={t('profile.bestStreak')} value={profile.bestStreak} accent="text-amber-400" unit={t('profile.days')} />
        <StatBox label={t('profile.level')} value={profile.level} accent="text-pink-500" />
      </div>

      {/* Extended compare metrics */}
      {comparing && !compareLoading && (
        <Card className="mb-8">
          <CardContent className="p-5 md:p-6">
            <div className="text-[10px] text-muted-foreground tracking-widest mb-4 uppercase">{t('friends.compare.extendedTitle')}</div>
            <div className="grid grid-cols-2 gap-4">
              <CompareRow
                label={t('friends.compare.sessionsWeek')}
                otherValue={otherCompareStats.sessionsThisWeek}
                myValue={myCompareStats.sessionsThisWeek}
              />
              <CompareRow
                label={t('friends.compare.sessionsMonth')}
                otherValue={otherCompareStats.sessionsThisMonth}
                myValue={myCompareStats.sessionsThisMonth}
              />
              <CompareRow
                label={t('friends.compare.phase')}
                otherValue={otherCompareStats.phase}
                myValue={myCompareStats.phase}
              />
              {otherCompareStats.sleepAvgQuality !== null && (
                <CompareRow
                  label={t('friends.compare.sleepQuality')}
                  otherValue={otherCompareStats.sleepAvgQuality}
                  myValue={myCompareStats.sleepAvgQuality ?? 0}
                  unit="/5"
                />
              )}
              {otherCompareStats.nutritionAdherence !== null && (
                <CompareRow
                  label={t('friends.compare.nutritionAdherence')}
                  otherValue={otherCompareStats.nutritionAdherence}
                  myValue={myCompareStats.nutritionAdherence ?? 0}
                  unit="%"
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {comparing && compareLoading && (
        <div className="mb-8 flex justify-center py-4">
          <Loader label={t('friends.compare.loading')} />
        </div>
      )}

      {/* Programa actual */}
      {profile.activeProgram ? (
        <Card className="mb-8">
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-widest mb-2 uppercase">{t('profile.currentProgram')}</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{l(profile.activeProgram.name)}</div>
                <div className="text-xs text-muted-foreground">{t('profile.phase', { phase: profile.phase })}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/u/${userId}/routine`)}
                className="text-[10px] tracking-widest hover:border-lime hover:text-lime"
              >
                {t('profile.viewRoutine')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="mb-8 text-xs text-muted-foreground text-center py-4">{t('profile.noActiveProgram')}</div>
      )}

      {/* PRs */}
      <Card className="mb-8">
        <CardContent className="p-5 md:p-6">
          <div className="text-[10px] text-muted-foreground tracking-widest mb-4 uppercase">Records personales</div>
          <div className="space-y-3">
            {PR_DEFS.map(pr => {
              const value = profile.prs[pr.key] || 0
              const compareVal = comparing && currentUserPrs ? currentUserPrs[pr.key] || 0 : undefined
              const pct = Math.min(100, (value / pr.goal) * 100)
              return (
                <div key={pr.key}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm">{pr.label}</span>
                    <div className="flex items-center gap-3">
                      <span className={cn('text-sm font-medium', pr.accent)}>
                        {value}{pr.unit}
                      </span>
                      {compareVal !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          vs <span className={compareVal > value ? 'text-red-400' : compareVal < value ? 'text-emerald-400' : ''}>{compareVal}{pr.unit}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Referral stats — own profile only */}
      {isOwnProfile && (
        <Card className="mb-8">
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-widest mb-3 uppercase">{t('profile.referralsAndPoints')}</div>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div>
                <div className="font-bebas text-2xl leading-none text-[hsl(var(--lime))]">{referralStats.totalReferred}</div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">{t('referrals.statReferred')}</div>
              </div>
              <div>
                <div className="font-bebas text-2xl leading-none text-amber-400">{referralStats.pointsBalance}</div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">{t('profile.points')}</div>
              </div>
              <div>
                <div className="font-bebas text-2xl leading-none text-sky-500">{referralStats.totalEarned}</div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">{t('profile.totalEarned')}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mb-3">{t('profile.pointsUnlockSoon')}</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/referrals')}
                className="text-[10px] tracking-widest hover:border-lime hover:text-lime"
              >
                {t('profile.viewMyReferrals')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleInvite}
                className="text-[10px] tracking-widest hover:border-lime hover:text-lime"
              >
                {t('profile.inviteFriend')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity calendar */}
      <div className="mb-8">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-4 uppercase">{t('profile.activityThisMonth')}</div>
        <div className="flex gap-1 flex-wrap">
          {calDays.map(([date, active]) => (
            <div
              key={date}
              title={date}
              className={cn(
                'size-6 rounded',
                active
                  ? 'bg-[hsl(var(--lime))]'
                  : date === today
                    ? 'bg-[hsl(var(--lime))]/15 border border-[hsl(var(--lime))]/40'
                    : 'bg-muted border border-transparent'
              )}
            />
          ))}
        </div>
      </div>

      {/* Recent sessions */}
      {profile.recentSessions.length > 0 && (
        <div className="mb-8">
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-4 uppercase">{t('profile.recentSessions')}</div>
          <div className="flex flex-col gap-2">
            {profile.recentSessions.map(session => {
              const phaseColor = PHASE_COLORS[session.phase]
              const dateObj = new Date(session.completedAt.replace(' ', 'T'))
              const formattedDate = dateObj.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })
              // El hook devuelve título y nota crudos: se localizan aquí, y la
              // nota se comprueba ya localizada (un `{"es":""}` sería truthy).
              const workoutTitle = l(session.workoutTitle)
              const note = l(session.note)
              return (
                <button
                  key={session.id}
                  onClick={() => navigate(`/s/${session.id}`)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-md bg-card border border-border hover:border-lime/30 transition-colors',
                    phaseColor?.border ? `border-l-[3px] ${phaseColor.border}` : 'border-l-[3px] border-l-[hsl(var(--lime))]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className={cn('text-sm font-medium truncate', phaseColor?.text)}>{workoutTitle}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {session.phase > 0 && (
                          <span className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase">Fase {session.phase}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{formattedDate}</span>
                      </div>
                    </div>
                    <svg className="size-4 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,3 11,8 6,13" /></svg>
                  </div>
                  {note && (
                    <div className="text-[11px] text-muted-foreground truncate mt-1.5 italic border-t border-border/50 pt-1.5">"{note}"</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}

function CompareRow({ label, otherValue, myValue, unit }: {
  label: string
  otherValue: number
  myValue: number
  unit?: string
}) {
  const { t } = useTranslation()
  const diff = otherValue - myValue
  const ahead = diff > 0
  const behind = diff < 0
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="font-bebas text-xl leading-none text-foreground">{otherValue}{unit}</span>
        <span className={cn('text-[10px]', ahead ? 'text-emerald-400' : behind ? 'text-red-400' : 'text-muted-foreground')}>
          {diff !== 0 && (ahead ? '+' : '')}{diff !== 0 ? diff : '='} {t('friends.compare.vsYou')}
        </span>
      </div>
    </div>
  )
}

function StatBox({ label, value, compareValue, accent, unit }: {
  label: string
  value: number
  compareValue?: number
  accent: string
  unit?: string
}) {
  const { t } = useTranslation()
  const ahead = compareValue !== undefined && value > compareValue
  const behind = compareValue !== undefined && value < compareValue
  return (
    <Card>
      <CardContent className="p-4">
        <div className={cn('font-bebas text-3xl leading-none mb-1', accent)}>
          {value}{unit && <span className="text-lg ml-0.5">{unit}</span>}
        </div>
        <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
        {compareValue !== undefined && (
          <div className={cn('text-[10px] mt-1', ahead ? 'text-emerald-400' : behind ? 'text-red-400' : 'text-muted-foreground')}>
            {ahead ? '+' : ''}{value - compareValue} {t('friends.compare.vsYou')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

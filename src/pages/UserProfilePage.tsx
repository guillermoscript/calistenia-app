import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Loader } from '../components/ui/loader'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { cn } from '../lib/utils'
import { todayStr, localMidnightAsUTC, utcToLocalDateStr } from '../lib/dateUtils'
import { useFollows } from '../hooks/useFollows'
import { ShareButton } from '../components/ShareButton'
import { shareProfile, shareReferralInvite } from '../lib/share'
import { useReferrals } from '../hooks/useReferrals'
import type { ShareMethod } from '../lib/share'

interface ProfileData {
  id: string
  displayName: string
  avatarUrl: string | null
  email: string
  memberSince: string
  // From user_stats
  totalSessions: number
  bestStreak: number
  currentStreak: number
  level: number
  xp: number
  // From settings
  phase: number
  prs: Record<string, number>
  // Activity
  monthActivity: Record<string, boolean>
  // Active program
  activeProgram: { name: string; id: string } | null
}

const PR_DEFS = [
  { key: 'pr_pullups',   label: 'Pull-ups',        unit: 'reps', goal: 20, accent: 'text-sky-500' },
  { key: 'pr_pushups',   label: 'Push-ups',        unit: 'reps', goal: 50, accent: 'text-[hsl(var(--lime))]' },
  { key: 'pr_lsit',      label: 'L-sit',           unit: 's',    goal: 30, accent: 'text-amber-400' },
  { key: 'pr_pistol',    label: 'Pistol Squat',    unit: 'reps', goal: 1,  accent: 'text-pink-500' },
  { key: 'pr_handstand', label: 'Freestanding Handstand', unit: 's', goal: 60, accent: 'text-red-500' },
]

export default function UserProfilePage() {
  const { t } = useTranslation()
  const { settings } = useWorkoutState()
  const { getLongestStreak, getTotalSessions } = useWorkoutActions()
  const { userId: currentUserId } = useAuthState()
  const currentUserPrs = settings as unknown as Record<string, number>
  const currentUserStreak = useMemo(() => getLongestStreak(), [getLongestStreak])
  const currentUserSessions = useMemo(() => getTotalSessions(), [getTotalSessions])
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)
  const isOwnProfile = currentUserId === userId
  const { isFollowing, follow, unfollow, followingCount, followersCount } = useFollows(currentUserId || null)
  const [followLoading, setFollowLoading] = useState(false)
  const { stats: referralStats, getReferralStats } = useReferrals(currentUserId || null)
  const [referralCode, setReferralCode] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      setLoading(true)
      try {
        // Fetch user
        const user = await pb.collection('users').getOne(userId)

        // Fetch user_stats
        let stats: any = {}
        try {
          stats = await pb.collection('user_stats').getFirstListItem(
            pb.filter('user = {:uid}', { uid: userId })
          )
        } catch { /* no stats yet */ }

        // Fetch settings
        let settings: any = {}
        try {
          const settingsRes = await pb.collection('settings').getList(1, 1, {
            filter: pb.filter('user = {:uid}', { uid: userId }),
            $autoCancel: false,
          })
          if (settingsRes.items.length > 0) settings = settingsRes.items[0]
        } catch { /* no settings yet */ }

        // Fetch recent sessions for activity calendar
        const today = todayStr()
        const yearMonth = today.slice(0, 7) // "YYYY-MM"
        const monthActivity: Record<string, boolean> = {}
        // Fill all days of the month
        const daysInMonth = new Date(parseInt(yearMonth.slice(0, 4)), parseInt(yearMonth.slice(5, 7)), 0).getDate()
        for (let d = 1; d <= daysInMonth; d++) {
          const date = `${yearMonth}-${String(d).padStart(2, '0')}`
          monthActivity[date] = false
        }

        try {
          const sessions = await pb.collection('sessions').getList(1, 100, {
            filter: pb.filter('user = {:uid} && created >= {:start}', {
              uid: userId,
              start: localMidnightAsUTC(`${yearMonth}-01`),
            }),
          })
          for (const s of sessions.items) {
            const date = utcToLocalDateStr(s.created)
            if (date && monthActivity.hasOwnProperty(date)) {
              monthActivity[date] = true
            }
          }
        } catch { /* no sessions collection or access */ }

        // Fetch active program
        let activeProgram: { name: string; id: string } | null = null
        try {
          const upRes = await pb.collection('user_programs').getFirstListItem(
            pb.filter('user = {:uid} && is_current = true', { uid: userId }),
            { expand: 'program', $autoCancel: false }
          )
          if (upRes.expand?.program) {
            activeProgram = { name: (upRes.expand.program as any).name, id: (upRes.expand.program as any).id }
          }
        } catch { /* no active program */ }

        setProfile({
          id: user.id,
          displayName: user.display_name || user.email?.split('@')[0] || '',
          avatarUrl: getUserAvatarUrl(user as any, '200x200'),
          email: user.email,
          memberSince: user.created ? utcToLocalDateStr(user.created) : '',
          totalSessions: stats.total_sessions || 0,
          bestStreak: stats.workout_streak_best || 0,
          currentStreak: stats.workout_streak_current || 0,
          level: stats.level || 1,
          xp: stats.xp || 0,
          phase: settings.phase || 1,
          prs: {
            pr_pullups: settings.pr_pullups || 0,
            pr_pushups: settings.pr_pushups || 0,
            pr_lsit: settings.pr_lsit || 0,
            pr_pistol: settings.pr_pistol || 0,
            pr_handstand: settings.pr_handstand || 0,
          },
          monthActivity,
          activeProgram,
        })
      } catch (e) {
        console.error('UserProfilePage: load error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  // Load referral stats and code for own profile
  useEffect(() => {
    if (!isOwnProfile || !currentUserId) return
    getReferralStats()
    pb.collection('users').getOne(currentUserId, { fields: 'referral_code', $autoCancel: false })
      .then((u: any) => setReferralCode(u.referral_code || null))
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
              Miembro desde {profile.memberSince} · Fase {profile.phase}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isOwnProfile && currentUserId && userId && (
            <>
              <Button
                variant={isFollowing(userId) ? 'default' : 'outline'}
                size="sm"
                disabled={followLoading}
                onClick={async () => {
                  setFollowLoading(true)
                  if (isFollowing(userId)) await unfollow(userId)
                  else await follow(userId)
                  setFollowLoading(false)
                }}
                className={cn(
                  'text-[10px] tracking-widest h-9 active:scale-95 transition-all',
                  isFollowing(userId)
                    ? 'bg-[hsl(var(--lime))] text-background hover:bg-red-500 hover:text-white'
                    : 'hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]'
                )}
              >
                {followLoading ? '...' : isFollowing(userId) ? 'SIGUIENDO' : 'SEGUIR'}
              </Button>
              <Button
                variant={comparing ? 'default' : 'outline'}
                size="sm"
                onClick={() => setComparing(c => !c)}
                className={cn(
                  'text-[10px] tracking-widest h-9',
                  comparing
                    ? 'bg-[hsl(var(--lime))] text-background'
                    : 'hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]'
                )}
              >
                {comparing ? 'OCULTAR' : 'COMPARAR'}
              </Button>
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatBox label="Sesiones" value={profile.totalSessions} compareValue={comparing ? currentUserSessions : undefined} accent="text-[hsl(var(--lime))]" />
        <StatBox label={t('profile.currentStreak')} value={profile.currentStreak} compareValue={comparing ? currentUserStreak : undefined} accent="text-sky-500" unit={t('profile.days')} />
        <StatBox label={t('profile.bestStreak')} value={profile.bestStreak} accent="text-amber-400" unit={t('profile.days')} />
        <StatBox label="Nivel" value={profile.level} accent="text-pink-500" />
      </div>

      {/* Programa actual */}
      {profile.activeProgram ? (
        <Card className="mb-8">
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-widest mb-2 uppercase">Programa actual</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{profile.activeProgram.name}</div>
                <div className="text-xs text-muted-foreground">Fase {profile.phase}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/u/${userId}/routine`)}
                className="text-[10px] tracking-widest hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
              >
                VER RUTINA
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
            <div className="text-[10px] text-muted-foreground tracking-widest mb-3 uppercase">Referidos y Puntos</div>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div>
                <div className="font-bebas text-2xl leading-none text-[hsl(var(--lime))]">{referralStats.totalReferred}</div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">Referidos</div>
              </div>
              <div>
                <div className="font-bebas text-2xl leading-none text-amber-400">{referralStats.pointsBalance}</div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">Puntos</div>
              </div>
              <div>
                <div className="font-bebas text-2xl leading-none text-sky-500">{referralStats.totalEarned}</div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">Total ganado</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mb-3">Tus puntos desbloquearan funciones de IA proximamente</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/referrals')}
                className="text-[10px] tracking-widest hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
              >
                VER MIS REFERIDOS
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleInvite}
                className="text-[10px] tracking-widest hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
              >
                INVITAR AMIGO
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity calendar */}
      <div className="mb-8">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-4 uppercase">Actividad este mes</div>
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
            {ahead ? '+' : ''}{value - compareValue} vs tu
          </div>
        )}
      </CardContent>
    </Card>
  )
}

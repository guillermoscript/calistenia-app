import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { pb } from '../lib/pocketbase'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { cn } from '../lib/utils'

interface ProfileData {
  id: string
  displayName: string
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
}

const PR_DEFS = [
  { key: 'pr_pullups',   label: 'Pull-ups',        unit: 'reps', goal: 20, accent: 'text-sky-500' },
  { key: 'pr_pushups',   label: 'Push-ups',        unit: 'reps', goal: 50, accent: 'text-[hsl(var(--lime))]' },
  { key: 'pr_lsit',      label: 'L-sit',           unit: 's',    goal: 30, accent: 'text-amber-400' },
  { key: 'pr_pistol',    label: 'Pistol Squat',    unit: 'reps', goal: 1,  accent: 'text-pink-500' },
  { key: 'pr_handstand', label: 'Handstand libre',  unit: 's',    goal: 60, accent: 'text-red-500' },
]

interface UserProfilePageProps {
  currentUserId?: string
  currentUserPrs?: Record<string, number>
  currentUserStreak?: number
  currentUserSessions?: number
}

export default function UserProfilePage({
  currentUserId,
  currentUserPrs,
  currentUserStreak,
  currentUserSessions,
}: UserProfilePageProps) {
  const { userId } = useParams<{ userId: string }>()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)
  const isOwnProfile = currentUserId === userId

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
        const now = new Date()
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const monthActivity: Record<string, boolean> = {}
        // Fill all days of the month
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
        for (let d = 1; d <= daysInMonth; d++) {
          const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          monthActivity[date] = false
        }

        try {
          const sessions = await pb.collection('sessions').getList(1, 100, {
            filter: pb.filter('user = {:uid} && created >= {:start}', {
              uid: userId,
              start: firstOfMonth.toISOString().replace('T', ' '),
            }),
          })
          for (const s of sessions.items) {
            const date = s.created?.split(' ')[0] || s.created?.split('T')[0]
            if (date && monthActivity.hasOwnProperty(date)) {
              monthActivity[date] = true
            }
          }
        } catch { /* no sessions collection or access */ }

        setProfile({
          id: user.id,
          displayName: user.display_name || user.email?.split('@')[0] || '',
          email: user.email,
          memberSince: user.created?.split(' ')[0] || user.created?.split('T')[0] || '',
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
        })
      } catch (e) {
        console.error('UserProfilePage: load error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-muted-foreground text-sm">
        Cargando perfil...
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-muted-foreground text-sm">
        No se encontro el perfil.
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]
  const calDays = Object.entries(profile.monthActivity)

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="size-16 rounded-full bg-accent flex items-center justify-center text-2xl font-bebas text-foreground shrink-0">
          {profile.displayName[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1">
          <h1 className="font-bebas text-4xl leading-none">{profile.displayName}</h1>
          <div className="text-xs text-muted-foreground mt-1">
            Miembro desde {profile.memberSince} · Fase {profile.phase}
          </div>
        </div>
        {!isOwnProfile && currentUserId && (
          <Button
            variant={comparing ? 'default' : 'outline'}
            onClick={() => setComparing(c => !c)}
            className={cn(
              'text-[10px] tracking-widest',
              comparing
                ? 'bg-[hsl(var(--lime))] text-background'
                : 'hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]'
            )}
          >
            {comparing ? 'OCULTAR' : 'COMPARAR'}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatBox label="Sesiones" value={profile.totalSessions} compareValue={comparing ? currentUserSessions : undefined} accent="text-[hsl(var(--lime))]" />
        <StatBox label="Racha actual" value={profile.currentStreak} compareValue={comparing ? currentUserStreak : undefined} accent="text-sky-500" unit="dias" />
        <StatBox label="Mejor racha" value={profile.bestStreak} accent="text-amber-400" unit="dias" />
        <StatBox label="Nivel" value={profile.level} accent="text-pink-500" />
      </div>

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

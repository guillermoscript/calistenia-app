/**
 * «Para ti» del inicio (#855): como mucho 2 filas en móvil y 3 en escritorio,
 * filas con línea fina (no tarjetas). QUÉ se enseña lo decide `getParaTi`
 * (#853); aquí solo se cargan los datos que necesita.
 *
 * Este componente SOLO se monta si `paraTiEnabled` (3.er entreno de la cuenta
 * y ninguna actividad en curso): así las consultas de retos, seguidos, amigos
 * y nutrición no se lanzan para quien aún no las va a ver. Web no tiene
 * batallas, así que `hasActiveBattle` va siempre a `false`.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Apple, Camera, ChevronRight, Trophy, Users, Compass } from 'lucide-react'
import { useChallenges } from '@calistenia/core/hooks/useChallenges'
import { useFeaturedChallenge } from '@calistenia/core/hooks/useFeaturedChallenge'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import { useCommunityPrograms } from '@calistenia/core/hooks/useCommunityPrograms'
import { useNutrition } from '@calistenia/core/hooks/useNutrition'
import { resolvePresetChallengeTitle } from '@calistenia/core/lib/challenge-presets'
import { getParaTi, PARA_TI_MAX, type ParaTiKind } from '@calistenia/core/lib/paraTi'
import { trackHomeParaTiTap } from '@calistenia/core/lib/home-analytics'
import { weekInPhase } from '@calistenia/core/lib/programProgress'
import { daysAgoStr, diffDays, todayStr } from '@calistenia/core/lib/dateUtils'
import type { HomeStateKind } from '@calistenia/core/lib/homeState'
import { useWorkoutState } from '../../contexts/WorkoutContext'
import { useFriendsTrainedToday } from '../../hooks/useFriendsTrainedToday'

const DESKTOP_QUERY = '(min-width: 1024px)'

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(DESKTOP_QUERY).matches)
  useEffect(() => {
    const mql = window.matchMedia?.(DESKTOP_QUERY)
    if (!mql) return
    const onChange = () => setDesktop(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return desktop
}

interface HomeParaTiProps {
  userId: string
  homeKind: HomeStateKind
  accountSessions: number
}

interface Row {
  kind: ParaTiKind
  icon: ReactNode
  title: string
  hint: string
  to: string
}

export default function HomeParaTi({ userId, homeKind, accountSessions }: HomeParaTiProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const { phases, programProgress } = useWorkoutState()
  const today = todayStr()

  const { active: joined } = useChallenges(userId)
  // El destacado solo aplica si no participas en ningún reto: sin eso, no se consulta.
  const { card: featured } = useFeaturedChallenge(joined.length === 0 ? userId : null)
  const { following } = useFollows(userId)
  const { programs: communityPrograms } = useCommunityPrograms(userId)
  const { ids: friendsToday } = useFriendsTrainedToday(userId, following.map(f => f.id))
  const { goals, getDailyTotals } = useNutrition(userId)

  const loggedFoodLast7Days = Array.from({ length: 7 }, (_, i) => daysAgoStr(i))
    .some(day => getDailyTotals(day).calories > 0)
  const firstWeekOfPhase = weekInPhase(phases, programProgress.currentPhase, programProgress.currentWeek) === 1

  const kinds = getParaTi({
    homeKind,
    accountSessions,
    hasActiveBattle: false,
    joinedChallenges: joined.length,
    friendsTrainedToday: friendsToday.length,
    loggedFoodLast7Days,
    firstWeekOfPhase,
    featuredChallengeAvailable: !!featured,
    followingCount: following.length,
    communityProgramAvailable: communityPrograms.length > 0,
  }, isDesktop ? PARA_TI_MAX.desktop : PARA_TI_MAX.mobile)

  const rows = kinds.map((kind): Row | null => {
    switch (kind) {
      case 'challenge_progress': {
        const c = joined[0]
        const left = Math.max(0, diffDays(c.ends_at.slice(0, 10), today))
        return {
          kind,
          icon: <Trophy className="size-4" />,
          title: t('home.paraTi.challenge', { name: resolvePresetChallengeTitle(c) }),
          hint: t('home.paraTi.challengeDaysLeft', { count: left }),
          to: `/challenges/${c.id}`,
        }
      }
      case 'friends_today': {
        const first = following.find(f => f.id === friendsToday[0])
        const name = first?.displayName || first?.username || ''
        const others = friendsToday.length - 1
        return {
          kind,
          icon: <Users className="size-4" />,
          title: others > 0 ? t('home.paraTi.friendsToday', { name, count: others }) : t('home.paraTi.friendToday', { name }),
          hint: t('home.paraTi.viewActivity'),
          to: '/community',
        }
      }
      case 'nutrition_today': {
        const eaten = Math.round(getDailyTotals().calories)
        return {
          kind,
          icon: <Apple className="size-4" />,
          title: goals?.dailyCalories
            ? t('home.paraTi.nutrition', { eaten: eaten.toLocaleString(), goal: goals.dailyCalories.toLocaleString() })
            : t('dashboard.nutrition'),
          hint: t('home.paraTi.nutritionHint'),
          to: '/nutrition',
        }
      }
      case 'phase_photos':
        return {
          kind,
          icon: <Camera className="size-4" />,
          title: t('home.paraTi.phasePhotos', { phase: programProgress.currentPhase }),
          hint: t('home.paraTi.phasePhotosHint'),
          to: '/progress?tab=cuerpo',
        }
      case 'featured_challenge':
        return featured ? {
          kind,
          icon: <Trophy className="size-4" />,
          title: t('home.paraTi.featuredChallenge', { name: resolvePresetChallengeTitle(featured.challenge) }),
          hint: t('home.paraTi.featuredChallengeHint'),
          to: `/challenges/${featured.challenge.id}`,
        } : null
      case 'community_program': {
        const p = communityPrograms.find(cp => cp.membership) ?? communityPrograms[0]
        return p ? {
          kind,
          icon: <Compass className="size-4" />,
          title: t('home.paraTi.communityProgram', { name: t(p.title_key) }),
          hint: t('home.paraTi.communityProgramHint'),
          to: `/community-programs/${p.id}`,
        } : null
      }
      default:
        return null
    }
  }).filter((r): r is Row => !!r)

  if (!rows.length) return null

  return (
    <section aria-labelledby="home-para-ti-title" className="flex flex-col gap-2" data-testid="home-para-ti">
      <h2 id="home-para-ti-title" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {t('home.paraTi.title')}
      </h2>
      <div className="border-t border-border">
        {rows.map(row => (
          <button
            key={row.kind}
            type="button"
            onClick={() => {
              trackHomeParaTiTap({ kind: row.kind })
              navigate(row.to)
            }}
            className="flex min-h-[52px] w-full items-center gap-3 border-b border-border py-1.5 text-left hover:bg-muted/40"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground" aria-hidden="true">
              {row.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{row.title}</span>
              <span className="truncate text-xs text-muted-foreground">{row.hint}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  )
}

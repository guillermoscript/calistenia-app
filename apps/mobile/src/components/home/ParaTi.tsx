/**
 * «Para ti» del inicio (#858): como mucho 2 filas, en el orden de `getParaTi`
 * (#853). La pantalla solo monta este componente cuando `paraTiEnabled` lo
 * permite (3.er entreno en adelante y nada en curso), así que sus consultas no
 * se lanzan antes: no hay que pagarlas para una cuenta que aún no las ve.
 *
 * Todo lo que enseña ya tiene su pantalla (Comunidad #860, Nutrición, fotos);
 * aquí solo va el atajo.
 */
import { useMemo } from 'react'
import { View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Camera, Flag, Swords, Trophy, Users, Utensils } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { useWorkoutState } from '@/contexts/WorkoutContext'
import { isBattleOngoing } from '@calistenia/core/lib/battle'
import { useActiveBattle } from '@/lib/use-active-battle'
import { useChallenges } from '@calistenia/core/hooks/useChallenges'
import { useFeaturedChallenge } from '@calistenia/core/hooks/useFeaturedChallenge'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import { useCommunityPrograms } from '@calistenia/core/hooks/useCommunityPrograms'
import { useFriendsTrainedToday } from '@calistenia/core/hooks/useFriendsTrainedToday'
import { useNutrition } from '@calistenia/core/hooks/useNutrition'
import { daysAgoStr, diffDays, utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { trackFeaturedChallengeOpened } from '@calistenia/core/lib/featured-challenge'
import { weekInPhase } from '@calistenia/core/lib/programProgress'
import { getParaTi, PARA_TI_MAX, type ParaTiKind } from '@calistenia/core/lib/paraTi'
import type { HomeStateKind } from '@calistenia/core/lib/homeState'
import { LinkRow } from './today-parts'

/** Un solo tono para la sección (guía de diseño): el azul de lo social. */
const SKY = '#38bdf8'

export default function ParaTi({ userId, homeKind, accountSessions, today, onTap }: {
  userId: string
  homeKind: HomeStateKind
  accountSessions: number
  today: string
  onTap: (kind: ParaTiKind, run: () => void) => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const { phases, programProgress } = useWorkoutState()
  const { data: battle } = useActiveBattle()
  const { active: challenges } = useChallenges(userId)
  const { card: featured } = useFeaturedChallenge(userId)
  const { following, followingCount } = useFollows(userId)
  const { programs: communityPrograms } = useCommunityPrograms(userId)
  const { entries: meals } = useNutrition(userId)
  // Misma consulta que web (core): no depende de que el feed esté cargado.
  const followedIds = useMemo(() => following.map(f => f.id), [following])
  const { ids: friendIdsToday } = useFriendsTrainedToday(userId, followedIds)
  const friendsToday = useMemo(() => {
    const byId = new Map(following.map(f => [f.id, f.displayName || f.username || '']))
    return friendIdsToday.map(id => byId.get(id) ?? '')
  }, [friendIdsToday, following])

  const since = daysAgoStr(6)
  const loggedFoodLast7Days = (meals ?? []).some(m => {
    const day = m.loggedAt ? utcToLocalDateStr(m.loggedAt) : ''
    return day >= since && day <= today
  })
  const week = programProgress.hasStarted && !programProgress.isCompleted ? programProgress.currentWeek : null
  const phase = programProgress.currentPhase || 1
  const communityProgram = communityPrograms.find(p => p.membership?.status === 'active') ?? communityPrograms[0]

  const kinds = getParaTi({
    homeKind,
    accountSessions,
    hasActiveBattle: isBattleOngoing(battle),
    joinedChallenges: challenges.length,
    friendsTrainedToday: friendsToday.length,
    loggedFoodLast7Days,
    firstWeekOfPhase: weekInPhase(phases, phase, week) === 1,
    featuredChallengeAvailable: !!featured,
    followingCount,
    communityProgramAvailable: !!communityProgram,
  }, PARA_TI_MAX.mobile)

  if (kinds.length === 0) return null

  const row = (kind: ParaTiKind) => {
    switch (kind) {
      case 'battle':
        return {
          icon: <Swords size={16} color={SKY} />,
          title: battle?.status === 'live' ? t('battle.barLive') : t('home.paraTi.battleYourTurn'),
          go: () => { if (battle) router.push(`/battle/${battle.id}`) },
        }
      case 'challenge_progress': {
        const c = challenges[0]
        const left = Math.max(0, diffDays(c.ends_at.slice(0, 10), today))
        return {
          icon: <Trophy size={16} color={SKY} />,
          title: t('home.paraTi.challenge', { name: c.title }),
          hint: t('home.paraTi.challengeDaysLeft', { count: left }),
          go: () => router.push(`/challenges/${c.id}`),
        }
      }
      case 'friends_today':
        return {
          icon: <Users size={16} color={SKY} />,
          title: friendsToday.length === 1
            ? t('home.paraTi.friendToday', { name: friendsToday[0] })
            : t('home.paraTi.friendsToday', { name: friendsToday[0], count: friendsToday.length - 1 }),
          hint: t('home.paraTi.viewActivity'),
          go: () => router.push('/community?section=activity' as Href),
        }
      case 'nutrition_today':
        return {
          icon: <Utensils size={16} color={SKY} />,
          title: t('nav.nutrition'),
          hint: t('home.paraTi.nutritionHint'),
          go: () => router.push('/nutrition' as Href),
        }
      case 'phase_photos':
        return {
          icon: <Camera size={16} color={SKY} />,
          title: t('home.paraTi.phasePhotos', { phase }),
          hint: t('home.paraTi.phasePhotosHint'),
          go: () => router.push('/progress-photos'),
        }
      case 'featured_challenge':
        return {
          icon: <Flag size={16} color={SKY} />,
          title: t('home.paraTi.featuredChallenge', { name: featured!.challenge.title }),
          hint: t('home.paraTi.featuredChallengeHint'),
          go: () => {
            trackFeaturedChallengeOpened(featured!)
            router.push(`/challenges/${featured!.challenge.id}`)
          },
        }
      case 'community_program':
        return {
          icon: <Users size={16} color={SKY} />,
          title: t('home.paraTi.communityProgram', { name: t(communityProgram!.title_key) }),
          hint: t('home.paraTi.communityProgramHint'),
          go: () => router.push(`/community-programs/${communityProgram!.id}`),
        }
    }
  }

  return (
    <View className="gap-2" accessibilityLabel={t('home.paraTi.title')}>
      <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">{t('home.paraTi.title')}</Text>
      <View className="border-t border-border">
        {kinds.map(kind => {
          const r = row(kind)
          return <LinkRow key={kind} icon={r.icon} title={r.title} hint={r.hint} onPress={() => onTap(kind, r.go)} />
        })}
      </View>
    </View>
  )
}

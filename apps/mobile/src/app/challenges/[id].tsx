/**
 * Detalle de un reto — clasificación + unirse. Puerto móvil de
 * ChallengeDetailPage (web), usando el mismo hook de core (`useChallengeDetail`).
 *
 * Ruta: /challenges/[id]. Coexiste con `challenges.tsx` (listado en /challenges)
 * igual que `cardio.tsx` + `cardio/[id].tsx` — no hace falta moverlo a
 * `challenges/index.tsx`.
 */
import { useEffect, useRef, useState } from 'react'
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useChallengeDetail } from '@calistenia/core/hooks/useChallengeDetail'
import { getMetricLabel, getMetricUnit, daysRemaining } from '@calistenia/core/lib/challenges'
import { pb } from '@calistenia/core/lib/pocketbase'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import type { LeaderboardEntry } from '@calistenia/core/hooks/useLeaderboard'

const LIME = 'hsl(74 90% 45%)'
const MEDALS = ['🥇', '🥈', '🥉']

export default function ChallengeDetailScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { challenge, leaderboard, loading, participantIds, load } = useChallengeDetail(id ?? null, userId)
  const [joining, setJoining] = useState(false)

  useEffect(() => { load() }, [load])

  // Vista del detalle: una vez por reto cargado, no en cada refetch del leaderboard.
  const viewedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!id || loading || !challenge) return
    if (viewedIdRef.current === id) return
    viewedIdRef.current = id
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeViewed, {
      surface: 'challenge_detail',
      source: 'challenge_route',
      challenge_id: id,
      result: 'viewed',
    })
  }, [id, loading, challenge])

  const isParticipant = !!userId && participantIds.has(userId)
  const isActive = challenge?.status === 'active'

  const handleJoin = async () => {
    if (!userId || !id) return
    setJoining(true)
    try {
      await pb.collection('challenge_participants').create({ challenge: id, user: userId })
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeJoined, {
        surface: 'challenge_detail',
        source: 'challenge_detail',
        challenge_id: id,
        participant_count: leaderboard.length + 1,
        result: 'joined',
      })
      load()
    } catch {
      // 400 = ya participaba (índice único); degradar en silencio, igual que challenges.tsx
    } finally {
      setJoining(false)
    }
  }

  if (loading && !challenge) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <Header router={router} title="" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={LIME} />
        </View>
      </SafeAreaView>
    )
  }

  if (!challenge) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <Header router={router} title="" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-2xl">😕</Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            {t('challenges.emptyBody')}
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  const metricLabel = getMetricLabel(challenge.metric, challenge.custom_metric, challenge.exercise_slug)
  const unit = getMetricUnit(challenge.metric, challenge.exercise_slug)

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <Header router={router} title="" />

      <ScrollView contentContainerClassName="px-4 pb-12 gap-4" showsVerticalScrollIndicator={false}>
        {/* Título + meta */}
        <View className="gap-2">
          <Text className="font-bebas text-3xl leading-none text-foreground">{challenge.title}</Text>

          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1.5">
            <Text className="font-mono text-[10px] tracking-wide text-lime">{metricLabel}</Text>
            {(challenge.goal ?? 0) > 0 && (
              <>
                <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
                <Text className="font-mono text-[10px] text-amber-400">
                  {t('challenges.goal', { value: challenge.goal })}
                </Text>
              </>
            )}
            <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
            <Text className={cn('font-mono text-[10px]', isActive ? 'text-amber-400' : 'text-muted-foreground')}>
              {daysRemaining(challenge.ends_at)}
            </Text>
            <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
            <Text className="font-mono text-[10px] text-muted-foreground">
              {t('challenges.participants', { count: leaderboard.length })}
            </Text>
          </View>

          {challenge.description ? (
            <Text className="text-sm leading-relaxed text-muted-foreground">{challenge.description}</Text>
          ) : null}
        </View>

        {/* Unirse — solo si el reto está activo y aún no participa */}
        {isActive && userId && !isParticipant && (
          <Pressable
            onPress={handleJoin}
            disabled={joining}
            className={cn('items-center rounded-lg bg-lime py-3 active:opacity-80', joining && 'opacity-50')}
            accessibilityRole="button"
          >
            <Text className="font-mono text-[11px] uppercase tracking-widest text-lime-foreground">
              {joining ? '...' : t('featuredChallenge.join')}
            </Text>
          </Pressable>
        )}

        {/* Clasificación */}
        <View className="gap-1.5">
          {leaderboard.length === 0 ? (
            <Text className="py-8 text-center text-sm text-muted-foreground">{t('common.noResults')}</Text>
          ) : (
            leaderboard.map((entry, i) => (
              <RankRow key={entry.userId} entry={entry} position={i + 1} unit={unit} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ router, title }: { router: ReturnType<typeof useRouter>; title: string }) {
  const { t } = useTranslation()
  return (
    <View className="flex-row items-center gap-2 px-2 py-1">
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        className="p-2"
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <ArrowLeft size={20} color="hsl(0 0% 55%)" />
      </Pressable>
      {title ? (
        <Text className="flex-1 font-bebas text-xl leading-none text-foreground" numberOfLines={1}>
          {title}
        </Text>
      ) : null}
    </View>
  )
}

function RankRow({ entry, position, unit }: { entry: LeaderboardEntry; position: number; unit: string }) {
  const router = useRouter()
  const medal = MEDALS[position - 1]

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/u/[id]', params: { id: entry.userId } })}
      className={cn(
        'flex-row items-center gap-3 rounded-xl border px-4 py-3 active:opacity-70',
        entry.isCurrentUser ? 'border-lime/40 bg-lime/10' : 'border-border bg-card',
      )}
      accessibilityRole="button"
    >
      <View className="w-7 items-center">
        {medal ? (
          <Text className="text-base">{medal}</Text>
        ) : (
          <Text className="font-mono text-xs text-muted-foreground">{position}</Text>
        )}
      </View>

      <View className="size-9 items-center justify-center overflow-hidden rounded-full bg-accent">
        {entry.avatarUrl ? (
          <Image
            source={{ uri: entry.avatarUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={entry.userId}
            accessibilityLabel={entry.displayName}
          />
        ) : (
          <Text className="font-mono text-xs text-foreground">{(entry.displayName[0] ?? '?').toUpperCase()}</Text>
        )}
      </View>

      <View className="flex-1 min-w-0">
        <Text
          className={cn('font-sans-medium text-sm', entry.isCurrentUser ? 'text-lime' : 'text-foreground')}
          numberOfLines={1}
        >
          {entry.displayName}
        </Text>
      </View>

      <View className="flex-row items-baseline gap-1">
        <Text className={cn('font-bebas text-2xl leading-none', entry.isCurrentUser ? 'text-lime' : 'text-foreground')}>
          {entry.value}
        </Text>
        {unit ? <Text className="font-mono text-[10px] text-muted-foreground">{unit}</Text> : null}
      </View>
    </Pressable>
  )
}

/** Retos — port móvil de ChallengesPage (useChallenges de core). */
import { useEffect, useState } from 'react'
import { View, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X, Target } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useChallenges, type ChallengeWithMeta } from '@calistenia/core/hooks/useChallenges'
import { daysRemaining, getMetricLabel } from '@calistenia/core/lib/challenges'
import { pb } from '@calistenia/core/lib/pocketbase'

// ── Types ─────────────────────────────────────────────────────────────────────

type TabFilter = 'active' | 'past'

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { active, past, loading, load } = useChallenges(userId)
  const [filter, setFilter] = useState<TabFilter>('active')
  const [joining, setJoining] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const items: ChallengeWithMeta[] = filter === 'active' ? active : past

  const handleJoin = async (challenge: ChallengeWithMeta) => {
    if (!userId) {
      Alert.alert('Inicia sesión para unirte a un reto')
      return
    }
    setJoining(challenge.id)
    try {
      await pb.collection('challenge_participants').create({
        challenge: challenge.id,
        user: userId,
      })
      await load()
    } catch (e: any) {
      // 400 / duplicate — user already joined
      if (e?.status !== 400) {
        Alert.alert('Error', 'No se pudo unir al reto. Intenta de nuevo.')
      }
    } finally {
      setJoining(null)
    }
  }

  const TABS: { id: TabFilter; label: string; count: number }[] = [
    { id: 'active', label: 'Activos', count: active.length },
    { id: 'past', label: 'Pasados', count: past.length },
  ]

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-start justify-between px-4 pt-2 pb-4">
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            Social
          </Text>
          <Text className="font-bebas text-4xl leading-none text-foreground">Retos</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-muted/60 p-2 active:opacity-70"
        >
          <X size={18} color="#888899" />
        </Pressable>
      </View>

      {/* Tab filter */}
      <View className="flex-row gap-1.5 px-4 pb-4">
        {TABS.map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => setFilter(tab.id)}
            className={cn(
              'rounded-md border px-3 py-2',
              filter === tab.id
                ? 'border-lime/60 bg-lime/10'
                : 'border-border',
            )}
          >
            <Text
              className={cn(
                'font-mono text-[11px] tracking-wide',
                filter === tab.id ? 'text-lime' : 'text-muted-foreground',
              )}
            >
              {tab.label}
              {tab.count > 0 ? (
                <Text className="font-mono text-[10px] opacity-70"> {tab.count}</Text>
              ) : null}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View className="flex-1 items-center justify-center gap-2 py-10">
          <ActivityIndicator color="#a3e635" />
          <Text className="font-mono text-xs text-muted-foreground">{t('common.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-10 gap-2"
          ListEmptyComponent={
            <EmptyState
              icon={Target}
              title={filter === 'active' ? t('challenges.emptyActive') : t('challenges.emptyPast')}
              body={t('challenges.emptyBody')}
            />
          }
          renderItem={({ item }) => (
            <ChallengeCard
              challenge={item}
              onJoin={() => void handleJoin(item)}
              isJoining={joining === item.id}
              userId={userId}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}

// ── Challenge Card ────────────────────────────────────────────────────────────

interface ChallengeCardProps {
  challenge: ChallengeWithMeta
  onJoin: () => void
  isJoining: boolean
  userId: string | null
}

function ChallengeCard({ challenge: ch, onJoin, isJoining, userId }: ChallengeCardProps) {
  const isActive = ch.status === 'active'
  const metricLabel = getMetricLabel(ch.metric, ch.custom_metric, ch.exercise_slug)
  const daysLeft = daysRemaining(ch.ends_at)

  return (
    <View className="rounded-xl border border-border bg-card px-4 py-3.5 gap-2">
      {/* Title row */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Text className="font-sans-medium text-foreground" numberOfLines={2}>
            {ch.title}
          </Text>
        </View>
        {/* Join button — only for active challenges when user is known */}
        {isActive && userId ? (
          <Pressable
            onPress={onJoin}
            disabled={isJoining}
            className={cn(
              'rounded-lg bg-lime/20 px-3 py-1.5 active:opacity-70',
              isJoining && 'opacity-50',
            )}
          >
            <Text className="font-mono text-[11px] tracking-wide text-lime">
              {isJoining ? '...' : 'Unirse'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Meta row */}
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        {/* Metric */}
        <Text className="font-mono text-[10px] tracking-wide text-lime">{metricLabel}</Text>

        {/* Goal */}
        {(ch.goal ?? 0) > 0 ? (
          <>
            <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
            <Text className="font-mono text-[10px] text-amber-400">
              Meta: {ch.goal ?? 0}
            </Text>
          </>
        ) : null}

        <Text className="font-mono text-[10px] text-muted-foreground">·</Text>

        {/* Days remaining */}
        <Text
          className={cn(
            'font-mono text-[10px]',
            isActive ? 'text-amber-400' : 'text-muted-foreground',
          )}
        >
          {daysLeft}
        </Text>

        <Text className="font-mono text-[10px] text-muted-foreground">·</Text>

        {/* Participant count */}
        <Text className="font-mono text-[10px] text-muted-foreground">
          {ch.participantCount} participante{ch.participantCount !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Description if present */}
      {ch.description ? (
        <Text className="font-mono text-[10px] text-muted-foreground/70 leading-relaxed" numberOfLines={2}>
          {ch.description}
        </Text>
      ) : null}
    </View>
  )
}

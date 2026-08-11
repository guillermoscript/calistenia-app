import { useEffect, useRef } from 'react'
import { View, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import { useChallengeDetail } from '@calistenia/core/hooks/useChallengeDetail'
import { daysRemaining, getMetricLabel, getMetricUnit } from '@calistenia/core/lib/challenges'
import {
  resolvePresetChallengeDescription,
  resolvePresetChallengeTitle,
} from '@calistenia/core/lib/challenge-presets'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

export default function ChallengeDetailScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const user = useAuthUser()
  const userId = user?.id ?? null
  const challengeId = typeof id === 'string' ? id : null
  const { challenge, leaderboard, loading, load } = useChallengeDetail(challengeId, userId)
  const viewedRef = useRef<string | null>(null)
  const progressRef = useRef<string | null>(null)
  const completionRef = useRef<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const currentEntry = leaderboard.find(entry => entry.isCurrentUser) ?? null

  useEffect(() => {
    if (!challengeId || loading || !challenge || viewedRef.current === challengeId) return
    viewedRef.current = challengeId
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeViewed, {
      surface: 'challenge_detail',
      source: 'challenge_route',
      challenge_id: challengeId,
      result: 'viewed',
    })
  }, [challengeId, loading, challenge])

  useEffect(() => {
    if (!challengeId || loading || !currentEntry) return
    const key = `${challengeId}:${currentEntry.value}`
    if (progressRef.current === key) return
    progressRef.current = key
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeProgressUpdated, {
      surface: 'challenge_detail',
      source: 'challenge_route',
      challenge_id: challengeId,
      progress_value: currentEntry.value,
      result: 'updated',
    })
  }, [challengeId, currentEntry, loading])

  useEffect(() => {
    if (!challengeId || loading || !challenge?.goal || challenge.goal <= 0) return
    if (!currentEntry || currentEntry.value < challenge.goal || completionRef.current === challengeId) return
    completionRef.current = challengeId
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeCompleted, {
      surface: 'challenge_detail',
      source: 'challenge_goal_reached',
      challenge_id: challengeId,
      result: 'completed',
    })
  }, [challengeId, challenge, currentEntry, loading])

  const goalReached = !!challenge?.goal && !!currentEntry && currentEntry.value >= challenge.goal

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-4">
        <Pressable onPress={() => router.back()} className="rounded-full p-2 active:opacity-70">
          <ArrowLeft size={20} color="#a3e635" />
        </Pressable>
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('nav.challenges')}
        </Text>
        <View className="w-9" />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center gap-2">
          <ActivityIndicator color="#a3e635" />
          <Text className="font-mono text-xs text-muted-foreground">{t('common.loading')}</Text>
        </View>
      ) : !challenge ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-sm text-muted-foreground">{t('challenge.noParticipants')}</Text>
        </View>
      ) : (
        <View className="px-4 gap-5">
          <View className="gap-2">
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{getMetricLabel(challenge.metric, challenge.custom_metric, challenge.exercise_slug)}</Text>
            <Text className="font-bebas text-4xl leading-none text-foreground">{resolvePresetChallengeTitle(challenge)}</Text>
            {challenge.description ? <Text className="font-sans text-sm leading-relaxed text-muted-foreground">{resolvePresetChallengeDescription(challenge)}</Text> : null}
            <Text className="font-mono text-[10px] text-muted-foreground">{challenge.starts_at} → {challenge.ends_at}</Text>
          </View>

          <View className="flex-row items-center justify-between border-y border-border py-3">
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {goalReached ? t('challenge.preset.completed') : challenge.status === 'active' ? daysRemaining(challenge.ends_at) : t('challenge.preset.expired')}
            </Text>
            <Text className="font-mono text-[10px] text-lime">{t('challenges.participants', { count: leaderboard.length })}</Text>
          </View>

          <View className="gap-3">
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t('challenge.preset.progress')}</Text>
            {currentEntry ? (
              <View className="rounded-xl border border-lime/30 bg-lime/10 p-4 gap-3">
                <View className="flex-row items-end justify-between">
                  <Text className="font-sans-medium text-foreground">{currentEntry.displayName}</Text>
                  <Text className="font-bebas text-4xl text-lime">
                    {currentEntry.value}{getMetricUnit(challenge.metric, challenge.exercise_slug) ? ` ${getMetricUnit(challenge.metric, challenge.exercise_slug)}` : ''}
                  </Text>
                </View>
                {challenge.goal && challenge.goal > 0 ? (
                  <View className="gap-2">
                    <View className="h-2 overflow-hidden rounded-full bg-background">
                      <View className="h-full rounded-full bg-lime" style={{ width: `${Math.min(100, (currentEntry.value / challenge.goal) * 100)}%` }} />
                    </View>
                    <Text className="font-mono text-[10px] text-muted-foreground">{currentEntry.value} / {challenge.goal}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text className="font-sans text-sm text-muted-foreground">{t('challenge.preset.noProgress')}</Text>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

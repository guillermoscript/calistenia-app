/** Retos — port móvil de ChallengesPage (useChallenges de core). */
import { useEffect, useRef, useState } from 'react'
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
import { isCumulativeMetric } from '@calistenia/core/lib/cumulative-scoring'
import {
  BEGINNER_CHALLENGE_PRESETS,
  getPresetDateRange,
  getPresetTargetLabel,
  resolvePresetChallengeDescription,
  resolvePresetChallengeTitle,
  type BeginnerChallengePreset,
} from '@calistenia/core/lib/challenge-presets'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

// ── Types ─────────────────────────────────────────────────────────────────────

type TabFilter = 'active' | 'past'

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { active, past, loading, load, joinPreset } = useChallenges(userId)
  const [filter, setFilter] = useState<TabFilter>('active')

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    for (const preset of BEGINNER_CHALLENGE_PRESETS) {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeViewed, {
        surface: 'challenge_preset_catalog',
        source: preset.id,
        result: 'viewed',
      })
    }
  }, [])

  const items: ChallengeWithMeta[] = filter === 'active' ? active : past

  // Una vista por reto y por visita a la pantalla: `items` cambia de identidad
  // en cada refetch (montaje, invalidate, staleTime), así que sin este registro
  // el mismo reto se contaría varias veces y hundiría la conversión vista→unión.
  const viewedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    for (const challenge of items) {
      const seenKey = `${filter}:${challenge.id}`
      if (viewedRef.current.has(seenKey)) continue
      viewedRef.current.add(seenKey)
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeViewed, {
        surface: 'challenge_list',
        source: filter,
        challenge_id: challenge.id,
        participant_count: challenge.participantCount,
        result: 'viewed',
      })
    }
  }, [filter, items])

  // Solo los retos activos "ocupan" un preset: una ronda terminada debe dejar
  // volver a empezar, no bloquear la tarjeta en VER PROGRESO para siempre.
  const joinedPresets = new Map(
    active
      .filter(challenge => challenge.preset_key)
      .map(challenge => [challenge.preset_key!, challenge]),
  )

  const handleJoinPreset = (preset: BeginnerChallengePreset) => {
    if (!userId || !preset.enabled) return
    const dates = getPresetDateRange(preset)
    Alert.alert(
      t('challenge.preset.confirmTitle'),
      t('challenge.preset.confirmBody', {
        title: t(preset.titleKey),
        startsAt: dates.startsAt,
        endsAt: dates.endsAt,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('challenge.preset.join'),
          onPress: () => {
            void joinPreset(preset.id)
              .then(result => router.push(`/challenges/${result.challengeId}`))
              .catch(() => Alert.alert(t('challenge.preset.confirmTitle'), t('challenge.preset.joinError')))
          },
        },
      ],
    )
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

      {/*
        El catálogo va como cabecera de la FlatList, no como View hermana: si no,
        ocupa alto fijo, empuja la lista fuera de pantalla y nada de eso scrollea
        (el último preset quedaba tapado por la barra de navegación).
      */}
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 pb-10 gap-2"
        ListHeaderComponent={
          filter === 'active' ? (
            <BeginnerPresetCatalog
              joinedPresets={joinedPresets}
              onJoin={handleJoinPreset}
              onOpen={(challengeId) => router.push(`/challenges/${challengeId}`)}
            />
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center justify-center gap-2 py-10">
              <ActivityIndicator color="#a3e635" />
              <Text className="font-mono text-xs text-muted-foreground">{t('common.loading')}</Text>
            </View>
          ) : (
            <EmptyState
              icon={Target}
              title={filter === 'active' ? t('challenges.emptyActive') : t('challenges.emptyPast')}
              body={t('challenges.emptyBody')}
            />
          )
        }
        renderItem={({ item }) => (
          <ChallengeCard
            challenge={item}
            onOpen={() => router.push(`/challenges/${item.id}`)}
          />
        )}
      />
    </SafeAreaView>
  )
}

// ── Challenge Card ────────────────────────────────────────────────────────────

interface ChallengeCardProps {
  challenge: ChallengeWithMeta
  onOpen: () => void
}

function ChallengeCard({ challenge: ch, onOpen }: ChallengeCardProps) {
  const { t } = useTranslation()
  const isActive = ch.status === 'active'
  const metricLabel = getMetricLabel(ch.metric, ch.custom_metric, ch.exercise_slug)
  const daysLeft = daysRemaining(ch.ends_at)

  return (
    <Pressable onPress={onOpen} className="rounded-xl border border-border bg-card px-4 py-3.5 gap-2 active:opacity-80">
      {/* Title row */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Text className="font-sans-medium text-foreground" numberOfLines={2}>
            {resolvePresetChallengeTitle(ch)}
          </Text>
        </View>
      </View>

      {/* Meta row */}
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        {/* Metric */}
        <Text className="font-mono text-[10px] tracking-wide text-lime">{metricLabel}</Text>

        {/* Cómo puntúa (solo métricas acumulativas #352) */}
        {isCumulativeMetric(ch.metric) ? (
          <Text className="font-mono text-[10px] text-muted-foreground">
            {t(`challenge.metricDesc.${ch.metric}`)}
          </Text>
        ) : null}

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
          {resolvePresetChallengeDescription(ch)}
        </Text>
      ) : null}
    </Pressable>
  )
}

function BeginnerPresetCatalog({
  joinedPresets,
  onJoin,
  onOpen,
}: {
  joinedPresets: Map<string, ChallengeWithMeta>
  onJoin: (preset: BeginnerChallengePreset) => void
  onOpen: (challengeId: string) => void
}) {
  const { t } = useTranslation()

  return (
    // Sin px-4: el padding horizontal ya lo pone el contentContainer de la lista.
    <View className="pb-4 gap-2">
      <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
        {t('challenge.preset.kicker')}
      </Text>
      <Text className="font-bebas text-2xl leading-none text-foreground">
        {t('challenge.preset.catalogTitle')}
      </Text>
      <Text className="font-sans text-xs leading-relaxed text-muted-foreground">
        {t('challenge.preset.catalogDescription')}
      </Text>
      {BEGINNER_CHALLENGE_PRESETS.map(preset => {
        const joined = joinedPresets.get(preset.id)
        return (
          <View key={preset.id} className={cn('rounded-xl border bg-card p-4 gap-3', preset.enabled ? 'border-border' : 'border-border/60 opacity-70')}>
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground">{t(preset.titleKey)}</Text>
                <Text className="font-sans text-xs leading-relaxed text-muted-foreground mt-1">{t(preset.descriptionKey)}</Text>
              </View>
              <Text className="font-mono text-[9px] uppercase tracking-widest text-lime">{t('challenge.preset.difficulty')}</Text>
            </View>
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              <Text className="font-mono text-[10px] text-lime">{getMetricLabel(preset.metric)}</Text>
              <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
              <Text className="font-mono text-[10px] text-muted-foreground">{getPresetTargetLabel(preset)}</Text>
              <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
              <Text className="font-mono text-[10px] text-muted-foreground">{t('challenge.preset.duration', { count: preset.durationDays })}</Text>
            </View>
            {preset.disabledReasonKey && !preset.enabled ? (
              <Text className="font-mono text-[10px] text-amber-400">{t(preset.disabledReasonKey)}</Text>
            ) : null}
            <Pressable
              disabled={!preset.enabled}
              onPress={() => joined ? onOpen(joined.id) : onJoin(preset)}
              className={cn('rounded-lg px-3 py-2.5 items-center', preset.enabled ? 'bg-lime/20 active:opacity-70' : 'bg-muted')}
            >
              <Text className={cn('font-mono text-[11px] tracking-wide', preset.enabled ? 'text-lime' : 'text-muted-foreground')}>
                {joined ? t('challenge.preset.open') : preset.enabled ? t('challenge.preset.join') : t('challenge.preset.unavailable')}
              </Text>
            </Pressable>
          </View>
        )
      })}
    </View>
  )
}

/**
 * Clasificación entre seguidos (pastillas de categoría + filas), sin cabecera.
 *
 * La usan la ruta `/leaderboard` y la sección Ranking de la pestaña Comunidad
 * (#860). Las etiquetas son las mismas claves `leaderboard.*` que la web: aquí
 * estaban escritas a pelo en español.
 */
import { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { View, FlatList, Pressable, ScrollView, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Trophy } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { EmptyState } from '@/components/ui/empty-state'
import { SuggestedUsers } from '@/components/social/SuggestedUsers'
import { SUGGESTED_USERS_LEADERBOARD_LIMIT } from '@calistenia/core/lib/suggested-users'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useLeaderboard, type LeaderboardCategory, type LeaderboardEntry } from '@calistenia/core/hooks/useLeaderboard'
import { RANK_MEDALS } from '@calistenia/core/lib/challenges'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

// ── Category definitions ──────────────────────────────────────────────────────

type TimeFilter = 'week' | 'month'

interface CategoryDef {
  id: LeaderboardCategory
  label: string
  unit: string
  hasTimeFilter: boolean
}

function buildCategories(t: TFunction): CategoryDef[] {
  const days = t('leaderboard.streakUnit')
  return [
    { id: 'sessions_week', label: t('leaderboard.sessions'), unit: '', hasTimeFilter: true },
    { id: 'total_sessions', label: t('leaderboard.totalSessions'), unit: '', hasTimeFilter: false },
    { id: 'streak', label: t('leaderboard.streak'), unit: days, hasTimeFilter: false },
    { id: 'streak_best', label: t('leaderboard.bestStreak'), unit: days, hasTimeFilter: false },
    { id: 'xp', label: 'XP', unit: 'xp', hasTimeFilter: false },
    { id: 'total_sets', label: t('leaderboard.totalSets'), unit: '', hasTimeFilter: false },
    { id: 'pr_pullups', label: t('leaderboard.prPullups'), unit: 'reps', hasTimeFilter: false },
    { id: 'pr_pushups', label: t('leaderboard.prPushups'), unit: 'reps', hasTimeFilter: false },
    { id: 'pr_lsit', label: 'L-sit', unit: 's', hasTimeFilter: false },
    { id: 'pr_handstand', label: 'Handstand', unit: 's', hasTimeFilter: false },
  ]
}

// ── List ──────────────────────────────────────────────────────────────────────

export default function LeaderboardList() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { entries, loading, load } = useLeaderboard(userId)

  const [category, setCategory] = useState<LeaderboardCategory>('sessions_week')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week')

  useEffect(() => {
    void load()
  }, [load])

  // Desacoplado de `load` igual que en web (#578): una vista por visita, no por
  // render. Existía solo en web hasta el #636 §5.
  useEffect(() => {
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.leaderboardViewed, {
      surface: 'leaderboard', source: 'leaderboard_screen',
    })
  }, [])

  const categories = useMemo(() => buildCategories(t), [t])
  const catDef = categories.find((c) => c.id === category)

  const activeCategory: LeaderboardCategory =
    category === 'sessions_week' && timeFilter === 'month' ? 'sessions_month' : category

  const currentEntries = entries[activeCategory] ?? []
  const hasAnyFollows = Object.values(entries).some((arr) => arr.length > 1)

  return (
    <View className="flex-1">
      <FlatList
        data={currentEntries}
        keyExtractor={(item) => item.userId}
        contentContainerClassName="px-4 pb-10 gap-2"
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            {/* Category pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-1.5 pb-1"
            >
              {categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategory(cat.id)}
                  className={cn(
                    'min-h-11 justify-center rounded-md border px-3',
                    category === cat.id
                      ? 'border-lime/60 bg-lime/10'
                      : 'border-border',
                  )}
                >
                  <Text
                    className={cn(
                      'font-mono text-[11px] tracking-wide',
                      category === cat.id ? 'text-lime' : 'text-muted-foreground',
                    )}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Time filter — only for sessions category */}
            {catDef?.hasTimeFilter && (
              <View className="flex-row gap-1.5">
                <Pressable
                  onPress={() => setTimeFilter('week')}
                  className={cn(
                    'min-h-11 justify-center rounded-md border px-3',
                    timeFilter === 'week'
                      ? 'border-amber-400/60 bg-amber-400/10'
                      : 'border-border',
                  )}
                >
                  <Text
                    className={cn(
                      'font-mono text-[11px] tracking-wide',
                      timeFilter === 'week' ? 'text-amber-400' : 'text-muted-foreground',
                    )}
                  >
                    {t('leaderboard.thisWeek')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTimeFilter('month')}
                  className={cn(
                    'min-h-11 justify-center rounded-md border px-3',
                    timeFilter === 'month'
                      ? 'border-amber-400/60 bg-amber-400/10'
                      : 'border-border',
                  )}
                >
                  <Text
                    className={cn(
                      'font-mono text-[11px] tracking-wide',
                      timeFilter === 'month' ? 'text-amber-400' : 'text-muted-foreground',
                    )}
                  >
                    {t('leaderboard.thisMonth')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-10">
              <Text className="font-mono text-xs text-muted-foreground">{t('common.loading')}</Text>
            </View>
          ) : !hasAnyFollows ? (
            <View className="gap-5">
              <EmptyState
                icon={Trophy}
                title={t('leaderboard.emptyTitle')}
                body={t('leaderboard.emptyBody')}
                ctaLabel={t('dashboard.findFriends')}
                onCtaPress={() => router.push('/friends')}
              />
              {/* #806: el vacío no es un callejón sin salida */}
              <SuggestedUsers surface="leaderboard_suggestions" limit={SUGGESTED_USERS_LEADERBOARD_LIMIT} />
            </View>
          ) : (
            <View className="items-center py-10">
              <Text className="font-mono text-xs text-muted-foreground">{t('leaderboard.noData')}</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <RankRow
            entry={item}
            position={index + 1}
            unit={catDef?.unit ?? ''}
          />
        )}
      />
    </View>
  )
}

// ── Rank Row ──────────────────────────────────────────────────────────────────

interface RankRowProps {
  entry: LeaderboardEntry
  position: number
  unit: string
}

export function RankRow({ entry, position, unit }: RankRowProps) {
  const { t } = useTranslation()
  const medal = RANK_MEDALS[position - 1]

  return (
    <View
      className={cn(
        'flex-row items-center gap-3 rounded-xl border px-4 py-3',
        entry.isCurrentUser
          ? 'border-lime/30 bg-lime/10 border-l-2 border-l-lime'
          : 'border-border bg-card',
      )}
    >
      {/* Position */}
      <View className="w-8 items-center">
        {medal ? (
          <Text className="text-lg">{medal}</Text>
        ) : (
          <Text className="font-mono text-sm text-muted-foreground">{position}</Text>
        )}
      </View>

      {/* Avatar */}
      {entry.avatarUrl ? (
        <Image
          source={{ uri: entry.avatarUrl }}
          className="size-9 rounded-full"
          style={{ width: 36, height: 36, borderRadius: 18 }}
          resizeMode="cover"
        />
      ) : (
        <View className="size-9 items-center justify-center rounded-full bg-muted">
          <Text className="font-sans-medium text-sm text-foreground">
            {entry.displayName[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}

      {/* Name */}
      <View className="flex-1 min-w-0">
        <Text
          className={cn(
            'font-sans-medium text-foreground',
            entry.isCurrentUser && 'text-lime',
          )}
          numberOfLines={1}
        >
          {entry.displayName}
          {entry.isCurrentUser && (
            <Text className="font-mono text-[10px] text-muted-foreground"> {t('leaderboard.you')}</Text>
          )}
        </Text>
      </View>

      {/* Value */}
      <View className="items-end">
        <Text
          className={cn(
            'font-bebas text-2xl leading-none',
            entry.isCurrentUser ? 'text-lime' : 'text-foreground',
          )}
        >
          {entry.value}
        </Text>
        {unit ? (
          <Text className="font-mono text-[10px] text-muted-foreground">{unit}</Text>
        ) : null}
      </View>
    </View>
  )
}

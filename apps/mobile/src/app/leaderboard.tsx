/** Clasificación — port móvil de LeaderboardPage (useLeaderboard de core). */
import { useEffect, useState } from 'react'
import { View, FlatList, Pressable, ScrollView, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useLeaderboard, type LeaderboardCategory, type LeaderboardEntry } from '@calistenia/core/hooks/useLeaderboard'

// ── Medals ────────────────────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉']

// ── Category definitions ──────────────────────────────────────────────────────

type TimeFilter = 'week' | 'month'

interface CategoryDef {
  id: LeaderboardCategory
  label: string
  unit: string
  hasTimeFilter: boolean
}

const CATEGORIES: CategoryDef[] = [
  { id: 'sessions_week', label: 'Sesiones', unit: '', hasTimeFilter: true },
  { id: 'total_sessions', label: 'Total sesiones', unit: '', hasTimeFilter: false },
  { id: 'streak', label: 'Racha actual', unit: 'días', hasTimeFilter: false },
  { id: 'streak_best', label: 'Mejor racha', unit: 'días', hasTimeFilter: false },
  { id: 'xp', label: 'XP', unit: 'xp', hasTimeFilter: false },
  { id: 'total_sets', label: 'Series totales', unit: '', hasTimeFilter: false },
  { id: 'pr_pullups', label: 'Dominadas', unit: 'reps', hasTimeFilter: false },
  { id: 'pr_pushups', label: 'Flexiones', unit: 'reps', hasTimeFilter: false },
  { id: 'pr_lsit', label: 'L-sit', unit: 's', hasTimeFilter: false },
  { id: 'pr_handstand', label: 'Handstand', unit: 's', hasTimeFilter: false },
]

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { entries, loading, load } = useLeaderboard(userId)

  const [category, setCategory] = useState<LeaderboardCategory>('sessions_week')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('week')

  useEffect(() => {
    void load()
  }, [load])

  const catDef = CATEGORIES.find((c) => c.id === category)

  const activeCategory: LeaderboardCategory =
    category === 'sessions_week' && timeFilter === 'month' ? 'sessions_month' : category

  const currentEntries = entries[activeCategory] ?? []
  const hasAnyFollows = Object.values(entries).some((arr) => arr.length > 1)

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-start justify-between px-4 pt-2 pb-4">
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            Social
          </Text>
          <Text className="font-bebas text-4xl leading-none text-foreground">Clasificación</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-muted/60 p-2 active:opacity-70"
        >
          <X size={18} color="#888899" />
        </Pressable>
      </View>

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
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategory(cat.id)}
                  className={cn(
                    'rounded-md border px-3 py-1.5',
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
                    'rounded-md border px-3 py-1.5',
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
                    Esta semana
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTimeFilter('month')}
                  className={cn(
                    'rounded-md border px-3 py-1.5',
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
                    Este mes
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-10">
              <Text className="font-mono text-xs text-muted-foreground">Cargando...</Text>
            </View>
          ) : !hasAnyFollows ? (
            <View className="items-center gap-3 rounded-xl border border-dashed border-border py-14">
              <Text className="text-3xl">🏆</Text>
              <Text className="text-center font-mono text-xs text-muted-foreground px-6">
                Sigue a amigos para ver la clasificación
              </Text>
              <Pressable
                onPress={() => router.push('/friends' as never)}
                className="mt-1 rounded-lg bg-lime/20 px-4 py-2 active:opacity-70"
              >
                <Text className="font-mono text-xs text-lime tracking-wide">Buscar amigos</Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center py-10">
              <Text className="font-mono text-xs text-muted-foreground">Sin datos aún</Text>
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
    </SafeAreaView>
  )
}

// ── Rank Row ──────────────────────────────────────────────────────────────────

interface RankRowProps {
  entry: LeaderboardEntry
  position: number
  unit: string
}

function RankRow({ entry, position, unit }: RankRowProps) {
  const medal = MEDALS[position - 1]

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
            <Text className="font-mono text-[10px] text-muted-foreground"> (tú)</Text>
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

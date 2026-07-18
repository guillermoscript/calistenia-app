/**
 * HomeActivity — sección compacta de "Actividad reciente" para la pantalla de inicio.
 * Dos pestañas:
 *   · Amigos → últimos entrenamientos de la gente que sigues (useActivityFeed)
 *   · Tú     → tus últimas sesiones + registros de nutrición (datos locales + caché)
 *
 * Vive en el espacio libre bajo los accesos Amigos/Ranking/Retos del Today screen.
 */
import { useEffect, useMemo, useState } from 'react'
import { View, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Users, Dumbbell, Apple, Activity } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useActivityFeed } from '@calistenia/core/hooks/useActivityFeed'
import { useCardioSessions } from '@calistenia/core/hooks/useCardioStats'
import { useNutrition } from '@calistenia/core/hooks/useNutrition'
import { timeAgo, relativeDate } from '@calistenia/core/lib/dateUtils'
import type { SessionDone } from '@calistenia/core/types'

const LIME = 'hsl(74 90% 45%)'
const MUTED = 'hsl(0 0% 55%)'

type Tab = 'amigos' | 'tu'

// Hoisted: reusada por cada sesión al derivar el título (js-hoist-regexp).
const WORKOUT_KEY_RE = /^p(\d+)_(\w+)$/

type YouItem = {
  kind: 'session' | 'meal' | 'cardio'
  id: string
  ts: number
  title: string
  sub: string
  /** Destino al tocar la fila: detalle de sesión/cardio o tab de nutrición. */
  nav: Href
}

export default function HomeActivity() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const [tab, setTab] = useState<Tab>('amigos')

  const { items: feedItems, loading: feedLoading, load } = useActivityFeed(userId)
  const { progress } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()
  const { entries } = useNutrition(userId)
  const { sessions: cardioSessions } = useCardioSessions(userId)

  // Cargar el feed de amigos de forma perezosa al montar (la pestaña Amigos es la inicial).
  useEffect(() => {
    if (userId) load()
  }, [userId, load])

  const friends = useMemo(() => feedItems.slice(0, 3), [feedItems])

  const titleForSession = (s: SessionDone): string => {
    if (s.workoutKey.startsWith('free_') || s.workoutKey.startsWith('manual_')) {
      return t('progress.freeSession')
    }
    const m = WORKOUT_KEY_RE.exec(s.workoutKey)
    if (m) {
      const w = getWorkout(parseInt(m[1]), m[2])
      if (w?.title) return w.title
      return `${t('workout.phaseLabel', { phase: m[1] })} · ${t(`day.${m[2]}`, { defaultValue: m[2] })}`
    }
    return s.workoutKey
  }

  const youItems = useMemo<YouItem[]>(() => {
    // Un solo recorrido: filtra las sesiones hechas y las mapea a la vez (js-flatmap-filter).
    const sessions: YouItem[] = Object.entries(progress).flatMap(([k, v]) => {
      // Salta días de cardio de programa (cardioSessionId): ya se listan como cardio.
      if (!k.startsWith('done_') || !(v as SessionDone).done || (v as SessionDone).cardioSessionId) return []
      const s = v as SessionDone
      return [{
        kind: 'session' as const,
        id: `s_${s.date}_${s.workoutKey}`,
        ts: s.completedAt ?? Date.parse(`${s.date}T12:00:00`),
        title: titleForSession(s),
        sub: relativeDate(s.date),
        nav: { pathname: '/session-detail', params: { date: s.date, workoutKey: s.workoutKey, title: titleForSession(s) } },
      }]
    })

    const meals: YouItem[] = (entries ?? []).map(e => ({
      kind: 'meal' as const,
      id: `m_${e.id}`,
      ts: Date.parse(e.loggedAt),
      title: t(`meal.${e.mealType}`, { defaultValue: e.mealType }),
      sub: `${t('dashboard.kcal', { count: Math.round(e.totalCalories) })} · ${timeAgo(e.loggedAt)}`,
      nav: '/nutrition' as Href,
    }))

    const cardio: YouItem[] = cardioSessions.map(c => ({
      kind: 'cardio' as const,
      id: `c_${c.id}`,
      ts: Date.parse(c.started_at),
      title: `${t(`cardio.${c.activity_type}`, { defaultValue: c.activity_type })} · ${(c.distance_km ?? 0).toFixed(2)} km`,
      sub: timeAgo(c.started_at),
      nav: { pathname: '/cardio/[id]', params: { id: String(c.id) } },
    }))

    return [...sessions, ...meals, ...cardio]
      .filter(i => Number.isFinite(i.ts))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 4)
  }, [progress, entries, cardioSessions, getWorkout, t]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!userId) return null

  const seeAllTarget = tab === 'amigos' ? '/social' : '/history'

  return (
    <View className="gap-2.5">
      {/* Cabecera + tabs + ver todo */}
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('dashboard.recentActivity')}
        </Text>
        <Pressable onPress={() => router.push(seeAllTarget)} className="flex-row items-center gap-0.5 active:opacity-60">
          <Text className="font-mono text-[10px] uppercase tracking-wide text-lime">{t('dashboard.seeAll')}</Text>
          <ChevronRight size={13} color={LIME} />
        </Pressable>
      </View>

      {/* Segmented control Amigos / Tú */}
      <View className="flex-row gap-1.5 rounded-xl border border-border bg-card p-1">
        <TabButton label={t('dashboard.tabFriends')} active={tab === 'amigos'} onPress={() => setTab('amigos')} />
        <TabButton label={t('dashboard.tabYou')} active={tab === 'tu'} onPress={() => setTab('tu')} />
      </View>

      {/* Contenido */}
      {tab === 'amigos' ? (
        feedLoading && friends.length === 0 ? (
          <ActivitySkeleton />
        ) : friends.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('dashboard.noFriendsActivityTitle')}
            body={t('dashboard.noFriendsActivity')}
            ctaLabel={t('dashboard.findFriends')}
            onCtaPress={() => router.push('/friends')}
          />
        ) : (
          <View className="gap-2">
            {friends.map(item => (
              <Pressable
                key={item.id}
                onPress={() => router.push({ pathname: '/u/[id]', params: { id: item.userId } })}
                className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 active:opacity-70"
              >
                <View className="size-9 items-center justify-center overflow-hidden rounded-full bg-accent">
                  {item.avatarUrl ? (
                    <Image
                      source={{ uri: item.avatarUrl }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                      recyclingKey={item.userId}
                      accessibilityLabel={item.displayName}
                    />
                  ) : (
                    <Text className="font-mono text-xs text-foreground">{(item.displayName[0] ?? '?').toUpperCase()}</Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
                    {item.displayName}
                  </Text>
                  <Text className="font-mono text-[10px] text-muted-foreground" numberOfLines={1}>
                    {item.workoutTitle} · {timeAgo(item.completedAt)}
                  </Text>
                </View>
                <ChevronRight size={16} color={MUTED} />
              </Pressable>
            ))}
          </View>
        )
      ) : youItems.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={t('dashboard.noYourActivityTitle')}
          body={t('dashboard.noYourActivity')}
        />
      ) : (
        <View className="gap-2">
          {youItems.map(item => (
            <Pressable
              key={item.id}
              onPress={() => router.push(item.nav)}
              className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 active:opacity-70"
            >
              <View
                className={cn(
                  'size-9 items-center justify-center rounded-full',
                  item.kind === 'meal' ? 'bg-emerald-400/10' : item.kind === 'cardio' ? 'bg-sky-500/15' : 'bg-lime/15',
                )}
              >
                {item.kind === 'meal' ? (
                  <Apple size={16} color="#34d399" />
                ) : item.kind === 'cardio' ? (
                  <Activity size={16} color="#0ea5e9" />
                ) : (
                  <Dumbbell size={16} color={LIME} />
                )}
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text className="font-mono text-[10px] text-muted-foreground" numberOfLines={1}>
                  {item.sub}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn('flex-1 items-center rounded-lg py-1.5 active:opacity-80', active ? 'bg-lime/15' : '')}
    >
      <Text className={cn('font-mono text-[11px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  )
}

function ActivitySkeleton() {
  return (
    <View className="gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
          <Skeleton className="size-9 rounded-full" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="h-2.5 w-20 rounded" />
          </View>
        </View>
      ))}
    </View>
  )
}

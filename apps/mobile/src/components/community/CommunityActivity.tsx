/**
 * Sección Actividad de la pestaña Comunidad (#860): lo social que antes estaba
 * repartido por el inicio y el menú ☰, en una sola columna.
 *
 *   batalla activa → reto destacado → tus amigos (3) → ranking de la semana
 *   (3 primeros + tu puesto) → más (programas de comunidad, carreras, invitar)
 *
 * Sin amigos no hay feed ni ranking que enseñar: el estado vacío invita a
 * buscarlos y deja el reto destacado, que no necesita a nadie.
 */
import { useEffect, useMemo } from 'react'
import { View, Pressable, ScrollView } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Users } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import FeaturedChallengeCard from '@/components/home/FeaturedChallengeCard'
import FriendActivityRow from '@/components/social/FriendActivityRow'
import ActiveBattleRow from '@/components/community/ActiveBattleRow'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import { useActivityFeed } from '@calistenia/core/hooks/useActivityFeed'
import { useLeaderboard } from '@calistenia/core/hooks/useLeaderboard'
import { summarizeWeek } from '@/lib/community-ranking'

const MUTED = 'hsl(0 0% 55%)'

export default function CommunityActivity({ onSeeRanking }: { onSeeRanking: () => void }) {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { following, loading: followsLoading } = useFollows(userId)
  const hasFriends = following.length > 0

  return (
    <ScrollView contentContainerClassName="gap-6 px-4 pb-10 pt-1" showsVerticalScrollIndicator={false}>
      <ActiveBattleRow />

      {!followsLoading && !hasFriends ? (
        <View className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Users}
            title={t('community.emptyTitle')}
            body={t('community.emptyBody')}
            ctaLabel={t('dashboard.findFriends')}
            onCtaPress={() => router.push('/friends')}
          />
        </View>
      ) : null}

      <FeaturedChallengeCard userId={userId} />

      {hasFriends ? (
        <>
          <FriendsActivity userId={userId} />
          <WeeklyRanking userId={userId} onSeeAll={onSeeRanking} />
        </>
      ) : null}

      <MoreLinks />
    </ScrollView>
  )
}

// ── Tus amigos ────────────────────────────────────────────────────────────────

function FriendsActivity({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { items, loading, load } = useActivityFeed(userId)

  // El feed es perezoso: no pide nada hasta el primer `load()`.
  useEffect(() => {
    if (userId) void load()
  }, [userId, load])

  const latest = useMemo(() => items.slice(0, 3), [items])

  return (
    <View className="gap-2">
      <SectionHeader
        label={t('community.yourFriends')}
        actionLabel={t('dashboard.seeAll')}
        onAction={() => router.push('/social')}
      />
      {loading && latest.length === 0 ? (
        <RowsSkeleton count={3} tall />
      ) : latest.length === 0 ? (
        <Text className="py-2 text-sm text-muted-foreground">{t('community.friendsQuiet')}</Text>
      ) : (
        <View className="gap-2">
          {latest.map(item => (
            <FriendActivityRow key={item.id} item={item} meId={userId} />
          ))}
        </View>
      )}
    </View>
  )
}

// ── Ranking de la semana ──────────────────────────────────────────────────────

function WeeklyRanking({ userId, onSeeAll }: { userId: string | null; onSeeAll: () => void }) {
  const { t } = useTranslation()
  const { entries, loading, load } = useLeaderboard(userId)

  // Igual que el feed: el ranking no consulta hasta que alguien llama a `load()`.
  useEffect(() => {
    void load()
  }, [load])

  const week = entries.sessions_week
  const rows = useMemo(() => summarizeWeek(week), [week])

  return (
    <View className="gap-2">
      <SectionHeader label={t('community.weekRanking')} actionLabel={t('dashboard.seeAll')} onAction={onSeeAll} />
      {loading ? (
        <RowsSkeleton count={3} />
      ) : rows.length === 0 ? (
        <Text className="py-2 text-sm text-muted-foreground">{t('leaderboard.noData')}</Text>
      ) : (
        <View className="border-t border-border">
          {rows.map(({ entry, position }) => (
            <View
              key={entry.userId}
              className="h-11 flex-row items-center gap-3 border-b border-border"
            >
              <Text
                className={cn(
                  'w-6 font-bebas text-xl leading-none',
                  entry.isCurrentUser ? 'text-lime' : 'text-foreground',
                )}
              >
                {position}
              </Text>
              <Text
                className={cn('flex-1 text-sm text-foreground', entry.isCurrentUser && 'font-sans-medium')}
                numberOfLines={1}
              >
                {entry.isCurrentUser ? t('community.you') : entry.displayName}
              </Text>
              <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
                {t('community.workouts', { count: entry.value })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

// ── Más ───────────────────────────────────────────────────────────────────────

function MoreLinks() {
  const { t } = useTranslation()
  const router = useRouter()

  const links: { title: string; sub: string; href: Href }[] = [
    { title: t('nav.communityPrograms'), sub: t('community.programsSub'), href: '/community-programs' },
    { title: t('nav.races'), sub: t('community.racesSub'), href: '/races-discover' },
    { title: t('community.invite'), sub: t('community.inviteSub'), href: '/referrals' },
  ]

  return (
    <View className="gap-2">
      <Kicker>{t('nav.sectionMore')}</Kicker>
      <View className="border-t border-border">
        {links.map(link => (
          <Pressable
            key={link.title}
            onPress={() => router.push(link.href)}
            className="min-h-14 flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
            accessibilityRole="button"
          >
            <View className="flex-1 gap-0.5">
              <Text className="font-sans-medium text-sm text-foreground">{link.title}</Text>
              <Text className="text-xs text-muted-foreground">{link.sub}</Text>
            </View>
            <ChevronRight size={16} color={MUTED} />
          </Pressable>
        ))}
      </View>
    </View>
  )
}

// ── Piezas ────────────────────────────────────────────────────────────────────

function SectionHeader({ label, actionLabel, onAction }: { label: string; actionLabel: string; onAction: () => void }) {
  return (
    <View className="flex-row items-center justify-between">
      <Kicker>{label}</Kicker>
      <Pressable
        onPress={onAction}
        // El texto mide ~14 pt: la zona táctil se estira hasta los 44.
        className="min-h-11 flex-row items-center gap-0.5 pl-3 active:opacity-60"
        accessibilityRole="button"
      >
        <Text className="font-mono text-[10px] uppercase tracking-wide text-lime">{actionLabel}</Text>
        <ChevronRight size={13} color="hsl(74 90% 45%)" />
      </Pressable>
    </View>
  )
}

function RowsSkeleton({ count, tall = false }: { count: number; tall?: boolean }) {
  return (
    <View className="gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn('w-full rounded-xl', tall ? 'h-16' : 'h-11')} />
      ))}
    </View>
  )
}

/**
 * Pantalla de Amigos — Siguiendo / Seguidores + búsqueda de usuarios + invitar.
 * Port móvil de apps/web/src/pages/FriendsPage.tsx
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  View,
  ScrollView,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { shareReferralInvite, shareText, profileUrl } from '@/lib/share'
import { pb, getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import { useBlocks } from '@calistenia/core/hooks/useBlocks'
import { excludeBlocked } from '@calistenia/core/lib/blocks'
import { Sentry } from '@/lib/instrument'
import type { FollowUser } from '@calistenia/core/hooks/useFollows'
import { buildUserSearchFilter } from '@/lib/user-search-filter'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'siguiendo' | 'seguidores'

interface SearchResult {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

// ── Pure helper — no closures over component state ────────────────────────────

function mapPbItems(items: any[], excludeUserId: string): SearchResult[] {
  return items
    .filter((u: any) => u.id !== excludeUserId)
    .map((u: any) => ({
      id: u.id,
      displayName: u.display_name || u.name || u.username || '?',
      username: u.username || '',
      avatarUrl: getUserAvatarUrl(u, '100x100'),
    }))
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 opacity-40">
      <View className="size-10 rounded-full bg-muted" />
      <View className="flex-1 gap-1.5">
        <View className="h-3.5 w-28 rounded bg-muted" />
        <View className="h-2.5 w-16 rounded bg-muted" />
      </View>
      <View className="h-8 w-20 rounded-md bg-muted" />
    </View>
  )
}

// ── UserRow ───────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: FollowUser | SearchResult
  isFollowing: boolean
  isMutual?: boolean
  onFollow: () => Promise<void>
  onUnfollow: () => Promise<void>
  onTap: () => void
}

function UserRow({ user, isFollowing, isMutual, onFollow, onUnfollow, onTap }: UserRowProps) {
  const [actionLoading, setActionLoading] = useState(false)

  const handleAction = async () => {
    if (actionLoading) return
    setActionLoading(true)
    try {
      if (isFollowing) await onUnfollow()
      else await onFollow()
    } finally {
      setActionLoading(false)
    }
  }

  const initial = user.displayName[0]?.toUpperCase() ?? '?'

  return (
    <Pressable
      onPress={onTap}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
    >
      {user.avatarUrl ? (
        <Image
          source={{ uri: user.avatarUrl }}
          className="size-10 rounded-full"
          accessibilityLabel={user.displayName}
        />
      ) : (
        <View className="size-10 items-center justify-center rounded-full bg-accent">
          <Text className="font-sans-medium text-sm text-foreground">{initial}</Text>
        </View>
      )}

      <View className="flex-1 min-w-0">
        <Text className="font-sans-medium text-foreground" numberOfLines={1}>
          {user.displayName}
        </Text>
        <View className="flex-row items-center gap-1.5">
          {user.username ? (
            <Text className="font-mono text-[11px] text-muted-foreground" numberOfLines={1}>
              @{user.username}
            </Text>
          ) : null}
          {isMutual ? (
            <Text className="font-mono text-[11px] text-lime">· mutuo</Text>
          ) : null}
        </View>
      </View>

      <Button
        variant={isFollowing ? 'outline' : 'default'}
        size="sm"
        onPress={handleAction}
        disabled={actionLoading}
        className={cn(
          'shrink-0',
          !isFollowing && 'bg-lime',
        )}
      >
        {actionLoading ? (
          <ActivityIndicator size="small" color={isFollowing ? '#888899' : '#000'} />
        ) : (
          <Text
            className={cn(
              'font-mono text-[11px] tracking-widest',
              isFollowing ? 'text-foreground' : 'text-black',
            )}
          >
            {isFollowing ? 'SIGUIENDO' : 'SEGUIR'}
          </Text>
        )}
      </Button>
    </Pressable>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { following, followers, followingIds, loading, follow, unfollow } = useFollows(userId)
  const { blockedIds } = useBlocks(userId)

  const [tab, setTab] = useState<Tab>('siguiendo')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [retryTrigger, setRetryTrigger] = useState(0)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queryRef = useRef('')

  // Derive followerIds for mutual detection
  const followerIds = useMemo(() => new Set(followers.map((f) => f.id)), [followers])

  // ── Search (debounced, bounded server-side query — máx 20 resultados) ────────

  const query = search.trim()

  useEffect(() => {
    if (query.length < 1) {
      setSearchResults([])
      setSearchError(false)
      setSearching(false)
      return
    }
    queryRef.current = query
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchError(false)
      try {
        const { raw, params } = buildUserSearchFilter(query)
        const res = await pb.collection('users').getList(1, 20, {
          filter: pb.filter(raw, params),
          $autoCancel: true,
        })
        if (queryRef.current !== query) return // stale
        setSearchResults(mapPbItems(res.items, userId ?? ''))
      } catch (e) {
        if ((e as { isAbort?: boolean })?.isAbort) return // cancelado por $autoCancel, no es error
        Sentry.captureException(e, { tags: { feature: 'social', op: 'search_users' } })
        setSearchError(true)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => clearTimeout(debounceRef.current)
  }, [query, userId, retryTrigger])

  // Sort search results: already-followed first (bloqueados excluidos tras el filtro de texto)
  const sortedSearchResults = useMemo(
    () =>
      excludeBlocked(searchResults, blockedIds).slice().sort((a, b) => {
        const aF = followingIds.has(a.id) ? 0 : 1
        const bF = followingIds.has(b.id) ? 0 : 1
        return aF - bF
      }),
    [searchResults, followingIds, blockedIds],
  )

  // ── Invite share ─────────────────────────────────────────────────────────────

  const handleInvite = async () => {
    if (!userId) return
    const displayName = user?.display_name ?? user?.username ?? 'Alguien'
    // shareReferralInvite needs a referral code; use userId as fallback code
    const referralCode = (user as any)?.referral_code ?? userId
    const { message, url } = shareReferralInvite(displayName, referralCode)
    await shareText({ message, url })
  }

  // ── Tab helpers ───────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'siguiendo', label: 'Siguiendo', count: following.length },
    { id: 'seguidores', label: 'Seguidores', count: followers.length },
  ]

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderFollowUser = useCallback(
    ({ item, index: _i }: { item: FollowUser; index: number }) => {
      const isF = followingIds.has(item.id)
      return (
        <View className="mb-1.5">
          <UserRow
            user={item}
            isFollowing={isF}
            isMutual={tab === 'seguidores' ? isF : followerIds.has(item.id)}
            onFollow={async () => { await follow(item.id) }}
            onUnfollow={async () => { await unfollow(item.id) }}
            onTap={() => router.push(`/u/${item.id}` as any)}
          />
        </View>
      )
    },
    [followingIds, followerIds, tab, follow, unfollow, router],
  )

  const renderSearchResult = useCallback(
    ({ item }: { item: SearchResult }) => {
      const isF = followingIds.has(item.id)
      return (
        <View className="mb-1.5">
          <UserRow
            user={item}
            isFollowing={isF}
            isMutual={isF && followerIds.has(item.id)}
            onFollow={async () => { await follow(item.id) }}
            onUnfollow={async () => { await unfollow(item.id) }}
            onTap={() => router.push(`/u/${item.id}` as any)}
          />
        </View>
      )
    },
    [followingIds, followerIds, follow, unfollow, router],
  )

  const currentList = tab === 'siguiendo' ? following : followers

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Fixed header */}
      <View className="flex-row items-start justify-between px-4 pt-2 pb-3">
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            SOCIAL
          </Text>
          <Text className="font-bebas text-4xl leading-none text-foreground">Amigos</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-muted/60 p-2 active:opacity-70 mt-1"
        >
          <X size={18} color="#888899" />
        </Pressable>
      </View>

      {/* Search input */}
      <View className="px-4 mb-3">
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar usuario..."
          placeholderTextColor="#71717a"
          maxLength={50}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          className="h-11"
        />
      </View>

      {query ? (
        /* ── Search results ── */
        <View className="flex-1 px-4">
          {searching && (
            <View className="gap-1.5">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          )}
          {!searching && searchError && (
            <View className="items-center py-10 gap-3">
              <Text className="text-sm text-muted-foreground">Error al buscar. ¿Reintentar?</Text>
              <Button
                variant="outline"
                size="sm"
                onPress={() => setRetryTrigger((c) => c + 1)}
              >
                <Text className="font-mono text-xs">REINTENTAR</Text>
              </Button>
            </View>
          )}
          {!searching && !searchError && searchResults.length === 0 && (
            <View className="items-center py-10 gap-2">
              <Text className="font-sans-medium text-foreground">Sin resultados para &quot;{query}&quot;</Text>
              <Text className="text-sm text-muted-foreground text-center">
                ¿No está en la app? Invítalo a unirse.
              </Text>
              <Button
                onPress={handleInvite}
                size="sm"
                className="mt-2 bg-lime"
              >
                <Text className="font-mono text-[11px] tracking-widest text-black">INVITAR</Text>
              </Button>
            </View>
          )}
          {!searching && sortedSearchResults.length > 0 && (
            <FlatList
              data={sortedSearchResults}
              keyExtractor={(item) => item.id}
              renderItem={renderSearchResult}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      ) : (
        /* ── Tabs + lists ── */
        <View className="flex-1">
          {/* Invite card */}
          <View className="mx-4 mb-4 rounded-xl border border-border bg-card px-4 py-3 gap-2">
            <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              Invita a un amigo
            </Text>
            <Button
              onPress={handleInvite}
              size="sm"
              className="self-start bg-lime"
            >
              <Text className="font-mono text-[11px] tracking-widest text-black">
                COMPARTIR INVITACIÓN
              </Text>
            </Button>
          </View>

          {/* Tab bar */}
          <View className="flex-row gap-1.5 px-4 mb-4">
            {TABS.map((tb) => (
              <Pressable
                key={tb.id}
                onPress={() => setTab(tb.id)}
                className={cn(
                  'flex-row items-center gap-1 rounded-lg border px-3 py-2.5',
                  tab === tb.id
                    ? 'border-lime/40 bg-lime/10'
                    : 'border-border',
                )}
              >
                <Text
                  className={cn(
                    'font-mono text-[11px] tracking-wide',
                    tab === tb.id ? 'text-lime' : 'text-muted-foreground',
                  )}
                >
                  {tb.label}
                </Text>
                {tb.count > 0 && (
                  <Text
                    className={cn(
                      'font-mono text-[11px]',
                      tab === tb.id ? 'text-lime/70' : 'text-muted-foreground/60',
                    )}
                  >
                    {tb.count}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>

          {/* List content */}
          {loading ? (
            <View className="gap-1.5 px-4">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : currentList.length === 0 ? (
            <View className="items-center py-12 gap-2 px-4">
              <Text className="text-2xl">👥</Text>
              {tab === 'siguiendo' ? (
                <>
                  <Text className="font-sans-medium text-foreground">Aún no sigues a nadie</Text>
                  <Text className="text-sm text-muted-foreground text-center">
                    Busca usuarios o invita a tus amigos.
                  </Text>
                </>
              ) : (
                <>
                  <Text className="font-sans-medium text-foreground">Nadie te sigue todavía</Text>
                  <Text className="text-sm text-muted-foreground text-center">
                    Comparte tu perfil para conseguir seguidores.
                  </Text>
                  <Button onPress={handleInvite} size="sm" className="mt-2 bg-lime">
                    <Text className="font-mono text-[11px] tracking-widest text-black">COMPARTIR PERFIL</Text>
                  </Button>
                </>
              )}
            </View>
          ) : (
            <FlatList
              data={currentList}
              keyExtractor={(item) => item.id}
              renderItem={renderFollowUser}
              contentContainerClassName="px-4 pb-8"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  )
}

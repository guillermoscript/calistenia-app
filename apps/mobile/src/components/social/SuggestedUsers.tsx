/**
 * «Gente activa para seguir» (#806). Port móvil de
 * apps/web/src/components/friends/SuggestedUsers.tsx: misma lógica en core,
 * aquí solo la pintura. Se oculta sola sin sugerencias.
 */
import { useEffect, useRef, useState } from 'react'
import { View, Pressable, Image, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { useAuthUser } from '@/lib/use-auth-user'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import { useBlocks } from '@calistenia/core/hooks/useBlocks'
import { useSuggestedUsers } from '@calistenia/core/hooks/useSuggestedUsers'
import {
  trackSuggestedUserFollowed,
  trackSuggestedUsersViewed,
  type SuggestedUsersSurface,
} from '@calistenia/core/lib/suggested-users'

interface Props {
  surface: SuggestedUsersSurface
  limit?: number
  /** Solo se pinta si sigues a este número de personas o menos. */
  maxFollowing?: number
}

export function SuggestedUsers({ surface, limit, maxFollowing = Infinity }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const userId = useAuthUser()?.id ?? null
  const { following, followingIds, pendingOutgoingIds, loading: followsLoading, follow } = useFollows(userId)
  const { blockedIds } = useBlocks(userId)
  const enabled = !!userId && !followsLoading && following.length <= maxFollowing
  const { suggestions } = useSuggestedUsers(userId, followingIds, pendingOutgoingIds, blockedIds, { enabled, limit })
  const viewedRef = useRef(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Posición al pulsar: tras seguir, la fila desaparece de la lista.
  const positions = useRef(new Map<string, number>())
  suggestions.forEach((s, i) => positions.current.set(s.id, i + 1))

  useEffect(() => {
    if (viewedRef.current || suggestions.length === 0) return
    viewedRef.current = true
    trackSuggestedUsersViewed(surface, suggestions.length)
  }, [suggestions.length, surface])

  if (!enabled || suggestions.length === 0) return null

  const onFollow = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    try {
      const result = await follow(id)
      if (result) trackSuggestedUserFollowed(surface, id, result, positions.current.get(id) ?? 0)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <View className="gap-2">
      <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
        {t('friends.suggestedTitle')}
      </Text>
      <Text className="text-xs text-muted-foreground">{t('friends.suggestedHint')}</Text>
      {suggestions.map((u) => (
        <Pressable
          key={u.id}
          onPress={() => router.push(`/u/${u.id}` as any)}
          className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
        >
          {u.avatarUrl ? (
            <Image source={{ uri: u.avatarUrl }} className="size-10 rounded-full" accessibilityLabel={u.displayName} />
          ) : (
            <View className="size-10 items-center justify-center rounded-full bg-accent">
              <Text className="font-sans-medium text-sm text-foreground">{u.displayName[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
          <View className="min-w-0 flex-1">
            <Text className="font-sans-medium text-foreground" numberOfLines={1}>{u.displayName}</Text>
            <Text className="font-mono text-[11px] text-muted-foreground" numberOfLines={1}>
              {t('friends.suggestedSessions', { n: u.totalSessions })}
              {u.currentStreak > 1 ? ` · ${t('friends.suggestedStreak', { n: u.currentStreak })}` : ''}
            </Text>
          </View>
          <Button
            size="sm"
            onPress={() => { void onFollow(u.id) }}
            disabled={busyId === u.id}
            accessibilityLabel={t('friends.followBtn')}
            className="shrink-0 bg-lime"
          >
            {busyId === u.id ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text className="font-mono text-[11px] tracking-widest text-black">{t('friends.followBtn')}</Text>
            )}
          </Button>
        </Pressable>
      ))}
    </View>
  )
}

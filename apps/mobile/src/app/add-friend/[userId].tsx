/**
 * Auto-follow deep-link route — ejecuta follow() al montar y redirige al feed.
 * Port móvil de apps/web/src/pages/AddFriendPage.tsx
 *
 * Deep-link: /add-friend/<userId>
 *   → sigue al usuario y reemplaza la ruta por /(tabs) (feed social / home).
 */
import { useEffect, useRef } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import { useFollows } from '@calistenia/core/hooks/useFollows'

export default function AddFriendScreen() {
  const { userId: targetUserId } = useLocalSearchParams<{ userId: string }>()
  const router = useRouter()
  const currentUser = useAuthUser()
  const currentUserId = currentUser?.id ?? null

  const { follow } = useFollows(currentUserId)
  const executed = useRef(false)

  useEffect(() => {
    // Guard: only fire once, and only when we have both user IDs
    if (!targetUserId || !currentUserId || executed.current) return
    if (targetUserId === currentUserId) {
      // Can't follow yourself — just navigate to feed
      router.replace('/(tabs)' as any)
      return
    }
    executed.current = true

    const doFollow = async () => {
      await follow(targetUserId)
      // Navigate to the feed (social tab / home) after follow
      router.replace('/(tabs)' as any)
    }

    void doFollow()
  }, [targetUserId, currentUserId, follow, router])

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background" edges={['top', 'bottom']}>
      <View className="items-center gap-4">
        <ActivityIndicator size="large" color="#a3e635" />
        <Text className="font-mono text-[11px] uppercase tracking-[3px] text-muted-foreground">
          Siguiendo...
        </Text>
      </View>
    </SafeAreaView>
  )
}

/**
 * Usuarios bloqueados — lista + desbloquear. Entrada desde Perfil.
 */
import { View, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, ShieldOff } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { EmptyState } from '@/components/ui/empty-state'
import { useAuthUser } from '@/lib/use-auth-user'
import { useBlocks } from '@calistenia/core/hooks/useBlocks'

export default function BlockedUsersScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { blocked, unblock, loading } = useBlocks(user?.id ?? null)

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 pt-2 pb-2">
        <Pressable
          onPress={() => router.back()}
          className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
          accessibilityRole="button"
          accessibilityLabel={t('common.back', { defaultValue: 'Atrás' })}
        >
          <ChevronLeft size={24} color="rgba(255,255,255,0.55)" />
        </Pressable>
        <Text className="font-bebas text-4xl text-foreground">{t('blocks.manageTitle')}</Text>
      </View>

      <View className="h-px bg-border" />

      <ScrollView contentContainerClassName="px-4 pt-4 pb-16" showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="items-center justify-center py-16">
            <ActivityIndicator color="hsl(74 90% 45%)" />
          </View>
        ) : blocked.length === 0 ? (
          <View className="mt-4">
            <EmptyState icon={ShieldOff} title={t('blocks.empty')} body={t('blocks.emptyBody')} />
          </View>
        ) : (
          blocked.map(u => (
            <View
              key={u.id}
              className="mb-3 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
            >
              <View className="flex-row items-center gap-3">
                {u.avatarUrl ? (
                  <Image source={{ uri: u.avatarUrl }} className="size-10 rounded-full" accessibilityLabel={u.displayName} />
                ) : (
                  <View className="size-10 items-center justify-center rounded-full bg-accent">
                    <Text className="font-sans-medium text-sm text-foreground">
                      {u.displayName[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                <View>
                  <Text className="font-sans-medium text-foreground" numberOfLines={1}>{u.displayName}</Text>
                  {u.username ? (
                    <Text className="font-mono text-[11px] text-muted-foreground" numberOfLines={1}>@{u.username}</Text>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={() => { void unblock(u.id) }} hitSlop={8} className="active:opacity-70">
                <Text className="font-mono text-[11px] uppercase tracking-widest text-red-500 underline">
                  {t('blocks.unblockBtn')}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

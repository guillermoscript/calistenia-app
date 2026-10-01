/**
 * Pantalla de logros (#802). Paridad con `apps/web/src/pages/AchievementsPage.tsx`.
 * La lógica (catálogo, estado, orden) vive en `@calistenia/core/lib/achievements`.
 */

import { View, ScrollView, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { COLORS } from '@/lib/theme'
import { useAuthUser } from '@/lib/use-auth-user'

import { useAchievements } from '@calistenia/core/hooks/useAchievements'
import { utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import type { AchievementItem } from '@calistenia/core/lib/achievements'

function AchievementRow({ item }: { item: AchievementItem }) {
  const { t } = useTranslation()
  const pct = Math.round((item.progress / item.target) * 100)
  return (
    <Card
      className={cn('mb-3', item.unlocked ? 'border-lime/40' : '')}
      testID={`achievement-${item.key}`}
    >
      <CardContent className="flex-row items-center gap-4 py-3">
        <View
          className={cn(
            'size-12 items-center justify-center rounded-full',
            item.unlocked ? 'bg-lime/15' : 'bg-muted opacity-50',
          )}
        >
          <Text className="text-2xl">{item.icon}</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 font-sans-medium text-base text-foreground" numberOfLines={1}>
              {t(`achievements.${item.key}.name`)}
            </Text>
            <Text className={cn('font-mono text-[10px] uppercase tracking-[2px]', item.unlocked ? 'text-lime' : 'text-muted-foreground')}>
              {item.unlocked ? t('achievements.unlocked') : t('achievements.locked')}
            </Text>
          </View>
          <Text className="font-sans text-sm text-muted-foreground">{t(`achievements.${item.key}.desc`)}</Text>
          {item.unlocked ? (
            item.unlockedAt ? (
              <Text className="mt-1 font-sans text-xs text-muted-foreground">
                {t('achievements.unlockedOn', { date: utcToLocalDateStr(item.unlockedAt) })}
              </Text>
            ) : null
          ) : (
            <View className="mt-2">
              <View className="h-1.5 overflow-hidden rounded-full bg-muted">
                <View className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
              </View>
              <Text className="mt-1 font-sans text-xs text-muted-foreground">
                {t(item.metric === 'workouts' ? 'achievements.progressWorkouts' : 'achievements.progressWeeks', {
                  done: item.progress,
                  target: item.target,
                })}
              </Text>
            </View>
          )}
        </View>
      </CardContent>
    </Card>
  )
}

export default function AchievementsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { items, unlocked, total, loading, error, refresh } = useAchievements(user?.id ?? null)

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-4 pb-32"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={COLORS.lime} />}
      >
        <View className="mb-6 pb-2 pt-2">
          <Pressable
            onPress={() => { haptics.selection(); router.back() }}
            className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
            accessibilityRole="button"
            accessibilityLabel={t('common.back', { defaultValue: 'Atrás' })}
          >
            <ChevronLeft size={24} color="rgba(255,255,255,0.55)" />
          </Pressable>
          <Kicker>{!loading && !error ? t('achievements.subtitle', { unlocked, total }) : t('achievements.title')}</Kicker>
          <Text className="font-bebas text-4xl text-foreground">{t('achievements.title')}</Text>
        </View>

        {error ? (
          <View className="items-center gap-3 py-8">
            <Text className="text-center font-sans text-sm text-muted-foreground">{t('achievements.loadError')}</Text>
            <Button variant="outline" onPress={() => void refresh()}>
              <Text>{t('achievements.retry')}</Text>
            </Button>
          </View>
        ) : (
          items.map(item => <AchievementRow key={item.key} item={item} />)
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

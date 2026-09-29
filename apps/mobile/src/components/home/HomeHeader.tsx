/**
 * Cabecera del inicio (#858): fecha y saludo a la izquierda; campana (con su
 * contador) y avatar a la derecha. El avatar abre Perfil. Sin ☰: lo que
 * colgaba de ahí lo recolocan las pestañas de #859.
 */
import { Pressable, View } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { NotificationBadge } from '@/components/social/NotificationBadge'
import { useAuthUser } from '@/lib/use-auth-user'
import { withCacheToken } from '@/lib/avatar'
import { useThemeColors } from '@/lib/theme'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { localHour } from '@calistenia/core/lib/dateUtils'

export default function HomeHeader({ unreadCount }: { unreadCount: number }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const colors = useThemeColors()

  const hour = localHour()
  const greeting = hour < 12 ? t('home.greeting.morning') : hour < 19 ? t('home.greeting.afternoon') : t('home.greeting.evening')
  const date = new Date().toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'short' })
  const avatarUrl = user ? withCacheToken(getUserAvatarUrl(user, '200x200'), user.updated as string) : null
  const name = (user?.display_name as string) || (user?.name as string) || ''
  const initial = name.trim().charAt(0).toUpperCase() || '·'

  return (
    <View className="flex-row items-end justify-between gap-3 pt-2">
      <View className="flex-1 gap-0.5">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground" numberOfLines={1}>
          {date}
        </Text>
        <Text className="font-bebas text-[34px] leading-none text-foreground" numberOfLines={1}>{greeting}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => router.push('/notifications')}
          className="size-11 items-center justify-center rounded-full border border-border active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0
            ? t('home.a11y.notificationsUnread', { count: unreadCount })
            : t('home.a11y.notifications')}
        >
          <Bell size={18} color={colors.mutedForeground} />
          <NotificationBadge count={unreadCount} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/profile')}
          className="size-11 items-center justify-center overflow-hidden rounded-full bg-muted active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={t('home.a11y.profile')}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: 44, height: 44 }} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <Text className="font-sans-medium text-[15px] text-foreground">{initial}</Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

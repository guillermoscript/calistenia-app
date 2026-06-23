/**
 * Notificaciones — pantalla apilada (stacked route).
 * Lista todas las notificaciones del usuario con marca de lectura.
 */
import { useEffect, useCallback } from 'react'
import { View, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { X, BellOff, Settings } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useNotifications } from '@calistenia/core/hooks/useNotifications'
import type { AppNotification, NotificationType } from '@calistenia/core/hooks/useNotifications'
import { getNotifRoute } from '@/lib/notification-route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Separador de fila estable (a nivel de módulo: no se remonta en cada render). */
const NotifSeparator = () => <View className="mx-4 h-px bg-border/40" />

/** Tiempo relativo en español */
function relativeTimeEs(dateStr: string): string {
  if (!dateStr) return ''
  const then = new Date(dateStr.replace(' ', 'T')).getTime()
  if (isNaN(then)) return ''
  const diffMin = Math.floor((Date.now() - then) / 60000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'ayer'
  if (diffD <= 7) return `hace ${diffD}d`
  return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/** Mensaje localizado para cada tipo de notificación */
function getNotificationMessage(n: AppNotification, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const name = n.actorName || '?'
  switch (n.type as NotificationType) {
    case 'follow':
      return `${name} te empezó a seguir`
    case 'reaction': {
      const emoji = n.data?.emoji ? ` ${n.data.emoji}` : ''
      const target = n.data?.onComment ? 'tu comentario' : 'tu sesión'
      return `${name} reaccionó a ${target}${emoji}`
    }
    case 'comment':
      return `${name} comentó tu sesión`
    case 'comment_reply':
      return `${name} respondió tu comentario`
    case 'challenge_invite':
      return `${name} te invitó a un reto`
    case 'challenge_join':
      return `${name} se unió a tu reto`
    case 'challenge_complete': {
      const title = n.data?.challengeTitle ? ` "${n.data.challengeTitle}"` : ''
      return `Reto completado${title}`
    }
    case 'achievement': {
      const icon = n.data?.achievementIcon ? `${n.data.achievementIcon} ` : '🏅 '
      const aName = n.data?.achievementName || 'un logro'
      return `${icon}Desbloqueaste ${aName}`
    }
    case 'streak': {
      const days = n.data?.days ? ` de ${n.data.days} días` : ''
      return `¡Nueva racha${days}!`
    }
    case 'referral_signup': {
      const refName = n.data?.referredName || name
      return `${refName} se registró con tu enlace`
    }
    case 'referral_bonus': {
      const refName = n.data?.referredName || name
      return `¡Bonus por referir a ${refName}!`
    }
    // ── New friend-activity types ─────────────────────────────────────────────
    case 'friend_streak':
      return t('notif.friendStreak', { name, days: n.data?.days ?? 0 })
    case 'friend_achievement':
      return t('notif.friendAchievement', { name, achievement: n.data?.achievementName ?? n.data?.achievementIcon ?? '' })
    case 'friend_workout':
      return t('notif.friendWorkout', { name })
    case 'friend_joined':
      return t('notif.friendJoined', { name })
    default:
      return `${name} te envió una notificación`
  }
}

/** Inicial en mayúscula para el avatar */
function initial(name: string): string {
  return (name?.[0] ?? '?').toUpperCase()
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface NotificationRowProps {
  item: AppNotification
  onPress: (n: AppNotification) => void
}

function NotificationRow({ item, onPress }: NotificationRowProps) {
  const { t } = useTranslation()
  const isUnread = !item.read

  return (
    <Pressable
      onPress={() => onPress(item)}
      className={cn(
        'flex-row items-start gap-3 px-4 py-3.5 active:opacity-70',
        isUnread ? 'bg-lime/5' : 'bg-transparent',
      )}
    >
      {/* Left accent bar for unread */}
      {isUnread && (
        <View className="absolute bottom-0 left-0 top-0 w-0.5 rounded-r bg-lime" />
      )}

      {/* Actor initial avatar */}
      <View className="size-9 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
        <Text className="font-sans-medium text-sm text-foreground">
          {initial(item.actorName)}
        </Text>
      </View>

      {/* Content */}
      <View className="flex-1 min-w-0">
        <Text
          className={cn(
            'font-sans-medium text-sm leading-snug',
            isUnread ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {getNotificationMessage(item, t)}
        </Text>
        <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">
          {relativeTimeEs(item.created)}
        </Text>
      </View>

      {/* Unread dot */}
      {isUnread && (
        <View className="mt-2 size-2 shrink-0 rounded-full bg-lime" />
      )}
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function NotificationsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const {
    notifications,
    unreadCount,
    loading,
    loadNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotifications(userId)

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  const handleTap = useCallback(
    (n: AppNotification) => {
      if (!n.read) {
        void markAsRead(n.id)
      }
      const route = getNotifRoute(n)
      if (route) {
        router.push(route as Parameters<typeof router.push>[0])
      }
    },
    [markAsRead, router],
  )

  const hasUnread = unreadCount > 0

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
        <View>
          <Text className="font-bebas text-4xl leading-none text-foreground">
            Notificaciones
          </Text>
          {hasUnread && (
            <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-[3px] text-lime">
              {unreadCount} sin leer
            </Text>
          )}
        </View>

        <View className="flex-row items-center gap-2">
          {hasUnread && (
            <Pressable
              onPress={() => void markAllAsRead()}
              className="rounded-lg bg-muted/60 px-3 py-1.5 active:opacity-70"
            >
              <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                Marcar todo
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push('/notification-settings')}
            className="rounded-full bg-muted/60 p-2 active:opacity-70"
            accessibilityLabel={t('notifSettings.title')}
          >
            <Settings size={18} color="#888899" />
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-muted/60 p-2 active:opacity-70"
          >
            <X size={18} color="#888899" />
          </Pressable>
        </View>
      </View>

      {/* Divider */}
      <View className="h-px bg-border" />

      {/* List */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="hsl(74 90% 45%)" />
          <Text className="mt-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Cargando…
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerClassName="pb-8"
          renderItem={({ item }) => (
            <NotificationRow item={item} onPress={handleTap} />
          )}
          ItemSeparatorComponent={NotifSeparator}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center gap-3 py-20">
              <BellOff size={36} color="#52525b" strokeWidth={1.5} />
              <Text className="font-sans-medium text-sm text-muted-foreground">
                Sin notificaciones aún
              </Text>
              <Text className="text-center text-xs text-muted-foreground/60 px-8">
                Aquí aparecerán reacciones, comentarios y más
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

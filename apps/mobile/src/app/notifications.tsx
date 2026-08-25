/**
 * Notificaciones — pantalla apilada (stacked route).
 * Lista todas las notificaciones del usuario con marca de lectura.
 */
import { useEffect, useCallback, useState } from 'react'
import { View, FlatList, Pressable, ActivityIndicator, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { X, BellOff, Settings } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useNotifications } from '@calistenia/core/hooks/useNotifications'
import { useFollows } from '@calistenia/core/hooks/useFollows'
import type { FollowRequest } from '@calistenia/core/hooks/useFollows'
import type { AppNotification, NotificationType } from '@calistenia/core/hooks/useNotifications'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import type { TranslatableField } from '@calistenia/core/lib/i18n-db'
import { getNotifRoute } from '@/lib/notification-route'
import { timeAgoShort } from '@calistenia/core/lib/dateUtils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Separador de fila estable (a nivel de módulo: no se remonta en cada render). */
const NotifSeparator = () => <View className="mx-4 h-px bg-border/40" />

/**
 * Mensaje localizado para cada tipo de notificación.
 *
 * `l` resuelve los campos i18n que llegan dentro de `data` como mapa `{es, en}`
 * (#633), que es distinto de `t`: `t` traduce el copy de la app, `l` elige el
 * idioma de un texto que escribió un usuario y guardó PocketBase.
 */
function getNotificationMessage(
  n: AppNotification,
  t: (k: string, opts?: Record<string, unknown>) => string,
  l: (field: TranslatableField | undefined | null) => string,
): string {
  const name = n.actorName || '?'
  switch (n.type as NotificationType) {
    case 'follow':
      return `${name} te empezó a seguir`
    case 'follow_request':
      return t('notif.followRequest', { name })
    case 'follow_accepted':
      return t('notif.followAccepted', { name })
    case 'reaction': {
      const emoji = n.data?.emoji ? ` ${n.data.emoji}` : ''
      const target = n.data?.onComment ? 'tu comentario' : 'tu sesión'
      const base = `${name} reaccionó a ${target}${emoji}`
      // Para reacciones a un comentario mostramos a cuál se reaccionó.
      return n.data?.onComment && n.data?.commentPreview
        ? `${base}: «${n.data.commentPreview}»`
        : base
    }
    case 'comment':
      return n.data?.preview
        ? `${name} comentó tu sesión: «${n.data.preview}»`
        : `${name} comentó tu sesión`
    case 'comment_reply':
      return n.data?.preview
        ? `${name} respondió tu comentario: «${n.data.preview}»`
        : `${name} respondió tu comentario`
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
    // El nombre del programa viaja como mapa i18n `{es, en}` (#633): el servidor
    // no sabe en qué idioma tiene la app quien lo recibe, así que lo resuelve
    // aquí `l`. Puede venir vacío (programa sin `name`) y el copy se sostiene.
    case 'program_deleted':
      return t('notif.programDeleted', { name: l(n.data?.programName) })
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

/**
 * Botones Aceptar / Rechazar de una solicitud de seguimiento (#422). Dentro de
 * una fila pulsable, en RN el Pressable más interno se queda con el tap, así
 * que pulsar un botón no navega al perfil; el resto de la fila sigue pulsable.
 */
function RequestActions({
  requestId, onAccept, onReject,
}: { requestId: string; onAccept: (id: string) => Promise<boolean>; onReject: (id: string) => Promise<boolean> }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const run = async (kind: 'accept' | 'reject') => {
    setBusy(kind)
    try { await (kind === 'accept' ? onAccept(requestId) : onReject(requestId)) } finally { setBusy(null) }
  }
  return (
    <View className="mt-2 flex-row gap-2">
      <Pressable
        onPress={() => { void run('accept') }}
        disabled={busy !== null}
        className="rounded-lg bg-lime px-3 py-1.5 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={t('privacy.accept')}
      >
        {busy === 'accept'
          ? <ActivityIndicator size="small" color="#000" />
          : <Text className="font-mono text-[10px] uppercase tracking-wide text-black">{t('privacy.accept')}</Text>}
      </Pressable>
      <Pressable
        onPress={() => { void run('reject') }}
        disabled={busy !== null}
        className="rounded-lg border border-border px-3 py-1.5 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={t('privacy.reject')}
      >
        {busy === 'reject'
          ? <ActivityIndicator size="small" color="#888899" />
          : <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{t('privacy.reject')}</Text>}
      </Pressable>
    </View>
  )
}

/** Fila de la bandeja de solicitudes pendientes (encabezado de la lista). */
function FollowRequestRow({
  req, onAccept, onReject, onOpen,
}: { req: FollowRequest; onAccept: (id: string) => Promise<boolean>; onReject: (id: string) => Promise<boolean>; onOpen: (userId: string) => void }) {
  const name = req.user.displayName || req.user.username || '?'
  return (
    <View className="flex-row items-start gap-3 px-4 py-3">
      <Pressable onPress={() => onOpen(req.user.id)} className="flex-row items-center gap-3 active:opacity-70" accessibilityRole="button" accessibilityLabel={name}>
        {req.user.avatarUrl ? (
          <Image source={{ uri: req.user.avatarUrl }} className="size-9 rounded-full" />
        ) : (
          <View className="size-9 items-center justify-center rounded-full bg-muted">
            <Text className="font-sans-medium text-sm text-foreground">{initial(name)}</Text>
          </View>
        )}
      </Pressable>
      <View className="flex-1 min-w-0">
        <Pressable onPress={() => onOpen(req.user.id)} className="active:opacity-70">
          <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>{name}</Text>
          {req.user.username ? (
            <Text className="font-mono text-[10px] text-muted-foreground">@{req.user.username}</Text>
          ) : null}
        </Pressable>
        <RequestActions requestId={req.id} onAccept={onAccept} onReject={onReject} />
      </View>
    </View>
  )
}

interface NotificationRowProps {
  item: AppNotification
  onPress: (n: AppNotification) => void
  /** Solo para `follow_request` aún sin resolver: id de la fila de `follows`. */
  requestId?: string
  onAccept?: (id: string) => Promise<boolean>
  onReject?: (id: string) => Promise<boolean>
}

function NotificationRow({ item, onPress, requestId, onAccept, onReject }: NotificationRowProps) {
  const { t } = useTranslation()
  const l = useLocalize()
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
          {getNotificationMessage(item, t, l)}
        </Text>
        <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">
          {timeAgoShort(item.created)}
        </Text>
        {requestId && onAccept && onReject ? (
          <RequestActions requestId={requestId} onAccept={onAccept} onReject={onReject} />
        ) : null}
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

  // Solicitudes de seguimiento pendientes (#422): bandeja arriba + botones en
  // la propia notificación `follow_request` mientras siga sin resolverse.
  const { pendingIncoming, acceptRequest, rejectRequest } = useFollows(userId)
  const requestIdByActor = new Map(pendingIncoming.map(r => [r.user.id, r.id] as const))

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
            <NotificationRow
              item={item}
              onPress={handleTap}
              requestId={item.type === 'follow_request' && item.actorId ? requestIdByActor.get(item.actorId) : undefined}
              onAccept={acceptRequest}
              onReject={rejectRequest}
            />
          )}
          ItemSeparatorComponent={NotifSeparator}
          ListHeaderComponent={
            pendingIncoming.length > 0 ? (
              <View className="border-b border-border pb-2">
                <Text className="px-4 pb-1 pt-4 font-mono text-[10px] uppercase tracking-[3px] text-lime">
                  {t('privacy.requestsTitle')}
                </Text>
                {pendingIncoming.map(req => (
                  <FollowRequestRow
                    key={req.id}
                    req={req}
                    onAccept={acceptRequest}
                    onReject={rejectRequest}
                    onOpen={(id) => router.push(`/u/${id}` as Parameters<typeof router.push>[0])}
                  />
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="px-4 py-10">
              <EmptyState
                icon={BellOff}
                title={t('notifications.emptyTitle')}
                body={t('notifications.emptyBody')}
              />
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

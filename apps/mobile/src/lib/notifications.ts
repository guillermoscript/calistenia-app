/**
 * Notificaciones locales del rest timer (best effort: en Expo Go Android
 * tienen limitaciones; todo va en try/catch para no romper la sesión).
 * En foreground no se muestra banner — el contador en pantalla es suficiente.
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { Sentry } from '@/lib/instrument'

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const source = notification.request.content.data?.source
    // Recordatorios (comida/ejercicio/pausa) sí muestran banner en foreground.
    const isReminder = source === 'reminder'
    // Push remotas del backend (reacciones, comentarios, amigos, etc.)
    const isPush = source === 'push'
    // El rest timer no muestra nada — el contador en pantalla es suficiente.
    return {
      shouldShowBanner: isReminder || isPush,
      shouldShowList: isReminder || isPush,
      shouldPlaySound: isReminder || isPush,
      shouldSetBadge: isPush,
    }
  },
})

let permissionAsked = false

/**
 * Crea el canal Android 'rest-timer' sin pedir permiso (#815 hallazgo #4).
 * Antes solo se creaba dentro de `requestNotifPermission`, que
 * `SessionView.tsx` llamaba al arrancar CADA sesión. Ahora esa llamada se
 * salta hasta que la celebración ofrece `PushPermissionCard` (el primer
 * entreno ya no pide el permiso), y sin canal `scheduleRestEnd` programaría en
 * uno inexistente — Android descarta la notificación en silencio (API 26+).
 * Crear un canal no dispara ningún diálogo al usuario, así que se llama una
 * vez al arrancar la app (`app/_layout.tsx`).
 */
export async function ensureRestTimerChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    await Notifications.setNotificationChannelAsync('rest-timer', {
      name: 'Rest timer',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
    })
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'notifications', op: 'ensure_rest_timer_channel' } })
  }
}

export async function requestNotifPermission(): Promise<boolean> {
  try {
    await ensureRestTimerChannel()
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    if (permissionAsked) return false
    permissionAsked = true
    const res = await Notifications.requestPermissionsAsync()
    return res.granted
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'notifications', op: 'request_permission' } })
    return false
  }
}

/** Programa una notificación para el fin del descanso. Retorna id o null. */
export async function scheduleRestEnd(secondsFromNow: number, title: string, body: string): Promise<string | null> {
  if (secondsFromNow < 1) return null
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.round(secondsFromNow),
        channelId: Platform.OS === 'android' ? 'rest-timer' : undefined,
      },
    })
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'notifications', op: 'schedule_rest_end' } })
    return null
  }
}

export async function cancelScheduled(id: string | null): Promise<void> {
  if (!id) return
  try {
    await Notifications.cancelScheduledNotificationAsync(id)
  } catch { /* ignore */ }
}

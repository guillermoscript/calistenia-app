/**
 * Notificaciones locales del rest timer (best effort: en Expo Go Android
 * tienen limitaciones; todo va en try/catch para no romper la sesión).
 * En foreground no se muestra banner — el contador en pantalla es suficiente.
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

let permissionAsked = false

export async function requestNotifPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('rest-timer', {
        name: 'Rest timer',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
      })
    }
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    if (permissionAsked) return false
    permissionAsked = true
    const res = await Notifications.requestPermissionsAsync()
    return res.granted
  } catch {
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
  } catch {
    return null
  }
}

export async function cancelScheduled(id: string | null): Promise<void> {
  if (!id) return
  try {
    await Notifications.cancelScheduledNotificationAsync(id)
  } catch { /* ignore */ }
}

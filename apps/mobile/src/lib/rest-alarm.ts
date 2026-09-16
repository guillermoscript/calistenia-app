/**
 * Alarma de fin de descanso — la que suena con la app fuera de pantalla.
 *
 * Desde el #775 la notificación en vivo del entreno ya no es foreground service
 * (Play rechazó el tipo `health` seis veces), así que con la app en segundo plano
 * Android congela o mata el proceso: el «vamos» de `training-cues` deja de sonar
 * porque ya no hay JS que lo toque. El aviso lo tiene que dar el sistema.
 *
 * En Android lo programa notifee con `SET_ALARM_CLOCK`, que es lo que usa un
 * despertador: exacta, exenta de Doze y —lo importante— la ÚNICA exacta que no
 * necesita permiso del usuario (`SCHEDULE_EXACT_ALARM` ya no se concede sola
 * desde Android 14, y sin ella tanto expo-notifications como el WorkManager que
 * notifee usa por defecto caen en alarmas inexactas: llegan minutos tarde, que
 * para un descanso de 90 s es no llegar). El precio es el iconito de alarma en la
 * barra de estado mientras dura el descanso.
 *
 * En iOS basta la notificación local programada de expo-notifications: el sistema
 * la dispara igual con la app suspendida.
 *
 * Todo es best-effort: sin alarma la sesión sigue, solo se pierde el aviso.
 */
import { Platform } from 'react-native'

import { Sentry } from '@/lib/instrument'
import { cancelScheduled, scheduleRestEnd } from '@/lib/notifications'

/** Un solo descanso a la vez: reprogramar pisa el anterior. */
const NOTIF_ID = 'rest-end'

/**
 * Canal con sufijo de versión: Android congela sonido, vibración e importancia de
 * un canal en cuanto se crea. Para cambiar cualquiera de los tres hay que estrenar
 * un id nuevo (ver el mismo patrón en `live-session.ts`).
 */
const CHANNEL_ID = 'rest-end-v1'

/**
 * `rest_end` es el recurso de `res/raw` que el plugin de expo-notifications copia
 * desde `assets/sounds/rest_end.wav` (declarado en `app.json` → `sounds`). Sin
 * `sound` el canal de notifee se crea MUDO, que es justo lo que estamos
 * arreglando; con guion en el nombre el plugin ni lo copiaría.
 */
const CHANNEL_SOUND = 'rest_end'

/** Notificación de respaldo (iOS y Expo Go, donde notifee no existe). */
let fallbackId: string | null = null

async function getNotifee() {
  try {
    // Lazy: notifee es módulo nativo; en Expo Go no existe.
    return (await import('@notifee/react-native')).default
  } catch {
    return null
  }
}

/** Programa el aviso para `endAt`. Reprogramar con el mismo id reemplaza. */
export async function scheduleRestAlarm(endAt: number, title: string, body: string): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      const notifee = await getNotifee()
      if (notifee) {
        const { AlarmType, AndroidCategory, AndroidImportance, AndroidVisibility, TriggerType } =
          await import('@notifee/react-native')
        await notifee.createChannel({
          id: CHANNEL_ID,
          name: 'Fin del descanso',
          // HIGH para que salga en primer plano sobre lo que sea y suene aunque
          // HyperOS/MIUI esconda las silenciosas.
          importance: AndroidImportance.HIGH,
          sound: CHANNEL_SOUND,
          vibration: true,
          vibrationPattern: [0, 300, 150, 300],
          visibility: AndroidVisibility.PUBLIC,
        })
        await notifee.createTriggerNotification(
          {
            id: NOTIF_ID,
            title,
            body,
            android: {
              channelId: CHANNEL_ID,
              // ALARM la deja pasar por No molestar en modo prioridad.
              category: AndroidCategory.ALARM,
              importance: AndroidImportance.HIGH,
              smallIcon: 'notification_icon',
              largeIcon: 'ic_launcher',
              color: '#a3e635',
              visibility: AndroidVisibility.PUBLIC,
              autoCancel: true,
              // Ya cumplió: el descanso siguiente no debe encontrarla ahí.
              timeoutAfter: 60_000,
              pressAction: { id: 'default', launchActivity: 'default' },
            },
          },
          {
            type: TriggerType.TIMESTAMP,
            timestamp: endAt,
            alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
          },
        )
        return
      }
    }
    // iOS y Expo Go.
    fallbackId = await scheduleRestEnd(Math.ceil((endAt - Date.now()) / 1000), title, body)
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'rest_alarm', op: 'schedule' } })
  }
}

/** Quita el aviso programado (y el ya mostrado, si el usuario lo dejó ahí). */
export async function cancelRestAlarm(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      const notifee = await getNotifee()
      if (notifee) {
        await notifee.cancelTriggerNotification(NOTIF_ID)
        await notifee.cancelNotification(NOTIF_ID)
        return
      }
    }
    await cancelScheduled(fallbackId)
    fallbackId = null
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'rest_alarm', op: 'cancel' } })
  }
}

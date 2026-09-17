/**
 * Alarmas del entreno — las que suenan con la app fuera de pantalla.
 *
 * Desde el #775 la notificación en vivo del entreno ya no es foreground service
 * (Play rechazó el tipo `health` seis veces), así que con la app en segundo plano
 * Android congela o mata el proceso: los avisos de `training-cues` dejan de sonar
 * porque ya no hay JS que los toque. El aviso lo tiene que dar el sistema.
 *
 * En Android lo programa notifee con `SET_ALARM_CLOCK`, que es lo que usa un
 * despertador: exacta, exenta de Doze y —lo importante— la ÚNICA exacta que no
 * necesita permiso del usuario (`SCHEDULE_EXACT_ALARM` ya no se concede sola
 * desde Android 14, y sin ella tanto expo-notifications como el WorkManager que
 * notifee usa por defecto caen en alarmas inexactas: llegan minutos tarde, que
 * para un descanso de 90 s es no llegar). El precio es el iconito de alarma en la
 * barra de estado mientras dura la cuenta.
 *
 * En iOS basta la notificación local programada de expo-notifications: el sistema
 * la dispara igual con la app suspendida.
 *
 * Todo es best-effort: sin alarma la sesión sigue, solo se pierde el aviso.
 */
import { Platform } from 'react-native'

import { Sentry } from '@/lib/instrument'
import { cancelScheduled, scheduleRestEnd } from '@/lib/notifications'
import { ALARM_VIBRATION_PATTERN } from '@/lib/training-alarm-policy'

/** Qué cuenta atrás avisa. Cada una con su id: nunca corren a la vez, pero una
 *  alarma huérfana de la otra no debe sonar encima. */
export type TrainingAlarmKind = 'rest' | 'timer'

const NOTIF_ID: Record<TrainingAlarmKind, string> = {
  rest: 'rest-end',
  timer: 'timer-end',
}

/**
 * Canal con sufijo de versión: Android congela sonido, vibración e importancia de
 * un canal en cuanto se crea. Para cambiar cualquiera de los tres hay que estrenar
 * un id nuevo (ver el mismo patrón en `live-session.ts`).
 */
const CHANNEL_ID = 'training-end-v1'

/**
 * `rest_end` es el recurso de `res/raw` que el plugin de expo-notifications copia
 * desde `assets/sounds/rest_end.wav` (declarado en `app.json` → `sounds`). Sin
 * `sound` el canal de notifee se crea MUDO, que es justo lo que estamos
 * arreglando; con guion en el nombre el plugin ni lo copiaría.
 */
const CHANNEL_SOUND = 'rest_end'

/** Notificación de respaldo (iOS y Expo Go, donde notifee no existe). */
const fallbackIds: Record<TrainingAlarmKind, string | null> = { rest: null, timer: null }

async function getNotifee() {
  try {
    // Lazy: notifee es módulo nativo; en Expo Go no existe.
    return (await import('@notifee/react-native')).default
  } catch {
    return null
  }
}

/** Programa el aviso para `endAt`. Reprogramar con el mismo `kind` reemplaza. */
export async function scheduleTrainingAlarm(
  kind: TrainingAlarmKind,
  endAt: number,
  title: string,
  body: string,
): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      const notifee = await getNotifee()
      if (notifee) {
        const { AlarmType, AndroidCategory, AndroidImportance, AndroidVisibility, TriggerType } =
          await import('@notifee/react-native')
        await notifee.createChannel({
          id: CHANNEL_ID,
          name: 'Fin de la cuenta atrás',
          // HIGH para que salga en primer plano sobre lo que sea y suene aunque
          // HyperOS/MIUI esconda las silenciosas.
          importance: AndroidImportance.HIGH,
          sound: CHANNEL_SOUND,
          vibration: true,
          vibrationPattern: ALARM_VIBRATION_PATTERN,
          visibility: AndroidVisibility.PUBLIC,
        })
        await notifee.createTriggerNotification(
          {
            id: NOTIF_ID[kind],
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
              // Ya cumplió: la cuenta siguiente no debe encontrarla ahí.
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
    fallbackIds[kind] = await scheduleRestEnd(Math.ceil((endAt - Date.now()) / 1000), title, body)
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'training_alarm', op: 'schedule', kind } })
  }
}

/** Quita el aviso programado (y el ya mostrado, si el usuario lo dejó ahí). */
export async function cancelTrainingAlarm(kind: TrainingAlarmKind): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      const notifee = await getNotifee()
      if (notifee) {
        await notifee.cancelTriggerNotification(NOTIF_ID[kind])
        await notifee.cancelNotification(NOTIF_ID[kind])
        return
      }
    }
    await cancelScheduled(fallbackIds[kind])
    fallbackIds[kind] = null
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'training_alarm', op: 'cancel', kind } })
  }
}

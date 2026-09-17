/**
 * Alarmas del entreno — las que suenan con la app fuera de pantalla.
 *
 * Desde el #775 la notificación en vivo del entreno ya no es foreground service
 * (Play rechazó el tipo `health` seis veces), así que con la app en segundo plano
 * Android congela o mata el proceso: los avisos de `training-cues` dejan de sonar
 * porque ya no hay JS que los toque. El aviso lo tiene que dar el sistema.
 *
 * En Android lo programa notifee con `SET_ALARM_CLOCK` (lo que usa un
 * despertador): exacta, exenta de Doze y SIN el límite de una cada ~9 min que
 * tienen las `*AndAllowWhileIdle` en reposo, que con dos descansos seguidos y el
 * móvil en el bolsillo se notaría. Precio: el iconito de alarma en la barra de
 * estado mientras dura la cuenta.
 *
 * OJO: `SET_ALARM_CLOCK` SÍ exige `SCHEDULE_EXACT_ALARM` desde Android 12 (una
 * versión anterior de este fichero decía lo contrario y estaba mal). El permiso
 * va en el manifiesto (lo declara notifee) pero en Android 14+ NO se concede al
 * instalar; sin él notifee no lanza: escribe «Missing SCHEDULE_EXACT_ALARM
 * permission. Trigger not scheduled.» en logcat y no programa nada. Por eso aquí
 * se comprueba ANTES, la pantalla de descanso pide el permiso
 * (`AlarmPermissionCard`) y mientras falta se programa un aviso de respaldo
 * inexacto con expo-notifications: llega tarde (minutos en Doze), pero llega.
 *
 * El sonido va por el stream de ALARMA, no por el de notificaciones: el aviso
 * antiguo (expo-audio con el FGS vivo) sonaba por el stream de medios, así que
 * sonaba con el móvil en vibración; una notificación normal no. Un temporizador
 * que el usuario acaba de arrancar debe sonar como un temporizador. Por eso el
 * canal lo crea expo-notifications (notifee no expone `audioAttributes`) y
 * notifee solo lo referencia: los canales son del sistema, no de la librería.
 *
 * En iOS basta la notificación local programada de expo-notifications: el sistema
 * la dispara igual con la app suspendida.
 *
 * Todo es best-effort: sin alarma la sesión sigue, solo se pierde el aviso.
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import { Sentry } from '@/lib/instrument'
import { cancelScheduled, scheduleRestEnd } from '@/lib/notifications'
import { ALARM_VIBRATION_PATTERN } from '@/lib/training-alarm-policy'
import type { AlarmPermissionState } from '@calistenia/core/lib/alarm-prompt'

/** Qué cuenta atrás avisa. Cada una con su id: nunca corren a la vez, pero una
 *  alarma huérfana de la otra no debe sonar encima. */
export type TrainingAlarmKind = 'rest' | 'timer'

const NOTIF_ID: Record<TrainingAlarmKind, string> = {
  rest: 'rest-end',
  timer: 'timer-end',
}

/**
 * Canal con sufijo de versión: Android congela sonido, vibración, importancia y
 * atributos de audio de un canal en cuanto se crea. Para cambiar cualquiera hay
 * que estrenar un id nuevo (ver el mismo patrón en `live-session.ts`).
 * v2 = stream de alarma (la v1 iba por el de notificaciones).
 */
export const CHANNEL_ID = 'training-end-v2'

/**
 * `rest_end.wav` es el fichero que el plugin de expo-notifications copia a
 * `res/raw` desde `assets/sounds/rest_end.wav` (declarado en `app.json` →
 * `sounds`); expo lo resuelve por el nombre sin extensión. Sin el fichero, expo
 * avisa por logcat y el canal cae al sonido por defecto del sistema. Con guion en
 * el nombre el plugin ni lo copiaría.
 */
const CHANNEL_SOUND = 'rest_end.wav'

/** Notificación de respaldo (iOS, Expo Go y Android sin permiso de alarma exacta). */
const fallbackIds: Record<TrainingAlarmKind, string | null> = { rest: null, timer: null }

/** Para no inundar Sentry: el permiso que falta se cuenta una vez por proceso. */
let missingPermissionReported = false

async function getNotifee() {
  try {
    // Lazy: notifee es módulo nativo; en Expo Go no existe.
    return (await import('@notifee/react-native')).default
  } catch {
    return null
  }
}

/**
 * ¿Puede la app programar alarmas exactas? Solo tiene sentido en Android con
 * notifee; en el resto es `unsupported` y nadie pregunta nada.
 */
export async function getAlarmPermissionState(): Promise<AlarmPermissionState> {
  if (Platform.OS !== 'android') return 'unsupported'
  const notifee = await getNotifee()
  if (!notifee) return 'unsupported'
  try {
    const { AndroidNotificationSetting } = await import('@notifee/react-native')
    const settings = await notifee.getNotificationSettings()
    switch (settings.android.alarm) {
      case AndroidNotificationSetting.ENABLED:
        return 'granted'
      case AndroidNotificationSetting.DISABLED:
        return 'missing'
      default:
        // NOT_SUPPORTED: Android < 12, donde la alarma exacta no pide permiso.
        return 'unsupported'
    }
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'training_alarm', op: 'permission_state' } })
    return 'unsupported'
  }
}

/** Abre la pantalla de Ajustes «Alarmas y recordatorios» de la app. */
export async function openAlarmPermissionSettings(): Promise<void> {
  const notifee = await getNotifee()
  try {
    await notifee?.openAlarmPermissionSettings()
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'training_alarm', op: 'open_settings' } })
  }
}

async function ensureAndroidChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Fin de la cuenta atrás',
    // HIGH para que salga en primer plano sobre lo que sea y suene aunque
    // HyperOS/MIUI esconda las silenciosas.
    importance: Notifications.AndroidImportance.HIGH,
    sound: CHANNEL_SOUND,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    vibrationPattern: ALARM_VIBRATION_PATTERN,
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
}

/**
 * Programa el aviso para `endAt`. Reprogramar con el mismo `kind` reemplaza.
 * Devuelve `true` si quedó algo programado (exacto o de respaldo).
 */
export async function scheduleTrainingAlarm(
  kind: TrainingAlarmKind,
  endAt: number,
  title: string,
  body: string,
): Promise<boolean> {
  try {
    let channelId: string | undefined
    if (Platform.OS === 'android') {
      const notifee = await getNotifee()
      if (notifee) {
        await ensureAndroidChannel()
        channelId = CHANNEL_ID
        const permission = await getAlarmPermissionState()
        if (permission !== 'missing') {
          const { AlarmType, AndroidCategory, AndroidImportance, AndroidVisibility, TriggerType } =
            await import('@notifee/react-native')
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
          return true
        }
        // Sin permiso: que quede rastro (antes esto era invisible, solo logcat)
        // y que al menos llegue el aviso inexacto de expo-notifications.
        Sentry.addBreadcrumb({
          category: 'training_alarm',
          level: 'warning',
          message: 'SCHEDULE_EXACT_ALARM ausente: aviso de respaldo inexacto',
          data: { kind },
        })
        if (!missingPermissionReported) {
          missingPermissionReported = true
          Sentry.captureMessage('training_alarm: sin permiso de alarma exacta', {
            level: 'info',
            tags: { feature: 'training_alarm', op: 'schedule', kind },
          })
        }
      }
    }
    // iOS, Expo Go y Android sin permiso.
    fallbackIds[kind] = await scheduleRestEnd(
      Math.ceil((endAt - Date.now()) / 1000),
      title,
      body,
      channelId,
    )
    return fallbackIds[kind] != null
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'training_alarm', op: 'schedule', kind } })
    return false
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
        // Sigue abajo: puede haber un respaldo de expo-notifications armado.
      }
    }
    await cancelScheduled(fallbackIds[kind])
    fallbackIds[kind] = null
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'training_alarm', op: 'cancel', kind } })
  }
}

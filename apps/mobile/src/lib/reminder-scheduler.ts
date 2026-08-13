/**
 * reminder-scheduler.ts
 *
 * Permisos y limpieza de los recordatorios de comidas / entrenamiento.
 *
 * ENTREGA = PUSH DEL SERVIDOR. Ya NO se programan notificaciones locales:
 * el envío lo decide `mcp-server/src/api/reminder-dispatcher.ts`, que sí puede
 * convertir a la zona horaria del usuario (el JSVM de PocketBase no tiene
 * `Intl`) y llega igual con la app cerrada o parada por el sistema —el caso
 * habitual en MIUI/HyperOS, donde un force-stop borra las alarmas locales de
 * `AlarmManager` y nada las volvía a programar.
 *
 * Lo que queda aquí:
 *  1. `ensureReminderPermission` / `getReminderPermission` — el push necesita
 *     el mismo permiso POST_NOTIFICATIONS que las notificaciones locales.
 *  2. `cancelLegacyLocalReminders` — cancela las notificaciones WEEKLY que
 *     dejaron programadas las versiones anteriores. Sin esto, quien actualice
 *     recibiría CADA recordatorio DOS veces (la local antigua + el push nuevo).
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import { Sentry } from '@/lib/instrument'

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export type ReminderPermStatus = 'granted' | 'denied' | 'undetermined'

// ─── Canal Android ───────────────────────────────────────────────────────────

/**
 * Los recordatorios llegan como push remoto, así que comparten el canal de
 * push (`push-registration.ts`). Se crea aquí también porque la pantalla de
 * recordatorios puede pedir permiso antes de que se registre el token.
 */
const PUSH_CHANNEL_ID = 'push-notifications'

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Notificaciones',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
  })
}

// ─── Permisos ────────────────────────────────────────────────────────────────

/** Consulta el estado actual del permiso sin solicitarlo. */
export async function getReminderPermission(): Promise<ReminderPermStatus> {
  try {
    const { granted, canAskAgain, status } = await Notifications.getPermissionsAsync()
    if (granted) return 'granted'
    if (!canAskAgain && status === 'denied') return 'denied'
    return 'undetermined'
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'reminders', op: 'get_permission' } })
    return 'undetermined'
  }
}

/**
 * Crea el canal Android (si aplica) y solicita permiso si aún no fue
 * concedido. Retorna true si el permiso queda concedido.
 *
 * El canal se crea SIEMPRE, incluso con el permiso ya concedido: antes solo se
 * creaba al pedir permiso, así que en la ruta habitual (permiso concedido al
 * hacer login para el push) el canal no existía nunca.
 */
export async function ensureReminderPermission(): Promise<boolean> {
  try {
    await ensureAndroidChannel()
    const current = await Notifications.getPermissionsAsync()
    if (current.granted) return true
    const res = await Notifications.requestPermissionsAsync()
    return res.granted
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'reminders', op: 'ensure_permission' } })
    return false
  }
}

// ─── Limpieza de la programación local antigua ───────────────────────────────

/**
 * Cancela las notificaciones locales `source === 'reminder'` que programaron
 * las versiones anteriores de la app.
 *
 * Idempotente y barato: si no hay ninguna, no hace nada. Se llama una vez al
 * arrancar (`app/_layout.tsx`) y al entrar en la pantalla de recordatorios,
 * porque un usuario puede actualizar con decenas de ellas ya programadas.
 *
 * @returns cuántas notificaciones se cancelaron.
 */
export async function cancelLegacyLocalReminders(): Promise<number> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    const legacy = scheduled.filter((n) => n.content.data?.source === 'reminder')
    if (legacy.length === 0) return 0

    await Promise.all(
      legacy.map((n) =>
        Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {
          /* best-effort: una cancelación fallida no debe frenar al resto */
        }),
      ),
    )
    return legacy.length
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'reminders', op: 'cancel_legacy' } })
    return 0
  }
}

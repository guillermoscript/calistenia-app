/**
 * push-registration.ts
 *
 * Registra el token de Expo Push Notifications y lo guarda en PocketBase
 * (colección `expo_push_tokens`). Diseñado para ejecutarse fire-and-forget:
 * nunca lanza excepciones hacia afuera.
 *
 * Prerequisitos instalados:
 *   - expo-notifications (~56.x)
 *   - expo-device (~56.x)
 *   - expo-constants (~56.x)
 */
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type PocketBase from 'pocketbase'

// Canal Android para notificaciones remotas (push).
// Usamos un id separado de 'reminders' y 'rest-timer' para que el usuario
// pueda gestionar los permisos de forma independiente.
const PUSH_CHANNEL_ID = 'push-notifications'

/**
 * Registra el dispositivo para notificaciones push de Expo y guarda el token
 * en la colección `expo_push_tokens` de PocketBase.
 *
 * @param pb      Instancia singleton de PocketBase (ya inicializada).
 * @param userId  ID del usuario autenticado.
 *
 * @returns El token registrado, o null si no se pudo obtener/guardar.
 */
export async function registerPushTokenAsync(
  pb: PocketBase,
  userId: string,
): Promise<string | null> {
  try {
    // ── 1. Guard: solo dispositivos físicos soportan push remoto ─────────────
    if (!Device.isDevice) {
      console.log('[push] Omitiendo registro: no es un dispositivo físico.')
      return null
    }

    // ── 2. Canal Android (idempotente) ────────────────────────────────────────
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
        name: 'Notificaciones',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
      })
    }

    // ── 3. Permisos ───────────────────────────────────────────────────────────
    const { granted: alreadyGranted } = await Notifications.getPermissionsAsync()
    if (!alreadyGranted) {
      const { granted } = await Notifications.requestPermissionsAsync()
      if (!granted) {
        console.log('[push] Permiso de notificaciones denegado; omitiendo registro.')
        return null
      }
    }

    // ── 4. Obtener token de Expo ──────────────────────────────────────────────
    // Lee el projectId desde expo.extra.eas.projectId en app.json.
    // En builds de EAS esto se inyecta automáticamente; en Expo Go puede
    // no estar presente → fallback a llamada sin parámetro (sandbox token).
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
    if (!projectId) {
      console.warn(
        '[push] expo.extra.eas.projectId no configurado en app.json. ' +
        'El token de push puede no funcionar en builds de producción sin projectId.',
      )
    }
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    const token = tokenData.data

    if (!token) {
      console.warn('[push] getExpoPushTokenAsync devolvió un token vacío.')
      return null
    }

    // ── 5. Upsert en PocketBase ───────────────────────────────────────────────
    // Si el token ya existe (mismo dispositivo/reinstalación), no duplicamos.
    try {
      const existing = await pb.collection('expo_push_tokens').getFirstListItem(
        `token = "${token}"`,
      )
      // Token ya registrado; verificar que pertenece a este usuario.
      if (existing.user !== userId) {
        // Raro (token reasignado a otro usuario): actualizar el propietario.
        await pb.collection('expo_push_tokens').update(existing.id, {
          user: userId,
          platform: Platform.OS,
        })
        console.log('[push] Token existente reasignado al usuario actual.')
      } else {
        console.log('[push] Token ya registrado para este usuario.')
      }
    } catch (notFound) {
      // getFirstListItem lanza si no hay resultados → crear nuevo registro.
      await pb.collection('expo_push_tokens').create({
        user: userId,
        token,
        platform: Platform.OS,
      })
      console.log('[push] Token registrado correctamente:', token)
    }

    return token
  } catch (err) {
    // Nunca bloquear el init de la app por un fallo de push registration.
    console.warn('[push] Error en registerPushTokenAsync:', err)
    return null
  }
}

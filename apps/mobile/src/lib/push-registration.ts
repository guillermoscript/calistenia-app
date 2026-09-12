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
import type { PushPermissionState } from '@calistenia/core/lib/push-prompt'

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
 * @param opts.requestPermission  Si es `false`, no dispara el diálogo del SO
 *   cuando el permiso aún no está concedido (`undetermined`): se limita a
 *   registrar el token si ya había permiso, y si no lo hay, no hace nada.
 *   Por defecto `true` (comportamiento histórico). Ver `#694`: el arranque ya
 *   no pide el permiso — el diálogo vive en la celebración post-entreno.
 *
 * @returns El token registrado, o null si no se pudo obtener/guardar.
 */
export async function registerPushTokenAsync(
  pb: PocketBase,
  userId: string,
  opts: { requestPermission?: boolean } = {},
): Promise<string | null> {
  const { requestPermission = true } = opts
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
      if (!requestPermission) {
        console.log('[push] Permiso aún no decidido y requestPermission=false; omitiendo registro (#694).')
        return null
      }
      const { granted } = await Notifications.requestPermissionsAsync()
      if (!granted) {
        console.log('[push] Permiso de notificaciones denegado; omitiendo registro.')
        return null
      }
    }

    // ── 4. Obtener token ──────────────────────────────────────────────────────
    // Android: token NATIVO de FCM (getDevicePushTokenAsync) — lo enviamos
    //          directo a FCM v1 desde el servidor (no pasa por Expo Push).
    //          Requiere google-services.json embebido en el build nativo.
    // iOS:     token de Expo Push (sigue usando el servicio de Expo).
    let token: string | null = null
    if (Platform.OS === 'android') {
      const deviceToken = await Notifications.getDevicePushTokenAsync()
      token = typeof deviceToken.data === 'string' ? deviceToken.data : null
      if (!token) {
        console.warn('[push] getDevicePushTokenAsync devolvió un token vacío (¿falta google-services.json?).')
        return null
      }
    } else {
      // Lee el projectId desde expo.extra.eas.projectId en app.json.
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
      if (!projectId) {
        console.warn(
          '[push] expo.extra.eas.projectId no configurado en app.json. ' +
          'El token de push de iOS puede no funcionar sin projectId.',
        )
      }
      const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
      token = tokenData.data
      if (!token) {
        console.warn('[push] getExpoPushTokenAsync devolvió un token vacío.')
        return null
      }
    }

    // ── 5. Upsert en PocketBase ───────────────────────────────────────────────
    // Si el token ya existe (mismo dispositivo/reinstalación), no duplicamos.
    //
    // OJO: esta búsqueda solo puede encontrar tokens PROPIOS — `expo_push_tokens`
    // es owner-only en `listRule`, así que el registro de otra cuenta no aparece
    // (0 filas, sin error). Cuando el dispositivo cambia de dueño caemos al
    // `create` de abajo a propósito: el hook `pb_hooks/push_token_takeover.pb.js`
    // lo intercepta, borra el registro del dueño anterior y deja que el alta siga
    // su curso. La reasignación NO se puede hacer desde aquí (ni la lectura ni el
    // update de un registro ajeno pasan las reglas), así que no muevas esa lógica
    // al cliente.
    try {
      const existing = await pb.collection('expo_push_tokens').getFirstListItem(
        pb.filter('token = {:token}', { token }),
      )
      // Solo llega aquí si el token ya era de este usuario.
      if (existing.user !== userId) {
        // Inalcanzable con la listRule actual; se deja como red de seguridad por
        // si algún día la colección se abre en lectura.
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

/**
 * Estado del permiso de notificaciones en el vocabulario común de
 * `@calistenia/core/lib/push-prompt` (#694). No dispara el diálogo del SO:
 * solo lee el estado actual con `getPermissionsAsync()`.
 */
export async function getPushPermissionState(): Promise<PushPermissionState> {
  try {
    if (!Device.isDevice) return 'unsupported'
    const { status, granted, canAskAgain } = await Notifications.getPermissionsAsync()
    if (granted) return 'granted'
    if (status === 'undetermined' || (!granted && canAskAgain)) return 'undetermined'
    return 'denied'
  } catch {
    return 'unsupported'
  }
}

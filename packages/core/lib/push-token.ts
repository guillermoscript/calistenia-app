/**
 * Alta y baja del token de push en PocketBase — el «buscar y, si no está,
 * crear» que web (`push_subscriptions`) y móvil (`expo_push_tokens`) repetían.
 *
 * Cada app sigue adquiriendo el token con su API (permiso + `pushManager` en
 * web, expo-notifications en móvil); aquí solo se persiste.
 */

import { pb } from './pocketbase'

export type PushTokenCollection = 'push_subscriptions' | 'expo_push_tokens'

/** Cómo se localiza el registro de un token en cada colección. */
function lookupFilter(collection: PushTokenCollection, token: string, userId: string): string {
  return collection === 'push_subscriptions'
    // Web Push: `token` es el endpoint de la suscripción, que va dentro de un JSON.
    ? pb.filter('user = {:uid} && subscription.endpoint = {:ep}', { uid: userId, ep: token })
    // Expo: el token es único por dispositivo, sea cual sea el usuario.
    : pb.filter('token = {:token}', { token })
}

export type UpsertPushTokenResult = 'exists' | 'created' | 'reassigned'

/**
 * Registra el token si no estaba.
 *
 * `meta` son los campos propios de cada colección que se escriben en el alta
 * (`subscription` + `user_agent` en web; `platform` en móvil).
 *
 * OJO con `expo_push_tokens`: es owner-only en `listRule`, así que la búsqueda
 * solo encuentra tokens PROPIOS (el de otra cuenta da 0 filas, sin error).
 * Cuando el dispositivo cambia de dueño se cae al `create` a propósito: el hook
 * `pb_hooks/push_token_takeover.pb.js` lo intercepta, borra el registro del
 * dueño anterior y deja seguir el alta. La reasignación NO se puede hacer
 * desde el cliente, así que no muevas esa lógica aquí. La rama `reassigned`
 * es una red de seguridad por si algún día la colección se abre en lectura.
 *
 * Cualquier fallo de la búsqueda se trata como «no está» (comportamiento
 * histórico de las dos apps): lo que importa es que el alta se intente.
 */
export async function upsertPushToken(
  collection: PushTokenCollection,
  token: string,
  userId: string,
  meta: Record<string, unknown> = {},
): Promise<UpsertPushTokenResult> {
  try {
    const existing = await pb.collection(collection).getFirstListItem(
      lookupFilter(collection, token, userId),
      { requestKey: null },
    )
    if (existing.user !== userId) {
      await pb.collection(collection).update(existing.id, { user: userId, ...meta })
      return 'reassigned'
    }
    return 'exists'
  } catch {
    const body: Record<string, unknown> = collection === 'push_subscriptions'
      ? { user: userId, ...meta }
      : { user: userId, token, ...meta }
    await pb.collection(collection).create(body)
    return 'created'
  }
}

/** Borra el registro del token de este usuario, si existe. Nunca lanza. */
export async function removePushToken(
  collection: PushTokenCollection,
  token: string,
  userId: string,
): Promise<void> {
  try {
    const rec = await pb.collection(collection).getFirstListItem(
      lookupFilter(collection, token, userId),
      { requestKey: null },
    )
    await pb.collection(collection).delete(rec.id)
  } catch { /* no estaba o ya borrado */ }
}

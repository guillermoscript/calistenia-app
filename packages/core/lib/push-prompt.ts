/**
 * Cuándo pedir el permiso de notificaciones (#694).
 *
 * Antes, móvil lo pedía nada más iniciar sesión (`init-core.ts` →
 * `registerPushTokenAsync`) y web no lo pedía nunca salvo al guardar un
 * recordatorio. El mejor momento es el panel de celebración del primer
 * entreno: el usuario acaba de conseguir algo y el aviso tiene un porqué.
 *
 * Regla: se ofrece una sola vez por usuario y dispositivo, y solo si el
 * sistema aún no ha decidido (ni concedido ni denegado). Cualquier respuesta
 * —aceptar, rechazar o cerrar la tarjeta— la marca como vista.
 *
 * Sin React ni APIs de plataforma: quien llama traduce el estado del permiso
 * (`Notification.permission` en web, `getPermissionsAsync()` en Expo) al
 * vocabulario común de aquí.
 */
import { storage } from '../platform'
import { op } from './analytics'

/** `undetermined` = el sistema aún no preguntó (web `default`, Expo `undetermined`). */
export type PushPermissionState = 'undetermined' | 'granted' | 'denied' | 'unsupported'

export type PushPromptResult = 'granted' | 'denied' | 'dismissed'

/** Por usuario y dispositivo: la decisión del SO también lo es. */
export const pushPromptSeenKey = (userId: string): string =>
  `calistenia_push_prompt_seen_${userId}`

export function isPushPromptSeen(userId: string | null | undefined): boolean {
  if (!userId) return true
  return storage.getItem(pushPromptSeenKey(userId)) === 'true'
}

export function markPushPromptSeen(userId: string): void {
  storage.setItem(pushPromptSeenKey(userId), 'true')
}

export interface PushPromptInput {
  userId: string | null | undefined
  permission: PushPermissionState
}

/**
 * `true` cuando la tarjeta de permiso debe aparecer en el panel post-entreno.
 * No mira el número de sesiones a propósito: quien ya entrenaba antes de este
 * cambio también merece UNA oferta, en su siguiente celebración.
 */
export function shouldShowPushPrompt(i: PushPromptInput): boolean {
  if (!i.userId) return false
  if (i.permission !== 'undetermined') return false
  return !isPushPromptSeen(i.userId)
}

const SURFACE = 'post_workout'

export function trackPushPromptViewed(props: { workoutKey: string; totalSessions: number }): void {
  op.track('push_prompt_viewed', {
    surface: SURFACE,
    workout_key: props.workoutKey,
    total_sessions: props.totalSessions,
    is_first_workout: props.totalSessions <= 1,
  })
}

export function trackPushPromptAnswered(props: { result: PushPromptResult; workoutKey: string }): void {
  op.track('push_prompt_answered', {
    surface: SURFACE,
    result: props.result,
    workout_key: props.workoutKey,
  })
}

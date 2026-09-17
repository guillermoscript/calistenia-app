/**
 * Cuándo pedir el permiso de alarmas exactas de Android (PR #778).
 *
 * Sin foreground service (Play lo rechazó seis veces) el aviso de fin de
 * descanso con la pantalla apagada lo da una alarma del sistema, y en Android
 * 14+ la alarma exacta necesita `SCHEDULE_EXACT_ALARM`, que ya no se concede al
 * instalar: hay que mandar al usuario a Ajustes. Sin permiso hay un aviso de
 * respaldo inexacto, que llega tarde; por eso se le pide en el sitio donde le
 * afecta —la pantalla de descanso— y no al arrancar la app.
 *
 * Regla: la tarjeta se enseña mientras falte el permiso; «Ahora no» la calla
 * durante `ALARM_PROMPT_SNOOZE_MS` (por dispositivo: el permiso también lo es).
 * Concederlo la quita sola, porque el estado se relee al volver de Ajustes.
 *
 * Sin React ni APIs de plataforma: quien llama traduce lo que devuelve notifee
 * (`getNotificationSettings().android.alarm`) al vocabulario de aquí.
 */
import { storage } from '../platform'
import { op } from './analytics'

/**
 * `unsupported` = no aplica (iOS, Android < 12, Expo Go): ahí nunca se pregunta.
 */
export type AlarmPermissionState = 'granted' | 'missing' | 'unsupported'

export type AlarmPromptResult = 'opened_settings' | 'dismissed'

/** Cuánto callar la tarjeta tras «Ahora no». */
export const ALARM_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

/** Por dispositivo, no por usuario: el permiso es del sistema. */
export const ALARM_PROMPT_DISMISSED_AT_KEY = 'calistenia_alarm_prompt_dismissed_at'

export function getAlarmPromptDismissedAt(): number | null {
  const raw = storage.getItem(ALARM_PROMPT_DISMISSED_AT_KEY)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function markAlarmPromptDismissed(now: number = Date.now()): void {
  storage.setItem(ALARM_PROMPT_DISMISSED_AT_KEY, String(now))
}

export interface AlarmPromptInput {
  permission: AlarmPermissionState
  /** Última vez que el usuario pulsó «Ahora no»; `null` si nunca. */
  dismissedAt: number | null
  now: number
}

/** `true` cuando la tarjeta debe verse en la pantalla de descanso. */
export function shouldShowAlarmPrompt(i: AlarmPromptInput): boolean {
  if (i.permission !== 'missing') return false
  if (i.dismissedAt == null) return true
  // Un `dismissedAt` en el futuro (reloj cambiado) no debe callarla para siempre.
  if (i.dismissedAt > i.now) return true
  return i.now - i.dismissedAt >= ALARM_PROMPT_SNOOZE_MS
}

const SURFACE = 'rest_screen'

export function trackAlarmPromptViewed(): void {
  op.track('alarm_prompt_viewed', { surface: SURFACE })
}

export function trackAlarmPromptAnswered(props: { result: AlarmPromptResult }): void {
  op.track('alarm_prompt_answered', { surface: SURFACE, result: props.result })
}

/** Al volver de Ajustes: qué acabó pasando con el permiso. */
export function trackAlarmPermissionResolved(props: { granted: boolean }): void {
  op.track('alarm_permission_resolved', { surface: SURFACE, granted: props.granted })
}

/**
 * Cuándo armar el aviso de fin de descanso del sistema.
 *
 * Hay dos avisos posibles y solo puede sonar UNO: el «vamos» que toca la app
 * (`training-cues`, solo suena si el JS está vivo y en pantalla) y la alarma del
 * sistema (suena siempre, también con el proceso congelado). La regla es simple:
 * la alarma se arma únicamente mientras la app NO está en primer plano.
 *
 * Función pura a propósito — es la única parte testeable de `rest-alarm.ts`, que
 * es todo plataforma (notifee, expo-notifications).
 */

/** Por debajo de esto no merece la pena armar nada: el descanso ya se acabó. */
export const MIN_ARM_MS = 1_000

/**
 * Margen para NO cancelar al desmontar. Si la alarma vence dentro de este margen
 * es que el descanso terminó de verdad: cancelarla sería una carrera con el
 * sistema y, con la app en segundo plano, es lo único que suena.
 */
export const CANCEL_GRACE_MS = 2_000

export type RestAlarmAction = 'arm' | 'disarm' | 'none'

/**
 * @param appActive  ¿está la app en primer plano? (AppState === 'active')
 * @param msLeft     milisegundos que quedan de descanso
 * @param armed      ¿hay ya una alarma programada?
 */
export function restAlarmAction(appActive: boolean, msLeft: number, armed: boolean): RestAlarmAction {
  if (appActive) return armed ? 'disarm' : 'none'
  if (msLeft < MIN_ARM_MS) return 'none'
  return armed ? 'none' : 'arm'
}

/**
 * Al salir del descanso (saltar a mano, cerrar la sesión, cambiar de pantalla).
 * Solo se cancela si de verdad queda descanso por delante.
 */
export function shouldCancelOnLeave(msLeft: number): boolean {
  return msLeft > CANCEL_GRACE_MS
}

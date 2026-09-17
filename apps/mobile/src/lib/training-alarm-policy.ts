/**
 * Cuándo armar la alarma del sistema de un cronómetro del entreno (el fin del
 * descanso y el fin de un ejercicio por tiempo).
 *
 * Hay dos avisos posibles y solo puede sonar UNO: el que toca la app
 * (`training-cues`, que solo suena si el JS está vivo y en pantalla) y la alarma
 * del sistema (suena siempre, también con el proceso congelado). La regla es
 * simple: la alarma se arma únicamente mientras la app NO está en primer plano.
 *
 * Función pura a propósito — es la única parte testeable de `training-alarm.ts`,
 * que es todo plataforma (notifee, expo-notifications).
 */

/** Por debajo de esto no merece la pena armar nada: la cuenta ya se acabó. */
export const MIN_ARM_MS = 1_000

/**
 * Margen para NO cancelar al salir. Si la alarma vence dentro de este margen es
 * que la cuenta terminó de verdad: cancelarla sería una carrera con el sistema y,
 * con la app en segundo plano, es lo único que suena.
 */
export const CANCEL_GRACE_MS = 2_000

/**
 * Vibración del canal de la alarma: [pausa, vibra, pausa, vibra] en ms.
 *
 * notifee exige un número PAR de valores y todos POSITIVOS. El `0` inicial que
 * acepta Android le vale a notifee como error: `createChannel` lanza, la alarma no
 * se programa y el aviso no suena nunca (CALISTENIA-APP-16). Por eso empieza en 1
 * y hay un test que lo vigila.
 */
export const ALARM_VIBRATION_PATTERN = [1, 300, 150, 300]

export type TrainingAlarmAction = 'arm' | 'disarm' | 'none'

/**
 * @param appActive  ¿está la app en primer plano? (AppState === 'active')
 * @param endAt      fin de la cuenta; `null` si no hay cuenta en marcha (crono
 *                   parado, en pausa o sin arrancar)
 * @param now        ahora
 * @param armedFor   el `endAt` con el que está armada la alarma; `null` si no lo está
 *
 * `arm` también es la respuesta cuando hay que REARMAR (ajustar el descanso,
 * reanudar el crono): programar con el mismo id reemplaza a la anterior.
 */
export function trainingAlarmAction(
  appActive: boolean,
  endAt: number | null,
  now: number,
  armedFor: number | null,
): TrainingAlarmAction {
  // Delante siempre se desarma: el JS está vivo, así que el aviso lo toca la app.
  if (appActive) return armedFor == null ? 'none' : 'disarm'
  // Detrás, a una alarma que está venciendo NO se la toca: es la que tiene que
  // sonar. Justo aquí es donde se perdía el aviso — la cuenta llega a cero, la
  // pantalla se desmonta o el `endAt` se vuelve null, y la cancelábamos en el
  // mismo instante en que el sistema iba a dispararla.
  if (armedFor != null && !shouldCancelOnLeave(armedFor - now)) return 'none'
  if (endAt == null) return armedFor == null ? 'none' : 'disarm'
  // Ya no da tiempo a armar nada nuevo.
  if (endAt - now < MIN_ARM_MS) return 'none'
  return armedFor === endAt ? 'none' : 'arm'
}

/**
 * Al salir de la pantalla (saltar a mano, parar el crono, cerrar la sesión).
 * Solo se cancela si de verdad queda cuenta por delante.
 */
export function shouldCancelOnLeave(msLeft: number): boolean {
  return msLeft > CANCEL_GRACE_MS
}

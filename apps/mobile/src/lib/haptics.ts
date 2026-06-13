/**
 * Vocabulario háptico de la app — semántico, no por intensidad, para que cada
 * feature use el mismo lenguaje físico. Todos son fire-and-forget y nunca
 * lanzan (en dispositivos sin vibrador simplemente no pasa nada).
 *
 * Criterio: háptica solo donde confirma algo que el usuario no está mirando
 * (countdown, splits de km, fin de descanso) o sella una acción importante
 * (empezar/terminar sesión). Nunca en navegación ni scroll.
 */
import * as Haptics from 'expo-haptics'

export const haptics = {
  /** Tick sutil — cuenta atrás 3-2-1, eventos menores repetitivos */
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  /** Acción principal confirmada — empezar/pausar/reanudar sesión */
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  /** Momento fuerte — GO de carrera, cruzar la meta */
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  /** Cambio de opción en selectores/chips (actividad, modo, radio) */
  selection: () => Haptics.selectionAsync().catch(() => {}),
  /** Algo se completó bien — split de km, sesión guardada, PR */
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  /** Atención — quedan 10s de descanso, sesión en cola sin subir */
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  /** Falló algo que el usuario pidió — permiso denegado, crear carrera */
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
}

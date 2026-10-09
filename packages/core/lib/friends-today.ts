/**
 * «Amigos que han entrenado hoy» (#855): cotas de fecha para leer las views
 * `public_*` sin equivocarse de día.
 *
 * Los campos NO comparten convención:
 * - `public_sessions.completed_at` es hora de PARED local guardada tal cual
 *   (ver `streakDayOf`): se compara con `"<hoy> 00:00:00"`, SIN pasar por UTC.
 *   Con la medianoche en UTC, quien está al oeste de Greenwich perdía las
 *   sesiones de las primeras horas del día y quien está al este arrastraba las
 *   de las últimas horas de ayer.
 * - `public_circuit_sessions.started_at` y `public_cardio_sessions.started_at`
 *   son UTC reales: ahí sí vale la medianoche local convertida a UTC.
 */
import { localMidnightAsUTC } from './dateUtils'

export interface FriendsTodayBounds {
  /** Para `public_sessions.completed_at` (hora de pared). */
  wall: string
  /** Para los `started_at` de circuito y cardio (UTC). */
  utc: string
}

export function friendsTodayBounds(today: string): FriendsTodayBounds {
  return { wall: `${today} 00:00:00`, utc: localMidnightAsUTC(today) }
}

/**
 * Hitos de racha: qué días se celebran y cuál toca celebrar ahora. CÓDIGO PURO.
 *
 * Lo que NO vive aquí es dónde se apunta que un hito ya se enseñó, porque las
 * dos apps lo guardan de forma incompatible y migrarlo no es un refactor: web
 * usa una clave de localStorage por hito (`..._30_<userId>` = 'true') y móvil
 * un array JSON por usuario en AsyncStorage. Cada app conserva su persistencia
 * y le pasa a `pickActiveMilestone` un predicado de "¿ya se enseñó?" (#468).
 */

import { WEEKLY_STREAK_MILESTONES } from './weeklyStreak'

/**
 * SEMANAS de racha que se celebran, de menor a mayor: 4, 8, 12, 26 y 52. La
 * racha es semanal desde #801; mismos hitos que el push del servidor
 * (`pb_hooks/utils/notifications.js`). No coinciden con ningún hito viejo en
 * días (7, 14, 30, 60, 100), así que las marcas de "ya enseñado" guardadas
 * antes del cambio no tapan ninguno nuevo.
 */
export const STREAK_MILESTONES = WEEKLY_STREAK_MILESTONES

/**
 * El hito más alto ya alcanzado que todavía no se ha enseñado, o null.
 *
 * Se recorre de mayor a menor a propósito: quien vuelve tras meses sin abrir
 * la app ve el hito de 26 semanas, no el de 4 seguido del de 8. `isShown` se
 * consulta en ese mismo orden y se corta en el primero que sirve, así que una
 * implementación que lea de disco no paga por los hitos que no mira.
 */
export function pickActiveMilestone(
  streak: number,
  isShown: (milestone: number) => boolean,
  milestones: readonly number[] = STREAK_MILESTONES,
): number | null {
  return [...milestones].reverse().find((m) => streak >= m && !isShown(m)) ?? null
}

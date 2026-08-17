/**
 * Hitos de racha: qué días se celebran y cuál toca celebrar ahora. CÓDIGO PURO.
 *
 * Lo que NO vive aquí es dónde se apunta que un hito ya se enseñó, porque las
 * dos apps lo guardan de forma incompatible y migrarlo no es un refactor: web
 * usa una clave de localStorage por hito (`..._30_<userId>` = 'true') y móvil
 * un array JSON por usuario en AsyncStorage. Cada app conserva su persistencia
 * y le pasa a `pickActiveMilestone` un predicado de "¿ya se enseñó?" (#468).
 */

/** Días de racha que se celebran, de menor a mayor. */
export const STREAK_MILESTONES = [7, 14, 30, 60, 100] as const

/**
 * El hito más alto ya alcanzado que todavía no se ha enseñado, o null.
 *
 * Se recorre de mayor a menor a propósito: quien vuelve tras semanas sin abrir
 * la app ve el hito de 100 días, no el de 7 seguido del de 14. `isShown` se
 * consulta en ese mismo orden y se corta en el primero que sirve, así que una
 * implementación que lea de disco no paga por los hitos que no mira.
 */
export function pickActiveMilestone(
  streak: number,
  isShown: (milestone: number) => boolean,
): number | null {
  return [...STREAK_MILESTONES].reverse().find((m) => streak >= m && !isShown(m)) ?? null
}

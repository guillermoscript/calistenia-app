/**
 * Helpers puros de bloqueo de usuarios. El enforcement principal son las
 * reglas API de PocketBase; esto cubre las superficies donde las reglas no
 * llegan (búsqueda de usuarios, que lee `users` sin cláusula de bloqueo).
 */

/** Excluye de `users` los ids presentes en `blockedIds`. */
export function excludeBlocked<T extends { id: string }>(
  users: T[],
  blockedIds: Set<string>,
): T[] {
  if (blockedIds.size === 0) return users
  return users.filter(u => !blockedIds.has(u.id))
}

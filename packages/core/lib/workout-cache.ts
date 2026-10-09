import type { QueryClient } from '@tanstack/react-query'
import { qk } from './query-keys'

/**
 * Invalida lo que depende de los entrenos terminados, tras un create (o un
 * delete) que YA llegó al servidor.
 *
 * Antes cada sitio invalidaba lo suyo (el cardio dos claves, el circuito ninguna,
 * la fuerza ninguna) y `lifetimeSessions` no se invalidaba en ningún lado: la
 * etapa «cuenta» de Home iba un entreno por detrás hasta que expiraba el stale.
 *
 * `sessions` (el ProgressMap) solo es seguro invalidarlo DESPUÉS de que el
 * servidor tiene la fila: antes, el refetch se llevaba por delante el entreno
 * optimista (la fila no está en el servidor ni en la cola offline mientras el
 * create sigue esperando). Si la escritura quedó encolada NO se debe llamar:
 * el overlay de la cola y `setupAutoSync` ya la reconcilian.
 *
 * Con la caché de sesiones se invalida por prefijo `['sessions', uid]` (todas las
 * variantes de programa), porque el programa activo puede haber cambiado desde
 * que se montó el hook.
 */
export function invalidateAfterWorkout(
  qc: QueryClient,
  userId: string | null,
  opts: { cardio?: boolean } = {},
): void {
  if (!userId) return
  const sessionsRoot = qk.sessions(userId, null).slice(0, 2)
  void qc.invalidateQueries({ queryKey: sessionsRoot })
  void qc.invalidateQueries({ queryKey: qk.lifetimeSessions(userId) })
  void qc.invalidateQueries({ queryKey: qk.accountSessions(userId) })
  void qc.invalidateQueries({ queryKey: qk.streakDays(userId) })
  if (opts.cardio) void qc.invalidateQueries({ queryKey: qk.cardioSessions(userId) })
}

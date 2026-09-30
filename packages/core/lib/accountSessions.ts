/**
 * Total de entrenos de la CUENTA (#869): sesiones, no días. Suma las filas del
 * usuario en `sessions`, `circuit_sessions` y `cardio_sessions`, de todos los
 * programas y también las libres.
 *
 * No sirve `getTotalSessions()` (claves `done_` del `ProgressMap`, solo el
 * programa activo) ni `user_stats.total_sessions` (contador
 * `+ 1` del servidor: nunca baja al borrar una sesión y solo existe si la fila
 * de `user_stats` está al día). Se cuenta con `totalItems` de un `getList(1, 1)`
 * por colección: sin traer filas.
 */
export const ACCOUNT_SESSION_COLLECTIONS = ['sessions', 'circuit_sessions', 'cardio_sessions'] as const

/** Lo mínimo que se usa de PocketBase; deja probar sin red. */
export interface CountClient {
  filter: (raw: string, params: Record<string, unknown>) => string
  collection: (name: string) => {
    getList: (
      page: number,
      perPage: number,
      opts: { filter: string; fields: string; $autoCancel: boolean },
    ) => Promise<{ totalItems: number }>
  }
}

export async function countAccountSessions(client: CountClient, userId: string): Promise<number> {
  const filter = client.filter('user = {:uid}', { uid: userId })
  const counts = await Promise.all(
    ACCOUNT_SESSION_COLLECTIONS.map(name =>
      client.collection(name)
        .getList(1, 1, { filter, fields: 'id', $autoCancel: false })
        .then(r => r.totalItems),
    ),
  )
  return counts.reduce((sum, n) => sum + n, 0)
}

import { isAutoCancelError } from './pocketbase-errors'

/** Lo mínimo que se usa de PocketBase; deja probar sin red. */
export interface SettingsClient {
  filter: (raw: string, params: Record<string, unknown>) => string
  collection: (name: string) => {
    getList: (page: number, perPage: number, opts: Record<string, unknown>) => Promise<{ items: Array<{ id: string }> }>
    update: (id: string, data: Record<string, unknown>, opts: Record<string, unknown>) => Promise<unknown>
    create: (data: Record<string, unknown>, opts: Record<string, unknown>) => Promise<unknown>
  }
}

const NO_CANCEL = { $autoCancel: false } as const

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 404
}

/**
 * Guarda la fila `settings` del usuario (#881): actualiza la existente o crea
 * una si no hay ninguna.
 *
 * Ninguna petición se auto-cancela: dos guardados seguidos (objetivo + registro
 * semanal) comparten método y ruta, y el SDK abortaba el primero. Una
 * cancelación (`isAbort`, `status: 0`) NUNCA significa «no existe»: antes caía
 * en un `create` que daba 400 porque la fila ya estaba. Solo un 404 al
 * actualizar (la fila se borró) cae en crear.
 */
export async function saveSettingsRecord(
  client: SettingsClient,
  userId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const settings = client.collection('settings')
  try {
    const existing = await settings.getList(1, 1, {
      filter: client.filter('user = {:uid}', { uid: userId }), ...NO_CANCEL,
    })
    if (existing.items.length > 0) {
      try {
        await settings.update(existing.items[0].id, data, NO_CANCEL)
        return
      } catch (e) {
        if (!isNotFound(e)) throw e
      }
    }
    await settings.create({ user: userId, ...data }, NO_CANCEL)
  } catch (e) {
    if (isAutoCancelError(e)) return
    throw e
  }
}

const queues = new Map<string, Promise<void>>()

/** Encadena los guardados del mismo usuario para que lleguen en orden. */
export function saveSettingsSerial(
  client: SettingsClient,
  userId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const prev = queues.get(userId) ?? Promise.resolve()
  const next = prev.catch(() => {}).then(() => saveSettingsRecord(client, userId, data))
  queues.set(userId, next)
  return next.finally(() => { if (queues.get(userId) === next) queues.delete(userId) })
}

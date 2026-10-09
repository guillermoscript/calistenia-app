/**
 * Unirse a un reto. Vive aparte de `challenges.ts` para que ese fichero siga
 * siendo puro (sin PocketBase) y testeable sin `initCore()`.
 */
import { pb } from './pocketbase'

/**
 * Garantiza la fila de participante (`challenge_participants`) de `userId`.
 *
 * Un create duplicado es benigno —el índice único (challenge, user) responde
 * 400 si otra pestaña/dispositivo ganó la carrera—, pero solo se ignora si la
 * fila existe de verdad: tragarse el error a ciegas deja al usuario «unido» a
 * un reto en el que no participa y sin progreso posible. Si el create falla y
 * la fila no existe, LANZA el error original.
 *
 * `requestKey: null`: estas altas comparten ruta y sin él el SDK auto-cancelaba
 * todas menos la última (#536). Cada superficie sigue emitiendo su propio
 * analytics en el sitio de la llamada.
 */
export async function joinChallenge(challengeId: string, userId: string): Promise<void> {
  try {
    await pb.collection('challenge_participants').create(
      { challenge: challengeId, user: userId },
      { requestKey: null },
    )
  } catch (error) {
    const existing = await pb.collection('challenge_participants').getList(1, 1, {
      filter: pb.filter('challenge = {:cid} && user = {:uid}', { cid: challengeId, uid: userId }),
      $autoCancel: false,
    }).catch(() => null)
    if (!existing?.totalItems) throw error
  }
}

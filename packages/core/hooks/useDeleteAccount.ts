/**
 * Baja de cuenta (issue #300) — misma operación en web y móvil.
 *
 * Borra el registro en PocketBase (el resto cascadea) y deja el dispositivo
 * como si nunca se hubiera iniciado sesión: token, caché de queries y claves de
 * localStorage por usuario. Ese barrido no es cosmético — sin él, en un
 * navegador o teléfono compartido, los datos de nutrición, progreso o social de
 * la cuenta recién borrada seguirían legibles en local.
 */
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { pb, logout } from '../lib/pocketbase'
import { clearUserStorage } from '../lib/storage-keys'
import { op } from '../lib/analytics'

/**
 * Borra el registro del usuario; todo lo demás cae por cascada en el servidor
 * (`users.deleteRule` es `id = @request.auth.id`, y las 7 relaciones que no
 * cascadeaban se arreglaron en `1782600000_cascade_delete_user_relations.js`,
 * sin las cuales PocketBase respondía 400).
 *
 * Un 404 se trata como éxito: el registro ya no está, que es justo lo que se
 * pedía (reintento tras un timeout, o dos pestañas a la vez). Cualquier otro
 * error se propaga para que la UI lo muestre en vez de fingir la baja.
 */
export async function deleteAccountRecord(userId: string): Promise<void> {
  try {
    await pb.collection('users').delete(userId)
  } catch (err) {
    if ((err as { status?: number })?.status !== 404) throw err
  }
}

export interface UseDeleteAccountReturn {
  /** Borra la cuenta autenticada. Lanza si el servidor la rechaza. */
  deleteAccount: () => Promise<void>
  deleting: boolean
}

export function useDeleteAccount(): UseDeleteAccountReturn {
  const qc = useQueryClient()
  const [deleting, setDeleting] = useState(false)

  const deleteAccount = useCallback(async () => {
    // Se captura el id ANTES de borrar: después el authStore queda vacío.
    const userId = pb.authStore.record?.id ?? (pb.authStore as { model?: { id?: string } }).model?.id
    if (!userId) throw new Error('[account] no hay sesión que borrar')

    setDeleting(true)
    try {
      await deleteAccountRecord(userId)
      op.track('account_deleted')
      // Mismo barrido que signOut() en useAuth, y por los mismos motivos.
      op.clear()
      logout()
      qc.clear()
      clearUserStorage(userId)
    } finally {
      setDeleting(false)
    }
  }, [qc])

  return { deleteAccount, deleting }
}

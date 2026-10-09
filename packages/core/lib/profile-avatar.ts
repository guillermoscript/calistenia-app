/**
 * Subir o borrar la foto de perfil — el I/O que web y móvil repetían.
 *
 * Cada app resuelve lo suyo antes (el `<input type=file>` en web; picker,
 * permisos y `uriToBlob` en móvil) y aquí llega un `Blob` ya validado.
 */

import type { RecordModel } from 'pocketbase'
import { pb } from './pocketbase'

async function persistAvatar(userId: string, body: FormData | { avatar: null }): Promise<RecordModel> {
  const updated = await pb.collection('users').update(userId, body)
  // Sin esto la foto solo se vería tras cerrar sesión: el resto de la app lee
  // al usuario del authStore, no de una query.
  await pb.collection('users').authRefresh()
  return updated
}

/**
 * Sube `file` como avatar y sincroniza el authStore. Devuelve el registro
 * actualizado (para sacar la URL con `getUserAvatarUrl`).
 *
 * `fileName` es obligatorio si `file` es un `Blob` nativo sin `.name` (React
 * Native): PocketBase valida el formato por extensión.
 */
export function uploadAvatar(userId: string, file: Blob, fileName?: string): Promise<RecordModel> {
  const form = new FormData()
  if (fileName) form.append('avatar', file, fileName)
  else form.append('avatar', file)
  return persistAvatar(userId, form)
}

/** Borra el avatar: `null` vacía el campo de archivo (convención de PocketBase). */
export function removeAvatar(userId: string): Promise<RecordModel> {
  return persistAvatar(userId, { avatar: null })
}

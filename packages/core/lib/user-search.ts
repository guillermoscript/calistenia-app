/**
 * Búsqueda de usuarios por nombre — la parte que no depende de React.
 *
 * Antes la web se bajaba TODA la colección `users` con `getFullList` y filtraba
 * en cliente (cada usuario nuevo la hacía más pesada), y el móvil hacía una
 * consulta acotada en servidor. Gana la del móvil: un máximo de
 * `USER_SEARCH_LIMIT` filas por pulsación.
 */

import type { RecordModel } from 'pocketbase'
import { pb, getUserAvatarUrl } from './pocketbase'
import { authorDisplayName, type AuthorLike } from './author-name'

export const USER_SEARCH_LIMIT = 20

export interface UserSearchResult {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

/**
 * Construye el filtro PocketBase para buscar usuarios por nombre.
 *
 * Los campos DEBEN existir en la colección `users` o PocketBase rechaza la
 * query entera con un 400 y la pantalla se queda en "Error al buscar" (#408:
 * el filtro usaba `username`, que no existe, así que la búsqueda no funcionó
 * nunca desde #185).
 *
 * `email` se deja fuera a propósito: funciona, pero permitiría comprobar si una
 * dirección está registrada buscando trozos de ella.
 */
export function buildUserSearchFilter(q: string): {
  raw: string
  params: { q: string }
} {
  return { raw: 'display_name ~ {:q} || name ~ {:q}', params: { q } }
}

/** Registros de `users` → resultados de búsqueda, sin el propio usuario. */
export function mapUserSearchItems(
  items: RecordModel[],
  excludeUserId: string,
): UserSearchResult[] {
  return items
    .filter(u => u.id !== excludeUserId)
    .map(u => ({
      id: u.id,
      displayName: authorDisplayName(u as AuthorLike) || '?',
      username: u.username || '',
      avatarUrl: getUserAvatarUrl(u, '100x100'),
    }))
}

/** Una consulta acotada en servidor (máx. `USER_SEARCH_LIMIT`). */
export async function searchUsers(term: string, excludeUserId: string): Promise<UserSearchResult[]> {
  const { raw, params } = buildUserSearchFilter(term)
  const res = await pb.collection('users').getList(1, USER_SEARCH_LIMIT, {
    filter: pb.filter(raw, params),
    // Clave propia: la búsqueda cancela la anterior sin pisar otras lecturas de `users` (#565).
    requestKey: 'friends-user-search',
  })
  return mapUserSearchItems(res.items, excludeUserId)
}

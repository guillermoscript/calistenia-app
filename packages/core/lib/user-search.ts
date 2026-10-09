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
import { buildUserSearchFilter } from './user-search-filter'
import { authorDisplayName, type AuthorLike } from './author-name'

export const USER_SEARCH_LIMIT = 20

export interface UserSearchResult {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
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

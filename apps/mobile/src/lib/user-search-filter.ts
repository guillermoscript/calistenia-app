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

/** Construye el filtro PocketBase para buscar usuarios por nombre o username. */
export function buildUserSearchFilter(q: string): {
  raw: string
  params: { q: string }
} {
  return { raw: 'display_name ~ {:q} || username ~ {:q}', params: { q } }
}

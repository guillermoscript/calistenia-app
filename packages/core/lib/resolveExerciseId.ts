/**
 * resolveExerciseId — conservative runtime resolver.
 *
 * Maps a variant spelling / kebab slug / human name to the canonical catalog id.
 * NEVER fuzzy-matches: a wrong merge would corrupt score history.
 *
 * Resolution order (first confident hit wins):
 *  1. input is already an exact catalog id → return as-is
 *  2. input or its normalized form matches a catalog entry's seed_slug → return that id
 *     (handles kebab slugs from the exercise picker; equivalent to _id-map.json lookup)
 *  3. normalized input matches a catalog entry's name.es or name.en (non-ambiguous) → return that id
 *  4. no confident match → return input UNCHANGED
 *
 * Los índices ya no se construyen aquí: viven en `catalogIndex.ts`, que es el
 * único módulo que aplana el catálogo (#486). Este fichero ya no importa el
 * JSON, y por eso `exerciseCatalog.ts` —que sólo lo necesita para
 * `catalogExerciseIdentity()`— dejó de arrastrar 2,6 MB al grafo estático de la
 * web.
 */

import { getOrLoadCatalogIndex, normalizeForLookup } from './catalogIndex'

// El normalizador vive en `catalogIndex` porque lo necesita el propio indexado;
// se re-exporta aquí para no mover el import de sus consumidores.
export { normalizeForLookup }

// ── Public resolver ────────────────────────────────────────────────────────────

export function resolveExerciseId(input: string): string {
  if (!input) return input

  const index = getOrLoadCatalogIndex()
  // Sin índice todavía no se puede afirmar nada: se cae al paso 4, que es
  // justamente «no hay coincidencia segura, devuelve la entrada intacta».
  if (!index) return input

  // 1. Exact catalog id match
  if (index.ids.has(input)) return input

  // 2. Seed-slug lookup (raw key first, then normalized)
  const slugHit = index.bySeedSlug.get(input)
  if (slugHit) return slugHit
  const normInput = normalizeForLookup(input)
  const normSlugHit = index.bySeedSlug.get(normInput)
  if (normSlugHit) return normSlugHit

  // 3. Name index lookup (normalized name.es / name.en)
  const nameHit = index.byName.get(normInput)
  if (nameHit) return nameHit

  // 4. No confident match — return unchanged
  return input
}

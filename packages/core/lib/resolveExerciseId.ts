/**
 * resolveExerciseId — conservative runtime resolver.
 *
 * Maps a variant spelling / kebab slug / human name to the canonical catalog id.
 * NEVER fuzzy-matches: a wrong merge would corrupt score history.
 *
 * Resolution order (first confident hit wins):
 *  1. input is already an exact catalog id → return as-is
 *  1b. input is a retired id with orphaned history (`LEGACY_EXERCISE_IDS`) → its heir (#692)
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

import { getOrLoadCatalogIndex, normalizeForLookup, type CatalogIndex } from './catalogIndex'

// El normalizador vive en `catalogIndex` porque lo necesita el propio indexado;
// se re-exporta aquí para no mover el import de sus consumidores.
export { normalizeForLookup }

/**
 * Ids que se grabaron en `sets_log` en su día y ya no existen en el catálogo
 * (#692). Sin esto su historial cae al paso 4 y se pinta con el id crudo
 * («pushup») al lado del mismo ejercicio bajo su id actual.
 *
 *  - `pushup`: el programa «8 Semanas» lo registraba así hasta junio de 2026 y
 *    como `pushup_std` desde entonces.
 *  - `jogging`: entrada de wger cuyo contenido era en realidad un muscle-up
 *    (id slugificado de la sugerencia de búsqueda equivocada); retirada del
 *    catálogo en #692.
 *
 * Solo entran ids con historial huérfano. No es un sitio para sinónimos: eso
 * lo hacen `seed_slug` y el índice de nombres, y una fusión equivocada
 * corrompe récords.
 */
export const LEGACY_EXERCISE_IDS: Readonly<Record<string, string>> = {
  pushup: 'pushup_std',
  jogging: 'muscle_up',
}

// ── Public resolver ────────────────────────────────────────────────────────────

export function resolveExerciseId(
  input: string,
  // Inyectable para quien ya tiene el índice en la mano (y para los tests);
  // por defecto, el índice compartido del módulo.
  index: CatalogIndex | null = getOrLoadCatalogIndex(),
): string {
  if (!input) return input

  // Sin índice todavía no se puede afirmar nada: se cae al paso 4, que es
  // justamente «no hay coincidencia segura, devuelve la entrada intacta».
  if (!index) return input

  // 1. Exact catalog id match
  if (index.ids.has(input)) return input

  // 1b. Retired id whose history must merge with its heir (#692)
  const heir = LEGACY_EXERCISE_IDS[input]
  if (heir && index.ids.has(heir)) return heir

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

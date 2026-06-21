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
 */

import catalogData from '../data/exercise-catalog.json'

// ── Normalizer (reuses same logic as wger-mappings.ts slug generator) ─────────

/** Strip accents and lowercase — same pipeline used in wger-mappings.ts */
export function normalizeForLookup(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// ── Build indexes at module load ────────────────────────────────────────────────

type CatalogEntry = {
  id: string
  seed_slug?: string
  name: { es?: string; en?: string }
  [key: string]: unknown
}

function flattenCatalog(): CatalogEntry[] {
  const catalog = catalogData as {
    categories: Record<string, { exercises: CatalogEntry[] }>
  }
  const result: CatalogEntry[] = []
  for (const cat of Object.values(catalog.categories)) {
    for (const ex of cat.exercises) {
      result.push(ex)
    }
  }
  return result
}

const _allEntries: CatalogEntry[] = flattenCatalog()

// Index 1: exact catalog ids
const _catalogIds: Set<string> = new Set(_allEntries.map(e => e.id))

// Index 2: seed_slug → canonical id
// The catalog's seed_slug field encodes the same mapping as _id-map.json
// (every entry with seed_slug was derived from that slug → its id).
const _slugIndex: Map<string, string> = new Map(
  _allEntries
    .filter(e => e.seed_slug)
    .map(e => [e.seed_slug as string, e.id])
)

// Index 3: normalized name → canonical id (skip ambiguous)
// Ambiguous = same normalized name maps to two different ids → do NOT index
const _nameIndex: Map<string, string> = (() => {
  const counts = new Map<string, string[]>()

  for (const ex of _allEntries) {
    const names: string[] = []
    if (ex.name.es) names.push(normalizeForLookup(ex.name.es))
    if (ex.name.en) names.push(normalizeForLookup(ex.name.en))

    for (const norm of names) {
      if (!norm) continue
      const existing = counts.get(norm)
      if (existing) {
        existing.push(ex.id)
      } else {
        counts.set(norm, [ex.id])
      }
    }
  }

  const index = new Map<string, string>()
  for (const [norm, ids] of counts) {
    // Only index non-ambiguous entries
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 1) {
      index.set(norm, uniqueIds[0])
    }
    // Ambiguous: silently skip — no guess
  }
  return index
})()

// ── Public resolver ────────────────────────────────────────────────────────────

export function resolveExerciseId(input: string): string {
  if (!input) return input

  // 1. Exact catalog id match
  if (_catalogIds.has(input)) return input

  // 2. Seed-slug lookup (raw key first, then normalized)
  const slugHit = _slugIndex.get(input)
  if (slugHit) return slugHit
  const normInput = normalizeForLookup(input)
  const normSlugHit = _slugIndex.get(normInput)
  if (normSlugHit) return normSlugHit

  // 3. Name index lookup (normalized name.es / name.en)
  const nameHit = _nameIndex.get(normInput)
  if (nameHit) return nameHit

  // 4. No confident match — return unchanged
  return input
}

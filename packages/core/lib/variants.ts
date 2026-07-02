/**
 * Variation families — navigate variants of an exercise.
 *
 * Every catalog entry may carry a `family` id (baked at build time by
 * scripts/build-exercise-catalog.mjs from name patterns, e.g. all push-up
 * variations share family "push_up"). This module indexes the bundled
 * catalog by family and answers "which variants of X exist?".
 */
import catalogData from '../data/exercise-catalog.json'

export interface VariantEntry {
  id: string
  name: { es?: string; en?: string }
  muscles?: { es?: string; en?: string }
  difficulty?: string
  equipment?: string[]
  source?: string
  family?: string
  isTimer?: boolean
  [key: string]: unknown
}

function flatten(): VariantEntry[] {
  const cat = catalogData as unknown as {
    categories: Record<string, { exercises: VariantEntry[] }>
  }
  const out: VariantEntry[] = []
  for (const c of Object.values(cat.categories)) out.push(...c.exercises)
  return out
}

const _byId = new Map<string, VariantEntry>()
const _byFamily = new Map<string, VariantEntry[]>()
for (const ex of flatten()) {
  _byId.set(ex.id, ex)
  if (ex.family) {
    const list = _byFamily.get(ex.family) ?? []
    list.push(ex)
    _byFamily.set(ex.family, list)
  }
}

const DIFF_ORDER: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 }

/**
 * Variants of an exercise (same family, itself excluded), best-first:
 * curated entries before imported ones, then same-equipment, then easier
 * before harder. Empty when the exercise has no family (or is unknown).
 */
export function getVariants(exerciseId: string, limit = 12): VariantEntry[] {
  const ex = _byId.get(exerciseId)
  if (!ex?.family) return []
  const ownEquip = new Set(ex.equipment ?? [])
  const rank = (v: VariantEntry): number =>
    (v.source === 'exercisedb' ? 100 : 0) +
    ((v.equipment ?? []).some(e => ownEquip.has(e)) ? 0 : 10) +
    (DIFF_ORDER[v.difficulty ?? 'intermediate'] ?? 1)
  return (_byFamily.get(ex.family) ?? [])
    .filter(v => v.id !== exerciseId)
    .sort((a, b) => rank(a) - rank(b) || (a.name.es ?? '').localeCompare(b.name.es ?? ''))
    .slice(0, limit)
}

/** Family id of an exercise (null when it has none). */
export function getFamily(exerciseId: string): string | null {
  return _byId.get(exerciseId)?.family ?? null
}

/** Catalog entry by id (undefined when unknown). */
export function getCatalogEntry(exerciseId: string): VariantEntry | undefined {
  return _byId.get(exerciseId)
}

/** Full flattened catalog (shared index — do not mutate). */
export function getAllCatalogEntries(): VariantEntry[] {
  return Array.from(_byId.values())
}

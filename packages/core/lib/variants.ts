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
  category?: string
  muscle_groups?: string[]
  [key: string]: unknown
}

export interface VariantsByLevel {
  /** Family members one difficulty level below (progresiones hacia abajo). */
  easier: VariantEntry[]
  /** Same difficulty — or muscle/category-similar fallback when no family. */
  similar: VariantEntry[]
  /** Family members one difficulty level above (progresiones hacia arriba). */
  harder: VariantEntry[]
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

/**
 * Variants of an exercise grouped by difficulty relative to it — the
 * "no puedo hacer un muscle-up todavía" answer: easier progressions,
 * same-level alternatives, harder progressions.
 *
 * Family-based when the exercise has one. Without a family, `similar`
 * falls back to catalog entries sharing a muscle group and category
 * (same-equipment first), so every exercise offers alternatives.
 */
export function getVariantsByLevel(exerciseId: string, limitPerLevel = 6): VariantsByLevel {
  const ex = _byId.get(exerciseId)
  const empty: VariantsByLevel = { easier: [], similar: [], harder: [] }
  if (!ex) return empty
  const ownDiff = DIFF_ORDER[ex.difficulty ?? 'intermediate'] ?? 1

  const family = ex.family
    ? (_byFamily.get(ex.family) ?? []).filter(v => v.id !== exerciseId)
    : []

  if (family.length > 0) {
    const ownEquip = new Set(ex.equipment ?? [])
    // Curated entries and same-equipment variants first within each level
    const rank = (v: VariantEntry): number =>
      (v.source === 'exercisedb' ? 100 : 0) +
      ((v.equipment ?? []).some(e => ownEquip.has(e)) ? 0 : 10)
    const sorted = [...family].sort(
      (a, b) => rank(a) - rank(b) || (a.name.es ?? '').localeCompare(b.name.es ?? ''),
    )
    const level = (v: VariantEntry) => DIFF_ORDER[v.difficulty ?? 'intermediate'] ?? 1
    return {
      easier: sorted.filter(v => level(v) < ownDiff).slice(0, limitPerLevel),
      similar: sorted.filter(v => level(v) === ownDiff).slice(0, limitPerLevel),
      harder: sorted.filter(v => level(v) > ownDiff).slice(0, limitPerLevel),
    }
  }

  // No family — muscle/category similarity fallback for `similar` only
  // (easier/harder only make sense as progressions within a family).
  const ownGroups = new Set(ex.muscle_groups ?? [])
  if (ownGroups.size === 0 || !ex.category) return empty
  const ownEquip = new Set(ex.equipment ?? [])
  const candidates = getAllCatalogEntries().filter(v =>
    v.id !== exerciseId &&
    v.category === ex.category &&
    (v.muscle_groups ?? []).some(g => ownGroups.has(g)),
  )
  const score = (v: VariantEntry): number => {
    const shared = (v.muscle_groups ?? []).filter(g => ownGroups.has(g)).length
    const sameEquip = (v.equipment ?? []).some(e => ownEquip.has(e)) ||
      ((v.equipment ?? []).length === 0 && ownEquip.size === 0)
    const diffGap = Math.abs((DIFF_ORDER[v.difficulty ?? 'intermediate'] ?? 1) - ownDiff)
    return shared * 10 + (sameEquip ? 5 : 0) - diffGap * 2
  }
  return {
    ...empty,
    similar: candidates
      .sort((a, b) => score(b) - score(a) || (a.name.es ?? '').localeCompare(b.name.es ?? ''))
      .slice(0, limitPerLevel),
  }
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

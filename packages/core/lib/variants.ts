/**
 * Variation families — navigate variants of an exercise.
 *
 * Every catalog entry may carry a `family` id (baked at build time by
 * scripts/build-exercise-catalog.mjs from name patterns, e.g. all push-up
 * variations share family "push_up"). This module answers "which variants of X
 * exist?" a partir del índice compartido.
 *
 * Los mapas `por id` y `por familia` ya no se construyen aquí: los construye
 * `catalogIndex.ts` en un único recorrido del catálogo (#486). Este módulo ya no
 * importa el JSON, y con eso `challenges.ts` —que sólo usa `getCatalogEntry()`
 * para `getMetricUnit()`— dejó de arrastrarlo al grafo estático de la web desde
 * el leaderboard.
 */
import { getOrLoadCatalogIndex, type CatalogIndex } from './catalogIndex'

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
  /** Family members at the same difficulty level. */
  similar: VariantEntry[]
  /** Family members one difficulty level above (progresiones hacia arriba). */
  harder: VariantEntry[]
}

const DIFF_ORDER: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 }

/** El índice, o `null` si el catálogo todavía no ha cargado (dispara la carga). */
function index(): CatalogIndex | null {
  return getOrLoadCatalogIndex()
}

const familyOf = (idx: CatalogIndex, family: string): VariantEntry[] =>
  (idx.byFamily.get(family) ?? []) as unknown as VariantEntry[]

/**
 * Variants of an exercise (same family, itself excluded), best-first:
 * curated entries before imported ones, then same-equipment, then easier
 * before harder. Empty when the exercise has no family (or is unknown).
 */
export function getVariants(exerciseId: string, limit = 12): VariantEntry[] {
  const idx = index()
  if (!idx) return []
  const ex = getCatalogEntry(exerciseId)
  if (!ex?.family) return []
  const ownEquip = new Set(ex.equipment ?? [])
  const rank = (v: VariantEntry): number =>
    (v.source === 'exercisedb' ? 100 : 0) +
    ((v.equipment ?? []).some(e => ownEquip.has(e)) ? 0 : 10) +
    (DIFF_ORDER[v.difficulty ?? 'intermediate'] ?? 1)
  return familyOf(idx, ex.family)
    .filter(v => v.id !== exerciseId)
    .sort((a, b) => rank(a) - rank(b) || (a.name.es ?? '').localeCompare(b.name.es ?? ''))
    .slice(0, limit)
}

/**
 * Variants of an exercise grouped by difficulty relative to it — the
 * "no puedo hacer un muscle-up todavía" answer: easier progressions,
 * same-level alternatives, harder progressions. Family members only;
 * see getRelatedExercises for non-variation alternatives.
 */
export function getVariantsByLevel(exerciseId: string, limitPerLevel = 6): VariantsByLevel {
  const empty: VariantsByLevel = { easier: [], similar: [], harder: [] }
  const idx = index()
  if (!idx) return empty
  const ex = getCatalogEntry(exerciseId)
  if (!ex?.family) return empty
  const ownDiff = DIFF_ORDER[ex.difficulty ?? 'intermediate'] ?? 1

  const family = familyOf(idx, ex.family).filter(v => v.id !== exerciseId)
  if (family.length === 0) return empty

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

/**
 * Related exercises — similar work (shared muscle groups) that is NOT a
 * variation of the same movement: the exercise itself and its whole
 * family are excluded. Same category and equipment score higher; close
 * difficulty breaks ties.
 */
export function getRelatedExercises(exerciseId: string, limit = 6): VariantEntry[] {
  const ex = getCatalogEntry(exerciseId)
  if (!ex) return []
  const ownGroups = new Set(ex.muscle_groups ?? [])
  if (ownGroups.size === 0) return []
  const ownEquip = new Set(ex.equipment ?? [])
  const ownDiff = DIFF_ORDER[ex.difficulty ?? 'intermediate'] ?? 1

  const candidates = getAllCatalogEntries().filter(v =>
    v.id !== exerciseId &&
    (!ex.family || v.family !== ex.family) &&
    (v.muscle_groups ?? []).some(g => ownGroups.has(g)),
  )
  const score = (v: VariantEntry): number => {
    const shared = (v.muscle_groups ?? []).filter(g => ownGroups.has(g)).length
    const sameEquip = (v.equipment ?? []).some(e => ownEquip.has(e)) ||
      ((v.equipment ?? []).length === 0 && ownEquip.size === 0)
    const diffGap = Math.abs((DIFF_ORDER[v.difficulty ?? 'intermediate'] ?? 1) - ownDiff)
    return shared * 10 + (v.category === ex.category ? 4 : 0) + (sameEquip ? 3 : 0) - diffGap * 2
  }
  return candidates
    .sort((a, b) => score(b) - score(a) || (a.name.es ?? '').localeCompare(b.name.es ?? ''))
    .slice(0, limit)
}

/** Family id of an exercise (null when it has none). */
export function getFamily(exerciseId: string): string | null {
  return getCatalogEntry(exerciseId)?.family ?? null
}

/** Catalog entry by id (undefined when unknown). */
export function getCatalogEntry(exerciseId: string): VariantEntry | undefined {
  return index()?.byId.get(exerciseId) as VariantEntry | undefined
}

/** Full flattened catalog (shared index — do not mutate). */
export function getAllCatalogEntries(): VariantEntry[] {
  return (index()?.all ?? []) as unknown as VariantEntry[]
}

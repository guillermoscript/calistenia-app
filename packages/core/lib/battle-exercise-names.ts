/**
 * Nombres de ejercicio que se CONGELAN en `config.exercise_names` al crear una batalla
 * de día de programa o propia (#882).
 *
 * El invitado no tiene el programa del creador y un `exercise_id` de programa puede ser
 * una clave de slot («lun_1_2», #599) que el catálogo no conoce, así que el nombre tiene
 * que viajar dentro de la batalla. Función pura: el índice del catálogo se inyecta.
 */
import type { BattleExerciseNameEntry } from '../types/battle'
import { BATTLE_LIMITS } from './battle'
import { normalizeForLookup, type CatalogIndex, type CatalogIndexEntry } from './catalogIndex'
import { localize } from './i18n-db'
import { resolveExerciseId } from './resolveExerciseId'

export interface BattleNameSource {
  exerciseId: string
  /** Nombre que el creador ve en su programa o en el selector; ya en su idioma. */
  displayName?: string | null
}

const cap = (s: string) => s.trim().slice(0, BATTLE_LIMITS.maxExerciseNameLength)

function fromCatalog(entry: CatalogIndexEntry): BattleExerciseNameEntry | null {
  const es = cap(localize(entry.name, 'es'))
  const en = cap(localize(entry.name, 'en'))
  if (!es && !en) return null
  // `localize` cae a otro idioma si falta uno: solo se guarda lo que el catálogo dice de verdad.
  const raw = typeof entry.name === 'string' ? null : entry.name
  const out: BattleExerciseNameEntry = {}
  if (!raw || raw.es) out.es = es
  if (!raw || raw.en) out.en = en
  return out
}

export function battleExerciseNamesFrom(
  sources: readonly BattleNameSource[],
  language: string,
  index: CatalogIndex | null,
): Record<string, BattleExerciseNameEntry> {
  const lang: 'es' | 'en' = language.startsWith('en') ? 'en' : 'es'
  const out: Record<string, BattleExerciseNameEntry> = {}
  for (const { exerciseId, displayName } of sources) {
    const id = exerciseId.trim()
    if (!id || out[id]) continue
    const program = (displayName ?? '').trim()

    let entry: CatalogIndexEntry | undefined
    if (index) {
      entry = index.byId.get(resolveExerciseId(id, index))
      // Clave de slot: no está en el catálogo, pero su nombre de programa puede estarlo.
      if (!entry && program) entry = index.byId.get(index.byName.get(normalizeForLookup(program)) ?? '')
    }
    const catalog = entry ? fromCatalog(entry) : null
    if (catalog) out[id] = catalog
    else if (program) out[id] = { [lang]: cap(program) }
  }
  return out
}

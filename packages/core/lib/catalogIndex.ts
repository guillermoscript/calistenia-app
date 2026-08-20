/**
 * catalogIndex — el único sitio que aplana e indexa `data/exercise-catalog.json` (#486).
 *
 * Antes había cuatro aplanados del mismo fichero, cada uno construyendo sus
 * índices al evaluarse su módulo: `resolveExerciseId.ts` (ids, seed_slug,
 * nombres), `variants.ts` (por id y por familia), `catalogMedia.ts` (media por
 * clave) y `apps/mobile/src/lib/catalog.ts` (lista + por id). Las 1.578 entradas
 * se recorrían cuatro veces y el JSON quedaba enganchado al grafo estático de
 * los cuatro módulos.
 *
 * En la web eso costaba más de lo que parecía. `core/lib/challenges` importa
 * `getCatalogEntry` sólo para `getMetricUnit()`, y `core/lib/exerciseCatalog`
 * importa `resolveExerciseId` sólo para `catalogExerciseIdentity()`; como el
 * leaderboard usa el primero y `ExerciseCard` el segundo, el catálogo entero
 * entraba en el grafo *eager* y Vite acababa poniendo un
 * `<link rel="modulepreload">` al chunk de 2,6 MB en `index.html`. Se descargaba
 * en cada visita, incluida la landing.
 *
 * Aquí el índice se construye una sola vez y se alimenta por dos vías, según lo
 * que pueda hacer la plataforma:
 *
 *  - `loadCatalogIndex()` — `import()` dinámico, memoizado. Es la vía de la web:
 *    corta el import estático y el JSON queda en un chunk que sólo se pide
 *    cuando alguien abre una pantalla de ejercicios.
 *  - `primeCatalogIndex()` — inyección síncrona. Es la vía de React Native (el
 *    JSON viaja en el bundle igual, y ahí no hay nada que ahorrar) y la de los
 *    tests, donde las APIs síncronas tienen que responder desde la primera
 *    llamada.
 *
 * Las funciones públicas de `resolveExerciseId`, `variants` y `catalogMedia`
 * siguen siendo síncronas. Cuando el índice todavía no está, devuelven el
 * fallback que ya tenían documentado y disparan la carga de fondo.
 */

import type { CatalogStaticMedia } from './exerciseMedia'
import type { TranslatableField } from './i18n-db'

// ── Forma de una entrada del catálogo ────────────────────────────────────────

/**
 * Superconjunto de lo que declaraban por separado los cuatro consumidores.
 * Es a propósito: cuando cada módulo tenía su propio tipo, omitir un campo era
 * la forma de perderlo silenciosamente.
 */
export interface CatalogIndexEntry {
  id: string
  name: TranslatableField
  muscles?: TranslatableField
  note?: TranslatableField
  description?: TranslatableField
  seed_slug?: string
  slug?: string
  category?: string
  family?: string
  difficulty?: string
  equipment?: string[]
  muscle_groups?: string[]
  source?: string
  isTimer?: boolean
  timerSeconds?: number
  priority?: string
  sets?: number | string
  reps?: string
  rest?: number
  media?: CatalogStaticMedia
  youtube_query?: string
  youtube_search?: string
  images?: string[]
  [key: string]: unknown
}

/** Forma cruda del fichero `data/exercise-catalog.json`. */
export interface RawCatalog {
  categories: Record<string, { count?: number; exercises: CatalogIndexEntry[] }>
  [key: string]: unknown
}

export interface CatalogIndex {
  /**
   * El fichero tal cual. Lo necesitan las páginas web que recorren
   * `categories` para fusionar el catálogo con `WORKOUTS` y
   * `SUPPLEMENTARY_EXERCISES`; se expone aquí para que consuman el índice
   * compartido en vez de volver a importar el JSON. No mutar.
   */
  raw: RawCatalog
  /** Todas las entradas, en orden de categoría. No mutar. */
  all: CatalogIndexEntry[]
  /** Nombres de categoría, en el orden del fichero. */
  categories: string[]
  /** id canónico → entrada. */
  byId: Map<string, CatalogIndexEntry>
  /** id de familia → miembros de esa familia. */
  byFamily: Map<string, CatalogIndexEntry[]>
  /** Todos los ids canónicos, para el paso 1 de `resolveExerciseId`. */
  ids: Set<string>
  /** `seed_slug` → id canónico (paso 2 de `resolveExerciseId`). */
  bySeedSlug: Map<string, string>
  /** Nombre normalizado → id canónico, saltando ambiguos (paso 3). */
  byName: Map<string, string>
  /** id / seed_slug / slug → media estructurada, sólo de quien la tiene. */
  mediaByKey: Map<string, CatalogStaticMedia>
}

// ── Normalizador ─────────────────────────────────────────────────────────────

/**
 * Quita acentos y baja a minúsculas — mismo pipeline que el generador de slugs
 * de `wger-mappings.ts`. Vive aquí porque lo necesita el propio indexado.
 */
export function normalizeForLookup(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// ── Construcción ─────────────────────────────────────────────────────────────

/**
 * Construye todos los índices en un solo recorrido. Pura: no toca el estado del
 * módulo, así que los tests pueden indexar catálogos de mentira.
 */
export function buildCatalogIndex(raw: RawCatalog): CatalogIndex {
  const categories = Object.keys(raw?.categories ?? {})
  const all: CatalogIndexEntry[] = []
  const byId = new Map<string, CatalogIndexEntry>()
  const byFamily = new Map<string, CatalogIndexEntry[]>()
  const ids = new Set<string>()
  const bySeedSlug = new Map<string, string>()
  const mediaByKey = new Map<string, CatalogStaticMedia>()

  // Los nombres se cuentan primero y se indexan después: un nombre normalizado
  // que apunta a dos ids distintos es ambiguo y no se indexa (una resolución
  // equivocada corrompería el historial de series).
  const nameCounts = new Map<string, Set<string>>()

  for (const catName of categories) {
    for (const ex of raw.categories[catName]?.exercises ?? []) {
      all.push(ex)
      byId.set(ex.id, ex)
      ids.add(ex.id)

      if (ex.family) {
        const list = byFamily.get(ex.family)
        if (list) list.push(ex)
        else byFamily.set(ex.family, [ex])
      }

      if (ex.seed_slug) bySeedSlug.set(ex.seed_slug, ex.id)

      const media = ex.media
      if (media && (media.sequence || media.muscles || media.thumbnail || media.video)) {
        // Se indexa por cualquier identificador que pueda tener quien llama.
        for (const key of [ex.id, ex.seed_slug, ex.slug]) {
          if (key) mediaByKey.set(key, media)
        }
      }

      const name = ex.name as { es?: string; en?: string } | string | undefined
      const rawNames =
        typeof name === 'string' ? [name] : [name?.es, name?.en]
      for (const n of rawNames) {
        if (!n) continue
        const norm = normalizeForLookup(n)
        if (!norm) continue
        const seen = nameCounts.get(norm)
        if (seen) seen.add(ex.id)
        else nameCounts.set(norm, new Set([ex.id]))
      }
    }
  }

  const byName = new Map<string, string>()
  for (const [norm, idSet] of nameCounts) {
    if (idSet.size === 1) byName.set(norm, idSet.values().next().value as string)
    // Ambiguo: se salta en silencio, sin adivinar.
  }

  return { raw, all, categories, byId, byFamily, ids, bySeedSlug, byName, mediaByKey }
}

// ── Estado del módulo ────────────────────────────────────────────────────────

let _index: CatalogIndex | null = null
let _pending: Promise<CatalogIndex> | null = null

/**
 * Inyecta el catálogo de forma síncrona. La usan React Native (donde el JSON
 * viaja en el bundle de todas formas) y el setup de los tests. Idempotente:
 * la primera llamada gana, para que un `prime` tardío no reconstruya índices
 * que ya están en uso.
 */
export function primeCatalogIndex(raw: RawCatalog): CatalogIndex {
  if (!_index) _index = buildCatalogIndex(raw)
  return _index
}

/**
 * Carga el catálogo con un `import()` dinámico y construye el índice. Memoizada
 * en las dos direcciones: si ya está construido devuelve el existente, y las
 * llamadas concurrentes comparten la misma promesa.
 */
export function loadCatalogIndex(): Promise<CatalogIndex> {
  if (_index) return Promise.resolve(_index)
  if (!_pending) {
    _pending = import('../data/exercise-catalog.json')
      .then(mod => primeCatalogIndex((mod.default ?? mod) as unknown as RawCatalog))
      .catch(err => {
        // Que un fallo de red deje el índice atascado para siempre sería peor
        // que reintentar: se limpia la promesa para que el próximo consumidor
        // vuelva a pedirlo.
        _pending = null
        throw err
      })
  }
  return _pending
}

/**
 * El índice si ya está construido, `null` si no. Es lo que usan las funciones
 * síncronas para decidir entre responder y caer a su fallback.
 */
export function getCatalogIndexSync(): CatalogIndex | null {
  return _index
}

/** `true` cuando las APIs síncronas del catálogo ya pueden responder. */
export function isCatalogIndexReady(): boolean {
  return _index !== null
}

/**
 * El índice si está, y si no lo está, dispara la carga y devuelve `null`. Es el
 * patrón que siguen `resolveExerciseId`, `variants` y `catalogMedia`: responder
 * con su fallback documentado ahora y estar listas la próxima vez.
 */
export function getOrLoadCatalogIndex(): CatalogIndex | null {
  if (_index) return _index
  // El fallo ya se maneja dentro de loadCatalogIndex; aquí sólo evitamos un
  // unhandled rejection en el camino síncrono.
  void loadCatalogIndex().catch(() => {})
  return null
}

/** Sólo para tests: olvida el índice cargado. */
export function __resetCatalogIndexForTests(): void {
  _index = null
  _pending = null
}

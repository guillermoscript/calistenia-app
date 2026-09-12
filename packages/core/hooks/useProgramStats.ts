/**
 * Cuánta gente sigue cada programa (#620).
 *
 * Lee `view_program_stats`, la view que crea
 * `pb_migrations/1786200000_program_forked_from_and_stats.js`. Los conteos se
 * agregan en el servidor: hacerlo desde aquí costaría una consulta por programa
 * del catálogo, y el catálogo se pide entero en cada arranque.
 *
 * LO QUE HAY QUE SABER ANTES DE TOCAR ESTO
 * ----------------------------------------
 * 1. Una view de PocketBase NO emite realtime (#316). El contador se refresca
 *    cuando la query se invalida o caduca, no cuando alguien se inscribe. Por
 *    eso el `staleTime` es corto comparado con el del catálogo: es prueba
 *    social, no un dato transaccional, y llegar cinco minutos tarde no importa.
 *
 * 2. Si la regla de lectura de la view no casa, PocketBase devuelve 0 filas SIN
 *    error. Un programa que no aparezca en la respuesta puede ser «nadie lo
 *    sigue» o «no puedes verlo», y desde el cliente son indistinguibles. Por eso
 *    `statsById` deja fuera a los que no vinieron en vez de meterlos a 0: la UI
 *    distingue `undefined` («no se sabe») de `0` («nadie todavía») y con el
 *    primero no pinta nada. Rellenar con ceros convertiría un fallo de permisos
 *    en un «0 personas lo siguen» perfectamente creíble.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RecordModel } from 'pocketbase'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

/** Los conteos de un programa. Todos ya son números; la view nunca devuelve null. */
export interface ProgramStats {
  /** Inscripciones vivas. Incluye las filas legacy sin `status` (ver la migración). */
  activeCount: number
  /** Inscripciones terminadas. */
  completedCount: number
  /** Activos + completados: el número que se pinta como «N personas lo siguen». */
  followersCount: number
  /** Gente DISTINTA con al menos una sesión de este programa. */
  athletesCount: number
}

/**
 * Cuántos ids caben en un mismo `OR` antes de partir la consulta. El filtro
 * viaja en la query string, así que un catálogo grande generaría una URL que el
 * servidor rechaza (414) o que un proxy trunca. Es el mismo tamaño que usa
 * `fetchCatalog` para los day-configs, por la misma razón.
 */
const STATS_ID_CHUNK = 50

/** Páginas con las que `getFullList` recorre cada trozo. No es un tope. */
const STATS_PAGE_SIZE = 500

function toStats(record: RecordModel): ProgramStats {
  // `Number(x) || 0`: SQLite devuelve los COUNT como números, pero una view
  // recién creada sobre un servidor que aún no la tiene devolvería `undefined`
  // aquí y `NaN` se propagaría hasta la pantalla como «NaN personas lo siguen».
  return {
    activeCount:    Number(record.active_count) || 0,
    completedCount: Number(record.completed_count) || 0,
    followersCount: Number(record.followers_count) || 0,
    athletesCount:  Number(record.athletes_count) || 0,
  }
}

/**
 * Exportada para los tests: es donde vive el troceado y la decisión de dejar
 * fuera al programa que no vino, que es lo que hay que fijar.
 */
export async function fetchProgramStats(programIds: readonly string[]): Promise<Record<string, ProgramStats>> {
  if (!programIds.length) return {}

  const chunks: string[][] = []
  for (let i = 0; i < programIds.length; i += STATS_ID_CHUNK) {
    chunks.push([...programIds].slice(i, i + STATS_ID_CHUNK))
  }

  const results = await Promise.all(chunks.map(chunk =>
    pb.collection('view_program_stats').getFullList({
      batch: STATS_PAGE_SIZE,
      filter: chunk.map(id => pb.filter('id = {:id}', { id })).join(' || '),
      $autoCancel: false,
    })
      // Un servidor sin la migración aplicada devuelve 404 en esta colección. No
      // puede tumbar la pantalla: el contador es un adorno, y sin él la ficha
      // del programa tiene que seguir funcionando igual que antes de #620.
      .catch(() => [] as RecordModel[]),
  ))

  const byId: Record<string, ProgramStats> = {}
  for (const record of results.flat()) byId[record.id] = toStats(record)
  return byId
}

export interface UseProgramStatsReturn {
  /** Solo los programas que el servidor devolvió. Ausente ≠ cero: ver la cabecera. */
  statsById: Record<string, ProgramStats>
  loading: boolean
}

/**
 * @param programIds Ids del catálogo o de la ficha. Puede venir vacío mientras
 *   carga el catálogo; en ese caso no se pide nada.
 */
export function useProgramStats(programIds: readonly string[] | null | undefined): UseProgramStatsReturn {
  // Ordenados y deduplicados para que el mismo conjunto de programas dé SIEMPRE
  // la misma clave: el catálogo llega ordenado por nombre y la ficha con un id
  // suelto, y sin normalizar cada orden sería su propia entrada de caché.
  const ids = useMemo(
    () => Array.from(new Set(programIds ?? [])).sort(),
    [programIds],
  )

  // Memoizada aunque React Query compare la clave por igualdad estructural: una
  // clave recreada en cada render acaba en las dependencias de un `useCallback`
  // y se convierte en un bucle de refetch (#451).
  const queryKey = useMemo(() => qk.programs.stats(ids), [ids])

  const query = useQuery({
    queryKey,
    // Sin token válido las views devuelven 200 con lista vacía, igual que el
    // catálogo (ver `fetchCatalog`). Mejor no preguntar que cachear un vacío.
    enabled: ids.length > 0 && pb.authStore.isValid,
    staleTime: 60_000,
    queryFn: () => fetchProgramStats(ids),
  })

  return {
    statsById: query.data ?? {},
    loading: query.isLoading,
  }
}

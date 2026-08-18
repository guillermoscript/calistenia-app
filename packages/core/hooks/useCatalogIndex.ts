/**
 * useCatalogIndex — el gancho de React sobre el índice perezoso del catálogo (#486).
 *
 * Desde que `data/exercise-catalog.json` se carga con un `import()` dinámico, las
 * APIs síncronas de `resolveExerciseId`, `variants` y `catalogMedia` responden
 * con su fallback documentado mientras el fichero viaja. Este hook es la forma
 * de que una pantalla espere a tenerlo de verdad.
 *
 * Importa sobre todo donde se calculan identidades: `catalogExerciseIdentity()`
 * produce la clave con la que se registran las series, así que una pantalla que
 * registre entrenos debe esperar a `ready` antes de resolver ids.
 */
import { useEffect, useState } from 'react'
import {
  getCatalogIndexSync,
  loadCatalogIndex,
  type CatalogIndex,
} from '../lib/catalogIndex'

export interface UseCatalogIndexResult {
  /** El índice, o `null` mientras carga. */
  index: CatalogIndex | null
  /** `true` cuando el catálogo ya está indexado y las APIs síncronas responden. */
  ready: boolean
}

export function useCatalogIndex(): UseCatalogIndexResult {
  // El estado inicial mira el índice ya construido: en React Native (y en los
  // tests) está primado desde el arranque y el hook nunca llega a suspender
  // nada ni provoca un render extra.
  const [index, setIndex] = useState<CatalogIndex | null>(() => getCatalogIndexSync())

  useEffect(() => {
    if (index) return
    let alive = true
    loadCatalogIndex()
      .then(loaded => {
        if (alive) setIndex(loaded)
      })
      .catch(() => {
        // Se deja `index` en null: cada API cae a su fallback y `loadCatalogIndex`
        // ya limpió su promesa, así que el siguiente montaje reintenta.
      })
    return () => {
      alive = false
    }
  }, [index])

  return { index, ready: index !== null }
}

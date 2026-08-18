/**
 * Setup global de los tests de core.
 *
 * Desde el #486 `data/exercise-catalog.json` se carga con un `import()`
 * dinámico, así que las APIs síncronas que dependen de él —`resolveExerciseId`,
 * `variants`, `catalogMedia`— caen a su fallback documentado hasta que llega.
 * En los tests eso no interesa: se prima el índice de forma síncrona, igual que
 * hace React Native, y cada test sigue llamándolas tal cual.
 *
 * Un test que quiera ejercitar explícitamente la ventana de carga puede usar
 * `__resetCatalogIndexForTests()`.
 */
import catalog from './data/exercise-catalog.json'
import { primeCatalogIndex, type RawCatalog } from './lib/catalogIndex'

primeCatalogIndex(catalog as unknown as RawCatalog)

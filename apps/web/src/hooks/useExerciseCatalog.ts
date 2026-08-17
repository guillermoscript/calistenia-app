/**
 * El catálogo de ejercicios vive en core desde el #473, compartido con móvil
 * (que tenía su propia copia dentro de `session-detail.tsx`).
 *
 * Este fichero se queda como reenvío para no tocar a sus consumidores web.
 */
export {
  useExerciseCatalog,
  STATIC_CATALOG,
  type ExerciseCatalog,
} from '@calistenia/core/hooks/useExerciseCatalog'

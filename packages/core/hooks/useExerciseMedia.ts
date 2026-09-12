/**
 * useExerciseMedia — el gancho de React sobre `getExerciseMedia` (#608).
 *
 * El resolutor de `lib/exerciseMedia.ts` es puro, pero usarlo bien pide tres
 * pasos que se repetían a mano en cada pantalla: esperar al catálogo perezoso
 * (`useCatalogIndex`), buscarle la media estática por su clave canónica
 * (`getCatalogStaticMedia`) y montar el `catalogRecord` que el resolutor espera.
 * Solo `MediaViewer` los hacía; los otros cuatro sitios que pintan media leían
 * `demoImages[0]` a pelo, que es el **nombre de fichero crudo** de PocketBase, y
 * lo metían en un `src` — o sea, una imagen rota en cuanto la BD tuviera una.
 *
 * Este hook es el único camino que deberían usar. Devuelve siempre un
 * `ResolvedMedia`, con las URLs ya construidas (`/api/files/…`) o intactas si el
 * valor ya era una URL.
 *
 * Sirve para las dos formas de ejercicio que hay:
 *   - **de programa** — `pbRecordId` es el id de `program_exercises` y
 *     `demoImages` sus ficheros (capa de override del programa).
 *   - **de catálogo** — se pasa `catalogRecord` con el id de `exercises_catalog`
 *     y sus `defaultImages`.
 *
 * Ojo con la clave del catálogo: la media estática se indexa por la identidad
 * canónica (el `slug`), no por el id aleatorio de PocketBase. Por eso
 * `catalogKey` va aparte de `pbRecordId`.
 */
import { useMemo } from 'react'
import {
  getExerciseMedia,
  type CatalogMediaRecord,
  type ExerciseMediaInput,
  type ResolvedMedia,
} from '../lib/exerciseMedia'
import { getCatalogStaticMedia } from '../lib/catalogMedia'
import { useCatalogIndex } from './useCatalogIndex'

export interface UseExerciseMediaOpts {
  /** Registro de `exercises_catalog` para las capas de respaldo (b) y (c). */
  catalogRecord?: CatalogMediaRecord
  /**
   * Clave canónica con la que buscar la media estática empaquetada.
   * Normalmente el `slug` del ejercicio; si no se pasa, se usa `exercise.id`.
   */
  catalogKey?: string
  /** URL base de PocketBase. Vacío en web (mismo origen); obligatorio en móvil. */
  pbBaseUrl?: string
  /** Origen con el que prefijar las rutas relativas de media estática (móvil). */
  mediaBaseUrl?: string
}

/**
 * Resuelve la media de un ejercicio por la jerarquía canónica:
 * override del programa → media estática del catálogo → ficheros del catálogo →
 * vídeo curado → YouTube.
 */
export function useExerciseMedia(
  exercise: ExerciseMediaInput & { id?: string },
  opts: UseExerciseMediaOpts = {},
): ResolvedMedia {
  const { catalogRecord, catalogKey, pbBaseUrl = '', mediaBaseUrl = '' } = opts

  // Pide el catálogo empaquetado y vuelve a pintar cuando llega, en vez de
  // quedarse sin media estática para siempre (#486).
  const { ready } = useCatalogIndex()

  const key = catalogKey ?? exercise.id
  const staticMedia = catalogRecord?.staticMedia ?? getCatalogStaticMedia(key)

  const { pbRecordId, demoImages, demoVideo, youtube } = exercise
  // Las listas de ficheros llegan como arrays nuevos en cada render, así que la
  // dependencia estable es su contenido, no su identidad.
  const demoImagesKey = (demoImages || []).join('|')
  const defaultImagesKey = (catalogRecord?.defaultImages || []).join('|')

  return useMemo(() => {
    const effectiveCatalogRecord: CatalogMediaRecord | undefined =
      (catalogRecord || staticMedia) ? { ...catalogRecord, staticMedia } : undefined

    return getExerciseMedia(
      { pbRecordId, demoImages, demoVideo, youtube },
      { pbBaseUrl, mediaBaseUrl, catalogRecord: effectiveCatalogRecord },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las listas entran por su contenido (…Key) y `ready` fuerza el recálculo cuando el catálogo aterriza
  }, [
    pbRecordId, demoImagesKey, demoVideo, youtube,
    catalogRecord?.pbRecordId, defaultImagesKey, catalogRecord?.defaultVideo,
    catalogRecord?.curatedVideoUrl, catalogRecord?.youtube_query,
    staticMedia?.sequence, staticMedia?.muscles, staticMedia?.thumbnail, staticMedia?.video,
    pbBaseUrl, mediaBaseUrl, ready,
  ])
}

/** ¿El resolutor devuelve algo que pintar (imagen o vídeo hospedado)? */
export function hasResolvedMedia(media: ResolvedMedia): boolean {
  return !!(media.sequence || media.muscles || media.thumbnail || media.video || media.images.length > 0)
}

/**
 * catalogMedia.ts — bundled-catalog static media lookup (Plan 015)
 *
 * The resolver in `exerciseMedia.ts` is pure and takes a `catalogRecord.staticMedia`.
 * This module supplies that staticMedia by indexing the bundled catalog JSON by id,
 * so any surface (library, session, free session, mobile) can resolve a canonical
 * exercise's structured media from just its id — without each call site importing
 * the catalog. Works on web and React Native (the JSON is bundled either way).
 *
 * El índice `media por clave` ya no se construye aquí: lo construye
 * `catalogIndex.ts` en el mismo recorrido que el resto (#486).
 */

import { getOrLoadCatalogIndex } from './catalogIndex'
import type { CatalogStaticMedia } from './exerciseMedia'

/** Return the bundled structured media for a canonical exercise id or slug, if any. */
export function getCatalogStaticMedia(idOrSlug?: string): CatalogStaticMedia | undefined {
  if (!idOrSlug) return undefined
  // Sin catálogo cargado no hay media que dar; `exerciseMedia` ya sabe caer a
  // las capas de PocketBase y de YouTube.
  return getOrLoadCatalogIndex()?.mediaByKey.get(idOrSlug)
}

/**
 * catalogMedia.ts — bundled-catalog static media lookup (Plan 015)
 *
 * The resolver in `exerciseMedia.ts` is pure and takes a `catalogRecord.staticMedia`.
 * This module supplies that staticMedia by indexing the bundled catalog JSON by id,
 * so any surface (library, session, free session, mobile) can resolve a canonical
 * exercise's structured media from just its id — without each call site importing
 * the catalog. Works on web and React Native (the JSON is bundled either way).
 */

import catalog from '../data/exercise-catalog.json'
import type { CatalogStaticMedia } from './exerciseMedia'

interface CatalogEntry {
  id: string
  media?: CatalogStaticMedia
}

const mediaById: Map<string, CatalogStaticMedia> = (() => {
  const m = new Map<string, CatalogStaticMedia>()
  const categories = (catalog as { categories?: Record<string, { exercises?: CatalogEntry[] }> }).categories ?? {}
  for (const cat of Object.values(categories)) {
    for (const ex of cat.exercises ?? []) {
      if (ex.media && (ex.media.sequence || ex.media.muscles || ex.media.thumbnail || ex.media.video)) {
        m.set(ex.id, ex.media)
      }
    }
  }
  return m
})()

/** Return the bundled structured media for a canonical exercise id, if any. */
export function getCatalogStaticMedia(id?: string): CatalogStaticMedia | undefined {
  return id ? mediaById.get(id) : undefined
}
